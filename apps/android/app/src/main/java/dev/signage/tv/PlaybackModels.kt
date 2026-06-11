package dev.signage.tv

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CachedPlaybackV1(
    val deviceId: String,
    /** Device display name from server manifest; older caches omit this key. */
    val deviceDisplayName: String = "",
    val playlistName: String? = null,
    val contentRevision: String? = null,
    val playlistId: String? = null,
    val savedAtMs: Long,
    val slides: List<PlaybackSlide> = emptyList(),
    /** Matches devices.screen_orientation when cached; older payloads omit this key. */
    val screenOrientation: String = "landscape",
)

@Serializable
data class PlaybackSlide(
    val url: String,
    val fileType: String,
    val durationSeconds: Int? = null,
)

/**
 * Video URLs to fully cache in the background for the current and next slide.
 * Skips the URL ExoPlayer is actively decoding so prefetch never fights playback.
 */
fun videoUrlsToWarmCache(
    currentIndex: Int,
    slides: List<PlaybackSlide>,
    activelyPlayingVideoUrl: String? = null,
): List<String> {
    if (slides.isEmpty()) {
        return emptyList()
    }
    val n = slides.size
    val current = slides[currentIndex % n]
    val next = slides[(currentIndex + 1) % n]
    return buildList {
        if (current.fileType == "video" &&
            current.url.isNotBlank() &&
            current.url != activelyPlayingVideoUrl
        ) {
            add(current.url)
        }
        if (next.fileType == "video" &&
            next.url.isNotBlank() &&
            next.url != current.url &&
            next.url != activelyPlayingVideoUrl &&
            next.url !in this
        ) {
            add(next.url)
        }
    }
}

/** Image URLs for the current and next slide (Coil disk cache). */
fun imageUrlsToWarmCache(
    currentIndex: Int,
    slides: List<PlaybackSlide>,
): List<String> {
    if (slides.isEmpty()) {
        return emptyList()
    }
    val n = slides.size
    val current = slides[currentIndex % n]
    val next = slides[(currentIndex + 1) % n]
    return buildList {
        if (current.fileType == "image" && current.url.isNotBlank()) {
            add(current.url)
        }
        if (next.fileType == "image" &&
            next.url.isNotBlank() &&
            next.url != current.url &&
            next.url !in this
        ) {
            add(next.url)
        }
    }
}

/** Full playlist warm order: current slide first, then the rest in loop order. */
data class PlaylistWarmOrder(
    val videoUrls: List<String>,
    val imageUrls: List<String>,
)

fun playlistWarmOrder(
    slides: List<PlaybackSlide>,
    startIndex: Int,
): PlaylistWarmOrder {
    if (slides.isEmpty()) {
        return PlaylistWarmOrder(emptyList(), emptyList())
    }
    val n = slides.size
    val normalizedStart = ((startIndex % n) + n) % n
    val videos = LinkedHashSet<String>()
    val images = LinkedHashSet<String>()
    for (offset in 0 until n) {
        val slide = slides[(normalizedStart + offset) % n]
        when (slide.fileType) {
            "video" -> if (slide.url.isNotBlank()) videos.add(slide.url)
            "image" -> if (slide.url.isNotBlank()) images.add(slide.url)
        }
    }
    return PlaylistWarmOrder(videos.toList(), images.toList())
}
