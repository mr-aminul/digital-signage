package dev.signage.tv

import android.app.Application
import android.os.SystemClock
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.selects.onTimeout
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    /** Issued when an admin links the screen; survives anonymous auth rotation on the TV. */
    val PLAYBACK_SECRET = stringPreferencesKey("playback_secret")
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
        /** In-memory; last successful RPC (or cache on cold start) had network payload. */
        val isFromCache: Boolean = false,
        val contentRevision: String? = null,
        val playlistId: String? = null,
        /** Mirrors [DeviceRow.screenOrientation] from poll (dashboard setting). */
        val screenOrientation: String = "landscape",
        /** Admin paused playback in the dashboard; show standby branding instead of slides or errors. */
        val playbackDisabledByAdmin: Boolean = false,
        /**
         * Bumped when the display returns after standby so [MutableStateFlow] emits even if the server
         * manifest is unchanged, and so the UI restarts the playlist like a fresh sync.
         */
        val uiRefreshGeneration: Long = 0L,
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
    @SerialName("p_playback_secret")
    val pPlaybackSecret: String? = null,
)

@Serializable
private data class TvGetPlaybackResult(
    val ok: Boolean,
    @SerialName("deviceName")
    val deviceName: String? = null,
    @SerialName("playbackDisabled")
    val playbackDisabled: Boolean = false,
    @SerialName("playbackSecret")
    val playbackSecret: String? = null,
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

/** Avoid double UI recovery when both activity resume and [android.content.Intent.ACTION_SCREEN_ON] fire. */
private const val FOREGROUND_RECOVERY_DEBOUNCE_MS = 750L

private const val ANONYMOUS_SIGN_IN_MAX_ATTEMPTS = 8
private const val SUPABASE_NETWORK_RETRY_MAX = 4

/** Between full startup attempts when registration cannot reach Supabase yet (TV stays on loading). */
private const val STARTUP_RETRY_DELAY_INITIAL_MS = 2_000L
private const val STARTUP_RETRY_DELAY_MAX_MS = 60_000L

private sealed interface PlaybackLoadResult {
    data class Ok(val state: MainUiState.Playback) : PlaybackLoadResult

    /** [tv_get_playback_slides] returned ok=false — local credentials do not authorize this device. */
    data object NeedsRePairing : PlaybackLoadResult
}

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

    /** Wakes the playback poll loop immediately (conflated). */
    private val immediatePlaybackPoll = Channel<Unit>(Channel.CONFLATED)

    /**
     * Bumped when the activity resumes or the screen turns on so Compose remounts the current slide
     * even if the playlist poll returns an identical payload ([MutableStateFlow] would otherwise not emit).
     */
    private val _playbackUiRecoveryEpoch = MutableStateFlow(0L)
    val playbackUiRecoveryEpoch: StateFlow<Long> = _playbackUiRecoveryEpoch.asStateFlow()

    private var lastPlaybackForegroundRecoveryAtElapsedMs = 0L

    private val supabase by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            httpEngine = KtorClientProvider.unsafeHttpClient.engine
            install(Auth)
            install(Postgrest)
            // HttpTimeout is already installed in KtorClientProvider.unsafeHttpClient
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
                runStartupUntilConnected()
            }
        }
    }

    private fun ensureSignageExo() {
        if (signageExo == null) {
            signageExo =
                SignageExoController(getApplication()).also { controller ->
                    controller.onHardPlaybackRecovery = {
                        requestPlaybackUiRecovery(reason = "exo_stall")
                    }
                }
        }
    }

    private fun releaseSignageExo() {
        signageExo?.release()
        signageExo = null
    }

    /**
     * Called when the TV returns from standby or Exo reports a hard stall. Forces slide/media views to
     * remount without requiring a dashboard-side playlist change.
     */
    fun requestPlaybackUiRecovery(reason: String) {
        val s = _state.value
        if (s !is MainUiState.Playback || s.playbackDisabledByAdmin || s.slides.isEmpty()) {
            return
        }
        Log.i(LOG_TAG, "playback UI recovery ($reason)")
        _playbackUiRecoveryEpoch.update { it + 1 }
    }

    /** Activity visible again after pause, or [Intent.ACTION_SCREEN_ON] on some TVs. */
    fun onPlaybackForegroundEvent() {
        val s = _state.value
        val now = SystemClock.elapsedRealtime()
        if (s is MainUiState.Playback &&
            !s.playbackDisabledByAdmin &&
            s.slides.isNotEmpty() &&
            now - lastPlaybackForegroundRecoveryAtElapsedMs >= FOREGROUND_RECOVERY_DEBOUNCE_MS
        ) {
            lastPlaybackForegroundRecoveryAtElapsedMs = now
            Log.i(LOG_TAG, "playback foreground: resync from server + decoder reset")
            signageExo?.resetDecoderStateAfterDisplayWake()
            val deviceId = s.deviceId
            _state.update { cur ->
                if (cur is MainUiState.Playback && cur.deviceId == deviceId && !cur.playbackDisabledByAdmin && cur.slides.isNotEmpty()) {
                    cur.copy(uiRefreshGeneration = cur.uiRefreshGeneration + 1)
                } else {
                    cur
                }
            }
            requestPlaybackUiRecovery(reason = "foreground")
            immediatePlaybackPoll.trySend(Unit)
        }
        signageExo?.onActivityResume()
    }

    fun onPlaybackBackgroundEvent() {
        signageExo?.onActivityPause()
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

    private suspend fun readCachedPlaybackOnly(deviceId: String): MainUiState.Playback? = withContext(Dispatchers.IO) {
        val raw = dataStore.data.first()[DeviceKeys.CACHED_PLAYBACK] ?: return@withContext null
        val cached = runCatching { cachedPlaybackJson.decodeFromString<CachedPlaybackV1>(raw) }.getOrNull()
            ?: return@withContext null
        if (cached.deviceId != deviceId) {
            return@withContext null
        }
        if (cached.slides.isEmpty()) {
            return@withContext null
        }
        val orient =
            cached.screenOrientation.trim().lowercase().takeIf { it == "portrait" || it == "landscape" }
                ?: "landscape"
        MainUiState.Playback(
            deviceName = cached.deviceDisplayName,
            deviceId = deviceId,
            playlistName = cached.playlistName,
            slides = cached.slides,
            isFromCache = true,
            contentRevision = cached.contentRevision,
            playlistId = cached.playlistId,
            screenOrientation = orient,
            playbackDisabledByAdmin = false,
        )
    }

    private suspend fun writeCachedPlayback(
        deviceId: String,
        res: TvGetPlaybackResult,
        slides: List<PlaybackSlide>,
        screenOrientation: String,
        deviceDisplayName: String,
    ) = withContext(Dispatchers.IO) {
        if (slides.isEmpty()) {
            return@withContext
        }
        val payload =
            CachedPlaybackV1(
                deviceId = deviceId,
                deviceDisplayName = deviceDisplayName,
                playlistName = res.playlistName,
                contentRevision = res.contentRevision,
                playlistId = res.playlistId,
                savedAtMs = System.currentTimeMillis(),
                slides = slides,
                screenOrientation = screenOrientation,
            )
        val encoded = cachedPlaybackJson.encodeToString(CachedPlaybackV1.serializer(), payload)
        dataStore.edit { it[DeviceKeys.CACHED_PLAYBACK] = encoded }
    }

    private suspend fun clearCachedPlayback() {
        dataStore.edit { it.remove(DeviceKeys.CACHED_PLAYBACK) }
    }

    /** Clears locally stored device identity so the app can register fresh (new pairing code). */
    private suspend fun clearLocalDevicePairingKeys() {
        dataStore.edit { prefs ->
            prefs.remove(DeviceKeys.DEVICE_ID)
            prefs.remove(DeviceKeys.PAIRING_CODE)
            prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
            prefs.remove(DeviceKeys.PLAYBACK_SECRET)
            prefs.remove(DeviceKeys.CACHED_PLAYBACK)
        }
    }

    /**
     * Server rejected playback authorization — show a new pairing code instead of a dead-end screen.
     */
    private suspend fun recoverPairingAfterPlaybackRejected() {
        Log.w(LOG_TAG, "tv_get_playback_slides rejected; clearing local registration and showing pairing")
        _state.value = MainUiState.Initializing
        clearLocalDevicePairingKeys()
        try {
            createNewDeviceAndPoll()
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            Log.e(LOG_TAG, "recoverPairingAfterPlaybackRejected failed; retrying full startup", t)
            runStartupUntilConnected()
        }
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

    /**
     * Keeps retrying [startRegistrationFlow] with backoff while the device cannot reach Supabase,
     * instead of leaving the user on the connection error screen after transient outages.
     */
    private suspend fun runStartupUntilConnected() {
        var backoffMs = STARTUP_RETRY_DELAY_INITIAL_MS
        while (currentCoroutineContext().isActive) {
            _state.value = MainUiState.Initializing
            Log.i(LOG_TAG, "Starting registration flow...")
            try {
                startRegistrationFlow()
                Log.i(LOG_TAG, "Registration flow completed successfully.")
                return
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                Log.e(
                    LOG_TAG,
                    "TvUserFacingError ${TvUserFacingError.STARTUP_FAILED} startRegistrationFlow (retry in ${backoffMs}ms): ${t.message}",
                    t,
                )
                publishPlaybackUnavailableToCloud(TvUserFacingError.STARTUP_FAILED)
                // If we failed during registration, ensure Exo is released to avoid keeping
                // resources (or potential leaks) during the wait.
                releaseSignageExo()
                delay(backoffMs)
                backoffMs = minOf(backoffMs * 2, STARTUP_RETRY_DELAY_MAX_MS)
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

        val snapshot = withContext(Dispatchers.IO) { dataStore.data.first() }
        val storedDeviceId = snapshot[DeviceKeys.DEVICE_ID]
        val storedPairingCode = snapshot[DeviceKeys.PAIRING_CODE]

        if (storedDeviceId != null && storedPairingCode != null) {
            val registeredSnapshot = snapshot[DeviceKeys.REGISTERED_SESSION_ID]
            val currentUid = supabase.auth.currentUserOrNull()?.id
            val storedPlaybackSecret = snapshot[DeviceKeys.PLAYBACK_SECRET]
            if (registeredSnapshot != null && currentUid != null && registeredSnapshot != currentUid) {
                if (storedPlaybackSecret.isNullOrBlank()) {
                    Log.w(
                        LOG_TAG,
                        "TvUserFacingError: stored registered_session_id does not match current user; clearing local registration",
                    )
                    dataStore.edit { prefs ->
                        prefs.remove(DeviceKeys.DEVICE_ID)
                        prefs.remove(DeviceKeys.PAIRING_CODE)
                        prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                        prefs.remove(DeviceKeys.PLAYBACK_SECRET)
                        prefs.remove(DeviceKeys.CACHED_PLAYBACK)
                    }
                } else {
                    Log.w(
                        LOG_TAG,
                        "Anonymous session changed; resuming playback using stored playback secret",
                    )
                    startPlaybackObservation(storedDeviceId, "")
                    return
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
                if (!storedPlaybackSecret.isNullOrBlank()) {
                    Log.w(
                        LOG_TAG,
                        "Device row not visible to this session; resuming with playback secret (linked screen)",
                    )
                    startPlaybackObservation(storedDeviceId, "")
                    return
                }
                // Row not visible to this session (new anonymous user, cleared DB, etc.) — drop stale cache
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                    prefs.remove(DeviceKeys.REGISTERED_SESSION_ID)
                    prefs.remove(DeviceKeys.PLAYBACK_SECRET)
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
                    throw IllegalStateException("anonymous sign-in unavailable")
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
            prefs.remove(DeviceKeys.PLAYBACK_SECRET)
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
                message = "Waiting for an admin to link this screen…",
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
                clearLocalDevicePairingKeys()
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
                var nameForPoll =
                    when {
                        deviceName.isNotBlank() -> deviceName
                        cached != null -> cached.deviceName
                        else -> ""
                    }
                if (cached != null) {
                    _state.value =
                        cached.copy(
                            deviceName = nameForPoll.ifBlank { cached.deviceName },
                            isFromCache = true,
                        )
                }
                while (isActive) {
                    try {
                        when (val loaded = loadPlaybackState(nameForPoll, deviceId)) {
                            is PlaybackLoadResult.NeedsRePairing -> {
                                viewModelScope.launch {
                                    recoverPairingAfterPlaybackRejected()
                                }
                                return@launch
                            }
                            is PlaybackLoadResult.Ok -> {
                                val next = loaded.state
                                nameForPoll = next.deviceName
                                _state.value = next
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(LOG_TAG, "loadPlaybackState failed", e)
                        val now = _state.value
                        if (now is MainUiState.Playback &&
                            now.deviceId == deviceId &&
                            (now.slides.isNotEmpty() || now.playbackDisabledByAdmin)
                        ) {
                            // Keep last good manifest or admin standby until the next poll succeeds.
                        } else if (cached != null) {
                            _state.value =
                                cached.copy(
                                    deviceName = nameForPoll.ifBlank { cached.deviceName },
                                    isFromCache = true,
                                )
                        } else {
                            _state.value =
                                MainUiState.Playback(
                                    deviceName = nameForPoll,
                                    deviceId = deviceId,
                                    playlistName = null,
                                    slides = emptyList(),
                                    screenOrientation = (now as? MainUiState.Playback)?.screenOrientation ?: "landscape",
                                    playbackDisabledByAdmin = false,
                                )
                        }
                    }
                    select {
                        immediatePlaybackPoll.onReceive { }
                        onTimeout(4_000) { }
                    }
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
    ): PlaybackLoadResult = withContext(Dispatchers.IO) {
        val row = runCatching { fetchDeviceRow(deviceId) }.getOrNull()
        val screenOrientation =
            row?.screenOrientation?.trim()?.lowercase()?.takeIf { it == "portrait" || it == "landscape" }
                ?: (_state.value as? MainUiState.Playback)?.takeIf { it.deviceId == deviceId }
                    ?.screenOrientation?.trim()?.lowercase()?.takeIf { it == "portrait" || it == "landscape" }
                ?: "landscape"

        val storedPlaybackSecret = dataStore.data.first()[DeviceKeys.PLAYBACK_SECRET]
        val res =
            supabase.postgrest.rpc(
                "tv_get_playback_slides",
                TvGetPlaybackParams(
                    pDeviceId = deviceId,
                    pPlaybackSecret = storedPlaybackSecret?.takeIf { it.isNotBlank() },
                ),
            ).decodeAs<TvGetPlaybackResult>()
        Log.d(
            LOG_TAG,
            "tv_get_playback_slides ok=${res.ok} playbackDisabled=${res.playbackDisabled} playlistName=${res.playlistName} slidesCount=${res.slides.size} rev=${res.contentRevision}",
        )
        if (res.ok) {
            lastContentRevision.set(res.contentRevision)
        }
        if (!res.playbackSecret.isNullOrBlank()) {
            dataStore.edit { prefs ->
                prefs[DeviceKeys.PLAYBACK_SECRET] = res.playbackSecret!!
            }
        }
        if (!res.ok) {
            Log.w(
                LOG_TAG,
                "tv_get_playback_slides rejected for device $deviceId (invalid session, secret, or device removed).",
            )
            return@withContext PlaybackLoadResult.NeedsRePairing
        }
        val resolvedDisplayName =
            res.deviceName?.takeIf { it.isNotBlank() } ?: deviceName.ifBlank { "Display" }
        val prevGen =
            (_state.value as? MainUiState.Playback)?.takeIf { it.deviceId == deviceId }?.uiRefreshGeneration ?: 0L
        if (res.playbackDisabled) {
            clearCachedPlayback()
            return@withContext PlaybackLoadResult.Ok(
                MainUiState.Playback(
                    deviceName = resolvedDisplayName,
                    deviceId = deviceId,
                    playlistName = null,
                    slides = emptyList(),
                    isFromCache = false,
                    contentRevision = res.contentRevision,
                    playlistId = null,
                    screenOrientation = screenOrientation,
                    playbackDisabledByAdmin = true,
                    uiRefreshGeneration = prevGen,
                ),
            )
        }
        val slides =
            res.slides.map { s ->
                PlaybackSlide(
                    url = publicMediaUrl(s.storagePath),
                    fileType = s.fileType,
                    durationSeconds = if (s.fileType.equals("video", ignoreCase = true)) null else s.durationSeconds,
                )
            }
        if (slides.isEmpty()) {
            clearCachedPlayback()
        } else {
            runCatching {
                writeCachedPlayback(deviceId, res, slides, screenOrientation, resolvedDisplayName)
            }
        }
        PlaybackLoadResult.Ok(
            MainUiState.Playback(
                deviceName = resolvedDisplayName,
                deviceId = deviceId,
                playlistName = res.playlistName,
                slides = slides,
                isFromCache = false,
                contentRevision = res.contentRevision,
                playlistId = res.playlistId,
                screenOrientation = screenOrientation,
                playbackDisabledByAdmin = false,
                uiRefreshGeneration = prevGen,
            ),
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
                    prefs.remove(DeviceKeys.PLAYBACK_SECRET)
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
