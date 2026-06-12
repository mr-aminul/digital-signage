"use client";

import { MediaLibrary } from "@/components/media-library";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function AdminClientMediaPage() {
  const ownerId = useConsoleDataStore((s) => s.ownerId);

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return <MediaLibrary userId={ownerId} />;
}
