"use client";

import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { DeviceScreenEditor } from "@/components/device-screen-editor";
import type { DeviceWithAssignments } from "@/lib/console-sync";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function DeviceDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const ownerId = useConsoleDataStore((s) => s.ownerId);
  const lastSyncedAt = useConsoleDataStore((s) => s.lastSyncedAt);
  const devices = useConsoleDataStore((s) => s.devices);

  const device = useMemo(
    () => (devices as DeviceWithAssignments[]).find((d) => d.id === id),
    [devices, id],
  );

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  if (!id) {
    notFound();
  }

  if (!device) {
    if (lastSyncedAt !== null) {
      notFound();
    }
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return <DeviceScreenEditor deviceId={device.id} ownerId={ownerId} />;
}
