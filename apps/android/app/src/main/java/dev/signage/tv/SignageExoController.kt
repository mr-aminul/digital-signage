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
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
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
        val loopSingleItem: Boolean = false,
    )

    private var boundVideo: BoundVideo? = null
    private var stallWatchdogRunning = false
    private var stallWatchdogLastPositionMs = -1L
    private var stallWatchdogSameTicks = 0
    private var stallWatchdogBufferingTicks = 0
    private var stallWatchdogEndStuckTicks = 0
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
                val duration = exoRef.duration
                val loopSingleItem = boundVideo?.loopSingleItem == true
                if (loopSingleItem && state == Player.STATE_READY && exoRef.playWhenReady) {
                    mainHandler.post { onPlaybackPositionAdvanced?.invoke() }
                }
                if (duration != C.TIME_UNSET && duration > 0 && exoRef.playWhenReady && !loopSingleItem) {
                    val remaining = duration - pos
                    if (remaining in 0..END_REMAINING_THRESHOLD_MS) {
                        stallWatchdogEndStuckTicks++
                        if (stallWatchdogEndStuckTicks >= END_STUCK_TICKS_BEFORE_ADVANCE) {
                            Log.w(log, "Video at end (${pos}ms/${duration}ms) but STATE_ENDED not fired; advancing")
                            finishPlayback()
                            return
                        }
                    } else {
                        stallWatchdogEndStuckTicks = 0
                    }
                } else {
                    stallWatchdogEndStuckTicks = 0
                }

                val delta = kotlin.math.abs(pos - stallWatchdogLastPositionMs)
                if (stallWatchdogLastPositionMs >= 0 && delta < STALL_POSITION_DELTA_EPSILON_MS) {
                    stallWatchdogSameTicks++
                } else {
                    if (stallWatchdogLastPositionMs >= 0 && delta >= STALL_POSITION_DELTA_EPSILON_MS) {
                        mainHandler.post { onPlaybackPositionAdvanced?.invoke() }
                    }
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

    /** Invoked on the main thread when playback time advances (stall watchdog tick). */
    var onPlaybackPositionAdvanced: (() -> Unit)? = null

    private val upstream: OkHttpDataSource.Factory = OkHttpDataSource.Factory(SignageOkHttpClient.instance)
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
    private val prefetchJobs = ConcurrentHashMap<String, Job>()
    private val playlistWarmGeneration = AtomicInteger(0)
    private var playlistWarmJob: Job? = null

    /** URL bound to Exo right now — do not background-cache the same bytes. */
    fun currentlyPlayingVideoUrl(): String? = boundVideo?.url

    /** True while a sequential playlist warm or ad-hoc prefetch job is running. */
    fun isBackgroundVideoCachingActive(): Boolean =
        playlistWarmJob?.isActive == true || prefetchJobs.values.any { it.isActive }

    fun cancelVideoPrefetchExcept(allowedUrls: Collection<String>) {
        val allowed = allowedUrls.toSet()
        prefetchJobs.keys.filter { it !in allowed }.forEach { url ->
            prefetchJobs.remove(url)?.cancel()
        }
    }

    fun cancelPlaylistVideoWarm() {
        playlistWarmGeneration.incrementAndGet()
        playlistWarmJob?.cancel()
        playlistWarmJob = null
    }

    /**
     * Downloads [urls] one at a time (highest priority first). Cancels in-flight jobs for URLs
     * not in this playlist generation. Never blocks the main thread or active Exo decode.
     */
    fun schedulePrioritizedVideoWarm(urls: List<String>) {
        if (urls.isEmpty()) {
            return
        }
        val generation = playlistWarmGeneration.incrementAndGet()
        playlistWarmJob?.cancel()
        playlistWarmJob =
            ioScope.launch {
                for (url in urls) {
                    if (!isActive || generation != playlistWarmGeneration.get()) {
                        return@launch
                    }
                    cacheVideoUrlFully(url)
                }
            }
    }

    fun requestPrefetchVideos(urls: List<String>) {
        urls.forEach { requestPrefetchVideo(it) }
    }

    /** Fully cache [url] on disk (resumes partial spans). No-op when Exo is playing that URL. */
    fun requestPrefetchVideo(url: String) {
        if (url.isBlank()) {
            return
        }
        if (url == boundVideo?.url) {
            Log.d(log, "Skip full prefetch; url is actively playing: $url")
            return
        }
        if (prefetchJobs[url]?.isActive == true) {
            return
        }
        prefetchJobs[url]?.cancel()
        prefetchJobs[url] =
            ioScope.launch {
                try {
                    cacheVideoUrlFully(url)
                } finally {
                    prefetchJobs.remove(url)
                }
            }
    }

    private suspend fun cacheVideoUrlFully(url: String) {
        if (url.isBlank()) {
            return
        }
        if (url == boundVideo?.url) {
            Log.d(log, "Skip full prefetch; url is actively playing: $url")
            return
        }
        val existing = prefetchJobs[url]
        if (existing?.isActive == true) {
            existing.join()
            return
        }
        withContext(Dispatchers.IO) {
            val uri = Uri.parse(url)
            val dataSource = cacheDataSourceFactory.createDataSource() as? CacheDataSource
                ?: return@withContext
            val dataSpec =
                DataSpec.Builder()
                    .setUri(uri)
                    .setPosition(0)
                    .build()
            val writer = CacheWriter(dataSource, dataSpec, null, null)
            if (!coroutineContext.isActive) {
                writer.cancel()
                return@withContext
            }
            Log.i(log, "Full prefetch started url=$url")
            runCatching {
                writer.cache()
            }.onSuccess {
                Log.i(log, "Full prefetch complete url=$url")
            }.onFailure { e: Throwable ->
                if (e is IOException) {
                    Log.d(log, "Full prefetch ended url=$url: $e")
                } else {
                    throw e
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
        loopSingleItem: Boolean = false,
    ) {
        finished.set(false)
        stopStallWatchdog()
        mainHandler.removeCallbacksAndMessages(null)
        maxDurationRunnable = null
        boundVideo = BoundVideo(url, maxDurationSeconds, onEnded, onFirstFrameRendered, loopSingleItem)
        stallGraceUntilElapsedRealtimeMs = SystemClock.elapsedRealtime() + STALL_INITIAL_GRACE_MS
        stallWatchdogLastPositionMs = -1L
        stallWatchdogSameTicks = 0
        stallWatchdogBufferingTicks = 0
        stallWatchdogEndStuckTicks = 0
        val uri = Uri.parse(url)
        // Do not call clearVideoSurface() / setVideoSurface(null) here. Compose runs AndroidView
        // factory (PlayerView sets this player and attaches the surface) in the same frame, then
        // LaunchedEffect; clearing the surface in bind would run after attach and break rendering.
        firstFrameListener?.let { exo.removeAnalyticsListener(it) }
        firstFrameListener = null
        playbackListener?.let { exo.removeListener(it) }
        exo.repeatMode = if (loopSingleItem) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        exo.setMediaItem(MediaItem.fromUri(uri))
        exo.seekTo(0L)
        val l =
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED && !loopSingleItem) {
                        finishPlayback()
                    }
                }

                override fun onPositionDiscontinuity(
                    oldPosition: Player.PositionInfo,
                    newPosition: Player.PositionInfo,
                    reason: Int,
                ) {
                    if (loopSingleItem &&
                        (
                            reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION ||
                                reason == Player.DISCONTINUITY_REASON_SEEK
                        )
                    ) {
                        finished.set(false)
                        mainHandler.post { onPlaybackPositionAdvanced?.invoke() }
                    }
                }

                override fun onPlayerError(playbackError: PlaybackException) {
                    Log.e(log, "Video playback error: $url", playbackError)
                    if (loopSingleItem) {
                        Log.w(log, "Looping video error; rebinding url=$url")
                        bindCurrentVideoUrl(
                            url,
                            maxDurationSeconds,
                            onEnded,
                            onFirstFrameRendered,
                            loopSingleItem = true,
                        )
                    } else {
                        finishPlayback()
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
        if (!loopSingleItem && capMs != null && capMs in 1L..(2L * 60L * 60L * 1000L)) {
            val r = Runnable {
                Log.w(log, "Video max duration reached; advancing url=$url")
                finishPlayback()
            }
            maxDurationRunnable = r
            mainHandler.postDelayed(r, capMs)
        }

        startStallWatchdog()
    }

    /**
     * Called when the output [android.graphics.SurfaceTexture] was destroyed and recreated (typical after
     * display/TV power cycles). Re-prepares the current item without requiring Compose to rebuild.
     */
    fun rebindCurrentBoundVideo(reason: String) {
        val snapshot = boundVideo ?: return
        Log.i(log, "Rebinding bound video ($reason) url=${snapshot.url}")
        bindCurrentVideoUrl(
            snapshot.url,
            snapshot.maxDurationSeconds,
            snapshot.onEnded,
            snapshot.onFirstFrameRendered,
            snapshot.loopSingleItem,
        )
    }

    /** True when Exo reached the end of a non-looping item and needs a fresh bind from Compose. */
    fun shouldRebindSameItemInView(): Boolean =
        boundVideo?.loopSingleItem != true &&
            exo.playbackState == Player.STATE_ENDED &&
            exo.repeatMode == Player.REPEAT_MODE_OFF

    /** Compose still shows a video slide but the engine lost an active decode session. */
    fun needsVideoRebind(): Boolean {
        if (boundVideo == null) {
            return true
        }
        if (exo.playbackState == Player.STATE_ENDED) {
            return true
        }
        return finished.get() && boundVideo?.loopSingleItem != true
    }

    /** Exo is decoding the current slide; skip destructive foreground recovery. */
    fun isActivelyPlayingVideo(): Boolean {
        if (boundVideo == null) {
            return false
        }
        return when (exo.playbackState) {
            Player.STATE_BUFFERING,
            Player.STATE_READY,
            -> exo.playWhenReady
            else -> false
        }
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
        stallWatchdogEndStuckTicks = 0
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
        val snapshot = boundVideo
        if (snapshot != null) {
            when (exo.playbackState) {
                Player.STATE_ENDED -> {
                    if (!finished.get()) {
                        finishPlayback()
                    } else {
                        // Ended while backgrounded; loop the current slide instead of leaving a dead surface.
                        Log.i(log, "Resuming after STATE_ENDED; rebinding url=${snapshot.url}")
                        finished.set(false)
                        bindCurrentVideoUrl(
                            snapshot.url,
                            snapshot.maxDurationSeconds,
                            snapshot.onEnded,
                            snapshot.onFirstFrameRendered,
                            snapshot.loopSingleItem,
                        )
                    }
                    return
                }
                else -> Unit
            }
        }
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
            // No active video binding (e.g. image slide). Leaving playWhenReady true can resume stale
            // buffered audio after display wake if media were not fully cleared yet.
            exo.playWhenReady = false
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
            snapshot.loopSingleItem,
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
        exo.setVolume(0f)
        exo.stop()
        exo.setPlayWhenReady(false)
        exo.clearMediaItems()
        exo.setVideoSurface(null)
        exo.clearVideoSurface()
    }

    fun release() {
        cancelPlaylistVideoWarm()
        prefetchJobs.values.forEach { it.cancel() }
        prefetchJobs.clear()
        prefetchJob.cancel()
        onPlayerViewDetached()
        exo.release()
    }

    private fun finishPlayback() {
        if (!finished.compareAndSet(false, true)) {
            return
        }
        stopStallWatchdog()
        mainHandler.removeCallbacksAndMessages(null)
        maxDurationRunnable = null
        boundVideo?.onEnded?.invoke()
    }

    companion object {
        const val STALL_CHECK_INTERVAL_MS = 2_000L
        const val STALL_TICKS_BEFORE_RECOVER = 6
        const val STALL_BUFFERING_TICKS_BEFORE_RECOVER = 20
        const val STALL_POSITION_DELTA_EPSILON_MS = 80L
        const val STALL_INITIAL_GRACE_MS = 4_000L
        const val STALL_SOFT_RECOVERIES_BEFORE_HARD = 3
        const val END_REMAINING_THRESHOLD_MS = 750L
        const val END_STUCK_TICKS_BEFORE_ADVANCE = 2
    }
}
