package dev.signage.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.signage.tv.AppUpdateState
import dev.signage.tv.R
import dev.signage.tv.ui.theme.SignageColors

@Composable
fun AppUpdateOverlay(
    state: AppUpdateState,
    onInstallClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (state is AppUpdateState.Idle || state is AppUpdateState.Checking) {
        return
    }

    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(SignageColors.ThemeShellDark.copy(alpha = 0.92f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth(0.72f)
                    .background(SignageColors.ThemeShellLight, RoundedCornerShape(16.dp))
                    .padding(horizontal = 32.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when (state) {
                is AppUpdateState.Downloading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.size(44.dp),
                        color = SignageColors.Theme,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Text(
                        text = stringResource(R.string.update_downloading, state.versionName),
                        style = MaterialTheme.typography.titleMedium,
                        color = SignageColors.ThemeForegroundOnDark,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    if (state.progressPercent != null) {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            progress = { state.progressPercent / 100f },
                            color = SignageColors.Theme,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "${state.progressPercent}%",
                            style = MaterialTheme.typography.bodyMedium,
                            color = SignageColors.ThemeForegroundOnDarkSoft,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.update_downloading_indeterminate),
                            style = MaterialTheme.typography.bodyMedium,
                            color = SignageColors.ThemeForegroundOnDarkSoft,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                is AppUpdateState.ReadyToInstall -> {
                    Text(
                        text = stringResource(R.string.update_ready_title, state.versionName),
                        style = MaterialTheme.typography.titleMedium,
                        color = SignageColors.ThemeForegroundOnDark,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.update_ready_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SignageColors.ThemeForegroundOnDarkSoft,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(onClick = onInstallClick) {
                        Text(stringResource(R.string.update_install_now))
                    }
                }

                is AppUpdateState.AwaitingUserApproval -> {
                    Text(
                        text = stringResource(R.string.update_awaiting_title, state.versionName),
                        style = MaterialTheme.typography.titleMedium,
                        color = SignageColors.ThemeForegroundOnDark,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.update_awaiting_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SignageColors.ThemeForegroundOnDarkSoft,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(onClick = onInstallClick) {
                        Text(stringResource(R.string.update_continue_install))
                    }
                }

                is AppUpdateState.Error -> {
                    Text(
                        text = stringResource(R.string.update_error_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = SignageColors.ThemeForegroundOnDark,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = state.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = SignageColors.ThemeForegroundOnDarkSoft,
                        textAlign = TextAlign.Center,
                    )
                }

                AppUpdateState.Checking,
                AppUpdateState.Idle,
                -> Unit
            }
        }
    }
}
