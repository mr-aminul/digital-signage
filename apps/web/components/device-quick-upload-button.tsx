"use client";

import type { Media } from "@signage/types";
import { Upload } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { Button } from "@/components/ui/button";
import type { DeviceWithAssignments } from "@/lib/console-sync";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { getMediaPublicBaseUrl } from "@/lib/object-storage/urls";
import {
  appendMediaToPlaylist,
  ensureActivePlaylistForDevice,
} from "@/lib/screen-playlist";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConsoleDataStore } from "@/stores/console-data-store";

interface DeviceQuickUploadButtonProps {
  device: DeviceWithAssignments;
  ownerId: string;
  size?: "sm" | "default";
  className?: string;
}

export function DeviceQuickUploadButton({
  device,
  ownerId,
  size = "sm",
  className,
}: DeviceQuickUploadButtonProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { syncNow } = useConsoleSync();

  const addUploadedToDevice = useCallback(
    async (uploaded: Media[]) => {
      if (uploaded.length === 0) return;
      if (!getMediaPublicBaseUrl()) {
        toast.error("Missing NEXT_PUBLIC_MEDIA_BASE_URL.");
        return;
      }

      const { playlistId, error: playlistError } = await ensureActivePlaylistForDevice(
        supabase,
        ownerId,
        device,
      );
      if (playlistError || !playlistId) {
        toast.error(playlistError ?? "Could not set up a playlist for this screen.");
        return;
      }

      let sortOrder =
        useConsoleDataStore.getState().playlistItemsByPlaylistId[playlistId]?.length ?? 0;

      for (const row of uploaded) {
        const { error } = await appendMediaToPlaylist(supabase, playlistId, row, sortOrder);
        if (error) {
          toast.error(error);
          continue;
        }
        sortOrder += 1;
      }

      await syncNow();
      const count = uploaded.length;
      toast.success(
        count === 1
          ? `Added 1 file to ${device.name}`
          : `Added ${count} files to ${device.name}`,
      );
    },
    [device, ownerId, supabase, syncNow],
  );

  const { uploading, open, getInputProps } = useMediaUpload(ownerId, {
    onComplete: addUploadedToDevice,
  });

  return (
    <>
      <input {...getInputProps()} />
      <Button
        type="button"
        size={size}
        variant="secondary"
        className={cn("gap-1.5", className)}
        disabled={uploading}
        title="Upload images or videos to this screen"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {uploading ? "Uploading…" : "Add content"}
      </Button>
    </>
  );
}
