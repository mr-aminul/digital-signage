"use client";

import type { Media } from "@signage/types";
import { FileImage, FileVideo, FolderOpen, Image as ImageIcon, LayoutGrid, List, Search, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inferMediaFileType, isAcceptedSignageMime, readVideoFileDurationSeconds } from "@/lib/media";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConsoleDataStore } from "@/stores/console-data-store";

interface MediaLibraryProps {
  userId: string;
  publicBaseUrl: string;
}

type TypeFilter = "all" | "image" | "video" | "unknown";

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 30) return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (day > 0) return day === 1 ? "Updated yesterday" : `Updated ${day} days ago`;
  if (hr > 0) return `Updated ${hr} hour${hr === 1 ? "" : "s"} ago`;
  if (min > 0) return `Updated ${min} min ago`;
  return "Updated just now";
}

const FILTER_ROWS: { id: TypeFilter; label: string; icon: typeof ImageIcon }[] = [
  { id: "all", label: "All", icon: FolderOpen },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: FileVideo },
  { id: "unknown", label: "Other", icon: FileImage },
];

export function MediaLibrary({ userId, publicBaseUrl }: MediaLibraryProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const items = useConsoleDataStore((s) => s.media) as Media[];
  const { syncNow } = useConsoleSync();
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const refresh = useCallback(async () => {
    await syncNow();
  }, [syncNow]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      try {
        for (const file of acceptedFiles) {
          if (!isAcceptedSignageMime(file.type)) {
            toast.error(`${file.name} is not a supported image/video type.`);
            continue;
          }
          const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
          const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from("media").upload(objectPath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
          if (uploadError) {
            toast.error(uploadError.message);
            continue;
          }
          const fileType = inferMediaFileType(file.type);
          const intrinsicSeconds =
            fileType === "video" ? await readVideoFileDurationSeconds(file) : null;
          const { error: insertError } = await supabase.from("media").insert({
            owner_id: userId,
            storage_path: objectPath,
            file_type: fileType,
            original_filename: file.name,
            duration_seconds: intrinsicSeconds,
          });
          if (insertError) {
            toast.error(insertError.message);
            continue;
          }
          toast.success(`Uploaded ${file.name}`);
        }
        await refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
      } finally {
        setUploading(false);
      }
    },
    [refresh, supabase, userId],
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop: (files) => void onDrop(files),
    accept: {
      "image/jpeg": [],
      "image/png": [],
      "image/webp": [],
      "video/mp4": [],
      "video/webm": [],
    },
    multiple: true,
    disabled: uploading,
    noClick: true,
    noKeyboard: true,
  });

  const filtered = useMemo(() => {
    let list = items;
    if (typeFilter !== "all") {
      list = list.filter((m) => m.file_type === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => (m.original_filename ?? m.storage_path).toLowerCase().includes(q));
    }
    return list;
  }, [items, typeFilter, search]);

  async function removeMedia(row: Media) {
    const { error: storageError } = await supabase.storage.from("media").remove([row.storage_path]);
    if (storageError) {
      toast.error(storageError.message);
      return;
    }
    const { error } = await supabase.from("media").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Media deleted");
    await refresh();
  }

  return (
    <div className="flex min-h-[min(70vh,720px)] flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 space-y-4 lg:w-56 xl:w-60">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="h-9 border-border bg-background pl-8 text-sm"
              aria-label="Search media"
            />
          </div>
        </div>

        <Button
          type="button"
          className="h-10 w-full gap-2 font-semibold shadow-sm"
          onClick={() => open()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" strokeWidth={2.25} />
          {uploading ? "Uploading…" : "Upload files"}
        </Button>
        <p className="text-center text-[0.6875rem] text-muted-foreground lg:text-left">or drag files into the library</p>

        <nav className="rounded-xl border border-border bg-muted/30 p-2" aria-label="Filter by type">
          <p className="mb-2 px-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Type</p>
          <ul className="space-y-0.5">
            {FILTER_ROWS.map(({ id, label, icon: Icon }) => {
              const active = typeFilter === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setTypeFilter(id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div {...getRootProps()} className="min-w-0 flex-1">
        <input {...getInputProps()} />
        <div
          className={cn(
            "flex min-h-full flex-col rounded-xl border bg-card shadow-sm transition-colors",
            isDragActive ? "border-primary ring-2 ring-primary/20" : "border-border",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="text-foreground">Media library</span>
                <span className="text-muted-foreground/70">/</span>
                <span className="rounded-md bg-muted/80 px-2 py-0.5 text-xs font-normal text-foreground">All files</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtered.length} file{filtered.length === 1 ? "" : "s"}
                {items.length !== filtered.length ? ` (${items.length} total)` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "rounded-md p-1.5 text-muted-foreground transition-colors",
                  view === "grid" ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                )}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "rounded-md p-1.5 text-muted-foreground transition-colors",
                  view === "list" ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                )}
                aria-pressed={view === "list"}
                aria-label="List view"
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
                <p className="text-sm font-medium text-foreground">No files match</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {items.length === 0
                    ? "Upload images or videos to see them here. Data is cached locally—use Sync if needed."
                    : "Try another search or filter, or upload new assets."}
                </p>
                {items.length === 0 && (
                  <Button type="button" className="mt-4 gap-2" onClick={() => open()} disabled={uploading}>
                    <Upload className="h-4 w-4" />
                    Upload files
                  </Button>
                )}
              </div>
            ) : view === "grid" ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {filtered.map((item) => (
                  <MediaCard key={item.id} item={item} publicBaseUrl={publicBaseUrl} onRemove={() => void removeMedia(item)} />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {filtered.map((item) => (
                  <MediaListRow key={item.id} item={item} publicBaseUrl={publicBaseUrl} onRemove={() => void removeMedia(item)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeCornerBadge({ fileType }: { fileType: Media["file_type"] }) {
  if (fileType === "image") {
    return (
      <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 shadow-sm ring-1 ring-border backdrop-blur-sm">
        <ImageIcon className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
      </div>
    );
  }
  if (fileType === "video") {
    return (
      <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 shadow-sm ring-1 ring-border backdrop-blur-sm">
        <FileVideo className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
      </div>
    );
  }
  return (
    <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 shadow-sm ring-1 ring-border backdrop-blur-sm">
      <FileImage className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
    </div>
  );
}

function MediaCard({
  item,
  publicBaseUrl,
  onRemove,
}: {
  item: Media;
  publicBaseUrl: string;
  onRemove: () => void;
}) {
  const url = `${publicBaseUrl}/storage/v1/object/public/media/${item.storage_path}`;
  const name = item.original_filename ?? item.storage_path;

  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {item.file_type === "image" ? (
          <Image src={url} alt="" fill className="object-cover transition-transform group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, 280px" />
        ) : item.file_type === "video" ? (
          <video className="h-full w-full object-cover" src={url} muted playsInline preload="metadata" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
        )}
        <TypeCornerBadge fileType={item.file_type} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={name}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">{formatUpdatedAt(item.created_at)}</p>
        <div className="mt-auto flex gap-2 pt-1">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Open
          </a>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center rounded-md border border-transparent px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function MediaListRow({
  item,
  publicBaseUrl,
  onRemove,
}: {
  item: Media;
  publicBaseUrl: string;
  onRemove: () => void;
}) {
  const url = `${publicBaseUrl}/storage/v1/object/public/media/${item.storage_path}`;
  const name = item.original_filename ?? item.storage_path;

  return (
    <li className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/40">
      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {item.file_type === "image" ? (
          <Image src={url} alt="" fill className="object-cover" sizes="80px" />
        ) : item.file_type === "video" ? (
          <video className="h-full w-full object-cover" src={url} muted playsInline preload="metadata" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileImage className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{formatUpdatedAt(item.created_at)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Open
        </a>
        <button type="button" onClick={onRemove} className="text-xs font-medium text-destructive hover:underline">
          Delete
        </button>
      </div>
    </li>
  );
}
