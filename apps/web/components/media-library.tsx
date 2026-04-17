"use client";

import type { Media } from "@signage/types";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inferMediaFileType, isAcceptedSignageMime } from "@/lib/media";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface MediaLibraryProps {
  userId: string;
  initialMedia: Media[];
  publicBaseUrl: string;
}

export function MediaLibrary({ userId, initialMedia, publicBaseUrl }: MediaLibraryProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = useState<Media[]>(initialMedia);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("media")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data as Media[]) ?? []);
  }, [supabase, userId]);

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
          const { error: insertError } = await supabase.from("media").insert({
            owner_id: userId,
            storage_path: objectPath,
            file_type: inferMediaFileType(file.type),
            original_filename: file.name,
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
  });

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
        <p className="mt-2 text-muted-foreground">
          Uploads land in the `media` bucket under your user folder. JPG, PNG, WebP, MP4, and WebM are supported.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>Drag files here or click to browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center transition ${
              isDragActive ? "bg-muted" : "bg-background"
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-sm text-muted-foreground">
              {uploading ? "Uploading…" : "Drop images or videos, or click to select files"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const url = `${publicBaseUrl}/storage/v1/object/public/media/${item.storage_path}`;
          return (
            <Card key={item.id} className="border-border bg-card">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">{item.original_filename ?? item.storage_path}</CardTitle>
                <CardDescription>{item.file_type}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.file_type === "image" ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border">
                    <Image src={url} alt={item.original_filename ?? "Media"} fill className="object-cover" sizes="400px" />
                  </div>
                ) : item.file_type === "video" ? (
                  <video className="aspect-video w-full rounded-md border border-border" controls src={url} />
                ) : (
                  <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                )}
                <div className="flex justify-between gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
                    onClick={() => void removeMedia(item)}
                  >
                    Delete
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
