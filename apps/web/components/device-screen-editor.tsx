"use client";

import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DeviceStatus } from "@signage/types";
import type { Media, PlaylistItemWithMedia } from "@signage/types";
import {
  Clock,
  FileImage,
  FileVideo,
  GripVertical,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeviceWithAssignments } from "@/lib/console-sync";
import { useStaleOnlineTick } from "@/hooks/use-stale-online-tick";
import { effectiveDeviceStatus } from "@/lib/device-status";
import { formatPlaylistClockLabel } from "@/lib/playlist-timing";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConsoleDataStore } from "@/stores/console-data-store";
import { DevicePlaybackToggle } from "@/components/device-playback-toggle";
import { DeviceScreenOrientationSettings } from "@/components/device-screen-orientation-settings";
import { PlaylistPreviewButton } from "@/components/playlist-preview";
import { ReadonlyVideoDuration } from "@/components/readonly-video-duration";
import {
  DeviceTelemetryMoreButton,
  deviceScreenBasics,
  getDeviceDisplayDimensionsPx,
} from "@/components/device-telemetry-panel";

/** Stable fallback so Zustand selectors don’t return a new [] every run (avoids render loops). */
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

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Never seen";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 30) return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (day > 0) return day === 1 ? "Yesterday" : `${day} days ago`;
  if (hr > 0) return `${hr}h ago`;
  if (min > 0) return `${min}m ago`;
  return "Just now";
}

function statusLabel(status: DeviceStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "pending_pairing":
      return "Pending pairing";
    default:
      return status;
  }
}

function ScreenStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "online" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
        status === "offline" && "bg-muted text-muted-foreground",
        status === "pending_pairing" && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

interface DeviceScreenEditorProps {
  deviceId: string;
  ownerId: string;
  publicBaseUrl: string;
}

export function DeviceScreenEditor({ deviceId, ownerId, publicBaseUrl }: DeviceScreenEditorProps) {
  useStaleOnlineTick();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { syncNow } = useConsoleSync();

  const storeDevices = useConsoleDataStore((s) => s.devices) as DeviceWithAssignments[];
  const device = useMemo(
    () => storeDevices.find((d) => d.id === deviceId),
    [storeDevices, deviceId],
  );
  const playlists = useConsoleDataStore((s) => s.playlists);
  const allMedia = useConsoleDataStore((s) => s.media) as Media[];

  const activePlaylistId = useMemo(() => {
    return device?.device_playlists?.find((row) => row.is_active)?.playlist_id ?? "";
  }, [device]);

  const playlistId = activePlaylistId;
  const activePlaylistName = useMemo(() => {
    if (!playlistId) return null;
    return playlists.find((p) => p.id === playlistId)?.name ?? null;
  }, [playlists, playlistId]);

  const deviceDisplayPxForPreview = useMemo(
    () => (device ? getDeviceDisplayDimensionsPx(device) : null),
    [device],
  );
  const cachedItems = useConsoleDataStore((s) =>
    playlistId
      ? (s.playlistItemsByPlaylistId[playlistId] ?? EMPTY_PLAYLIST_ITEMS)
      : EMPTY_PLAYLIST_ITEMS,
  );
  const [items, setItems] = useState<PlaylistItemWithMedia[]>(cachedItems);
  const [libraryResetKey, setLibraryResetKey] = useState(0);
  const [librarySearch, setLibrarySearch] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [unassigningPlaylist, setUnassigningPlaylist] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);

  useEffect(() => {
    setItems(cachedItems);
  }, [cachedItems]);

  useEffect(() => {
    if (device) setDeviceName(device.name);
  }, [device]);

  const reloadFromServer = useCallback(async () => {
    await syncNow();
  }, [syncNow]);

  const saveDeviceName = useCallback(async () => {
    if (!device) return;
    const trimmed = deviceName.trim();
    if (!trimmed) {
      toast.error("Enter a screen name.");
      return;
    }
    if (trimmed === device.name) {
      setIsEditingDeviceName(false);
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.from("devices").update({ name: trimmed }).eq("id", device.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Screen name updated");
      await reloadFromServer();
      setIsEditingDeviceName(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save name";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  }, [device, deviceName, reloadFromServer, supabase]);

  const cancelEditingDeviceName = useCallback(() => {
    if (device) setDeviceName(device.name);
    setIsEditingDeviceName(false);
  }, [device]);

  const assignPlaylist = useCallback(
    async (nextPlaylistId: string) => {
      if (!device) return;
      const { error } = await supabase.from("device_playlists").upsert(
        {
          device_id: device.id,
          playlist_id: nextPlaylistId,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id,playlist_id" },
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      const { error: deactivateError } = await supabase
        .from("device_playlists")
        .update({ is_active: false })
        .eq("device_id", device.id)
        .neq("playlist_id", nextPlaylistId);
      if (deactivateError) {
        toast.error(deactivateError.message);
        return;
      }
      toast.success("Playlist assigned to this screen");
      await reloadFromServer();
    },
    [device, reloadFromServer, supabase],
  );

  const unassignPlaylist = useCallback(async () => {
    if (!device) return;
    setUnassigningPlaylist(true);
    try {
      const { error } = await supabase
        .from("device_playlists")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("device_id", device.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Playlist unassigned from this screen");
      await reloadFromServer();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to unassign playlist";
      toast.error(message);
    } finally {
      setUnassigningPlaylist(false);
    }
  }, [device, reloadFromServer, supabase]);

  const createPlaylistAndAssign = useCallback(async () => {
    if (!device) return;
    setCreatingPlaylist(true);
    try {
      const { data, error } = await supabase
        .from("playlists")
        .insert({ owner_id: ownerId, name: `${device.name} — screen` })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      await assignPlaylist(data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create playlist";
      toast.error(message);
    } finally {
      setCreatingPlaylist(false);
    }
  }, [assignPlaylist, device, ownerId, supabase]);

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

  const addMediaAtIndex = useCallback(
    async (mediaId: string, destIndex: number) => {
      if (!playlistId) return;
      const sortLen =
        useConsoleDataStore.getState().playlistItemsByPlaylistId[playlistId]?.length ?? 0;
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

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) {
        if (draggableId.startsWith("media-")) setLibraryResetKey((k) => k + 1);
        return;
      }

      if (source.droppableId === "media-library" && destination.droppableId === "media-library") {
        setLibraryResetKey((k) => k + 1);
        return;
      }

      if (draggableId.startsWith("media-") && destination.droppableId === "screen-playlist") {
        const mediaId = draggableId.replace(/^media-/, "");
        if (!playlistId) {
          toast.error("Choose a playlist for this screen first.");
          return;
        }
        await addMediaAtIndex(mediaId, destination.index);
        return;
      }

      if (draggableId.startsWith("pi-") && destination.droppableId === "media-library") {
        const itemId = draggableId.replace(/^pi-/, "");
        await removeItem(itemId);
        setLibraryResetKey((k) => k + 1);
        return;
      }

      if (
        draggableId.startsWith("pi-") &&
        source.droppableId === "screen-playlist" &&
        destination.droppableId === "screen-playlist"
      ) {
        if (destination.index === source.index) return;
        const next = reorder(items, source.index, destination.index);
        setItems(next);
        await persistOrder(next);
      }
    },
    [addMediaAtIndex, items, persistOrder, playlistId, removeItem],
  );

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return allMedia;
    return allMedia.filter((m) => (m.original_filename ?? m.storage_path).toLowerCase().includes(q));
  }, [allMedia, librarySearch]);

  const screenHardwareBasics = useMemo(
    () => (device ? deviceScreenBasics(device) : { brand: null, model: null, screenSize: null }),
    [device],
  );

  const playlistTimingLabel = useMemo(() => formatPlaylistClockLabel(items), [items]);

  const addMediaByClick = useCallback(
    (mediaId: string) => {
      if (!playlistId) {
        toast.error("Choose a playlist for this screen first.");
        return;
      }
      void addMediaAtIndex(mediaId, items.length);
    },
    [addMediaAtIndex, items.length, playlistId],
  );

  if (!device) {
    return null;
  }

  if (!publicBaseUrl) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Missing NEXT_PUBLIC_SUPABASE_URL. Copy `apps/web/.env.example` to `.env.local` to preview thumbnails.
      </div>
    );
  }

  const playlistPickerBar = (
    <>
      <Label htmlFor="screen-playlist" className="sr-only">
        Playlist for this screen
      </Label>
      <select
        id="screen-playlist"
        className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-52 lg:w-60"
        value={activePlaylistId}
        disabled={creatingPlaylist || unassigningPlaylist}
        aria-busy={unassigningPlaylist}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) {
            void unassignPlaylist();
            return;
          }
          void assignPlaylist(value);
        }}
      >
        <option value="">No playlist</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        className="h-10 w-full shrink-0 whitespace-nowrap sm:w-auto"
        disabled={creatingPlaylist || unassigningPlaylist}
        title="Creates a playlist and assigns it to this screen"
        onClick={() => void createPlaylistAndAssign()}
      >
        {creatingPlaylist ? "Creating…" : "New playlist"}
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <div className="relative mx-auto h-24 w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted to-muted/40 shadow-inner sm:mx-0">
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-10 w-10 text-muted-foreground/80" strokeWidth={1.25} />
                </div>
                <div className="absolute left-2 top-2">
                  <ScreenStatusBadge status={effectiveDeviceStatus(device)} />
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              {!isEditingDeviceName ? (
                <div className="flex max-w-full flex-wrap items-center gap-1.5">
                  <h1 className="min-w-0 w-fit max-w-full text-balance text-2xl font-semibold tracking-tight text-foreground leading-snug">
                    <span className="break-words [overflow-wrap:anywhere]">{device.name}</span>
                  </h1>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="inline-flex h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setDeviceName(device.name);
                      setIsEditingDeviceName(true);
                    }}
                    aria-label="Edit screen name"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Input
                    id="device-screen-name"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="h-11 min-w-0 flex-1 text-lg font-semibold sm:max-w-xl"
                    aria-label="Screen name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveDeviceName();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditingDeviceName();
                      }
                    }}
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={savingName || !deviceName.trim()}
                      onClick={() => void saveDeviceName()}
                    >
                      {savingName ? "Saving…" : "Save"}
                    </Button>
                    <Button type="button" variant="ghost" disabled={savingName} onClick={cancelEditingDeviceName}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <div
                  className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="list"
                  aria-label="Last activity"
                >
                  <span
                    role="listitem"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight tabular-nums"
                  >
                    <span className="shrink-0 text-muted-foreground">Last seen</span>
                    <span className="min-w-0 font-medium text-foreground">{formatLastSeen(device.last_seen)}</span>
                  </span>
                </div>
                {(screenHardwareBasics.brand || screenHardwareBasics.model || screenHardwareBasics.screenSize) && (
                  <div
                    className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="list"
                    aria-label="Device hardware from TV telemetry"
                  >
                    {screenHardwareBasics.brand ? (
                      <span
                        role="listitem"
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight"
                      >
                        <span className="shrink-0 text-muted-foreground">Brand</span>
                        <span className="min-w-0 truncate font-medium text-foreground">{screenHardwareBasics.brand}</span>
                      </span>
                    ) : null}
                    {screenHardwareBasics.model ? (
                      <span
                        role="listitem"
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight"
                      >
                        <span className="shrink-0 text-muted-foreground">Model</span>
                        <span className="min-w-0 truncate font-medium text-foreground">{screenHardwareBasics.model}</span>
                      </span>
                    ) : null}
                    {screenHardwareBasics.screenSize ? (
                      <span
                        role="listitem"
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/35 px-2.5 py-0.5 text-[0.6875rem] leading-tight tabular-nums"
                      >
                        <span className="shrink-0 text-muted-foreground">Screen</span>
                        <span className="min-w-0 truncate font-medium text-foreground">{screenHardwareBasics.screenSize}</span>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-wrap justify-start gap-2 border-t border-border pt-6 lg:w-auto lg:self-center lg:justify-end lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <DevicePlaybackToggle device={device} />
              <DeviceScreenOrientationSettings device={device} />
              <DeviceTelemetryMoreButton device={device} />
            </div>
          </div>
        </div>

      {device.playback_disabled ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Playlist playback is paused for this screen. The TV shows the app logo and “Device disabled by admin” until you
          choose <span className="font-medium">Resume playlist on TV</span>.
        </div>
      ) : null}

      {!playlistId ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
          <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Playlist on this screen</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Pick which playlist this TV plays. Use <span className="font-medium text-foreground">New playlist</span> to create and assign one.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                {playlistPickerBar}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              Select a playlist to load the clip editor and asset library.
            </p>
          </div>
        </section>
      ) : (
        <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h3 className="text-sm font-semibold text-foreground">Playlist control</h3>
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
                      <PlaylistPreviewButton
                        items={items}
                        playlistName={activePlaylistName}
                        publicBaseUrl={publicBaseUrl}
                        frame={{ kind: "device", displayPx: deviceDisplayPxForPreview }}
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">{playlistPickerBar}</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  {items.length === 0 && (
                    <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                      The TV stays on a placeholder until this playlist has at least one clip.
                    </p>
                  )}

                  <Droppable droppableId="screen-playlist">
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
                            <span className="pr-1 text-right" />
                          </div>
                          {items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-14 text-center">
                              <p className="text-sm font-medium text-foreground">Nothing in this playlist yet</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Drag files from <strong className="font-medium text-foreground">Assets</strong>, or upload on the{" "}
                                <Link href="/media" className="font-medium text-emerald-700 underline-offset-4 hover:underline">
                                  Media
                                </Link>{" "}
                                page.
                              </p>
                            </div>
                          ) : (
                            items.map((item, index) => (
                              <Draggable key={item.id} draggableId={`pi-${item.id}`} index={index}>
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
                                    <div className={cn("grid items-center gap-2", "grid-cols-[40px_88px_1fr_72px_88px_44px]")}>
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
                                      <ScreenPlaylistRowThumb item={item} publicBaseUrl={publicBaseUrl} />
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
                                            <Label className="sr-only" htmlFor={`dur-${item.id}`}>
                                              Duration (seconds)
                                            </Label>
                                            <Input
                                              id={`dur-${item.id}`}
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
                  <Droppable droppableId="media-library" key={libraryResetKey}>
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
                                    onClick={() => addMediaByClick(m.id)}
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
      )}
    </div>
  );
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

function ScreenPlaylistRowThumb({ item, publicBaseUrl }: { item: PlaylistItemWithMedia; publicBaseUrl: string }) {
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
