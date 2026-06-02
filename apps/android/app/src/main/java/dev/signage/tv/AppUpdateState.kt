package dev.signage.tv

sealed interface AppUpdateState {
    data object Idle : AppUpdateState

    data object Checking : AppUpdateState

    data class Downloading(
        val versionName: String,
        val progressPercent: Int?,
    ) : AppUpdateState

    /** APK verified on disk; waiting for the activity to launch the system installer. */
    data class ReadyToInstall(
        val versionName: String,
    ) : AppUpdateState

    data class AwaitingUserApproval(
        val versionName: String,
    ) : AppUpdateState

    data class Error(
        val message: String,
    ) : AppUpdateState
}
