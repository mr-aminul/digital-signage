/** Shared domain types for web + documentation parity with Supabase rows. */

export type DeviceStatus = "offline" | "online" | "pending_pairing";

/** Dashboard setting; Android applies via Activity.requestedOrientation while playback runs. */
export type DeviceScreenOrientation = "landscape" | "portrait";

export type MediaFileType = "image" | "video" | "unknown";

export interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
}

/** TV-reported diagnostics (varies by app version); see Android `DeviceTelemetryCollector`. */
export type DeviceTelemetry = Record<string, unknown>;

export interface Device {
  id: string;
  owner_id: string | null;
  registered_session_id: string | null;
  pairing_code: string;
  name: string;
  status: DeviceStatus;
  last_seen: string | null;
  created_at: string;
  /** Preferred playback orientation; default landscape when omitted (pre-migration rows). */
  screen_orientation?: DeviceScreenOrientation;
  /** Last payload from the screen app (JSON). */
  telemetry?: DeviceTelemetry | null;
  /** When `telemetry` was last written. */
  telemetry_at?: string | null;
  /** When true, the TV shows standby branding instead of the assigned playlist. */
  playback_disabled?: boolean;
}

export interface Media {
  id: string;
  owner_id: string;
  storage_path: string;
  file_type: MediaFileType;
  original_filename: string | null;
  created_at: string;
  /** Video intrinsic length in seconds; null for images or not yet probed. */
  duration_seconds?: number | null;
}

export interface Playlist {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  media_id: string;
  sort_order: number;
  /** Image dwell time in seconds; ignored for video (always plays to completion). */
  duration_seconds: number | null;
  display_from: string | null;
  display_until: string | null;
  created_at: string;
}

export interface DevicePlaylist {
  id: string;
  device_id: string;
  playlist_id: string;
  is_active: boolean;
  updated_at: string;
}

/** Payload used by the playlist editor (joins media metadata). */
export interface PlaylistItemWithMedia extends PlaylistItem {
  media: Pick<Media, "id" | "storage_path" | "file_type" | "original_filename" | "duration_seconds">;
}
