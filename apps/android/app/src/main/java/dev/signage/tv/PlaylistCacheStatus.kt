package dev.signage.tv

import android.app.Application
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.ContentMetadata
import coil.annotation.ExperimentalCoilApi
import coil.imageLoader
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Counts of playlist media items fully present on disk (Exo + Coil). */
data class PlaylistCacheCounts(
    val itemsTotal: Int,
    val itemsReady: Int,
    val videosTotal: Int,
    val videosReady: Int,
    val imagesTotal: Int,
    val imagesReady: Int,
)

fun computePlaylistCacheCounts(
    slides: List<PlaybackSlide>,
    isVideoReady: (String) -> Boolean,
    isImageReady: (String) -> Boolean,
): PlaylistCacheCounts {
    val videoUrls = LinkedHashSet<String>()
    val imageUrls = LinkedHashSet<String>()
    for (slide in slides) {
        when (slide.fileType) {
            "video" -> if (slide.url.isNotBlank()) videoUrls.add(slide.url)
            "image" -> if (slide.url.isNotBlank()) imageUrls.add(slide.url)
        }
    }
    val videosReady = videoUrls.count(isVideoReady)
    val imagesReady = imageUrls.count(isImageReady)
    return PlaylistCacheCounts(
        itemsTotal = videoUrls.size + imageUrls.size,
        itemsReady = videosReady + imagesReady,
        videosTotal = videoUrls.size,
        videosReady = videosReady,
        imagesTotal = imageUrls.size,
        imagesReady = imagesReady,
    )
}

@OptIn(UnstableApi::class, ExperimentalCoilApi::class)
object PlaylistCacheStatus {

    fun snapshot(
        app: Application,
        slides: List<PlaybackSlide>,
        contentRevision: String?,
        warming: Boolean,
    ): JsonObject {
        val counts =
            computePlaylistCacheCounts(
                slides = slides,
                isVideoReady = { url -> isVideoFullyCached(app, url) },
                isImageReady = { url -> isImageDiskCached(app, url) },
            )
        val cache = MediaCacheProvider.getSimpleCache(app)
        return buildJsonObject {
            put("items_total", counts.itemsTotal)
            put("items_ready", counts.itemsReady)
            put("videos_total", counts.videosTotal)
            put("videos_ready", counts.videosReady)
            put("images_total", counts.imagesTotal)
            put("images_ready", counts.imagesReady)
            put("warming", warming)
            put("cache_bytes_used", cache.cacheSpace)
            put("cache_bytes_max", MediaCacheProvider.maxCacheBytes())
            contentRevision?.takeIf { it.isNotBlank() }?.let { put("content_revision", it) }
        }
    }

    @OptIn(UnstableApi::class)
    fun isVideoFullyCached(app: Application, url: String): Boolean {
        if (url.isBlank()) {
            return false
        }
        val cache = MediaCacheProvider.getSimpleCache(app)
        val key = Uri.parse(url).toString()
        val contentLength = ContentMetadata.getContentLength(cache.getContentMetadata(key))
        if (contentLength <= 0L || contentLength == C.LENGTH_UNSET.toLong()) {
            return false
        }
        return cache.getCachedBytes(key, 0, contentLength) >= contentLength
    }

    @OptIn(ExperimentalCoilApi::class)
    fun isImageDiskCached(app: Application, url: String): Boolean {
        if (url.isBlank()) {
            return false
        }
        val diskCache = app.imageLoader.diskCache ?: return false
        return diskCache.openSnapshot(url)?.use { true } ?: false
    }
}
