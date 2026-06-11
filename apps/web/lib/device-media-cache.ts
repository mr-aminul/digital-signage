import type { Device } from "@signage/types";

export type DeviceMediaCacheTelemetry = {
  items_total?: number;
  items_ready?: number;
  videos_total?: number;
  videos_ready?: number;
  images_total?: number;
  images_ready?: number;
  warming?: boolean;
  cache_bytes_used?: number;
  cache_bytes_max?: number;
  content_revision?: string;
};

function telemetryNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function telemetryBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

/** Parsed `telemetry.media_cache` from the TV app (Phase 3). */
export function getDeviceMediaCache(device: Device): DeviceMediaCacheTelemetry | null {
  const t = device.telemetry;
  if (!t || typeof t !== "object") return null;
  const raw = (t as Record<string, unknown>).media_cache;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const itemsTotal = telemetryNumber(m.items_total);
  const itemsReady = telemetryNumber(m.items_ready);
  if (itemsTotal == null || itemsReady == null) return null;
  return {
    items_total: itemsTotal,
    items_ready: itemsReady,
    videos_total: telemetryNumber(m.videos_total) ?? undefined,
    videos_ready: telemetryNumber(m.videos_ready) ?? undefined,
    images_total: telemetryNumber(m.images_total) ?? undefined,
    images_ready: telemetryNumber(m.images_ready) ?? undefined,
    warming: telemetryBoolean(m.warming) ?? undefined,
    cache_bytes_used: telemetryNumber(m.cache_bytes_used) ?? undefined,
    cache_bytes_max: telemetryNumber(m.cache_bytes_max) ?? undefined,
    content_revision:
      typeof m.content_revision === "string" && m.content_revision.trim()
        ? m.content_revision.trim()
        : undefined,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type DeviceMediaCacheSummary = {
  label: string;
  detail: string | null;
  tone: "ready" | "warming" | "partial" | "empty";
};

/** One-line cache status for device cards and the screen editor. */
export function deviceMediaCacheSummary(device: Device): DeviceMediaCacheSummary | null {
  const cache = getDeviceMediaCache(device);
  if (!cache || cache.items_total <= 0) return null;

  const { items_ready: ready, items_total: total } = cache;
  const warming = cache.warming === true;

  let tone: DeviceMediaCacheSummary["tone"];
  if (warming) {
    tone = "warming";
  } else if (ready >= total) {
    tone = "ready";
  } else if (ready <= 0) {
    tone = "empty";
  } else {
    tone = "partial";
  }

  const label =
    warming && ready < total
      ? `Cache ${ready}/${total} · preparing`
      : ready >= total
        ? `Cache ready ${ready}/${total}`
        : `Cache ${ready}/${total}`;

  const parts: string[] = [];
  if (cache.videos_total != null && cache.videos_total > 0) {
    parts.push(`Video ${cache.videos_ready ?? 0}/${cache.videos_total}`);
  }
  if (cache.images_total != null && cache.images_total > 0) {
    parts.push(`Images ${cache.images_ready ?? 0}/${cache.images_total}`);
  }
  if (cache.cache_bytes_used != null) {
    const used = formatBytes(cache.cache_bytes_used);
    if (cache.cache_bytes_max != null) {
      parts.push(`${used} / ${formatBytes(cache.cache_bytes_max)}`);
    } else {
      parts.push(used);
    }
  }

  return {
    label,
    detail: parts.length > 0 ? parts.join(" · ") : null,
    tone,
  };
}
