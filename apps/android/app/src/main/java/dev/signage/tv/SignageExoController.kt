package dev.signage.tv

import android.app.Application
import android.net.Uri
import android.os.Handler
import android.os.Looper
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

    private val evictor = LeastRecentlyUsedCacheEvictor(200L * 1024L * 1024L)
    private val simpleCache: SimpleCache =
        SimpleCache(File(app.cacheDir, "exomedia3"), evictor, StandaloneDatabaseProvider(app))

    private val upstream: OkHttpDataSource.Factory = OkHttpDataSource.Factory(UnsafeOkHttpClient.instance)
    val cacheDataSourceFactory: CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(simpleCache)
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
        mainHandler.removeCallbacksAndMessages(null)
        maxDurationRunnable = null
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
    }

    /**
     * PlayerView was removed from the hierarchy; stop decoding until the next [bindCurrentVideoUrl].
     */
    fun onPlayerViewDetached() {
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
        simpleCache.release()
    }
}
