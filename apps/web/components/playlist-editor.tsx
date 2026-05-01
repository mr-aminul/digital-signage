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
  Plus,
  Search,
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
import { formatPlaylistClockLabel } from "@/lib/playlist-timing";
import { cn } from "@/lib/utils";
import { PlaylistPreviewButton } from "@/components/playlist-preview";
import { ReadonlyVideoDuration } from "@/components/readonly-video-duration";
import { useConsoleDataStore } from "@/stores/console-data-store";

const EMPTY_PLAYLIST_ITEMS: PlaylistItemWithMedia[] = [];

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  if (!removed) return list;
  result.splice(endIndex, 0, removed);
  return result;
}

function mediaUrl(publicBaseUrl: string, storagePath: string) {
  const base = publicBaseUrl.replace(/\/$/, "");
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/media/${path}`;
}

function LibraryThumb({ media, publicBaseUrl }: { media: Media; publicBaseUrl: string }) {
  const url = mediaUrl(publicBaseUrl, media.storage_path);
  return (
    <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {media.file_type === "image" ? (
        <Image src={url} alt="" fill className="object-cover" sizes="56px" />
      ) : media.file_type === "video" ? (
        <video className="h-full w-full object-cover" src={url} muted playsInline preload="metadata" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <FileImage className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function RowThumb({ item, publicBaseUrl }: { item: PlaylistItemWithMedia; publicBaseUrl: string }) {
  const url = mediaUrl(publicBaseUrl, item.media.storage_path);
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
  publicBaseUrl: string;
}

export function PlaylistEditor({ playlistId, initialName, publicBaseUrl }: PlaylistEditorProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { syncNow } = useConsoleSync();
  const cachedItems = useConsoleDataStore(
    (s) => s.playlistItemsByPlaylistId[playlistId] ?? EMPTY_PLAYLIST_ITEMS,
  );
  const allMedia = useConsoleDataStore((s) => s.media) as Media[];
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<PlaylistItemWithMedia[]>(cachedItems);
  const [savingName, setSavingName] = useState(false);
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

  const playlistTimingLabel = useMemo(() => formatPlaylistClockLabel(items), [items]);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return allMedia;
    return allMedia.filter((m) => (m.original_filename ?? m.storage_path).toLowerCase().includes(q));
  }, [allMedia, librarySearch]);

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
      await reloadFromServer();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  }

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
      const mediaRow = allMedia.find((m) => m.id === mediaId);
      const { data: row, error } = await supabase
        .from("playlist_items")
        .insert({
          playlist_id: playlistId,
          media_id: mediaId,
          sort_order: sortLen,
          duration_seconds: mediaRow?.file_type === "video" ? null : 10,
        })
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
    async (id: string, duration: number | null) => {
      const { error } = await supabase.from("playlist_items").update({ duration_seconds: duration }).eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
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

  if (!publicBaseUrl) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Missing NEXT_PUBLIC_SUPABASE_URL. Copy `apps/web/.env.example` to `.env.local` to preview thumbnails.
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1 space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/playlists" className="hover:text-foreground">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-muted-foreground/70">
              /
            </li>
            <li className="font-medium text-foreground">{name || "Playlist"}</li>
          </ol>
        </nav>

        <div className="space-y-2">
          <Label htmlFor="playlist-title" className="sr-only">
            Playlist name
          </Label>
          <Input
            id="playlist-title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 max-w-xl border-transparent bg-white text-xl font-semibold tracking-tight shadow-sm ring-1 ring-border focus-visible:ring-emerald-500/30 dark:bg-card"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              disabled={savingName || name.trim() === initialName.trim()}
              onClick={() => void saveName()}
            >
              {savingName ? "Saving…" : "Save name"}
            </Button>
          </div>
        </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h2 className="text-sm font-semibold text-foreground">Playlist control</h2>
                  <p className="text-xs text-muted-foreground">
                    Drag rows to reorder. Drop assets from the library on the right.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-0.5">
                  <span className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm dark:bg-card">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm dark:bg-card">
                    <Clock className="h-3.5 w-3.5" />
                    {playlistTimingLabel}
                  </span>
                  <PlaylistPreviewButton items={items} playlistName={name} publicBaseUrl={publicBaseUrl} />
                  <Link
                    href="/devices"
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "inline-flex gap-2 rounded-full bg-emerald-600 font-semibold text-white hover:bg-emerald-700 hover:opacity-100",
                    )}
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
                            Drag files from the asset panel, or upload on the{" "}
                            <Link href="/media" className="font-medium text-emerald-700 underline-offset-4 hover:underline">
                              Media
                            </Link>{" "}
                            page.
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
                                  snapshot.isDragging && "rounded-lg bg-emerald-500/5 ring-2 ring-emerald-500/25",
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
                                  <RowThumb item={item} publicBaseUrl={publicBaseUrl} />
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
                                        fallbackProbeUrl={mediaUrl(publicBaseUrl, item.media.storage_path)}
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
                                            const nextValue = Number.isFinite(value) && value > 0 ? value : null;
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

      <aside className="w-full shrink-0 lg:w-[300px]">
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Assets</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Drag into the playlist or tap Add.</p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search…"
                className="h-9 border-border bg-background pl-8 text-sm"
                aria-label="Search assets"
              />
            </div>
          </div>
          <div className="max-h-[min(520px,55vh)] overflow-y-auto p-3">
            <Droppable droppableId="playlist-library" key={libraryResetKey}>
              {(libProvided) => (
                <ul ref={libProvided.innerRef} {...libProvided.droppableProps} className="space-y-2">
                  {filteredLibrary.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                      No media matches.{" "}
                      <Link href="/media" className="font-medium text-emerald-700 underline-offset-4 hover:underline">
                        Upload
                      </Link>
                    </li>
                  ) : (
                    filteredLibrary.map((m, index) => (
                      <Draggable key={m.id} draggableId={`media-${m.id}`} index={index}>
                        {(dragProvided, snapshot) => (
                          <li
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg border border-border bg-background p-2 pr-2 shadow-sm",
                              snapshot.isDragging && "opacity-90 ring-2 ring-emerald-500/30",
                            )}
                          >
                            <LibraryThumb media={m} publicBaseUrl={publicBaseUrl} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{m.original_filename ?? m.storage_path}</p>
                              <p className="text-[0.625rem] capitalize text-muted-foreground">{m.file_type}</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 shrink-0 gap-1 px-2 text-xs"
                              onClick={() => void addMediaAtIndex(m.id, items.length)}
                            >
                              <Plus className="h-3 w-3" />
                              Add
                            </Button>
                          </li>
                        )}
                      </Draggable>
                    ))
                  )}
                  {libProvided.placeholder}
                </ul>
              )}
            </Droppable>
          </div>
        </div>
      </aside>
      </div>
    </DragDropContext>
  );
}
