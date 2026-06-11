package dev.signage.tv

import android.app.Application
import android.util.Log
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Phase 2: after the playlist manifest switches (instant UI update), fills the disk cache for
 * every slide in loop order starting at the current index. Playback is never blocked.
 */
class PlaylistMediaCacheCoordinator(
    private val app: Application,
    private val scope: CoroutineScope,
    private val exoProvider: () -> SignageExoController?,
) {
    private val logTag = "SignagePlaylistCache"
    private var imageWarmJob: Job? = null
    private var lastScheduledRevision: String? = null

    fun onPlaybackActive(
        slides: List<PlaybackSlide>,
        contentRevision: String?,
        startIndex: Int,
    ) {
        if (slides.isEmpty()) {
            cancelAll()
            lastScheduledRevision = null
            return
        }
        val revisionKey = contentRevision?.takeIf { it.isNotBlank() } ?: slides.joinToString("|") { it.url }
        val plan = playlistWarmOrder(slides, startIndex)
        val exo = exoProvider()
        if (exo == null) {
            return
        }

        val allowedVideos = plan.videoUrls.toSet()
        exo.cancelVideoPrefetchExcept(allowedVideos)
        val videosToWarm =
            plan.videoUrls.filter { url ->
                url.isNotBlank() && url != exo.currentlyPlayingVideoUrl()
            }
        exo.schedulePrioritizedVideoWarm(videosToWarm)

        if (revisionKey != lastScheduledRevision) {
            Log.i(
                logTag,
                "Playlist cache warm started rev=$revisionKey videos=${videosToWarm.size} images=${plan.imageUrls.size} startIndex=$startIndex",
            )
            lastScheduledRevision = revisionKey
        }

        imageWarmJob?.cancel()
        imageWarmJob =
            scope.launch(Dispatchers.IO) {
                if (plan.imageUrls.isEmpty()) {
                    return@launch
                }
                val loader = app.imageLoader
                for (url in plan.imageUrls) {
                    if (!isActive) {
                        return@launch
                    }
                    runCatching {
                        loader.execute(
                            ImageRequest.Builder(app)
                                .data(url)
                                .build(),
                        )
                    }.onFailure { e ->
                        Log.d(logTag, "Image playlist warm failed: $url", e)
                    }
                }
            }
    }

    fun cancelAll() {
        imageWarmJob?.cancel()
        imageWarmJob = null
        exoProvider()?.cancelPlaylistVideoWarm()
        exoProvider()?.cancelVideoPrefetchExcept(emptySet())
    }

    /** True while playlist image warm or Exo background video caching is in progress. */
    fun isWarming(): Boolean {
        if (imageWarmJob?.isActive == true) {
            return true
        }
        return exoProvider()?.isBackgroundVideoCachingActive() == true
    }
}
