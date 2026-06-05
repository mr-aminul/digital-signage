"use client";

import type { Media } from "@signage/types";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { FileImage, Plus, Search, Upload } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { mediaPublicUrl } from "@/lib/object-storage/urls";
import { cn, mediaLibraryAddButtonClassName } from "@/lib/utils";

function LibraryThumb({ media }: { media: Media }) {
  const url = mediaPublicUrl(media.storage_path);
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

interface PlaylistAssetsPanelProps {
  ownerId: string;
  droppableId: string;
  libraryResetKey: number;
  librarySearch: string;
  onLibrarySearchChange: (value: string) => void;
  filteredLibrary: Media[];
  onAddMedia: (mediaId: string) => void;
  onUploaded: (media: Media[]) => void | Promise<void>;
  uploadDisabled?: boolean;
  uploadDisabledHint?: string;
}

export function PlaylistAssetsPanel({
  ownerId,
  droppableId,
  libraryResetKey,
  librarySearch,
  onLibrarySearchChange,
  filteredLibrary,
  onAddMedia,
  onUploaded,
  uploadDisabled = false,
  uploadDisabledHint,
}: PlaylistAssetsPanelProps) {
  const { uploading, open, getInputProps } = useMediaUpload(ownerId, {
    onComplete: onUploaded,
  });

  function tryOpenUpload() {
    if (uploadDisabled) {
      if (uploadDisabledHint) toast.error(uploadDisabledHint);
      return;
    }
    open();
  }

  return (
    <aside className="w-full shrink-0 lg:w-[300px]">
      <input {...getInputProps()} />
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-card">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Media</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Upload here, then drag or tap Add.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs font-semibold shadow-sm"
              disabled={uploading || uploadDisabled}
              title={uploadDisabled ? uploadDisabledHint : "Upload images or videos"}
              onClick={tryOpenUpload}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "…" : "Upload"}
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={librarySearch}
              onChange={(e) => onLibrarySearchChange(e.target.value)}
              placeholder="Search…"
              className="h-9 border-border bg-background pl-8 text-sm"
              aria-label="Search media"
            />
          </div>
        </div>
        <div className="max-h-[min(520px,55vh)] overflow-y-auto p-3">
          <Droppable droppableId={droppableId} key={libraryResetKey}>
            {(libProvided) => (
              <ul ref={libProvided.innerRef} {...libProvided.droppableProps} className="space-y-2">
                {filteredLibrary.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    {uploadDisabled && uploadDisabledHint ? (
                      uploadDisabledHint
                    ) : (
                      <>
                        No media yet.{" "}
                        <button
                          type="button"
                          className="font-medium text-brand-strong underline-offset-4 hover:underline"
                          disabled={uploading || uploadDisabled}
                          onClick={tryOpenUpload}
                        >
                          Upload files
                        </button>
                      </>
                    )}
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
                            snapshot.isDragging && "opacity-90 ring-2 ring-brand-faint30",
                          )}
                        >
                          <LibraryThumb media={m} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{m.original_filename ?? m.storage_path}</p>
                            <p className="text-[0.625rem] capitalize text-muted-foreground">{m.file_type}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className={mediaLibraryAddButtonClassName}
                            disabled={uploadDisabled}
                            onClick={() => onAddMedia(m.id)}
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
  );
}
