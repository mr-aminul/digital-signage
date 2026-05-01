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
