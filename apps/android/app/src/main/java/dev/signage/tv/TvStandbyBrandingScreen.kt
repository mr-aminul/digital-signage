package dev.signage.tv

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Full-screen standby when playback is paused or waiting for content — banner, app name, short status.
 */
@Composable
fun TvStandbyBrandingScreen(
    message: String,
    hint: String? = null,
    footerContent: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = Modifier.fillMaxSize().padding(48.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.ic_tv_banner),
                contentDescription = null,
                modifier =
                    Modifier
                        .size(width = 280.dp, height = 158.dp),
                contentScale = ContentScale.Fit,
            )
            Spacer(modifier = Modifier.height(28.dp))
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.92f),
                textAlign = TextAlign.Center,
            )
            if (hint != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = hint,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.72f),
                    textAlign = TextAlign.Center,
                )
            }
            footerContent?.invoke()
        }
    }
}
