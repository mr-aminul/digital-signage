package dev.signage.tv

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

@Composable
fun PlaybackScreen(state: MainUiState.Playback) {
    if (state.slides.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "Waiting for an active playlist on this device…\nAssign one in the web dashboard (Devices).",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
        }
        return
    }

    // Full-bleed signage: no titles or metadata over media
    Box(modifier = Modifier.fillMaxSize()) {
        val slideKey = state.slides.joinToString("|") { "${it.url}#${it.fileType}" }
        var index by remember(slideKey) { mutableIntStateOf(0) }
        val slide = state.slides[index % state.slides.size]
        key(slide.url, slide.fileType) {
            when (slide.fileType) {
                "video" -> VideoSlide(url = slide.url, onEnded = { index = (index + 1) % state.slides.size })
                else -> ImageSlide(url = slide.url, durationSeconds = slide.durationSeconds, onDone = { index = (index + 1) % state.slides.size })
            }
        }
    }
}

@Composable
private fun VideoSlide(
    url: String,
    onEnded: () -> Unit,
) {
    val context = LocalContext.current
    key(url) {
        val player =
            remember {
                ExoPlayer.Builder(context).build().apply {
                    setMediaItem(MediaItem.fromUri(Uri.parse(url)))
                    prepare()
                    playWhenReady = true
                    addListener(
                        object : Player.Listener {
                            override fun onPlaybackStateChanged(playbackState: Int) {
                                if (playbackState == Player.STATE_ENDED) {
                                    onEnded()
                                }
                            }
                        },
                    )
                }
            }
        DisposableEffect(Unit) {
            onDispose { player.release() }
        }
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = {
                it.player = player
                it.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            },
        )
    }
}

@Composable
private fun ImageSlide(
    url: String,
    durationSeconds: Int?,
    onDone: () -> Unit,
) {
    val waitMs = (durationSeconds ?: 8).coerceIn(2, 120) * 1000L
    LaunchedEffect(url, waitMs) {
        delay(waitMs)
        onDone()
    }
    AsyncImage(
        model = url,
        contentDescription = null,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Crop,
    )
}
