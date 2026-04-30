package dev.signage.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import androidx.core.view.WindowCompat
import dev.signage.tv.ui.theme.SignageTvTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            SignageTvTheme {
                val state by viewModel.state.collectAsState()
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    when (val ui = state) {
                        MainUiState.Initializing -> TvLoadingScreen(message = "Starting…")

                        MainUiState.MissingConfig -> TvErrorCodeScreen(
                            userMessage = "Supabase URL or anon key is missing or still a placeholder. Set supabase.url and supabase.anon.key in local.properties (apps/android or repo root), sync Gradle, rebuild, and enable Anonymous sign-ins in the Supabase dashboard.",
                            code = TvUserFacingError.CONFIG_INCOMPLETE,
                        )

                        is MainUiState.Error -> {
                            val (msg, showReset) =
                                if (ui.code == TvUserFacingError.RELAUNCH_TO_PAIR) {
                                    "Registration was cleared. Restart this app, then get a new pairing code from the web app." to false
                                } else {
                                    "Something went wrong. If this continues, share the code below with support." to true
                                }
                            TvErrorCodeScreen(
                                userMessage = msg,
                                code = ui.code,
                                extraContent =
                                    if (showReset) {
                                        {
                                            Spacer(modifier = Modifier.height(24.dp))
                                            Button(onClick = { viewModel.resetRegistration() }) {
                                                Text("Reset registration")
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
private fun TvErrorCodeScreen(
    userMessage: String,
    code: String,
    extraContent: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = userMessage,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = "Error code: $code",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
        )
        extraContent?.invoke()
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
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Device id: ${state.deviceId}",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
    }
}
