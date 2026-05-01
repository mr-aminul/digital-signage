"use client";

import { ListVideo, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { Playlist } from "@signage/types";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function PlaylistsPage() {
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
    <div className="flex min-h-[min(420px,60vh)] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-gradient-to-b from-muted/30 to-transparent px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <ListVideo className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Playlist workspace</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Build loops of images and video, set how long each image shows (videos always play in full), then assign playlists to screens. Use the sidebar to open a
        playlist or create a new one.
      </p>
      {latestPlaylist ? (
        <Link
          href={`/playlists/${latestPlaylist.id}`}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Open latest playlist
          <Sparkles className="h-4 w-4 opacity-90" />
        </Link>
      ) : (
        <p className="mt-6 text-xs text-muted-foreground">Create your first playlist with the button in the left sidebar.</p>
      )}
    </div>
  );
}
