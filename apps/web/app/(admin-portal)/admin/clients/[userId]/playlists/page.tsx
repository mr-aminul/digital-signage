"use client";

import { ListVideo, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { Playlist } from "@signage/types";
import { playlistDetailPath, useAdminClientRoutes } from "@/components/admin/admin-client-route-context";
import { CreatePlaylistForm } from "@/components/create-playlist-form";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function AdminClientPlaylistsPage() {
  const adminRoutes = useAdminClientRoutes();
  const ownerId = useConsoleDataStore((s) => s.ownerId);
  const playlists = useConsoleDataStore((s) => s.playlists) as Playlist[];

  const latestPlaylist = useMemo(() => {
    if (playlists.length === 0) return undefined;
    return [...playlists].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [playlists]);

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(360px,50vh)] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong dark:text-brand-onDark">
        <ListVideo className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Playlist workspace</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Build loops of images and video for this client, then assign playlists to their screens.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <CreatePlaylistForm ownerId={ownerId} variant="empty" />
        {latestPlaylist ? (
          <Link
            href={playlistDetailPath(latestPlaylist.id, adminRoutes)}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Open latest playlist
            <Sparkles className="h-4 w-4 opacity-80" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
