import { describe, expect, it } from "vitest";
import type { Device } from "@signage/types";
import { deviceMediaCacheSummary, getDeviceMediaCache } from "@/lib/device-media-cache";

function deviceWithMediaCache(mediaCache: Record<string, unknown>): Device {
  return {
    id: "dev-1",
    name: "Lobby TV",
    status: "online",
    last_seen: new Date().toISOString(),
    telemetry: { media_cache: mediaCache },
  } as Device;
}

describe("getDeviceMediaCache", () => {
  it("parses media_cache from telemetry", () => {
    const parsed = getDeviceMediaCache(
      deviceWithMediaCache({
        items_total: 5,
        items_ready: 3,
        videos_total: 2,
        videos_ready: 1,
        images_total: 3,
        images_ready: 2,
        warming: true,
        cache_bytes_used: 1048576,
        cache_bytes_max: 1073741824,
      }),
    );
    expect(parsed).toEqual({
      items_total: 5,
      items_ready: 3,
      videos_total: 2,
      videos_ready: 1,
      images_total: 3,
      images_ready: 2,
      warming: true,
      cache_bytes_used: 1048576,
      cache_bytes_max: 1073741824,
    });
  });

  it("returns null when media_cache is missing", () => {
    expect(getDeviceMediaCache({ id: "x", name: "x", status: "online" } as Device)).toBeNull();
  });
});

describe("deviceMediaCacheSummary", () => {
  it("shows preparing when warming and incomplete", () => {
    const summary = deviceMediaCacheSummary(
      deviceWithMediaCache({ items_total: 4, items_ready: 1, warming: true }),
    );
    expect(summary?.label).toBe("Cache 1/4 · preparing");
    expect(summary?.tone).toBe("warming");
  });

  it("shows ready when all items cached", () => {
    const summary = deviceMediaCacheSummary(
      deviceWithMediaCache({ items_total: 2, items_ready: 2, warming: false }),
    );
    expect(summary?.label).toBe("Cache ready 2/2");
    expect(summary?.tone).toBe("ready");
  });
});
