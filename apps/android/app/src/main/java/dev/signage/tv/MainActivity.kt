package dev.signage.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Display
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import dev.signage.tv.ui.AppUpdateOverlay
import dev.signage.tv.ui.SignageBrandHeaderTv
import dev.signage.tv.ui.SignageBrandMark
import dev.signage.tv.ui.SignageShellBackground
import dev.signage.tv.ui.theme.SignageColors
import dev.signage.tv.ui.theme.SignageTvTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    /**
     * Emulator “TV power” often leaves the activity resumed while only window focus toggles.
     * Process lifecycle catches coming back from real background.
     */
    private val processForegroundObserver =
        object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                viewModel.onPlaybackForegroundEvent()
            }
        }

    /**
     * TVs often fail to deliver [Intent.ACTION_SCREEN_ON] while still updating [DisplayManager].
     * This catches HDMI/display power so we resync playback after standby.
     */
    private var displayPowerListener: DisplayManager.DisplayListener? = null

    private var networkPlaybackObserver: PlaybackNetworkObserver? = null

    private val screenPowerReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?,
            ) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_ON -> viewModel.onPlaybackForegroundEvent()
                    Intent.ACTION_SCREEN_OFF -> viewModel.onPlaybackBackgroundEvent()
                    else -> Unit
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ProcessLifecycleOwner.get().lifecycle.addObserver(processForegroundObserver)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            SignageTvTheme {
                val state by viewModel.state.collectAsState()
                val updateState by viewModel.appUpdateState.collectAsState()
                LaunchedEffect(updateState) {
                    if (updateState is AppUpdateState.ReadyToInstall) {
                        viewModel.installPendingUpdate(this@MainActivity)
                    }
                }
                Box(modifier = Modifier.fillMaxSize()) {
                    SignageShellBackground {
                        when (val ui = state) {
                        MainUiState.Initializing ->
                            TvLoadingScreen(message = stringResource(R.string.startup_loading))

                        MainUiState.MissingConfig ->
                            TvStandbyBrandingScreen(
                                message = stringResource(R.string.setup_config_needed),
                                hint = stringResource(R.string.setup_config_hint),
                            )

                        is MainUiState.Error -> {
                            when (ui.code) {
                                TvUserFacingError.RELAUNCH_TO_PAIR ->
                                    TvStandbyBrandingScreen(
                                        message = stringResource(R.string.error_relaunch_title),
                                        hint = stringResource(R.string.error_relaunch_hint),
                                    )

                                TvUserFacingError.SSL_TRUST_FAILED ->
                                    TvStandbyBrandingScreen(
                                        message = stringResource(R.string.error_ssl_trust_title),
                                        hint = stringResource(R.string.error_ssl_trust_hint),
                                        footerContent = {
                                            Spacer(modifier = Modifier.height(28.dp))
                                            Button(onClick = { viewModel.retryAfterConnectionError() }) {
                                                Text(stringResource(R.string.button_try_again))
                                            }
                                        },
                                    )

                                else ->
                                    TvStandbyBrandingScreen(
                                        message = stringResource(R.string.error_connection_title),
                                        hint = stringResource(R.string.error_connection_hint),
                                        footerContent = {
                                            Spacer(modifier = Modifier.height(28.dp))
                                            Button(onClick = { viewModel.resetRegistration() }) {
                                                Text(stringResource(R.string.button_reset_registration))
                                            }
                                        },
                                    )
                            }
                        }

                        is MainUiState.AwaitingLink -> PairingScreen(ui)

                        is MainUiState.Playback -> PlaybackScreen(state = ui, viewModel = viewModel)
                        }
                    }
                    AppUpdateOverlay(
                        state = updateState,
                        onInstallClick = { viewModel.installPendingUpdate(this@MainActivity) },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        ProcessLifecycleOwner.get().lifecycle.removeObserver(processForegroundObserver)
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            viewModel.onPlaybackForegroundEvent()
        }
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(
            this,
            screenPowerReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        val dm = getSystemService(DisplayManager::class.java)
        val listener =
            object : DisplayManager.DisplayListener {
                override fun onDisplayAdded(displayId: Int) {}

                override fun onDisplayRemoved(displayId: Int) {}

                override fun onDisplayChanged(displayId: Int) {
                    if (displayId != Display.DEFAULT_DISPLAY) {
                        return
                    }
                    when (dm.getDisplay(displayId)?.state) {
                        Display.STATE_ON -> viewModel.onPlaybackForegroundEvent()
                        Display.STATE_OFF -> viewModel.onPlaybackBackgroundEvent()
                        else -> Unit
                    }
                }
            }
        displayPowerListener = listener
        dm.registerDisplayListener(listener, Handler(Looper.getMainLooper()))

        networkPlaybackObserver =
            PlaybackNetworkObserver(this) {
                viewModel.requestImmediatePlaybackSync()
            }.also { it.register() }
    }

    override fun onStop() {
        networkPlaybackObserver?.unregister()
        networkPlaybackObserver = null
        displayPowerListener?.let { listener ->
            getSystemService(DisplayManager::class.java).unregisterDisplayListener(listener)
            displayPowerListener = null
        }
        unregisterReceiver(screenPowerReceiver)
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        viewModel.onPlaybackForegroundEvent()
        viewModel.onActivityResumedForUpdate(this)
    }

    override fun onPause() {
        viewModel.onPlaybackBackgroundEvent()
        super.onPause()
    }
}

@Composable
private fun TvLoadingScreen(message: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SignageBrandMark(
            boxWidth = 102.dp,
            boxHeight = 96.dp,
            cornerRadius = 9.dp,
            iconSize = 54.dp,
        )
        Spacer(modifier = Modifier.height(28.dp))
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = SignageColors.Theme,
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = SignageColors.ThemeForegroundOnDark,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PairingScreen(state: MainUiState.AwaitingLink) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
    ) {
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            SignageBrandHeaderTv()
        }
        Spacer(modifier = Modifier.height(40.dp))
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Pair this screen",
                style = MaterialTheme.typography.titleLarge,
                color = SignageColors.ThemeForegroundOnDark,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = state.pairingCode,
                style = MaterialTheme.typography.displayLarge,
                color = SignageColors.Theme,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = state.message,
                style = MaterialTheme.typography.bodyLarge,
                color = SignageColors.ThemeForegroundOnDarkSoft,
                textAlign = TextAlign.Center,
            )
        }
    }
}
