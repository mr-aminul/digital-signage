package dev.signage.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackWarmCacheTest {
    private val videoA = PlaybackSlide(url = "https://cdn.example/a.mp4", fileType = "video")
    private val videoB = PlaybackSlide(url = "https://cdn.example/b.mp4", fileType = "video")
    private val image = PlaybackSlide(url = "https://cdn.example/a.jpg", fileType = "image")

    @Test
    fun videoWarmCache_includesCurrentAndNextWhenDifferent() {
        assertEquals(
            listOf(videoA.url, videoB.url),
            videoUrlsToWarmCache(0, listOf(videoA, videoB)),
        )
    }

    @Test
    fun videoWarmCache_skipsSingleVideoPlaylistWhilePlaying() {
        assertEquals(
            emptyList<String>(),
            videoUrlsToWarmCache(0, listOf(videoA), activelyPlayingVideoUrl = videoA.url),
        )
    }

    @Test
    fun videoWarmCache_warmsCurrentOnceWhenNextIsSameUrl() {
        assertEquals(
            listOf(videoA.url),
            videoUrlsToWarmCache(0, listOf(videoA, videoA)),
        )
    }

    @Test
    fun videoWarmCache_onlyNextWhenCurrentIsImage() {
        assertEquals(
            listOf(videoA.url),
            videoUrlsToWarmCache(0, listOf(image, videoA)),
        )
    }

    @Test
    fun videoWarmCache_skipsActivelyPlayingUrlOnNextSlide() {
        assertEquals(
            listOf(videoA.url),
            videoUrlsToWarmCache(0, listOf(videoA, videoB), activelyPlayingVideoUrl = videoB.url),
        )
    }

    @Test
    fun imageWarmCache_includesCurrentAndNext() {
        val urls = imageUrlsToWarmCache(0, listOf(image, PlaybackSlide("https://cdn.example/b.jpg", "image")))
        assertEquals(2, urls.size)
        assertTrue(urls.contains(image.url))
    }

    @Test
    fun imageWarmCache_skipsWhenNextIsSameUrl() {
        assertEquals(
            listOf(image.url),
            imageUrlsToWarmCache(0, listOf(image, image)),
        )
    }

    @Test
    fun imageWarmCache_emptyForVideoOnlyPlaylist() {
        assertTrue(imageUrlsToWarmCache(0, listOf(videoA)).isEmpty())
    }

    @Test
    fun playlistWarmOrder_startsAtCurrentIndexInLoopOrder() {
        val slides = listOf(videoA, image, videoB)
        val order = playlistWarmOrder(slides, startIndex = 1)
        assertEquals(listOf(image.url), order.imageUrls)
        assertEquals(listOf(videoB.url, videoA.url), order.videoUrls)
    }

    @Test
    fun playlistWarmOrder_deduplicatesRepeatedUrls() {
        val slides = listOf(videoA, videoA, image)
        val order = playlistWarmOrder(slides, startIndex = 0)
        assertEquals(listOf(videoA.url), order.videoUrls)
        assertEquals(listOf(image.url), order.imageUrls)
    }

    @Test
    fun playlistWarmOrder_emptyForEmptyPlaylist() {
        val order = playlistWarmOrder(emptyList(), startIndex = 0)
        assertTrue(order.videoUrls.isEmpty())
        assertTrue(order.imageUrls.isEmpty())
    }
}
