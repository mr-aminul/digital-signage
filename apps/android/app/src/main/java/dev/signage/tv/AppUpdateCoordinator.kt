package dev.signage.tv

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

private const val UPDATE_LOG_TAG = "SignageTV.Update"

private val Application.updateDataStore by preferencesDataStore(name = "signage_app_update")

private object UpdateKeys {
    val LAST_FAILED_VERSION_CODE = intPreferencesKey("last_failed_version_code")
    val LAST_FAILED_AT_MS = longPreferencesKey("last_failed_at_ms")
}

@Serializable
private data class TvCheckAppUpdateParams(
    @SerialName("p_version_code")
    val pVersionCode: Int,
    @SerialName("p_package_name")
    val pPackageName: String,
)

@Serializable
private data class TvCheckAppUpdateResult(
    @SerialName("updateAvailable")
    val updateAvailable: Boolean = false,
    @SerialName("versionCode")
    val versionCode: Int? = null,
    @SerialName("versionName")
    val versionName: String? = null,
    @SerialName("storagePath")
    val storagePath: String? = null,
    val sha256: String? = null,
    @SerialName("releaseNotes")
    val releaseNotes: String? = null,
)

class AppUpdateCoordinator(
    private val application: Application,
) {
    private val dataStore = application.updateDataStore
    private val workMutex = Mutex()

    private val _state = MutableStateFlow<AppUpdateState>(AppUpdateState.Idle)
    val state: StateFlow<AppUpdateState> = _state.asStateFlow()

    suspend fun runUpdateLoop(
        supabase: SupabaseClient,
        checkAuthReady: suspend () -> Unit,
    ) {
        while (true) {
            try {
                checkAuthReady()
                checkDownloadAndInstall(supabase)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(UPDATE_LOG_TAG, "update loop iteration failed", e)
            }
            delay(UPDATE_CHECK_INTERVAL_MS)
        }
    }

    suspend fun retryInstall(activity: ComponentActivity) {
        val ready = _state.value
        if (ready is AppUpdateState.ReadyToInstall || ready is AppUpdateState.AwaitingUserApproval) {
            launchInstallIntent(activity)
        } else {
            workMutex.withLock {
                if (cachedApkFile().exists()) {
                    launchInstallIntent(activity)
                }
            }
        }
    }

    private suspend fun checkDownloadAndInstall(supabase: SupabaseClient) {
        workMutex.withLock {
            if (_state.value is AppUpdateState.Downloading) {
                return
            }
            val currentVersionCode = installedVersionCode()
            _state.value = AppUpdateState.Checking
            val update =
                runCatching {
                    supabase.postgrest.rpc(
                        "tv_check_app_update",
                        TvCheckAppUpdateParams(
                            pVersionCode = currentVersionCode,
                            pPackageName = application.packageName,
                        ),
                    ).decodeAs<TvCheckAppUpdateResult>()
                }.getOrElse { e ->
                    Log.d(UPDATE_LOG_TAG, "tv_check_app_update failed", e)
                    _state.value = AppUpdateState.Idle
                    return
                }

            if (!update.updateAvailable ||
                update.versionCode == null ||
                update.storagePath.isNullOrBlank() ||
                update.sha256.isNullOrBlank()
            ) {
                _state.value = AppUpdateState.Idle
                return
            }

            if (shouldSkipAfterRecentFailure(update.versionCode)) {
                Log.d(UPDATE_LOG_TAG, "skipping v${update.versionCode} after recent failed install")
                _state.value = AppUpdateState.Idle
                return
            }

            val versionName = update.versionName?.takeIf { it.isNotBlank() } ?: update.versionCode.toString()
            val downloadUrl = buildDownloadUrl(update.storagePath)
            val targetFile = cachedApkFile()

            if (targetFile.exists() && sha256Hex(targetFile).equals(update.sha256, ignoreCase = true)) {
                Log.i(UPDATE_LOG_TAG, "reusing cached APK for v$versionName")
                _state.value = AppUpdateState.ReadyToInstall(versionName)
                return
            }

            _state.value = AppUpdateState.Downloading(versionName, progressPercent = 0)
            val downloaded =
                runCatching {
                    downloadApk(downloadUrl, targetFile) { progress ->
                        _state.value = AppUpdateState.Downloading(versionName, progress)
                    }
                }.getOrElse { e ->
                    Log.e(UPDATE_LOG_TAG, "download failed", e)
                    targetFile.delete()
                    recordFailedAttempt(update.versionCode)
                    _state.value = AppUpdateState.Error("Update download failed.")
                    delay(FAILED_UPDATE_BACKOFF_MS)
                    _state.value = AppUpdateState.Idle
                    return
                }

            if (!downloaded) {
                targetFile.delete()
                recordFailedAttempt(update.versionCode)
                _state.value = AppUpdateState.Error("Update download failed.")
                delay(FAILED_UPDATE_BACKOFF_MS)
                _state.value = AppUpdateState.Idle
                return
            }

            val digest = sha256Hex(targetFile)
            if (!digest.equals(update.sha256, ignoreCase = true)) {
                Log.e(UPDATE_LOG_TAG, "sha256 mismatch expected=${update.sha256} actual=$digest")
                targetFile.delete()
                recordFailedAttempt(update.versionCode)
                _state.value = AppUpdateState.Error("Update verification failed.")
                delay(FAILED_UPDATE_BACKOFF_MS)
                _state.value = AppUpdateState.Idle
                return
            }

            clearFailedAttempt()
            _state.value = AppUpdateState.ReadyToInstall(versionName)
        }
    }

    fun launchInstallIntent(activity: ComponentActivity) {
        val apkFile = cachedApkFile()
        if (!apkFile.exists()) {
            _state.value = AppUpdateState.Error("Update file missing.")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            val versionName =
                (_state.value as? AppUpdateState.ReadyToInstall)?.versionName
                    ?: (_state.value as? AppUpdateState.AwaitingUserApproval)?.versionName
                    ?: ""
            _state.value = AppUpdateState.AwaitingUserApproval(versionName)
            val settingsIntent =
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${activity.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            runCatching { activity.startActivity(settingsIntent) }
                .onFailure { e ->
                    Log.e(UPDATE_LOG_TAG, "could not open unknown-sources settings", e)
                    _state.value = AppUpdateState.Error("Allow installs from this app in Settings, then try again.")
                }
            return
        }

        val contentUri =
            FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile,
            )
        val installIntent =
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        runCatching { activity.startActivity(installIntent) }
            .onSuccess {
                val versionName =
                    (_state.value as? AppUpdateState.ReadyToInstall)?.versionName
                        ?: (_state.value as? AppUpdateState.AwaitingUserApproval)?.versionName
                        ?: ""
                _state.value = AppUpdateState.AwaitingUserApproval(versionName)
            }
            .onFailure { e ->
                Log.e(UPDATE_LOG_TAG, "install intent failed", e)
                _state.value = AppUpdateState.Error("Could not start the installer.")
            }
    }

    private suspend fun shouldSkipAfterRecentFailure(versionCode: Int): Boolean {
        val prefs = dataStore.data.first()
        val failedCode = prefs[UpdateKeys.LAST_FAILED_VERSION_CODE] ?: return false
        val failedAt = prefs[UpdateKeys.LAST_FAILED_AT_MS] ?: return false
        if (failedCode != versionCode) return false
        return System.currentTimeMillis() - failedAt < FAILED_UPDATE_BACKOFF_MS
    }

    private suspend fun recordFailedAttempt(versionCode: Int) {
        dataStore.edit { prefs ->
            prefs[UpdateKeys.LAST_FAILED_VERSION_CODE] = versionCode
            prefs[UpdateKeys.LAST_FAILED_AT_MS] = System.currentTimeMillis()
        }
    }

    private suspend fun clearFailedAttempt() {
        dataStore.edit { prefs ->
            prefs.remove(UpdateKeys.LAST_FAILED_VERSION_CODE)
            prefs.remove(UpdateKeys.LAST_FAILED_AT_MS)
        }
    }

    private fun buildDownloadUrl(storagePath: String): String {
        val base = BuildConfig.SUPABASE_URL.trim().trimEnd('/')
        val path = storagePath.trimStart('/')
        return "$base/storage/v1/object/public/releases/$path"
    }

    private fun cachedApkFile(): File = File(application.cacheDir, "ota-update.apk")

    private fun installedVersionCode(): Int {
        @Suppress("DEPRECATION")
        val pkg =
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    application.packageManager.getPackageInfo(application.packageName, 0).longVersionCode.toInt()
                } else {
                    application.packageManager.getPackageInfo(application.packageName, 0).versionCode
                }
            }.getOrNull()
        return pkg ?: BuildConfig.VERSION_CODE
    }

    private suspend fun downloadApk(
        url: String,
        targetFile: File,
        onProgress: (Int?) -> Unit,
    ): Boolean =
        withContext(Dispatchers.IO) {
            val partFile = File(targetFile.parentFile, "${targetFile.name}.part")
            partFile.delete()
            targetFile.delete()

            val client =
                SignageOkHttpClient.instance.newBuilder()
                    .readTimeout(15, TimeUnit.MINUTES)
                    .writeTimeout(15, TimeUnit.MINUTES)
                    .build()
            val request = Request.Builder().url(url).get().build()
            val response =
                runCatching { client.newCall(request).execute() }.getOrElse {
                    partFile.delete()
                    return@withContext false
                }
            response.use { httpResponse ->
                if (!httpResponse.isSuccessful) {
                    partFile.delete()
                    return@withContext false
                }
                val body = httpResponse.body ?: run {
                    partFile.delete()
                    return@withContext false
                }
                val contentLength = body.contentLength().takeIf { it > 0L }
                body.byteStream().use { input ->
                    FileOutputStream(partFile).use { output ->
                        val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
                        var totalRead = 0L
                        while (isActive) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            totalRead += read
                            if (contentLength != null) {
                                val pct = ((totalRead * 100L) / contentLength).toInt().coerceIn(0, 100)
                                onProgress(pct)
                            } else {
                                onProgress(null)
                            }
                        }
                    }
                }
            }

            if (!partFile.exists() || partFile.length() <= 0L) {
                partFile.delete()
                return@withContext false
            }

            if (!partFile.renameTo(targetFile)) {
                partFile.copyTo(targetFile, overwrite = true)
                partFile.delete()
            }
            onProgress(100)
            true
        }

    private fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DOWNLOAD_BUFFER_BYTES)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

    companion object {
        private const val UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L
        private const val FAILED_UPDATE_BACKOFF_MS = 6 * 60 * 60 * 1000L
        private const val DOWNLOAD_BUFFER_BYTES = 64 * 1024
    }
}
