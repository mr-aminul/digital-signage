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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import dev.signage.tv.ui.theme.SignageTvTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    /**
     * TVs often fail to deliver [Intent.ACTION_SCREEN_ON] while still updating [DisplayManager].
     * This catches HDMI/display power so we resync playback after standby.
     */
    private var displayPowerListener: DisplayManager.DisplayListener? = null

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
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            SignageTvTheme {
                val state by viewModel.state.collectAsState()
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    when (val ui = state) {
                        MainUiState.Initializing ->
                            TvLoadingScreen(message = stringResource(R.string.startup_loading))

                        MainUiState.MissingConfig ->
                            TvStandbyBrandingScreen(
                                message = stringResource(R.string.setup_config_needed),
                                hint = stringResource(R.string.setup_config_hint),
                            )

                        is MainUiState.Error -> {
                            val message: String
                            val hint: String
                            val showReset: Boolean
                            if (ui.code == TvUserFacingError.RELAUNCH_TO_PAIR) {
                                message = stringResource(R.string.error_relaunch_title)
                                hint = stringResource(R.string.error_relaunch_hint)
                                showReset = false
                            } else {
                                message = stringResource(R.string.error_connection_title)
                                hint = stringResource(R.string.error_connection_hint)
                                showReset = true
                            }
                            TvStandbyBrandingScreen(
                                message = message,
                                hint = hint,
                                footerContent =
                                    if (showReset) {
                                        {
                                            Spacer(modifier = Modifier.height(28.dp))
                                            Button(onClick = { viewModel.resetRegistration() }) {
                                                Text(stringResource(R.string.button_reset_registration))
                                            }
                                        }
                                    } else {
                                        null
                                    },
                            )
                        }

                        is MainUiState.AwaitingLink -> PairingScreen(ui)

                        is MainUiState.Playback -> PlaybackScreen(state = ui, viewModel = viewModel)
                    }
                }
            }
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
    }

    override fun onStop() {
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
        CircularProgressIndicator(modifier = Modifier.size(48.dp))
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PairingScreen(state: MainUiState.AwaitingLink) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Pair this screen", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = state.pairingCode,
            style = MaterialTheme.typography.displayLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(text = state.message, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
    }
}
