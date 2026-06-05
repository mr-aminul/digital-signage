"use client";

import type { PlaylistItemWithMedia } from "@signage/types";
import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMediaPublicBaseUrl } from "@/lib/object-storage/urls";
import { ensureMediaVideoDuration } from "@/lib/media";

export function useEnsurePlaylistVideoDurations(
  items: PlaylistItemWithMedia[],
  supabase: SupabaseClient,
  onUpdated: () => void | Promise<void>,
) {
  const videoProbeKey = items
    .filter((item) => item.media.file_type === "video")
    .map((item) => `${item.media.id}:${item.media.duration_seconds ?? "null"}`)
    .join("|");

  useEffect(() => {
    const mediaBaseUrl = getMediaPublicBaseUrl();
    if (!mediaBaseUrl) return;

    let cancelled = false;

    void (async () => {
      for (const item of items) {
        if (cancelled) return;
        if (item.media.file_type !== "video") continue;
        const sec = await ensureMediaVideoDuration(supabase, item.media);
        if (sec != null && !cancelled) {
          await onUpdated();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, onUpdated, supabase, videoProbeKey]);
}
