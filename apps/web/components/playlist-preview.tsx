"use client";

import type { PlaylistItemWithMedia } from "@signage/types";
import { ListVideo } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function mediaUrl(publicBaseUrl: string, storagePath: string) {
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/media/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

function slideDurationSec(item: PlaylistItemWithMedia): number {
  return Math.max(1, item.duration_seconds ?? 10);
}

function PreviewSlide({
  item,
  publicBaseUrl,
  onImageDone,
  onVideoDone,
}: {
  item: PlaylistItemWithMedia;
  publicBaseUrl: string;
  onImageDone: () => void;
  onVideoDone: () => void;
}) {
  const url = mediaUrl(publicBaseUrl, item.media.storage_path);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoDoneRef = useRef(false);

  useEffect(() => {
    videoDoneRef.current = false;
  }, [item.id, url]);

  useEffect(() => {
    if (item.media.file_type === "video") return;
    const ms = slideDurationSec(item) * 1000;
    const id = window.setTimeout(onImageDone, ms);
    return () => clearTimeout(id);
  }, [item, onImageDone]);

  useEffect(() => {
    if (item.media.file_type !== "video") return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.playsInline = true;
    el.src = url;
    void el.play().catch(() => {});
  }, [item.media.file_type, url]);

  useEffect(() => {
    if (item.media.file_type !== "video") return;
    const el = videoRef.current;
    if (!el) return;

    const finish = () => {
      if (videoDoneRef.current) return;
      videoDoneRef.current = true;
      onVideoDone();
    };

    el.addEventListener("ended", finish);
    return () => el.removeEventListener("ended", finish);
  }, [item.media.file_type, onVideoDone, url]);

  if (item.media.file_type === "video") {
    return (
      <video
        ref={videoRef}
        className="h-full w-full object-contain bg-black"
        muted
        playsInline
        preload="auto"
        aria-label={`Preview: ${item.media.original_filename ?? "video"}`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
    <img src={url} alt="" className="h-full w-full object-contain bg-black" />
  );
}

export type PlaylistPreviewFrameContext =
  /** Playlist-only editor — generic 16:9 frame. */
  | { kind: "playlist" }
  /** Screen editor — match TV aspect ratio when telemetry includes display px. */
  | { kind: "device"; displayPx: { widthPx: number; heightPx: number } | null };

const GENERIC_ASPECT = { w: 16, h: 9 } as const;

function frameDescription(ctx: PlaylistPreviewFrameContext, hasDisplay: boolean): string {
  if (ctx.kind === "playlist") {
    return "Frame is a generic 16:9 area; assign this playlist to a screen to preview in that display's aspect ratio.";
  }
  if (hasDisplay) {
    return "Frame aspect ratio matches the display size reported by the TV app (pixel width x height).";
  }
  return "Display size is not in telemetry yet — frame uses 16:9 until the TV app reports width and height.";
}

export function PlaylistPreviewButton({
  items,
  playlistName,
  publicBaseUrl,
  className,
  frame = { kind: "playlist" },
}: {
  items: PlaylistItemWithMedia[];
  playlistName?: string | null;
  publicBaseUrl: string;
  className?: string;
  /** Where the preview is opened from — device page uses TV-reported resolution when available. */
  frame?: PlaylistPreviewFrameContext;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [index, setIndex] = useState(0);

  const empty = items.length === 0;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open, items]);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + items.length) % items.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, items.length]);

  const item = items[index];
  const slideLabel =
    items.length > 0 ? `${index + 1} / ${items.length}` : "";

  const displayPx = frame.kind === "device" ? frame.displayPx : null;
  const hasDeviceDisplay = displayPx != null;
  const aspectW = hasDeviceDisplay ? displayPx.widthPx : GENERIC_ASPECT.w;
  const aspectH = hasDeviceDisplay ? displayPx.heightPx : GENERIC_ASPECT.h;
  /** Width÷height — used so the frame fits inside the modal for both portrait and landscape TVs. */
  const aspectRatioNumber = aspectW / aspectH;
  const frameCaption = frameDescription(frame, hasDeviceDisplay);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("shrink-0 gap-1.5", className)}
        disabled={empty}
        title={empty ? "Add clips to the playlist to preview" : undefined}
        onClick={() => setOpen(true)}
        aria-label="Preview playlist"
      >
        <ListVideo className="h-4 w-4" strokeWidth={2} aria-hidden />
        Preview
      </Button>
      {open && !empty && item ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Dismiss" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[min(90vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-muted/30 px-5 py-4">
              <div className="min-w-0 space-y-0.5">
                <h2 id={titleId} className="text-lg font-semibold text-foreground">
                  Playlist preview
                </h2>
                {playlistName ? (
                  <p className="truncate text-sm text-muted-foreground">{playlistName}</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Local preview using your playlist order and image durations (videos always play in full). Use arrow keys to change slides.
              </p>
              <p className="text-xs text-muted-foreground">{frameCaption}</p>
              {hasDeviceDisplay ? (
                <p className="text-xs font-medium tabular-nums text-foreground/90">
                  {displayPx.widthPx} × {displayPx.heightPx} px
                </p>
              ) : null}
              <div className="flex w-full justify-center">
                <div
                  className="mx-auto overflow-hidden rounded-lg border border-border bg-muted/20"
                  style={{
                    width: `min(100%, calc(min(65vh, 560px) * ${aspectRatioNumber}))`,
                    aspectRatio: `${aspectW} / ${aspectH}`,
                  }}
                >
                  <PreviewSlide
                    key={`${item.id}-${index}`}
                    item={item}
                    publicBaseUrl={publicBaseUrl}
                    onImageDone={advance}
                    onVideoDone={advance}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Slide <span className="font-medium tabular-nums text-foreground">{slideLabel}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground max-w-[min(100%,240px)]" title={item.media.original_filename ?? undefined}>
                  {item.media.original_filename ?? item.media.storage_path}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
