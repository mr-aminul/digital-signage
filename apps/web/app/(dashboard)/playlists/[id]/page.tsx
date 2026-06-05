"use client";

import { notFound } from "next/navigation";
import { useMemo } from "react";
import { PlaylistEditor } from "@/components/playlist-editor";
import { useConsoleDataStore } from "@/stores/console-data-store";

interface PlaylistPageProps {
  params: { id: string };
}

export default function PlaylistDetailPage({ params }: PlaylistPageProps) {
  const ownerId = useConsoleDataStore((s) => s.ownerId);
  const lastSyncedAt = useConsoleDataStore((s) => s.lastSyncedAt);
  const playlists = useConsoleDataStore((s) => s.playlists);

  const meta = useMemo(() => {
    const row = playlists.find((p) => p.id === params.id);
    return row ? { name: row.name, id: row.id } : null;
  }, [playlists, params.id]);

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  if (!meta) {
    if (lastSyncedAt !== null) {
      notFound();
    }
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return <PlaylistEditor playlistId={meta.id} initialName={meta.name} />;
}
