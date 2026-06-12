"use client";

import { DevicesManager } from "@/components/devices-manager";
import { useConsoleDataStore } from "@/stores/console-data-store";

export default function AdminClientDevicesPage() {
  const ownerId = useConsoleDataStore((s) => s.ownerId);

  if (!ownerId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  return <DevicesManager />;
}
