package dev.signage.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Launches the main screen after the device finishes booting.
 * The user may still need to disable battery restrictions on some phones for this to be reliable.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val launch = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching {
            context.startActivity(launch)
        }.onFailure { e ->
            Log.w(TAG, "Failed to start MainActivity after boot", e)
        }
    }

    private companion object {
        const val TAG = "BootCompletedReceiver"
    }
}
