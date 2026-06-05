"use client";

import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { Media, PlaylistItemWithMedia } from "@signage/types";
import {
  Clock,
  FileImage,
  FileVideo,
  GripVertical,
  Image as ImageIcon,
  Monitor,
  Pencil,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureMediaVideoDuration } from "@/lib/media";
import { getMediaPublicBaseUrl, mediaPublicUrl } from "@/lib/object-storage/urls";
import { buildPlaylistItemInsertRow, formatPlaylistClockLabel } from "@/lib/playlist-timing";
import { cn } from "@/lib/utils";
import { PlaylistAssetsPanel } from "@/components/playlist-assets-panel";
import { PlaylistPreviewButton } from "@/components/playlist-preview";
import { ReadonlyVideoDuration } from "@/components/readonly-video-duration";
import { useEnsurePlaylistVideoDurations } from "@/hooks/use-ensure-playlist-video-durations";
import { useConsoleDataStore } from "@/stores/console-data-store";

const EMPTY_PLAYLIST_ITEMS: PlaylistItemWithMedia[] = [];

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  if (!removed) return list;
  result.splice(endIndex, 0, removed);
  return result;
}

function RowThumb({ item }: { item: PlaylistItemWithMedia }) {
  const url = mediaPublicUrl(item.media.storage_path);
  return (
    <div className="relative h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {item.media.file_type === "image" ? (
        <Image src={url} alt="" fill className="object-cover" sizes="72px" />
      ) : item.media.file_type === "video" ? (
        <video className="h-full w-full object-cover" src={url} muted playsInline preload="metadata" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <FileImage className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

interface PlaylistEditorProps {
  playlistId: string;
  initialName: string;
}

export function PlaylistEditor({ playlistId, initialName }: PlaylistEditorProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const ownerId = useConsoleDataStore((s) => s.ownerId);
  const { syncNow } = useConsoleSync();
  const cachedItems = useConsoleDataStore(
    (s) => s.playlistItemsByPlaylistId[playlistId] ?? EMPTY_PLAYLIST_ITEMS,
  );
  const allMedia = useConsoleDataStore((s) => s.media) as Media[];
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<PlaylistItemWithMedia[]>(cachedItems);
  const [savingName, setSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryResetKey, setLibraryResetKey] = useState(0);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    setItems(cachedItems);
  }, [cachedItems]);

  const reloadFromServer = useCallback(async () => {
    await syncNow();
  }, [syncNow]);

  useEnsurePlaylistVideoDurations(items, supabase, reloadFromServer);

  const playlistTimingLabel = useMemo(() => formatPlaylistClockLabel(items), [items]);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return allMedia;
    return allMedia.filter((m) => (m.original_filename ?? m.storage_path).toLowerCase().includes(q));
  }, [allMedia, librarySearch]);

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a playlist name.");
      return;
    }
    if (trimmed === initialName.trim()) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.from("playlists").update({ name: trimmed }).eq("id", playlistId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Playlist name updated");
      await reloadFromServer();
      setIsEditingName(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save name";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  }, [initialName, name, playlistId, reloadFromServer, supabase]);

  const cancelEditingName = useCallback(() => {
    setName(initialName);
    setIsEditingName(false);
  }, [initialName]);

  const persistOrder = useCallback(
    async (next: PlaylistItemWithMedia[]) => {
      const updates = next.map((item, index) =>
        supabase.from("playlist_items").update({ sort_order: index }).eq("id", item.id),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        toast.error(failed.error.message);
        await reloadFromServer();
        return;
      }
      await reloadFromServer();
    },
    [reloadFromServer, supabase],
  );

  const addMediaAtIndex = useCallback(
    async (mediaId: string, destIndex: number) => {
      const sortLen = useConsoleDataStore.getState().playlistItemsByPlaylistId[playlistId]?.length ?? 0;
      const mediaRow =
        allMedia.find((m) => m.id === mediaId) ??
        (useConsoleDataStore.getState().media as Media[]).find((m) => m.id === mediaId);
      if (mediaRow?.file_type === "video") {
        await ensureMediaVideoDuration(supabase, mediaRow);
      }
      const { data: row, error } = await supabase
        .from("playlist_items")
        .insert(
          buildPlaylistItemInsertRow({
            playlistId,
            mediaId,
            sortOrder: sortLen,
            fileType: mediaRow?.file_type,
          }),
        )
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      await reloadFromServer();
      const fresh = useConsoleDataStore.getState().playlistItemsByPlaylistId[playlistId] ?? [];
      const fromIndex = fresh.findIndex((i) => i.id === row.id);
      if (fromIndex < 0) return;
      if (fromIndex !== destIndex) {
        const reordered = reorder(fresh, fromIndex, destIndex);
        setItems(reordered);
        await persistOrder(reordered);
      } else {
        setItems(fresh);
      }
    },
    [allMedia, persistOrder, playlistId, reloadFromServer, supabase],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("playlist_items").delete().eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Removed from playlist");
      await reloadFromServer();
    },
    [reloadFromServer, supabase],
  );

  const updateDuration = useCallback(
    async (id: string, duration: number) => {
      const { error } = await supabase.from("playlist_items").update({ duration_seconds: duration }).eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await reloadFromServer();
    },
    [reloadFromServer, supabase],
  );

  const persistVideoMediaDuration = useCallback(
    async (mediaId: string, seconds: number) => {
      const { error } = await supabase.from("media").update({ duration_seconds: seconds }).eq("id", mediaId);
      if (error) return;
      await reloadFromServer();
    },
    [reloadFromServer, supabase],
  );

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) {
        if (draggableId.startsWith("media-")) setLibraryResetKey((k) => k + 1);
        return;
      }

      if (source.droppableId === "playlist-library" && destination.droppableId === "playlist-library") {
        setLibraryResetKey((k) => k + 1);
        return;
      }

      if (draggableId.startsWith("media-") && destination.droppableId === "playlist-main") {
        const mediaId = draggableId.replace(/^media-/, "");
        await addMediaAtIndex(mediaId, destination.index);
        return;
      }

      if (draggableId.startsWith("clip-") && destination.droppableId === "playlist-library") {
        const itemId = draggableId.replace(/^clip-/, "");
        await removeItem(itemId);
        setLibraryResetKey((k) => k + 1);
        return;
      }

      if (
        draggableId.startsWith("clip-") &&
        source.droppableId === "playlist-main" &&
        destination.droppableId === "playlist-main"
      ) {
        if (destination.index === source.index) return;
        const next = reorder(items, source.index, destination.index);
        setItems(next);
        await persistOrder(next);
      }
    },
    [addMediaAtIndex, items, persistOrder, removeItem],
  );

  const addUploadedToPlaylist = useCallback(
    async (uploaded: Media[]) => {
      for (const row of uploaded) {
        const len =
          useConsoleDataStore.getState().playlistItemsByPlaylistId[playlistId]?.length ?? items.length;
        await addMediaAtIndex(row.id, len);
      }
    },
    [addMediaAtIndex, items.length, playlistId],
  );

  if (!getMediaPublicBaseUrl()) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Missing NEXT_PUBLIC_MEDIA_BASE_URL. Copy `apps/web/.env.example` to `.env.local` to preview thumbnails.
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-4">
          {!isEditingName ? (
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              <h1 className="min-w-0 w-fit max-w-full text-balance text-2xl font-semibold tracking-tight text-foreground leading-snug">
                <span className="break-words [overflow-wrap:anywhere]">{initialName}</span>
              </h1>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="inline-flex h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setName(initialName);
                  setIsEditingName(true);
                }}
                aria-label="Edit playlist name"
              >
                <Pencil className="h-4 w-4" strokeWidth={2} />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Input
                id="playlist-title"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 min-w-0 flex-1 text-lg font-semibold sm:max-w-xl"
                aria-label="Playlist name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveName();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditingName();
                  }
                }}
              />
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" disabled={savingName || !name.trim()} onClick={() => void saveName()}>
                  {savingName ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" disabled={savingName} onClick={cancelEditingName}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <div
            className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="list"
            aria-label="Playlist summary"
          >
            <span
              role="listitem"
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight tabular-nums"
            >
              <span className="shrink-0 text-muted-foreground">Items</span>
              <span className="min-w-0 font-medium text-foreground">
                {items.length} {items.length === 1 ? "clip" : "clips"}
              </span>
            </span>
            <span
              role="listitem"
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight tabular-nums"
            >
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2} />
              <span className="shrink-0 text-muted-foreground">Duration</span>
              <span className="min-w-0 font-medium text-foreground">{playlistTimingLabel}</span>
            </span>
          </div>
        </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h2 className="text-sm font-semibold text-foreground">Playlist control</h2>
                  <p className="text-xs text-muted-foreground">
                    Drag rows to reorder. Drop media from the library on the right.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-0.5">
                  <PlaylistPreviewButton items={items} playlistName={isEditingName ? name : initialName} />
                  <Link
                    href="/devices"
                    className={cn(buttonVariants({ size: "sm" }), "gap-2 font-semibold")}
                  >
                    <Monitor className="h-4 w-4" />
                    Assign to screens
                  </Link>
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-4">
              <Droppable droppableId="playlist-main">
                {(dropProvided) => (
                  <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="overflow-x-auto">
                    <div className="min-w-[520px]">
                      <div
                        className="grid grid-cols-[40px_88px_1fr_72px_88px_44px] gap-2 border-b border-border pb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground"
                        role="row"
                      >
                        <span className="pl-1">#</span>
                        <span>Thumb</span>
                        <span>Title</span>
                        <span>Type</span>
                        <span>Duration</span>
                        <span className="text-right pr-1" />
                      </div>
                      {items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-14 text-center">
                          <p className="text-sm font-medium text-foreground">Nothing in this playlist yet</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Upload in the Media panel on the right, or drag files into this playlist.
                          </p>
                        </div>
                      ) : (
                        items.map((item, index) => (
                          <Draggable key={item.id} draggableId={`clip-${item.id}`} index={index}>
                            {(dragProvided, snapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                role="row"
                                className={cn(
                                  "border-b border-border/80 py-2.5",
                                  snapshot.isDragging && "rounded-lg bg-brand-softest ring-2 ring-brand-faint25",
                                )}
                              >
                                <div
                                  className={cn(
                                    "grid items-center gap-2",
                                    "grid-cols-[40px_88px_1fr_72px_88px_44px]",
                                  )}
                                >
                                  <div className="flex items-center justify-center pl-1 text-xs tabular-nums text-muted-foreground">
                                    <button
                                      type="button"
                                      className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                                      {...dragProvided.dragHandleProps}
                                      aria-label={`Reorder item ${index + 1}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                    <span className="ml-0.5">{index + 1}</span>
                                  </div>
                                  <RowThumb item={item} />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {item.media.original_filename ?? item.media.storage_path}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    {item.media.file_type === "video" ? (
                                      <FileVideo className="h-4 w-4 shrink-0" />
                                    ) : (
                                      <ImageIcon className="h-4 w-4 shrink-0" />
                                    )}
                                    <span className="text-xs capitalize">{item.media.file_type}</span>
                                  </div>
                                  <div>
                                    {item.media.file_type === "video" ? (
                                      <ReadonlyVideoDuration
                                        id={`duration-video-${item.id}`}
                                        durationSeconds={item.media.duration_seconds}
                                        fallbackProbeUrl={mediaPublicUrl(item.media.storage_path)}
                                        onProbedDuration={(sec) =>
                                          void persistVideoMediaDuration(item.media.id, sec)
                                        }
                                      />
                                    ) : (
                                      <>
                                        <Label className="sr-only" htmlFor={`duration-${item.id}`}>
                                          Duration (seconds)
                                        </Label>
                                        <Input
                                          id={`duration-${item.id}`}
                                          type="number"
                                          min={1}
                                          className="h-9 w-full min-w-0 text-sm tabular-nums"
                                          key={`d-${item.id}-${item.duration_seconds}`}
                                          defaultValue={item.duration_seconds ?? 10}
                                          onBlur={(e) => {
                                            const raw = e.target.value.trim();
                                            const value = Number(raw);
                                            const nextValue =
                                              Number.isFinite(value) && value > 0 ? value : 10;
                                            void updateDuration(item.id, nextValue);
                                          }}
                                        />
                                      </>
                                    )}
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => void removeItem(item.id)}
                                      aria-label="Remove clip"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {dropProvided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </div>

      {ownerId ? (
        <PlaylistAssetsPanel
          ownerId={ownerId}
          droppableId="playlist-library"
          libraryResetKey={libraryResetKey}
          librarySearch={librarySearch}
          onLibrarySearchChange={setLibrarySearch}
          filteredLibrary={filteredLibrary}
          onAddMedia={(mediaId) => void addMediaAtIndex(mediaId, items.length)}
          onUploaded={addUploadedToPlaylist}
        />
      ) : null}
      </div>
    </DragDropContext>
  );
}
