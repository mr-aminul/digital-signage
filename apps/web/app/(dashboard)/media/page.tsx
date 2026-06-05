"use client";

import { MediaLibrary } from "@/components/media-library";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function MediaPage() {
  const ownerId = useConsoleDataStore((s) => s.ownerId);

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-56 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return <MediaLibrary userId={ownerId} />;
}
