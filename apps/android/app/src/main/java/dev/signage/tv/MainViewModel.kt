package dev.signage.tv

import android.app.Application
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.result.PostgrestResult
import io.github.jan.supabase.postgrest.query.Order
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
import java.util.UUID
import kotlin.random.Random

private val Application.deviceDataStore by preferencesDataStore(name = "signage_device")

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
}

sealed interface MainUiState {
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
    ) : MainUiState

    data class Error(val message: String) : MainUiState
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
)

@Serializable
private data class DevicePlaylistRow(
    @SerialName("playlist_id") val playlistId: String,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
private data class PlaylistItemSimpleRow(
    val id: String,
    @SerialName("sort_order") val sortOrder: Int,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("media_id") val mediaId: String,
)

@Serializable
private data class MediaRow(
    val id: String,
    @SerialName("storage_path") val storagePath: String,
    @SerialName("file_type") val fileType: String,
)

@Serializable
private data class PlaylistNameRow(
    val id: String,
    val name: String,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val dataStore = application.deviceDataStore
    private var playbackObserveJob: Job? = null

    private val supabase by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            install(Auth)
            install(Postgrest)
        }
    }

    private val _state = MutableStateFlow<MainUiState>(MainUiState.MissingConfig)
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    init {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            _state.value = MainUiState.MissingConfig
        } else {
            viewModelScope.launch {
                runCatching {
                    startRegistrationFlow()
                }.onFailure { throwable ->
                    _state.value = MainUiState.Error(throwable.message ?: "Unexpected error")
                }
            }
        }
    }

    private suspend fun startRegistrationFlow() {
        // Attempt anonymous sign-in but don't crash if disabled
        runCatching { supabase.auth.signInAnonymously() }

        val snapshot = dataStore.data.first()
        val storedDeviceId = snapshot[DeviceKeys.DEVICE_ID]
        val storedPairingCode = snapshot[DeviceKeys.PAIRING_CODE]

        if (storedDeviceId != null && storedPairingCode != null) {
            val visible = fetchDeviceRow(storedDeviceId)
            if (visible != null) {
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
                pollUntilLinked(storedDeviceId)
                return
            }
            // Row not visible to this session (new anonymous user, cleared DB, etc.) — drop stale cache
            dataStore.edit { prefs ->
                prefs.remove(DeviceKeys.DEVICE_ID)
                prefs.remove(DeviceKeys.PAIRING_CODE)
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

    private suspend fun createNewDeviceAndPoll() {
        val pairingCode = generatePairingCode()
        // Use Supabase user ID if available, otherwise generate a persistent installation ID
        val registrationId = supabase.auth.currentUserOrNull()?.id ?: UUID.randomUUID().toString()

        val inserted =
            supabase
                .from("devices")
                .insert(
                    DeviceInsert(
                        pairingCode = pairingCode,
                        registeredSessionId = registrationId,
                    ),
                ) { select() }
                .decodeOneRow<DeviceRow>()

        dataStore.edit { prefs ->
            prefs[DeviceKeys.DEVICE_ID] = inserted.id
            prefs[DeviceKeys.PAIRING_CODE] = inserted.pairingCode
        }

        _state.value =
            MainUiState.AwaitingLink(
                pairingCode = inserted.pairingCode,
                deviceId = inserted.id,
                message = "Waiting for the owner to link this screen…",
            )

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

    private fun startPlaybackObservation(deviceId: String, deviceName: String) {
        playbackObserveJob?.cancel()
        playbackObserveJob =
            viewModelScope.launch {
                while (isActive) {
                    try {
                        _state.value = loadPlaybackState(deviceId, deviceName)
                    } catch (_: Exception) {
                        _state.value =
                            MainUiState.Playback(
                                deviceName = deviceName,
                                deviceId = deviceId,
                                playlistName = null,
                                slides = emptyList(),
                            )
                    }
                    delay(4_000)
                }
            }
    }

    private suspend fun loadPlaybackState(
        deviceId: String,
        deviceName: String,
    ): MainUiState.Playback {
        val assignment =
            supabase
                .from("device_playlists")
                .select {
                    filter {
                        eq("device_id", deviceId)
                        eq("is_active", true)
                    }
                }.decodeList<DevicePlaylistRow>()
                .firstOrNull()
        if (assignment == null) {
            return MainUiState.Playback(deviceName, deviceId, null, emptyList())
        }
        val playlistId = assignment.playlistId
        val playlistName =
            supabase
                .from("playlists")
                .select {
                    filter { eq("id", playlistId) }
                }.decodeList<PlaylistNameRow>()
                .firstOrNull()
                ?.name

        val items =
            supabase
                .from("playlist_items")
                .select {
                    filter { eq("playlist_id", playlistId) }
                    order(column = "sort_order", order = Order.ASCENDING)
                }.decodeList<PlaylistItemSimpleRow>()

        val slides = mutableListOf<PlaybackSlide>()
        for (item in items) {
            val mediaList =
                supabase
                    .from("media")
                    .select {
                        filter { eq("id", item.mediaId) }
                    }.decodeList<MediaRow>()
            val m = mediaList.firstOrNull() ?: continue
            if (m.storagePath.isBlank()) continue
            slides.add(
                PlaybackSlide(
                    url = publicMediaUrl(m.storagePath),
                    fileType = m.fileType,
                    durationSeconds = item.durationSeconds,
                ),
            )
        }
        return MainUiState.Playback(deviceName, deviceId, playlistName, slides)
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
        playbackObserveJob?.cancel()
        playbackObserveJob = null
        viewModelScope.launch {
            runCatching {
                dataStore.edit { prefs ->
                    prefs.remove(DeviceKeys.DEVICE_ID)
                    prefs.remove(DeviceKeys.PAIRING_CODE)
                }
                supabase.auth.signOut()
            }
            _state.value = MainUiState.Error("Cleared local registration. Relaunch the app to generate a new pairing code.")
        }
    }

    private fun generatePairingCode(): String = Random.nextInt(0, 1_000_000).toString().padStart(6, '0')
}
