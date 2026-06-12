import type { SupabaseClient } from "@supabase/supabase-js";
import type { Device, Media, Playlist, PlaylistItemWithMedia } from "@signage/types";

export type DeviceWithAssignments = Device & {
  device_playlists: Array<{ playlist_id: string; is_active: boolean }> | null;
};

type RawPlaylistItemRow = {
  id: string;
  playlist_id: string;
  media_id: string;
  sort_order: number;
  duration_seconds: number | null;
  display_from: string | null;
  display_until: string | null;
  created_at: string;
  media: PlaylistItemWithMedia["media"] | PlaylistItemWithMedia["media"][];
};

function mapPlaylistItemRow(row: RawPlaylistItemRow): PlaylistItemWithMedia {
  const mediaField = row.media;
  const media = Array.isArray(mediaField) ? mediaField[0] : mediaField;
  if (!media) {
    throw new Error("Playlist item is missing joined media metadata.");
  }
  return {
    id: row.id,
    playlist_id: row.playlist_id,
    media_id: row.media_id,
    sort_order: row.sort_order,
    duration_seconds: row.duration_seconds,
    display_from: row.display_from,
    display_until: row.display_until,
    created_at: row.created_at,
    media,
  };
}

export type ConsoleSnapshot = {
  devices: DeviceWithAssignments[];
  playlists: Playlist[];
  media: Media[];
  playlistItemsByPlaylistId: Record<string, PlaylistItemWithMedia[]>;
};

/**
 * Single bulk pull from Supabase (devices, playlists, media, all playlist items for those playlists).
 */
export async function pullConsoleData(supabase: SupabaseClient, userId: string): Promise<ConsoleSnapshot> {
  const { error: staleErr } = await supabase.rpc("mark_stale_devices_offline", { p_owner_id: userId });
  if (staleErr) {
    console.warn("[pullConsoleData] mark_stale_devices_offline:", staleErr.message);
  }

  const [devicesRes, playlistsRes, mediaRes] = await Promise.all([
    supabase
      .from("devices")
      .select("*, device_playlists(playlist_id,is_active)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("playlists").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("media").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
  ]);

  if (devicesRes.error) throw devicesRes.error;
  if (playlistsRes.error) throw playlistsRes.error;
  if (mediaRes.error) throw mediaRes.error;

  const devices = (devicesRes.data as DeviceWithAssignments[]) ?? [];
  const playlists = (playlistsRes.data as Playlist[]) ?? [];
  const media = (mediaRes.data as Media[]) ?? [];

  const playlistIds = playlists.map((p) => p.id);
  const playlistItemsByPlaylistId: Record<string, PlaylistItemWithMedia[]> = {};

  if (playlistIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from("playlist_items")
      .select(
        "id,playlist_id,media_id,sort_order,duration_seconds,display_from,display_until,created_at,media(*)",
      )
      .in("playlist_id", playlistIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemsError) throw itemsError;
    const rows = (itemRows as RawPlaylistItemRow[] | null) ?? [];
    for (const row of rows) {
      const mapped = mapPlaylistItemRow(row);
      const list = playlistItemsByPlaylistId[mapped.playlist_id] ?? [];
      list.push(mapped);
      playlistItemsByPlaylistId[mapped.playlist_id] = list;
    }
  }

  return { devices, playlists, media, playlistItemsByPlaylistId };
}
