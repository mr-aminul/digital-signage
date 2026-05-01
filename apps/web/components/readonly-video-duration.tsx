"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

interface ReadonlyVideoDurationProps {
  id: string;
  durationSeconds?: number | null;
  fallbackProbeUrl?: string | null;
}

function secondsDisplay(duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return "";
  return String(Math.max(1, Math.round(duration)));
}

export function ReadonlyVideoDuration({ id, durationSeconds, fallbackProbeUrl }: ReadonlyVideoDurationProps) {
  const [probed, setProbed] = useState<number | null>(null);
  const hasDb =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0;

  useEffect(() => {
    setProbed(null);
  }, [durationSeconds, fallbackProbeUrl]);

  const metaSrc =
    !hasDb && fallbackProbeUrl
      ? `${fallbackProbeUrl}${fallbackProbeUrl.includes("#") ? "" : "#t=0.001"}`
      : null;

  const sec = hasDb ? Number(durationSeconds) : probed;
  const valueText = sec != null && Number.isFinite(sec) && sec > 0 ? secondsDisplay(sec) : "";

  return (
    <div className="min-w-0">
      {metaSrc ? (
        <video
          key={metaSrc}
          className="pointer-events-none fixed left-0 top-0 z-[-1] h-[2px] w-[2px] opacity-0"
          preload="metadata"
          muted
          playsInline
          aria-hidden
          src={metaSrc}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0 && d !== Number.POSITIVE_INFINITY) {
              setProbed(d);
            }
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0 && d !== Number.POSITIVE_INFINITY) {
              setProbed(d);
            }
          }}
        />
      ) : null}
      <Label className="sr-only" htmlFor={id}>
        Video duration in seconds (from file, not editable)
      </Label>
      <Input
        id={id}
        readOnly
        tabIndex={-1}
        value={valueText}
        placeholder="…"
        className="h-9 w-full min-w-0 cursor-default text-sm tabular-nums"
      />
    </div>
  );
}
