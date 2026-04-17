"use client";

import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { Media, PlaylistItemWithMedia } from "@signage/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface PlaylistEditorProps {
  playlistId: string;
  ownerId: string;
  initialName: string;
}

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

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  if (!removed) return list;
  result.splice(endIndex, 0, removed);
  return result;
}

export function PlaylistEditor({ playlistId, ownerId, initialName }: PlaylistEditorProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<PlaylistItemWithMedia[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [savingName, setSavingName] = useState(false);

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("playlist_items")
      .select("id,playlist_id,media_id,sort_order,duration_seconds,display_from,display_until,created_at,media(*)")
      .eq("playlist_id", playlistId)
      .order("sort_order", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data as RawPlaylistItemRow[] | null) ?? [];
    setItems(rows.map(mapPlaylistItemRow));
  }, [playlistId, supabase]);

  const loadMedia = useCallback(async () => {
    const { data, error } = await supabase
      .from("media")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMedia((data as Media[]) ?? []);
  }, [ownerId, supabase]);

  useEffect(() => {
    void loadItems();
    void loadMedia();
  }, [loadItems, loadMedia]);

  async function saveName() {
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("playlists")
        .update({ name: name.trim() || "Untitled playlist" })
        .eq("id", playlistId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Playlist name saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  }

  async function persistOrder(next: PlaylistItemWithMedia[]) {
    const updates = next.map((item, index) =>
      supabase.from("playlist_items").update({ sort_order: index }).eq("id", item.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(failed.error.message);
      await loadItems();
      return;
    }
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = reorder(items, result.source.index, result.destination.index);
    setItems(next);
    await persistOrder(next);
  }

  async function addItem() {
    if (!selectedMediaId) {
      toast.error("Choose a media asset first.");
      return;
    }
    const nextOrder = items.length === 0 ? 0 : Math.max(...items.map((i) => i.sort_order)) + 1;
    const { error } = await supabase.from("playlist_items").insert({
      playlist_id: playlistId,
      media_id: selectedMediaId,
      sort_order: nextOrder,
      duration_seconds: 10,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Clip added");
    await loadItems();
  }

  async function updateDuration(id: string, duration: number | null) {
    const { error } = await supabase.from("playlist_items").update({ duration_seconds: duration }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadItems();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("playlist_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Clip removed");
    await loadItems();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link className="text-primary hover:underline" href="/playlists">
              ← Back to playlists
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit playlist</h1>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Rename the playlist for your teammates.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" onClick={() => void saveName()} disabled={savingName}>
            {savingName ? "Saving…" : "Save name"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Playlist builder</CardTitle>
          <CardDescription>Drag clips to reorder. Durations are seconds (used for still images).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="media">Add media</Label>
              <select
                id="media"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedMediaId}
                onChange={(e) => setSelectedMediaId(e.target.value)}
              >
                <option value="">Select media…</option>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.original_filename ?? m.storage_path}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={() => void addItem()}>
              Add to playlist
            </Button>
          </div>

          <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
            <Droppable droppableId="playlist-items">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No clips yet. Upload media, then add it here.</p>
                  ) : (
                    items.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={`flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between ${
                              snapshot.isDragging ? "shadow-lg" : ""
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {item.media.original_filename ?? item.media.storage_path}
                              </p>
                              <p className="text-xs text-muted-foreground">{item.media.file_type}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs" htmlFor={`duration-${item.id}`}>
                                  Duration (s)
                                </Label>
                                <Input
                                  id={`duration-${item.id}`}
                                  type="number"
                                  min={1}
                                  className="h-9 w-24"
                                  defaultValue={item.duration_seconds ?? 10}
                                  onBlur={(e) => {
                                    const value = Number(e.target.value);
                                    const nextValue = Number.isFinite(value) && value > 0 ? value : null;
                                    void updateDuration(item.id, nextValue);
                                  }}
                                />
                              </div>
                              <Button type="button" variant="destructive" size="sm" onClick={() => void removeItem(item.id)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </CardContent>
      </Card>
    </div>
  );
}
