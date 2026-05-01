package dev.signage.tv

import android.app.Application
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.io.File
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
@UnstableApi
@androidx.annotation.OptIn(UnstableApi::class)
class SignageExoController(
    private val app: Application,
) {
    private val log = "SignageExo"

    private val mainHandler = Handler(Looper.getMainLooper())
    private var maxDurationRunnable: Runnable? = null

    private data class BoundVideo(
        val url: String,
        val maxDurationSeconds: Int?,
        val onEnded: () -> Unit,
        val onFirstFrameRendered: (() -> Unit)?,
    )

    private var boundVideo: BoundVideo? = null
    private var stallWatchdogRunning = false
    private var stallWatchdogLastPositionMs = -1L
    private var stallWatchdogSameTicks = 0
    private var stallWatchdogBufferingTicks = 0
    private var stallSoftRecoveriesInWindow = 0
    private var stallGraceUntilElapsedRealtimeMs = 0L

    private val stallWatchdogRunnable =
        object : Runnable {
            override fun run() {
                if (!stallWatchdogRunning) {
                    return
                }
                val exoRef = exo
                if (finished.get() || boundVideo == null) {
                    stopStallWatchdog()
                    return
                }

                val state = exoRef.playbackState
                if (state == Player.STATE_IDLE || state == Player.STATE_ENDED) {
                    stopStallWatchdog()
                    return
                }

                val nowMs = SystemClock.elapsedRealtime()
                if (nowMs < stallGraceUntilElapsedRealtimeMs) {
                    mainHandler.postDelayed(this, STALL_CHECK_INTERVAL_MS)
                    return
                }

                if (state == Player.STATE_BUFFERING) {
                    stallWatchdogLastPositionMs = -1L
                    stallWatchdogSameTicks = 0
                    stallWatchdogBufferingTicks++
                    if (stallWatchdogBufferingTicks >= STALL_BUFFERING_TICKS_BEFORE_RECOVER) {
                        stallWatchdogBufferingTicks = 0
                        Log.w(log, "Video stuck buffering for too long; recovering...")
                        softRecoverFromStall()
                        return
                    }
                    mainHandler.postDelayed(this, STALL_CHECK_INTERVAL_MS)
                    return
                }

                stallWatchdogBufferingTicks = 0
                if (!exoRef.playWhenReady) {
                    stallWatchdogLastPositionMs = exoRef.currentPosition
                    stallWatchdogSameTicks = 0
                    mainHandler.postDelayed(this, STALL_CHECK_INTERVAL_MS)
                    return
                }

                val pos = exoRef.currentPosition
                val delta = kotlin.math.abs(pos - stallWatchdogLastPositionMs)
                if (stallWatchdogLastPositionMs >= 0 && delta < STALL_POSITION_DELTA_EPSILON_MS) {
                    stallWatchdogSameTicks++
                } else {
                    stallWatchdogSameTicks = 0
                    stallSoftRecoveriesInWindow = 0
                }
                stallWatchdogLastPositionMs = pos

                if (stallWatchdogSameTicks >= STALL_TICKS_BEFORE_RECOVER) {
                    stallWatchdogSameTicks = 0
                    Log.w(log, "Video frozen (position not moving); recovering...")
                    softRecoverFromStall()
                    return
                }

                mainHandler.postDelayed(this, STALL_CHECK_INTERVAL_MS)
            }
        }

    /** Invoked after repeated soft stall recoveries so Compose can remount [PlayerView]. */
    var onHardPlaybackRecovery: (() -> Unit)? = null

    private val upstream: OkHttpDataSource.Factory = OkHttpDataSource.Factory(UnsafeOkHttpClient.instance)
    val cacheDataSourceFactory: CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(MediaCacheProvider.getSimpleCache(app))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_BLOCK_ON_CACHE or CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private val loadControl =
        DefaultLoadControl.Builder()
            // Tighter "buffer to start" reduces gap before first frame; cache + prefetch absorb some risk of rebuffer.
            .setBufferDurationsMs(20_000, 90_000, 400, 1_000)
            .build()

    val exo: ExoPlayer =
        ExoPlayer.Builder(app, DefaultRenderersFactory(app).setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF))
            .setLoadControl(loadControl)
            .setMediaSourceFactory(DefaultMediaSourceFactory(cacheDataSourceFactory))
            .setSeekBackIncrementMs(5_000)
            .setSeekForwardIncrementMs(5_000)
            .setSeekParameters(SeekParameters.CLOSEST_SYNC)
            .build()
            .apply {
                videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
            }

    private var playbackListener: Player.Listener? = null
    private var firstFrameListener: AnalyticsListener? = null
    private var finished: AtomicBoolean = AtomicBoolean(true)

    private val prefetchJob = SupervisorJob()
    private val ioScope = CoroutineScope(prefetchJob + Dispatchers.IO)
    private var prefetching: Job? = null
    private var prefetchUrlInFlight: String? = null

    fun requestPrefetchIfVideo(url: String) {
        prefetching?.cancel()
        prefetching =
            ioScope.launch {
                val jobUrl = url
                prefetchUrlInFlight = jobUrl
                try {
                    withContext(Dispatchers.IO) {
                        val uri = Uri.parse(url)
                        val dataSource = cacheDataSourceFactory.createDataSource() as? CacheDataSource
                            ?: return@withContext
                        val dataSpec = DataSpec.Builder()
                            .setUri(uri)
                            .setPosition(0)
                            .setLength(4L * 1024L * 1024L)
                            .build()
                        val writer = CacheWriter(dataSource, dataSpec, null, null)
                        if (!isActive) {
                            writer.cancel()
                            return@withContext
                        }
                        runCatching {
                            writer.cache()
                        }.onFailure { e: Throwable ->
                            if (e is IOException) {
                                Log.d(log, "Prefetch end: $e")
                            } else {
                                throw e
                            }
                        }
                    }
                } finally {
                    if (prefetchUrlInFlight == jobUrl) {
                        prefetchUrlInFlight = null
                    }
                }
            }
    }

    /**
     * Must run on the main thread (Compose [androidx.compose.runtime.LaunchedEffect]).
     */
    fun bindCurrentVideoUrl(
        url: String,
        maxDurationSeconds: Int?,
        onEnded: () -> Unit,
        onFirstFrameRendered: (() -> Unit)? = null,
    ) {
        finished.set(false)
        stopStallWatchdog()
        mainHandler.removeCallbacksAndMessages(null)
        maxDurationRunnable = null
        boundVideo = BoundVideo(url, maxDurationSeconds, onEnded, onFirstFrameRendered)
        stallGraceUntilElapsedRealtimeMs = SystemClock.elapsedRealtime() + STALL_INITIAL_GRACE_MS
        stallWatchdogLastPositionMs = -1L
        stallWatchdogSameTicks = 0
        stallWatchdogBufferingTicks = 0
        val uri = Uri.parse(url)
        // Do not call clearVideoSurface() / setVideoSurface(null) here. Compose runs AndroidView
        // factory (PlayerView sets this player and attaches the surface) in the same frame, then
        // LaunchedEffect; clearing the surface in bind would run after attach and break rendering.
        firstFrameListener?.let { exo.removeAnalyticsListener(it) }
        firstFrameListener = null
        playbackListener?.let { exo.removeListener(it) }
        exo.setMediaItem(MediaItem.fromUri(uri))
        exo.seekTo(0L)
        val l =
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) {
                        if (finished.compareAndSet(false, true)) {
                            onEnded()
                        }
                    }
                }

                override fun onPlayerError(playbackError: PlaybackException) {
                    Log.e(log, "Video playback error: $url", playbackError)
                    if (finished.compareAndSet(false, true)) {
                        onEnded()
                    }
                }
            }
        playbackListener = l
        exo.addListener(l)
        if (onFirstFrameRendered != null) {
            val notify = onFirstFrameRendered
            firstFrameListener =
                object : AnalyticsListener {
                    override fun onRenderedFirstFrame(
                        eventTime: AnalyticsListener.EventTime,
                        output: Any,
                        renderTimeMs: Long,
                    ) {
                        firstFrameListener?.let { exo.removeAnalyticsListener(it) }
                        firstFrameListener = null
                        mainHandler.post { notify() }
                    }
                }
            exo.addAnalyticsListener(firstFrameListener!!)
        }
        exo.prepare()
        exo.playWhenReady = true
        exo.setVolume(1f)

        val capMs = maxDurationSeconds?.takeIf { it > 0 }?.times(1000L)
        if (capMs != null && capMs in 1L..(30L * 60L * 1000L)) {
            val r = Runnable {
                if (finished.compareAndSet(false, true)) {
                    exo.stop()
                    onEnded()
                }
            }
            maxDurationRunnable = r
            mainHandler.postDelayed(r, capMs)
        }

        startStallWatchdog()
    }

    fun onActivityPause() {
        stopStallWatchdog()
        exo.pause()
    }

    /**
     * After HDMI/TV power cycles the surface and decoder can be stale while Exo still reports READY.
     * Clears media and surface bindings so the next [bindCurrentVideoUrl] starts fresh (without [release]).
     */
    fun resetDecoderStateAfterDisplayWake() {
        stopStallWatchdog()
        mainHandler.removeCallbacksAndMessages(null)
        maxDurationRunnable = null
        stallSoftRecoveriesInWindow = 0
        stallWatchdogBufferingTicks = 0
        stallWatchdogSameTicks = 0
        stallWatchdogLastPositionMs = -1L
        boundVideo = null
        finished.set(true)
        firstFrameListener?.let { exo.removeAnalyticsListener(it) }
        firstFrameListener = null
        playbackListener?.let { exo.removeListener(it) }
        playbackListener = null
        exo.stop()
        exo.playWhenReady = false
        exo.clearMediaItems()
        exo.setVideoSurface(null)
        exo.clearVideoSurface()
    }

    fun onActivityResume() {
        if (boundVideo != null && !finished.get()) {
            exo.playWhenReady = true
            when (exo.playbackState) {
                Player.STATE_IDLE -> if (exo.mediaItemCount > 0) {
                    exo.prepare()
                }
                Player.STATE_BUFFERING,
                Player.STATE_READY,
                -> {}
                Player.STATE_ENDED -> {}
            }
            startStallWatchdog()
        } else {
            exo.playWhenReady = true
        }
    }

    private fun softRecoverFromStall() {
        val snapshot = boundVideo ?: return
        stallSoftRecoveriesInWindow++
        Log.w(
            log,
            "Video stall detected; soft recover (${stallSoftRecoveriesInWindow}/$STALL_SOFT_RECOVERIES_BEFORE_HARD) url=${snapshot.url}",
        )
        if (stallSoftRecoveriesInWindow >= STALL_SOFT_RECOVERIES_BEFORE_HARD) {
            stallSoftRecoveriesInWindow = 0
            stopStallWatchdog()
            mainHandler.post {
                onHardPlaybackRecovery?.invoke()
            }
            return
        }
        bindCurrentVideoUrl(
            snapshot.url,
            snapshot.maxDurationSeconds,
            snapshot.onEnded,
            snapshot.onFirstFrameRendered,
        )
    }

    private fun startStallWatchdog() {
        stopStallWatchdog()
        if (boundVideo == null || finished.get()) {
            return
        }
        stallWatchdogRunning = true
        mainHandler.postDelayed(stallWatchdogRunnable, STALL_CHECK_INTERVAL_MS)
    }

    private fun stopStallWatchdog() {
        stallWatchdogRunning = false
        mainHandler.removeCallbacks(stallWatchdogRunnable)
    }

    /**
     * PlayerView was removed from the hierarchy; stop decoding until the next [bindCurrentVideoUrl].
     */
    fun onPlayerViewDetached() {
        stopStallWatchdog()
        boundVideo = null
        mainHandler.removeCallbacksAndMessages(null)
        finished.set(true)
        firstFrameListener?.let { exo.removeAnalyticsListener(it) }
        firstFrameListener = null
        playbackListener?.let { exo.removeListener(it) }
        playbackListener = null
        exo.stop()
        exo.setPlayWhenReady(false)
        exo.clearMediaItems()
        exo.setVideoSurface(null)
        exo.clearVideoSurface()
    }

    fun release() {
        prefetching?.cancel()
        prefetchJob.cancel()
        onPlayerViewDetached()
        exo.release()
    }

    companion object {
        const val STALL_CHECK_INTERVAL_MS = 2_000L
        const val STALL_TICKS_BEFORE_RECOVER = 4
        const val STALL_BUFFERING_TICKS_BEFORE_RECOVER = 15
        const val STALL_POSITION_DELTA_EPSILON_MS = 80L
        const val STALL_INITIAL_GRACE_MS = 4_000L
        const val STALL_SOFT_RECOVERIES_BEFORE_HARD = 2
    }
}
