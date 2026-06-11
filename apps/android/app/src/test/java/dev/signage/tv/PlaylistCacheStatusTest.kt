package dev.signage.tv

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaylistCacheStatusTest {
    private val videoA = PlaybackSlide(url = "https://cdn.example/a.mp4", fileType = "video")
    private val videoB = PlaybackSlide(url = "https://cdn.example/b.mp4", fileType = "video")
    private val image = PlaybackSlide(url = "https://cdn.example/a.jpg", fileType = "image")

    @Test
    fun computeCounts_allReady() {
        val counts =
            computePlaylistCacheCounts(
                slides = listOf(videoA, videoB, image),
                isVideoReady = { true },
                isImageReady = { true },
            )
        assertEquals(3, counts.itemsTotal)
        assertEquals(3, counts.itemsReady)
        assertEquals(2, counts.videosTotal)
        assertEquals(2, counts.videosReady)
        assertEquals(1, counts.imagesTotal)
        assertEquals(1, counts.imagesReady)
    }

    @Test
    fun computeCounts_deduplicatesUrls() {
        val counts =
            computePlaylistCacheCounts(
                slides = listOf(videoA, videoA, image, image),
                isVideoReady = { it == videoA.url },
                isImageReady = { false },
            )
        assertEquals(2, counts.itemsTotal)
        assertEquals(1, counts.itemsReady)
        assertEquals(1, counts.videosTotal)
        assertEquals(1, counts.videosReady)
        assertEquals(1, counts.imagesTotal)
        assertEquals(0, counts.imagesReady)
    }

    @Test
    fun computeCounts_emptyPlaylist() {
        val counts =
            computePlaylistCacheCounts(
                slides = emptyList(),
                isVideoReady = { true },
                isImageReady = { true },
            )
        assertEquals(0, counts.itemsTotal)
        assertEquals(0, counts.itemsReady)
    }
}
