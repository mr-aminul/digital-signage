package dev.signage.tv

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/** Builds error-only `telemetry.playback` JSON for [tv_merge_playback_snapshot]. */
object PlaybackSnapshot {
    /** Replaces slide snapshot so the console does not show stale slides while the TV shows an error screen. */
    fun buildPlayerErrorJson(errorCode: String): JsonObject =
        buildJsonObject {
            put("error", JsonPrimitive(true))
            put("error_code", JsonPrimitive(errorCode))
            put("updated_at_ms", JsonPrimitive(System.currentTimeMillis()))
        }
}
