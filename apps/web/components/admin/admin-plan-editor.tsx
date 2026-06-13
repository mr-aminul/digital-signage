"use client";

import type { Device } from "@signage/types";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Minus, Monitor, Plus } from "lucide-react";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { PlanUsageSummary } from "@/components/plan/plan-usage-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDevicePlanActive, formatDevicePlanAdded, formatDevicePlanHint } from "@/lib/device-status";
import {
  STORAGE_GB_PRESETS,
  formatStorageBytes,
  parseStorageGbInput,
} from "@/lib/plan-quota";
import { cn } from "@/lib/utils";

type AdminPlanEditorProps = {
  userId: string;
  deviceLimit: number;
  deviceCount: number;
  storageLimitBytes: number;
  storageUsedBytes: number;
  devices: Pick<Device, "id" | "name" | "status" | "last_seen" | "created_at" | "paused_by_quota">[];
};

async function savePlan(payload: {
  userId: string;
  deviceLimit: number;
  storageLimitBytes: number;
  activeDeviceIds?: string[];
}) {
  const response = await fetch("/api/admin/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to update plan");
  }
}

function pickMostRecentlyActiveDeviceIds(
  devices: Pick<Device, "id" | "last_seen">[],
  limit: number,
): string[] {
  return [...devices]
    .sort((a, b) => {
      const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit)
    .map((device) => device.id);
}

function QuantityStepper({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 0,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  min: number;
  max?: number;
  step?: number;
  decimals?: number;
  ariaLabel: string;
}) {
  const parsed = Number.parseFloat(value);
  const numeric = Number.isFinite(parsed) ? parsed : min;
  const canDec = numeric > min;
  const canInc = max == null || numeric < max;

  function applyDelta(delta: number) {
    const next = Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, numeric + delta));
    onChange(decimals > 0 ? next.toFixed(decimals) : String(Math.round(next)));
  }

  return (
    <div
      className="flex items-stretch overflow-hidden rounded-md border border-input bg-background shadow-sm"
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        variant="ghost"
        className="h-9 w-9 shrink-0 rounded-none border-r border-input px-0 hover:bg-muted/80"
        disabled={!canDec}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => applyDelta(-step)}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent text-center tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-label={ariaLabel}
      />
      <Button
        type="button"
        variant="ghost"
        className="h-9 w-9 shrink-0 rounded-none border-l border-input px-0 hover:bg-muted/80"
        disabled={!canInc}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => applyDelta(step)}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function AdminPlanEditor({
  userId,
  deviceLimit,
  deviceCount,
  storageLimitBytes,
  storageUsedBytes,
  devices,
}: AdminPlanEditorProps) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [screenLimit, setScreenLimit] = useState(String(deviceLimit));
  const [storageGb, setStorageGb] = useState(String((storageLimitBytes / 1024 ** 3).toFixed(1)));
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(() =>
    pickMostRecentlyActiveDeviceIds(devices, deviceLimit),
  );
  const [loading, setLoading] = useState(false);

  const parsedScreenLimit = Number.parseInt(screenLimit, 10);
  const parsedStorageBytes = parseStorageGbInput(storageGb);
  const screenValid = Number.isInteger(parsedScreenLimit) && parsedScreenLimit >= 1;
  const storageValid = parsedStorageBytes != null && parsedStorageBytes >= 1024 ** 2;
  const needsDevicePick = screenValid && parsedScreenLimit < deviceCount;
  const selectionValid = !needsDevicePick || selectedDeviceIds.length === parsedScreenLimit;

  const unchanged =
    screenValid &&
    storageValid &&
    parsedScreenLimit === deviceLimit &&
    parsedStorageBytes === storageLimitBytes;

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bTime - aTime;
      }),
    [devices],
  );

  function setScreenLimitValue(next: string) {
    const cleaned = next.replace(/[^\d]/g, "").slice(0, 4);
    setScreenLimit(cleaned);
    const n = Number.parseInt(cleaned, 10);
    if (Number.isInteger(n) && n >= 1 && n < deviceCount) {
      setSelectedDeviceIds(pickMostRecentlyActiveDeviceIds(devices, n));
    }
  }

  function toggleDevice(id: string) {
    setSelectedDeviceIds((current) => {
      if (current.includes(id)) {
        return current.filter((x) => x !== id);
      }
      if (!screenValid) return current;
      if (current.length >= parsedScreenLimit) {
        toast.error(`Select at most ${parsedScreenLimit} active screen${parsedScreenLimit === 1 ? "" : "s"}.`);
        return current;
      }
      return [...current, id];
    });
  }

  if (!canWrite) {
    return (
      <div className="space-y-4 rounded-xl border border-border/90 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Plan & usage</h2>
        <PlanUsageSummary
          deviceCount={deviceCount}
          deviceLimit={deviceLimit}
          storageUsedBytes={storageUsedBytes}
          storageLimitBytes={storageLimitBytes}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/90 bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Plan & usage</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Set how many screens can play and how much cloud storage this client receives. Lowering
          screens below the linked count pauses playback on the rest immediately. If you do not pick
          active screens, the most recently seen devices are kept online automatically.
        </p>
      </div>

      <PlanUsageSummary
        deviceCount={deviceCount}
        deviceLimit={deviceLimit}
        storageUsedBytes={storageUsedBytes}
        storageLimitBytes={storageLimitBytes}
      />

      <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-screens" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Screen limit
          </Label>
          <QuantityStepper
            id="plan-screens"
            value={screenLimit}
            onChange={setScreenLimitValue}
            min={1}
            max={9999}
            ariaLabel="Screen limit"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            {deviceCount} screen{deviceCount === 1 ? "" : "s"} currently linked.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-storage" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Storage (GB)
          </Label>
          <QuantityStepper
            id="plan-storage"
            value={storageGb}
            onChange={(next) => setStorageGb(next.replace(/[^\d.]/g, ""))}
            min={1}
            max={512}
            step={1}
            decimals={1}
            ariaLabel="Storage limit in gigabytes"
          />
          <div className="flex flex-wrap gap-1.5">
            {STORAGE_GB_PRESETS.map((gb) => (
              <button
                key={gb}
                type="button"
                onClick={() => setStorageGb(String(gb))}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium transition",
                  storageGb === String(gb)
                    ? "border-brand-faint25 bg-brand-faint15 text-foreground"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                {gb} GB
              </button>
            ))}
          </div>
          {storageValid && storageUsedBytes > parsedStorageBytes! ? (
            <p className="text-[0.6875rem] text-amber-800 dark:text-amber-200">
              Client is using {formatStorageBytes(storageUsedBytes)} — uploads stay blocked until they
              delete {formatStorageBytes(storageUsedBytes - parsedStorageBytes!)} or you raise the limit.
            </p>
          ) : null}
        </div>
      </div>

      {needsDevicePick ? (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Choose {parsedScreenLimit} active screen{parsedScreenLimit === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">
            {deviceCount - parsedScreenLimit} other linked screen
            {deviceCount - parsedScreenLimit === 1 ? "" : "s"} will stop playback when you save.
          </p>
          <ul className="flex flex-col gap-1.5">
            {sortedDevices.map((device) => {
              const selected = selectedDeviceIds.includes(device.id);
              const hint = formatDevicePlanHint(device);
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    onClick={() => toggleDevice(device.id)}
                    title={hint}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition",
                      selected
                        ? "border-brand-faint25 bg-brand-faint15 shadow-sm"
                        : "border-border/80 bg-background hover:border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-brand-strong bg-brand-strong text-white"
                          : "border-border bg-card text-transparent",
                      )}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                    </span>
                    <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{device.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] tabular-nums text-muted-foreground/75">
                      <span>{formatDevicePlanAdded(device)}</span>
                      <span className="text-muted-foreground/35" aria-hidden>
                        ·
                      </span>
                      <span>{formatDevicePlanActive(device)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={loading || !screenValid || !storageValid || !selectionValid || unchanged}
        onClick={() => {
          if (!screenValid || !storageValid || !selectionValid) return;

          const storageOver = storageUsedBytes > parsedStorageBytes!;
          const pauseCount = needsDevicePick ? deviceCount - parsedScreenLimit : 0;
          const message = [
            `Save plan for this client?`,
            `Screens: ${parsedScreenLimit}`,
            `Storage: ${formatStorageBytes(parsedStorageBytes!)}`,
            pauseCount > 0 ? `${pauseCount} screen(s) will pause playback.` : null,
            storageOver ? "Uploads remain blocked until usage is under the new storage cap." : null,
          ]
            .filter(Boolean)
            .join("\n");

          if (!window.confirm(message)) return;

          setLoading(true);
          void (async () => {
            try {
              await savePlan({
                userId,
                deviceLimit: parsedScreenLimit,
                storageLimitBytes: parsedStorageBytes!,
                activeDeviceIds: needsDevicePick ? selectedDeviceIds : undefined,
              });
              toast.success("Plan updated");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not update plan");
            } finally {
              setLoading(false);
            }
          })();
        }}
      >
        {loading ? "Saving…" : "Save plan"}
      </Button>
    </div>
  );
}
