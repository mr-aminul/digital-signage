"use client";

import type { Device } from "@signage/types";
import { HardDrive } from "lucide-react";
import { deviceMediaCacheSummary } from "@/lib/device-media-cache";
import { cn } from "@/lib/utils";

const toneClass: Record<NonNullable<ReturnType<typeof deviceMediaCacheSummary>>["tone"], string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warming: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  partial: "border-border/80 bg-muted/35 text-foreground",
  empty: "border-border/80 bg-muted/35 text-muted-foreground",
};

export function DeviceMediaCacheChip({
  device,
  compact = false,
  className,
}: {
  device: Device;
  compact?: boolean;
  className?: string;
}) {
  const summary = deviceMediaCacheSummary(device);
  if (!summary) return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] leading-tight",
        toneClass[summary.tone],
        className,
      )}
      title={summary.detail ?? summary.label}
    >
      <HardDrive className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 truncate font-medium">{summary.label}</span>
      {!compact && summary.detail ? (
        <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">· {summary.detail}</span>
      ) : null}
    </span>
  );
}
