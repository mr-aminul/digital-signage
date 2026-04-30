package dev.signage.tv

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.util.Log
import android.view.LayoutInflater
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImagePainter
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import coil.request.ImageRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

private const val LOG_TAG = "SignageTV"

@Composable
private fun MismatchOrEmptyScreen(
    userMessage: String,
    code: String,
) {
    Box(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = userMessage,
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Error code: $code",
                modifier = Modifier.padding(top = 16.dp),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
fun PlaybackScreen(
    state: MainUiState.Playback,
    viewModel: MainViewModel,
) {
    val context = LocalContext.current
    LaunchedEffect(state.screenOrientation) {
        val activity = context as? ComponentActivity ?: return@LaunchedEffect
        activity.requestedOrientation =
            when (state.screenOrientation.lowercase()) {
                "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                else -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
    }

    if (state.isRegistrationMismatch) {
        MismatchOrEmptyScreen(
            userMessage =
                "This screen is no longer linked. On the TV: choose Reset, then add the new pairing code in the web app.",
            code = TvUserFacingError.LINK_LOST,
        )
        return
    }
    if (state.slides.isEmpty()) {
        MismatchOrEmptyScreen(
            userMessage =
                if (state.playlistName == null) {
                    "No playlist to show. Assign a playlist to this display in the web app."
                } else {
                    "The active playlist is empty. Add content in the web app, and this display will update shortly."
                },
            code = if (state.playlistName == null) TvUserFacingError.NO_PLAYLIST else TvUserFacingError.EMPTY_PLAYLIST,
        )
        return
    }

    val engine = remember { viewModel.exoForPlayback() }
    val slideKey =
        state.slides.joinToString("|") { s ->
            "${s.url}#${s.fileType}#${s.durationSeconds}#${state.contentRevision}#${state.isFromCache}"
        }
    var index by remember(slideKey) { mutableIntStateOf(0) }
    var visit by remember(slideKey) { mutableIntStateOf(0) }
    val n = state.slides.size
    val slide = state.slides[index % n]
    val previousSlide = state.slides[(index - 1 + n) % n]
    val holdImageUrlForVideo: String? =
        if (slide.fileType == "video" && previousSlide.fileType != "video") {
            previousSlide.url
        } else {
            null
        }

    LaunchedEffect(index, state.slides, state.contentRevision) {
        viewModel.onPlaybackSlideContext(index, state.slides)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (slide.fileType) {
            "video" -> {
                val maxSec = slide.durationSeconds
                key(visit, slide.url, maxSec) {
                    val onEnded: () -> Unit = {
                        index = (index + 1) % n
                        visit += 1
                    }
                    SharedExoVideoSlide(
                        url = slide.url,
                        maxDurationSeconds = maxSec,
                        holdImageUrl = holdImageUrlForVideo,
                        onEnded = onEnded,
                        engine = engine,
                    )
                }
            }
            else -> {
                LaunchedEffect(index, slide.url) {
                    engine.onPlayerViewDetached()
                }
                ImageSlide(
                    url = slide.url,
                    durationSeconds = slide.durationSeconds,
                    onDone = {
                        index = (index + 1) % n
                        visit += 1
                    },
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun SharedExoVideoSlide(
    url: String,
    maxDurationSeconds: Int?,
    holdImageUrl: String?,
    onEnded: () -> Unit,
    engine: SignageExoController,
) {
    val onEndState = rememberUpdatedState(onEnded)
    val bindKey = url to maxDurationSeconds
    var lastBound: Pair<String, Int?>? by remember { mutableStateOf(null) }
    var videoRevealed by remember(url, holdImageUrl) {
        mutableStateOf(holdImageUrl == null)
    }

    // Bind in [AndroidView.update] (same frame as PlayerView#player) instead of [LaunchedEffect], which
    // runs on the next frame and adds a visible delay after the view attaches the surface.
    Box(modifier = Modifier.fillMaxSize()) {
        if (holdImageUrl != null) {
            HoldUnderImageFullBleed(url = holdImageUrl)
        }
        AndroidView(
            factory = { context ->
                val view = LayoutInflater.from(context).inflate(R.layout.exo_player_texture_view, null) as PlayerView
                view.setEnableComposeSurfaceSyncWorkaround(true)
                view.setShutterBackgroundColor(Color.TRANSPARENT)
                view.setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                view.player = engine.exo
                view
            },
            onRelease = { v -> (v as PlayerView).player = null },
            update = { v ->
                val view = v as PlayerView
                if (view.player == null) {
                    view.player = engine.exo
                }
                view.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                if (lastBound != bindKey) {
                    lastBound = bindKey
                    videoRevealed = (holdImageUrl == null)
                    engine.bindCurrentVideoUrl(
                        url = url,
                        maxDurationSeconds = maxDurationSeconds,
                        onEnded = { onEndState.value() },
                        onFirstFrameRendered =
                            if (holdImageUrl != null) {
                                { videoRevealed = true }
                            } else {
                                null
                            },
                    )
                }
            },
            modifier =
                Modifier
                    .fillMaxSize()
                    .then(
                        if (holdImageUrl != null) {
                            Modifier.graphicsLayer {
                                alpha = if (videoRevealed) 1f else 0f
                            }
                        } else {
                            Modifier
                        },
                    ),
        )
    }
}

@Composable
private fun HoldUnderImageFullBleed(url: String) {
    val context = LocalContext.current
    val request =
        remember(url) {
            ImageRequest.Builder(context)
                .data(url)
                .allowHardware(true)
                .build()
        }
    SubcomposeAsyncImage(
        model = request,
        contentDescription = null,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Crop,
    ) {
        when (painter.state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            is AsyncImagePainter.State.Error,
            is AsyncImagePainter.State.Empty,
            is AsyncImagePainter.State.Loading,
            -> {
                Box(Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
private fun ImageSlide(
    url: String,
    durationSeconds: Int?,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val dwellMs = (durationSeconds ?: 8).coerceIn(2, 120) * 1000L
    val request =
        remember(url) {
            ImageRequest.Builder(context)
                .data(url)
                .listener(
                    onError = { _, result ->
                        Log.e(LOG_TAG, "Image load failed: $url", result.throwable)
                    },
                )
                .build()
        }

    SubcomposeAsyncImage(
        model = request,
        contentDescription = null,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Crop,
    ) {
        LaunchedEffect(url, dwellMs) {
            val settled =
                withTimeoutOrNull(120_000) {
                    snapshotFlow { painter.state }.first {
                        it is AsyncImagePainter.State.Success || it is AsyncImagePainter.State.Error
                    }
                }
            when (settled) {
                is AsyncImagePainter.State.Success -> delay(dwellMs)
                is AsyncImagePainter.State.Error -> delay(8_000)
                else -> Unit
            }
            onDone()
        }
        when (val s = painter.state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            is AsyncImagePainter.State.Error -> {
                Log.e(LOG_TAG, "Slide image load failed: $url", s.result.throwable)
                Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(
                        text = "This slide could not be shown. Error code: ${TvUserFacingError.SLIDE_LOAD}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            is AsyncImagePainter.State.Loading,
            is AsyncImagePainter.State.Empty,
            -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "Loading…",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        }
    }
}
