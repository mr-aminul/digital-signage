package dev.signage.tv

import android.app.ActivityManager
import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import java.net.Inet4Address
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Gathers a support-oriented snapshot of the host for [public.devices.telemetry].
 * Wi‑Fi SSID, GPS, and stable Wi‑Fi MAC are not included (Android restrictions / no extra permissions).
 */
object DeviceTelemetryCollector {

    private const val PUBLIC_IP_URL = "https://api64.ipify.org?format=text"

    suspend fun buildPayload(
        application: Application,
        contentRevision: String?,
    ): JsonObject = withContext(Dispatchers.Default) {
        @Suppress("DEPRECATION")
        val pkg = runCatching { application.packageManager.getPackageInfo(application.packageName, 0) }.getOrNull()
        val appVersion = pkg?.versionName
        @Suppress("DEPRECATION")
        val versionCode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pkg?.longVersionCode?.toInt()
            } else {
                @Suppress("DEPRECATION")
                pkg?.versionCode
            } ?: 0
        val cm = application.getSystemService(ConnectivityManager::class.java)
        val cap = cm?.getNetworkCapabilities(cm.activeNetwork)
        val link = cm?.getLinkProperties(cm.activeNetwork)
        val localV4 =
            link
                ?.linkAddresses
                ?.asSequence()
                ?.map { it.address }
                ?.filter { it is Inet4Address && !it.isLoopbackAddress }
                ?.firstOrNull()
                ?.hostAddress
        val transport =
            when {
                cap == null -> "none"
                cap.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                cap.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                cap.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "bluetooth"
                else -> "other"
            }
        val am = application.getSystemService(ActivityManager::class.java) ?: return@withContext buildJsonObject {}
        val mem = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mem)
        val metrics = application.resources.displayMetrics
        val publicIp = fetchPublicIp()
        val maxHeapMb = (Runtime.getRuntime().maxMemory() / (1024L * 1024L)).toInt()
        val androidId =
            Settings.Secure.getString(
                application.contentResolver,
                Settings.Secure.ANDROID_ID,
            ) ?: ""

        val hardware =
            buildJsonObject {
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("brand", Build.BRAND)
                put("device", Build.DEVICE)
                put("product", Build.PRODUCT)
                put("board", Build.BOARD)
                put("hardware", Build.HARDWARE)
                if (Build.FINGERPRINT.isNotBlank()) {
                    put("fingerprint", Build.FINGERPRINT)
                }
                if (Build.ID.isNotBlank()) {
                    put("build_id", Build.ID)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    runCatching { Build.SKU }
                        .getOrNull()
                        ?.takeIf { it.isNotBlank() }
                        ?.let { put("sku", it) }
                }
            }

        val os =
            buildJsonObject {
                put("release", Build.VERSION.RELEASE)
                put("sdk", Build.VERSION.SDK_INT)
                put("security_patch", Build.VERSION.SECURITY_PATCH)
                if (Build.VERSION.INCREMENTAL.isNotBlank()) {
                    put("build_incremental", Build.VERSION.INCREMENTAL)
                }
            }

        val display =
            buildJsonObject {
                put("width_px", metrics.widthPixels)
                put("height_px", metrics.heightPixels)
                put("density", metrics.density)
                put("scaled_density", metrics.scaledDensity)
                put("density_dpi", metrics.densityDpi)
                put("screen_width_dp", calcDp(metrics.widthPixels, metrics))
                put("screen_height_dp", calcDp(metrics.heightPixels, metrics))
                val sw = application.resources.configuration.smallestScreenWidthDp
                if (sw > 0) {
                    put("smallest_width_dp", sw)
                }
            }

        val isMetered =
            when {
                cap == null -> true
                cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) -> false
                else -> true
            }

        return@withContext buildJsonObject {
            put("app", buildJsonObject {
                put("package", application.packageName)
                appVersion?.let { put("version_name", it) }
                put("version_code", versionCode)
            })
            put("os", os)
            put("hardware", hardware)
            put("display", display)
            put("abis", JsonArray(Build.SUPPORTED_ABIS.map { JsonPrimitive(it) }))
            put("network", buildJsonObject {
                put("type", transport)
                put("metered", isMetered)
                put(
                    "mac_note",
                    "Wi-Fi MAC is not exposed to apps on current Android; use local_ipv4 and public for reachability.",
                )
                if (localV4 != null) {
                    put("local_ipv4", localV4)
                }
                if (publicIp != null) {
                    put("public_ipv4", publicIp)
                }
            })
            put("locale", Locale.getDefault().toString())
            put("timezone", TimeZone.getDefault().id)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am.isLowRamDevice) {
                put("is_low_ram_device", true)
            }
            put("ram_total_mb", (mem.totalMem / (1024L * 1024L)).toString())
            put("jvm_max_heap_mb", maxHeapMb)
            put("settings_android_id", androidId)
            contentRevision?.let { put("content_revision", it) }
        }
    }

    private fun calcDp(px: Int, metrics: DisplayMetrics): Int =
        (px / metrics.density).roundToInt()

    private suspend fun fetchPublicIp(): String? =
        withContext(Dispatchers.IO) {
            runCatching {
                KtorClientProvider.unsafeHttpClient.get(PUBLIC_IP_URL).bodyAsText().trim()
            }.getOrNull()
        }
}
