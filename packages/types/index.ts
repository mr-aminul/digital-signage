/** Shared domain types for web + documentation parity with Supabase rows. */

export type DeviceStatus = "offline" | "online" | "pending_pairing";

/** Dashboard setting; Android applies via Activity.requestedOrientation while playback runs. */
export type DeviceScreenOrientation = "landscape" | "portrait";

export type MediaFileType = "image" | "video" | "unknown";

export interface Profile {
  id: string;
  client_name: string | null;
  created_at: string;
  is_disabled?: boolean;
  /** Max linked devices; default 1 for new accounts. */
  device_limit?: number;
  /** Max cloud storage bytes; default 2 GiB. */
  storage_limit_bytes?: number;
  /** Running total of media.size_bytes; maintained by DB trigger. */
  storage_used_bytes?: number;
}

/** Row returned by admin_directory_stats() RPC. */
export interface AdminDirectoryStats {
  client_count: number;
  device_count: number;
  online_device_count: number;
  disabled_count: number;
}

export interface PlatformStaff {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
}

/** Row returned by admin_list_admins() RPC. */
export interface AdminDirectoryEntry {
  user_id: string;
  email: string;
  display_name: string | null;
  role: PlatformStaff["role"];
  is_active: boolean;
  created_at: string;
}

/** Row returned by admin_list_users() RPC. */
export interface AdminUserDirectoryEntry {
  id: string;
  email: string;
  client_name: string | null;
  created_at: string;
  device_count: number;
  online_device_count: number;
  active_device_count: number;
  device_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  is_disabled: boolean;
  /** True when the account also has admin portal access. */
  is_staff: boolean;
  /** Total rows matching the current admin list filter (paginated RPC only). */
  total_count?: number;
}

/** Row returned by admin_list_audit_log() RPC. */
export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  actor_display_name: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_client_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  /** Total rows matching the current filter (paginated RPC only). */
  total_count?: number;
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
  /** Paused because the client exceeded their screen plan limit. */
  paused_by_quota?: boolean;
}

export interface AppRelease {
  id: string;
  version_code: number;
  version_name: string;
  storage_path: string;
  sha256: string;
  release_notes: string | null;
  is_active: boolean;
  package_name: string;
  created_at: string;
  created_by: string | null;
}

export interface Media {
  id: string;
  owner_id: string;
  storage_path: string;
  file_type: MediaFileType;
  original_filename: string | null;
  created_at: string;
  /** File size in bytes at upload. */
  size_bytes?: number;
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
