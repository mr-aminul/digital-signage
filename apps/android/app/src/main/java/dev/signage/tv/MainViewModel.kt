package dev.signage.tv

import android.app.Application
import android.provider.Settings
import android.util.Log
import androidx.annotation.OptIn
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.result.PostgrestResult
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.util.concurrent.atomic.AtomicReference
import kotlin.random.Random

private const val LOG_TAG = "SignageTV"

private val Application.deviceDataStore by preferencesDataStore(name = "signage_device")

private val cachedPlaybackJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
}

/**
 * PostgREST returns `[{...}]` by default, but `single()` uses `Accept: application/vnd.pgrst.object+json`,
 * which returns `{...}`. supabase-kt's [PostgrestResult.decodeSingle] only accepts a JSON array.
 */
private inline fun <reified T : Any> PostgrestResult.decodeOneRow(): T {
    val payload = data.trim()
    return if (payload.startsWith("[")) decodeSingle<T>() else decodeAs<T>()
}

private object DeviceKeys {
    val DEVICE_ID = stringPreferencesKey("device_id")
    val PAIRING_CODE = stringPreferencesKey("pairing_code")
    val CACHED_PLAYBACK = stringPreferencesKey("cached_playback_v1")
    /** [android.provider.Settings.Secure.ANDROID_ID] for this app; stable for identifying this install. */
    val ANDROID_INSTALLATION_ID = stringPreferencesKey("android_installation_id")
    /**
     * Supabase auth user id (anonymous) that registered the device. Must match the restored session for RLS.
     */
    val REGISTERED_SESSION_ID = stringPreferencesKey("registered_session_id")
}

sealed interface MainUiState {
    /** Initial connect / registration in progress. */
    data object Initializing : MainUiState

    data object MissingConfig : MainUiState

    data class AwaitingLink(
        val pairingCode: String,
        val deviceId: String,
        val message: String,
    ) : MainUiState

    data class Playback(
        val deviceName: String,
        val deviceId: String,
        val playlistName: String?,
        val slides: List<PlaybackSlide>,
        /** True when tv_get_playback_slides rejected the caller (lost anon session vs registered_session_id). */
        val isRegistrationMismatch: Boolean = false,
        /** In-memory; last successful RPC (or cache on cold start) had network payload. */
        val isFromCache: Boolean = false,
        val contentRevision: String? = null,
        val playlistId: String? = null,
        /** Mirrors [DeviceRow.screenOrientation] from poll (dashboard setting). */
        val screenOrientation: String = "landscape",
    ) : MainUiState

    /**
     * Fatal to the main flow. [code] is a [TvUserFacingError] constant for support;
     * details are in logcat, not in [code].
     */
    data class Error(val code: String) : MainUiState
}

@Serializable
data class DeviceInsert(
    @SerialName("pairing_code") val pairingCode: String,
    val name: String = "Android TV",
    val status: String = "pending_pairing",
    @SerialName("registered_session_id") val registeredSessionId: String,
)

@Serializable
data class DeviceRow(
    val id: String,
    @SerialName("owner_id") val ownerId: String? = null,
    @SerialName("pairing_code") val pairingCode: String,
    val name: String,
    val status: String,
    @SerialName("screen_orientation") val screenOrientation: String = "landscape",
)

@Serializable
private data class TvGetPlaybackParams(
    @SerialName("p_device_id")
    val pDeviceId: String,
)

@Serializable
private data class TvGetPlaybackResult(
    val ok: Boolean,
    val playlistName: String? = null,
    val contentRevision: String? = null,
    val playlistId: String? = null,
    val slides: List<TvGetPlaybackSlide> = emptyList(),
)

@Serializable
private data class TvGetPlaybackSlide(
    @SerialName("fileType")
    val fileType: String,
    @SerialName("durationSeconds")
    val durationSeconds: Int? = null,
    @SerialName("storagePath")
    val storagePath: String,
)

@Serializable
private data class TvDeviceReportTelemetryParams(
    @SerialName("p_device_id")
    val pDeviceId: String,
    @SerialName("p_telemetry")
    val pTelemetry: JsonObject,
)

@Serializable
private data class TvMergePlaybackSnapshotParams(
    @SerialName("p_device_id")
    val pDeviceId: String,
    @SerialName("p_playback")
    val pPlayback: JsonObject,
)

private const val TELEMETRY_INTERVAL_MS = 120_000L

private const val ANONYMOUS_SIGN_IN_MAX_ATTEMPTS = 8
private const val SUPABASE_NETWORK_RETRY_MAX = 4

@OptIn(UnstableApi::class)
class MainViewModel(
    application: Application,
) : AndroidViewModel(application) {
    private val dataStore = application.deviceDataStore
    private var playbackObserveJob: Job? = null
    private var telemetryJob: Job? = null
    private var telemetryDeviceId: String? = null
    private val lastContentRevision = AtomicReference<String?>(null)
    private var signageExo: SignageExoController? = null

    private val supabase by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            httpEngine = KtorClientProvider.unsafeHttpClient.engine
            install(Auth)
            install(Postgrest)
        }
    }

    private val _state = MutableStateFlow<MainUiState>(MainUiState.Initializing)
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    init {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            Log.e(LOG_TAG, "TvUserFacingError ${TvUserFacingError.CONFIG_INCOMPLETE}: SUPABASE_URL or SUPABASE_ANON_KEY is blank in build")
            _state.value = MainUiState.MissingConfig
        } else {
            viewModelScope.launch {
                runCatching {
                    startRegistrationFlow()
                }.onFailure { throwable ->
                    Log.e(LOG_TAG, "TvUserFacingError ${TvUserFacingError.STARTUP_FAILED} startRegistrationFlow", throwable)
                    _state.value = MainUiState.Error(TvUserFacingError.STARTUP_FAILED)
                    publishPlaybackUnavailableToCloud(TvUserFacingError.STARTUP_FAILED)
                }
            }
        }
    }

    private fun ensureSignageExo() {
        if (signageExo == null) {
            signageExo = SignageExoController(getApplication())
        }
    }

    fun exoForPlayback(): SignageExoController {
        ensureSignageExo()
        return signageExo!!
    }

    /**
     * Prefetch the *next* slide in loop order when it is a video, so a prior image (or first loop)
     * can warm the disk cache and Exo buffer.
     */
    fun onPlaybackSlideContext(
        currentIndex: Int,
        slides: List<PlaybackSlide>,
    ) {
        if (slides.isEmpty()) {
            return
        }
        val n = slides.size
        val next = slides[(currentIndex + 1) % n]
        if (next.fileType == "video") {
            signageExo?.requestPrefetchIfVideo(next.url)
        }
    }

    private suspend fun readCachedPlaybackOnly(deviceId: String): MainUiState.Playback? {
        val raw = dataStore.data.first()[DeviceKeys.CACHED_PLAYBACK] ?: return null
        val cached = runCatching { cachedPlaybackJson.decodeFromString<CachedPlaybackV1>(raw) }.getOrNull()
            ?: return null
        if (cached.deviceId != deviceId) {
            return null
        }
        if (cached.slides.isEmpty()) {
            return null
        }
        val orient =
            cached.screenOrientation.trim().lowercase().takeIf { it == "portrait" || it == "landscape" }
                ?: "landscape"
        return MainUiState.Playback(
            deviceName = "",
            deviceId = deviceId,
            playlistName = cached.playlistName,
            slides = cached.slides,
            isRegistrationMismatch = false,
            isFromCache = true,
            contentRevision = cached.contentRevision,
            playlistId = cached.playlistId,
            screenOrientation = orient,
        )
    }

    private suspend fun writeCachedPlayback(
        deviceId: String,
        res: TvGetPlaybackResult,
        slides: List<PlaybackSlide>,
        screenOrientation: String,
    ) {
        if (slides.isEmpty()) {
            return
        }
        val payload =
            CachedPlaybackV1(
                deviceId = deviceId,
                playlistName = res.playlistName,
                contentRevision = res.contentRevision,
                playlistId = res.playlistId,
                savedAtMs = System.currentTimeMillis(),
                slides = slides,
                screenOrientation = screenOrientation,
            )
        dataStore.edit { it[DeviceKeys.CACHED_PLAYBACK] = cachedPlaybackJson.encodeToString(CachedPlaybackV1.serializer(), payload) }
    }

    private suspend fun clearCachedPlayback() {
        dataStore.edit { it.remove(DeviceKeys.CACHED_PLAYBACK) }
    }

    private suspend fun persistDeviceMetadata() {
        val app = getApplication<Application>()
        dataStore.edit { prefs ->
            Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID)
                ?.let { id ->
                    if (prefs[DeviceKeys.ANDROID_INSTALLATION_ID] == null) {
                        prefs[DeviceKeys.ANDROID_INSTALLATION_ID] = id
                    }
                }
            supabase.auth.currentUserOrNull()?.id?.let { uid ->
                prefs[DeviceKeys.REGISTERED_SESSION_ID] = uid
            }
        }
    }

    private suspend fun startRegistrationFlow() {
        // Wait until persisted GoTrue session is loaded. Calling signInAnonymously() before that replaces
        // the session and breaks access to the existing device (registered_session_id must match auth.uid()).
        supabase.auth.awaitInitialization()
        if (supabase.auth.currentSessionOrNull() == null) {
            ensureAnonymousUserIdOrNull()
        }

        val snapshot = dataStore.data.first()
        val storedDeviceId = snapshot[DeviceKeys.DEVICE_ID]
        val storedPairingCode = snapshot[DeviceKeys.PAIRING_CODE]

        if (storedDeviceId != null && storedPairingCode != null) {
            val registeredSnapshot = snapshot[DeviceKeys.REGISTERED_SESSION_ID]
            val currentUid = supabase.auth.currentUserOrNull()?.id
            if (registeredSnapshot != null && currentUid != null && registeredSnapshot != currentUid) {
                Log.w(
                    LOG_TAG,
                    "TvUserFacingError: stored registered_session_id does not match current user; clearing local registration",
                )
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                    prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                    prefs.remove(DeviceKeys.CACHED_PLAYBACK)
                }
            } else {
                val visible = fetchDeviceRowWithRetry(storedDeviceId)
                if (visible != null) {
                    persistDeviceMetadata()
                    if (visible.ownerId != null) {
                        startPlaybackObservation(storedDeviceId, visible.name)
                        return
                    }
                    _state.value =
                        MainUiState.AwaitingLink(
                            pairingCode = storedPairingCode,
                            deviceId = storedDeviceId,
                            message = "Enter this code in the web dashboard to finish linking.",
                        )
                    startDeviceTelemetryLoop(storedDeviceId)
                    pollUntilLinked(storedDeviceId)
                    return
                }
                // Row not visible to this session (new anonymous user, cleared DB, etc.) — drop stale cache
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                    prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                }
            }
        }

        createNewDeviceAndPoll()
    }

    /** Uses a normal JSON array response (no `.single()`); RLS returns [] if this session cannot see the row. */
    private suspend fun fetchDeviceRow(deviceId: String): DeviceRow? =
        supabase
            .from("devices")
            .select {
                filter {
                    eq("id", deviceId)
                }
            }.decodeList<DeviceRow>()
            .firstOrNull()

    /**
     * PostgREST calls can fail transiently on cold emulator / DNS / TLS handshakes.
     * Retries before surfacing [TvUserFacingError.STARTUP_FAILED].
     */
    private suspend fun fetchDeviceRowWithRetry(deviceId: String): DeviceRow? {
        var lastError: Throwable? = null
        repeat(SUPABASE_NETWORK_RETRY_MAX) { attempt ->
            runCatching {
                return fetchDeviceRow(deviceId)
            }.onFailure { e ->
                lastError = e
                Log.w(LOG_TAG, "fetchDeviceRow failed (attempt ${attempt + 1}/$SUPABASE_NETWORK_RETRY_MAX)", e)
                if (attempt < SUPABASE_NETWORK_RETRY_MAX - 1) {
                    delay(minOf(2000L, 250L shl attempt))
                }
            }
        }
        throw lastError ?: IllegalStateException("fetchDeviceRowWithRetry exhausted")
    }

    private suspend fun <T> retrySupabaseNetwork(
        label: String,
        block: suspend () -> T,
    ): T {
        var lastError: Throwable? = null
        repeat(SUPABASE_NETWORK_RETRY_MAX) { attempt ->
            runCatching {
                return block()
            }.onFailure { e ->
                lastError = e
                Log.w(LOG_TAG, "$label failed (attempt ${attempt + 1}/$SUPABASE_NETWORK_RETRY_MAX)", e)
                if (attempt < SUPABASE_NETWORK_RETRY_MAX - 1) {
                    delay(minOf(3000L, 250L shl attempt))
                }
            }
        }
        throw lastError ?: IllegalStateException(label)
    }

    private suspend fun ensureAnonymousUserIdOrNull(): String? {
        supabase.auth.currentUserOrNull()?.id?.let {
            return it
        }
        signInAnonymouslyWithRetries(clearSessionFirst = false)?.let {
            return it
        }
        // Stale GoTrue session (e.g. project URL/key changed in Gradle) can block new anonymous sessions.
        Log.w(LOG_TAG, "anonymous sign-in failed after retries; clearing auth session and retrying")
        runCatching { supabase.auth.signOut() }
        return signInAnonymouslyWithRetries(clearSessionFirst = true)
    }

    private suspend fun signInAnonymouslyWithRetries(clearSessionFirst: Boolean): String? {
        repeat(ANONYMOUS_SIGN_IN_MAX_ATTEMPTS) { attempt ->
            runCatching {
                supabase.auth.signInAnonymously()
            }.onFailure { e ->
                Log.w(
                    LOG_TAG,
                    "signInAnonymously failed (attempt ${attempt + 1}/$ANONYMOUS_SIGN_IN_MAX_ATTEMPTS, afterClear=$clearSessionFirst)",
                    e,
                )
            }
            supabase.auth.currentUserOrNull()?.id?.let {
                return it
            }
            delay(minOf(4000L, 200L shl minOf(attempt, 4)))
        }
        return null
    }

    private suspend fun createNewDeviceAndPoll() {
        val pairingCode = generatePairingCode()
        val registrationId =
            ensureAnonymousUserIdOrNull()
                ?: run {
                    Log.e(LOG_TAG, "TvUserFacingError ${TvUserFacingError.STARTUP_FAILED}: no Supabase user after anonymous sign-in")
                    _state.value = MainUiState.Error(TvUserFacingError.STARTUP_FAILED)
                    publishPlaybackUnavailableToCloud(TvUserFacingError.STARTUP_FAILED)
                    return
                }

        val inserted =
            retrySupabaseNetwork("devices.insert") {
                supabase
                    .from("devices")
                    .insert(
                        DeviceInsert(
                            pairingCode = pairingCode,
                            registeredSessionId = registrationId,
                        ),
                    ) { select() }
                    .decodeOneRow<DeviceRow>()
            }

        dataStore.edit { prefs ->
            prefs[DeviceKeys.DEVICE_ID] = inserted.id
            prefs[DeviceKeys.PAIRING_CODE] = inserted.pairingCode
            val installId = Settings.Secure.getString(
                getApplication<Application>().contentResolver,
                Settings.Secure.ANDROID_ID,
            )
            if (installId != null) {
                prefs[DeviceKeys.ANDROID_INSTALLATION_ID] = installId
            }
            supabase.auth.currentUserOrNull()?.id?.let { uid ->
                prefs[DeviceKeys.REGISTERED_SESSION_ID] = uid
            }
        }

        _state.value =
            MainUiState.AwaitingLink(
                pairingCode = inserted.pairingCode,
                deviceId = inserted.id,
                message = "Waiting for the owner to link this screen…",
            )

        startDeviceTelemetryLoop(inserted.id)
        pollUntilLinked(inserted.id)
    }

    private suspend fun pollUntilLinked(deviceId: String) {
        while (true) {
            val row =
                try {
                    fetchDeviceRow(deviceId)
                } catch (_: Exception) {
                    delay(10_000)
                    continue
                }

            if (row == null) {
                // No row: stale local id for this anon session, or device removed — register again
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                    prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                }
                createNewDeviceAndPoll()
                return
            }

            if (row.ownerId != null) {
                startPlaybackObservation(deviceId, row.name)
                return
            }

            delay(5_000)
        }
    }

    private fun startPlaybackObservation(
        deviceId: String,
        deviceName: String,
    ) {
        playbackObserveJob?.cancel()
        startDeviceTelemetryLoop(deviceId)
        ensureSignageExo()
        playbackObserveJob =
            viewModelScope.launch {
                val cached = readCachedPlaybackOnly(deviceId)
                if (cached != null) {
                    _state.value = cached.copy(deviceName = deviceName, isFromCache = true)
                }
                while (isActive) {
                    try {
                        _state.value = loadPlaybackState(deviceName, deviceId)
                    } catch (e: Exception) {
                        Log.e(LOG_TAG, "loadPlaybackState failed", e)
                        val now = _state.value
                        if (now is MainUiState.Playback && now.deviceId == deviceId && now.slides.isNotEmpty()) {
                            // Keep last good manifest (includes disk cache) until the next poll succeeds.
                        } else if (cached != null) {
                            _state.value = cached.copy(deviceName = deviceName, isFromCache = true)
                        } else {
                            _state.value =
                                MainUiState.Playback(
                                    deviceName = deviceName,
                                    deviceId = deviceId,
                                    playlistName = null,
                                    slides = emptyList(),
                                    isRegistrationMismatch = false,
                                    screenOrientation = (now as? MainUiState.Playback)?.screenOrientation ?: "landscape",
                                )
                        }
                    }
                    delay(4_000)
                }
            }
    }

    private suspend fun mergePlaybackErrorSnapshot(
        errorCode: String,
        deviceId: String,
    ) {
        runCatching {
            supabase.postgrest.rpc(
                "tv_merge_playback_snapshot",
                TvMergePlaybackSnapshotParams(
                    pDeviceId = deviceId,
                    pPlayback = PlaybackSnapshot.buildPlayerErrorJson(errorCode),
                ),
            )
        }.onFailure { e ->
            Log.d(LOG_TAG, "tv_merge_playback_snapshot error snapshot failed", e)
        }
    }

    private fun publishPlaybackUnavailableToCloud(errorCode: String) {
        val deviceId = telemetryDeviceId ?: return
        viewModelScope.launch {
            mergePlaybackErrorSnapshot(errorCode, deviceId)
        }
    }

    private fun startDeviceTelemetryLoop(deviceId: String) {
        telemetryDeviceId = deviceId
        telemetryJob?.cancel()
        telemetryJob =
            viewModelScope.launch {
                while (isActive) {
                    runCatching {
                        val payload =
                            DeviceTelemetryCollector.buildPayload(
                                getApplication(),
                                lastContentRevision.get(),
                            )
                        supabase.postgrest.rpc(
                            "tv_device_report_telemetry",
                            TvDeviceReportTelemetryParams(
                                pDeviceId = deviceId,
                                pTelemetry = payload,
                            ),
                        )
                    }.onFailure { e ->
                        Log.d(LOG_TAG, "tv_device_report_telemetry failed", e)
                    }
                    delay(TELEMETRY_INTERVAL_MS)
                }
            }
    }

    private suspend fun loadPlaybackState(
        deviceName: String,
        deviceId: String,
    ): MainUiState.Playback {
        val row = runCatching { fetchDeviceRow(deviceId) }.getOrNull()
        val screenOrientation =
            row?.screenOrientation?.trim()?.lowercase()?.takeIf { it == "portrait" || it == "landscape" }
                ?: "landscape"

        val res =
            supabase.postgrest.rpc("tv_get_playback_slides", TvGetPlaybackParams(pDeviceId = deviceId))
                .decodeAs<TvGetPlaybackResult>()
        Log.d(
            LOG_TAG,
            "tv_get_playback_slides ok=${res.ok} playlistName=${res.playlistName} slidesCount=${res.slides.size} rev=${res.contentRevision}",
        )
        if (res.ok) {
            lastContentRevision.set(res.contentRevision)
        }
        if (!res.ok) {
            Log.w(
                LOG_TAG,
                "tv_get_playback_slides: this Supabase user is not the registering session for device $deviceId. Use Reset on the TV and link again, or re-pair.",
            )
            return MainUiState.Playback(
                deviceName = deviceName,
                deviceId = deviceId,
                playlistName = null,
                slides = emptyList(),
                isRegistrationMismatch = true,
                screenOrientation = screenOrientation,
            )
        }
        val slides =
            res.slides.map { s ->
                PlaybackSlide(
                    url = publicMediaUrl(s.storagePath),
                    fileType = s.fileType,
                    durationSeconds = s.durationSeconds,
                )
            }
        if (slides.isEmpty()) {
            clearCachedPlayback()
        } else {
            runCatching { writeCachedPlayback(deviceId, res, slides, screenOrientation) }
        }
        return MainUiState.Playback(
            deviceName = deviceName,
            deviceId = deviceId,
            playlistName = res.playlistName,
            slides = slides,
            isRegistrationMismatch = false,
            isFromCache = false,
            contentRevision = res.contentRevision,
            playlistId = res.playlistId,
            screenOrientation = screenOrientation,
        )
    }

    private fun publicMediaUrl(storagePath: String): String {
        val base = BuildConfig.SUPABASE_URL.trimEnd('/')
        val encoded =
            storagePath.split("/").joinToString("/") { segment ->
                java.net.URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
            }
        return "$base/storage/v1/object/public/media/$encoded"
    }

    fun resetRegistration() {
        val deviceIdSnapshot = telemetryDeviceId
        telemetryJob?.cancel()
        telemetryJob = null
        playbackObserveJob?.cancel()
        playbackObserveJob = null
        telemetryDeviceId = null
        signageExo?.release()
        signageExo = null
        viewModelScope.launch {
            if (deviceIdSnapshot != null) {
                mergePlaybackErrorSnapshot(TvUserFacingError.RELAUNCH_TO_PAIR, deviceIdSnapshot)
            }
            runCatching {
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                    prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                    prefs.remove(DeviceKeys.ANDROID_INSTALLATION_ID)
                    prefs.remove(DeviceKeys.CACHED_PLAYBACK)
                }
                supabase.auth.signOut()
            }
            Log.w(LOG_TAG, "TvUserFacingError ${TvUserFacingError.RELAUNCH_TO_PAIR}: user requested reset; app must be restarted to pair again")
            _state.value = MainUiState.Error(TvUserFacingError.RELAUNCH_TO_PAIR)
        }
    }

    override fun onCleared() {
        super.onCleared()
        telemetryJob?.cancel()
        playbackObserveJob?.cancel()
        signageExo?.release()
        signageExo = null
    }

    private fun generatePairingCode(): String = Random.nextInt(0, 1_000_000).toString().padStart(6, '0')
}
