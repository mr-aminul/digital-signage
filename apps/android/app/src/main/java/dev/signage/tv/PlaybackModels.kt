package dev.signage.tv

data class PlaybackSlide(
    val url: String,
    val fileType: String,
    val durationSeconds: Int?,
)
