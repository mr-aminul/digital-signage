"use client";

import type { Device, DeviceStatus } from "@signage/types";
import { LayoutGrid, Link2, List, Monitor, Search, Settings, Trash2, Tv, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { deviceDetailPath, useAdminClientRoutes } from "@/components/admin/admin-client-route-context";
import { useOptionalAdminStaff } from "@/components/admin/admin-staff-context";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { usePlanQuota } from "@/components/console/plan-quota-context";
import { PlanUsageMeter } from "@/components/plan/plan-usage-meter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeviceWithAssignments } from "@/lib/console-sync";
import { useStaleOnlineTick } from "@/hooks/use-stale-online-tick";
import { effectiveDeviceStatus, formatDeviceLastSeen } from "@/lib/device-status";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConsoleDataStore } from "@/stores/console-data-store";
import { deviceTelemetrySummaryLine } from "@/components/device-telemetry-panel";
import { DeviceMediaCacheChip } from "@/components/device-media-cache-chip";
import { DeviceAppVersionChip } from "@/components/device-app-version-chip";
import { DeviceDisabledBadge, deviceDisabledPresentation, isDevicePausedByQuota } from "@/components/device-disabled-notice";
import { DevicePlaybackPowerButton } from "@/components/device-playback-toggle";
import { useActiveAppRelease, type ActiveAppRelease } from "@/hooks/use-active-app-release";
import { deviceAppUpdateStatus, getDeviceInstalledApp } from "@/lib/device-app-version";

type StatusFilter = "all" | DeviceStatus;

function statusLabel(status: DeviceStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "pending_pairing":
      return "Pending";
    default:
      return status;
  }
}

function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide",
        status === "online" && "bg-brand-soft text-brand-badge dark:text-brand-onDark",
        status === "offline" && "bg-muted text-muted-foreground",
        status === "pending_pairing" && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function deviceCardActionButtonClass(variant: "secondary" | "outline") {
  return cn(
    buttonVariants({ variant, size: "sm" }),
    "h-8 w-8 p-0 transition-all duration-150 hover:shadow-sm active:scale-[0.97]",
    variant === "secondary" ? "hover:bg-muted/90" : "hover:bg-muted/60",
  );
}

function DeviceModelChip({ model }: { model: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full border border-border/80 bg-background/90 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground shadow-sm"
      title={model}
    >
      <span className="truncate">{model}</span>
    </span>
  );
}

const STATUS_FILTERS: { id: StatusFilter; label: string; icon: typeof Monitor }[] = [
  { id: "all", label: "All", icon: Monitor },
  { id: "online", label: "Online", icon: Wifi },
  { id: "offline", label: "Offline", icon: WifiOff },
  { id: "pending_pairing", label: "Pending", icon: Link2 },
];

export function DevicesManager() {
  useStaleOnlineTick();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const devices = useConsoleDataStore((s) => s.devices) as DeviceWithAssignments[];
  const activeAppRelease = useActiveAppRelease();

  const { syncNow } = useConsoleSync();
  const adminStaff = useOptionalAdminStaff();
  const adminRoutes = useAdminClientRoutes();
  const plan = usePlanQuota();
  const deviceLimit = plan?.deviceLimit ?? null;
  const accountDisabled = plan?.accountDisabled ?? false;
  const readOnly = adminStaff != null && !adminStaff.canWrite;
  const canControlPlayback = Boolean(adminStaff?.canWrite && !accountDisabled);

  const [pairingCode, setPairingCode] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [devicePendingDelete, setDevicePendingDelete] = useState<Device | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const refreshAfterMutation = useCallback(async () => {
    await syncNow();
  }, [syncNow]);

  async function linkDevice() {
    if (readOnly) return;
    if (deviceLimit != null && devices.length >= deviceLimit) {
      toast.error(`Screen limit reached (${deviceLimit}). Contact support to add more.`);
      return;
    }
    setLinking(true);
    try {
      const code = pairingCode.trim();
      if (!/^[0-9]{6}$/.test(code)) {
        toast.error("Pairing code must be exactly 6 digits.");
        return;
      }
      const ownerId = adminRoutes?.clientId ?? null;
      const { data, error } = await supabase.rpc("link_device_by_pairing_code", {
        p_code: code,
        p_name: friendlyName.trim() || null,
        p_owner_id: ownerId,
      });
      if (error) {
        if (error.message.includes("device_limit_reached")) {
          toast.error(
            `You've reached your screen limit (${deviceLimit ?? "plan limit"}). Remove a screen or upgrade your plan.`,
          );
        } else if (error.message.includes("trial_expired")) {
          toast.error("Your trial has ended. Contact us to upgrade and link more screens.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(`Linked device ${(data as Device).name}`);
      setPairingCode("");
      setFriendlyName("");
      await refreshAfterMutation();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to link device";
      toast.error(message);
    } finally {
      setLinking(false);
    }
  }

  const confirmDeleteDevice = useCallback(async () => {
    if (!devicePendingDelete) return;
    setDeleteInProgress(true);
    try {
      const { error } = await supabase.from("devices").delete().eq("id", devicePendingDelete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Device removed");
      setDevicePendingDelete(null);
      await refreshAfterMutation();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove device";
      toast.error(message);
    } finally {
      setDeleteInProgress(false);
    }
  }, [devicePendingDelete, refreshAfterMutation, supabase]);

  const filtered = useMemo(() => {
    let list = devices;
    if (statusFilter !== "all") {
      list = list.filter((d) => effectiveDeviceStatus(d) === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    return list;
  }, [devices, statusFilter, search]);

  const onlineCount = useMemo(
    () => devices.filter((d) => effectiveDeviceStatus(d) === "online").length,
    [devices],
  );

  const updatePendingCount = useMemo(() => {
    if (!activeAppRelease) return 0;
    return devices.filter((d) => deviceAppUpdateStatus(getDeviceInstalledApp(d), activeAppRelease) === "update_available")
      .length;
  }, [activeAppRelease, devices]);

  const atDeviceLimit = deviceLimit != null && devices.length >= deviceLimit;
  const quotaPausedCount = devices.filter((d) => isDevicePausedByQuota(d)).length;

  return (
    <div className="flex min-h-[min(70vh,720px)] flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 space-y-4 lg:w-56 xl:w-60">
        {plan ? (
          <PlanUsageMeter
            variant="screens"
            used={devices.length}
            limit={plan.deviceLimit}
            layout="card"
            className="shadow-sm"
          />
        ) : null}

        {!readOnly ? (
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Link a screen
            </p>
            {deviceLimit != null ? (
              <p className="mb-3 text-xs tabular-nums text-muted-foreground">
                {devices.length} of {deviceLimit} screens linked
                {quotaPausedCount > 0
                  ? ` · ${quotaPausedCount} paused by plan`
                  : ""}
              </p>
            ) : null}
            {atDeviceLimit ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                You have reached your screen limit. Contact support if you need to link more devices.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pair-code" className="text-xs">
                    Pairing code
                  </Label>
                  <Input
                    id="pair-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="h-9 font-mono text-sm tracking-widest"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pair-name" className="text-xs">
                    Display name
                  </Label>
                  <Input
                    id="pair-name"
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                    placeholder="Lobby screen"
                    className="h-9 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  className="h-10 w-full gap-2 font-semibold shadow-sm"
                  onClick={() => void linkDevice()}
                  disabled={linking}
                >
                  <Tv className="h-4 w-4" strokeWidth={2.25} />
                  {linking ? "Linking…" : "Link device"}
                </Button>
              </div>
            )}
            {!atDeviceLimit ? (
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
                Enter the six-digit code from the TV after it signs in. List is cached locally—use Sync in the
                header to refresh.
              </p>
            ) : null}
          </div>
        ) : null}

        <nav className="rounded-xl border border-border bg-muted/30 p-2" aria-label="Filter by status">
          <p className="mb-2 px-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <ul className="space-y-0.5">
            {STATUS_FILTERS.map(({ id, label, icon: Icon }) => {
              const active = statusFilter === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-full flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
            <div className="min-w-0 shrink-0">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="text-foreground">Screens</span>
                <span className="text-muted-foreground/70">/</span>
                <span className="rounded-md bg-muted/80 px-2 py-0.5 text-xs font-normal text-foreground">All devices</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtered.length} screen{filtered.length === 1 ? "" : "s"}
                {devices.length !== filtered.length ? ` (${devices.length} total)` : ""}
                {devices.length > 0 && (
                  <>
                    {" "}
                    · {onlineCount} online
                    {updatePendingCount > 0 ? (
                      <>
                        {" "}
                        · {updatePendingCount} update{updatePendingCount === 1 ? "" : "s"} pending
                      </>
                    ) : null}
                  </>
                )}
              </p>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <div className="relative w-full min-w-0 sm:w-48 lg:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search screens…"
                  className="h-9 border-border bg-background pl-8 text-sm"
                  aria-label="Search devices"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "rounded-md p-1.5 text-muted-foreground transition-colors",
                  view === "grid" ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                )}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "rounded-md p-1.5 text-muted-foreground transition-colors",
                  view === "list" ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                )}
                aria-pressed={view === "list"}
                aria-label="List view"
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-5">
            {devices.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Monitor className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-foreground">No screens linked yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Open the TV app, note the pairing code, then use <strong className="font-medium text-foreground">Link a screen</strong> on the
                  left.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
                <p className="text-sm font-medium text-foreground">No screens match</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">Try another search or status filter.</p>
              </div>
            ) : view === "grid" ? (
              <ul className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {filtered.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    activeAppRelease={activeAppRelease}
                    accountDisabled={accountDisabled}
                    canControlPlayback={canControlPlayback}
                    canDelete={!readOnly}
                    onRequestDelete={() => setDevicePendingDelete(device)}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {filtered.map((device) => (
                  <DeviceListRow
                    key={device.id}
                    device={device}
                    activeAppRelease={activeAppRelease}
                    accountDisabled={accountDisabled}
                    canControlPlayback={canControlPlayback}
                    canDelete={!readOnly}
                    onRequestDelete={() => setDevicePendingDelete(device)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={devicePendingDelete !== null}
        title={devicePendingDelete ? `Remove “${devicePendingDelete.name}”?` : "Remove screen?"}
        description="This disconnects the screen from your account. The TV will need to be paired again to show your content."
        confirmLabel="Remove screen"
        onClose={() => !deleteInProgress && setDevicePendingDelete(null)}
        onConfirm={confirmDeleteDevice}
        isConfirming={deleteInProgress}
      />
    </div>
  );
}

function DeviceCard({
  device,
  activeAppRelease,
  accountDisabled = false,
  canControlPlayback = false,
  canDelete = true,
  onRequestDelete,
}: {
  device: Device;
  activeAppRelease: ActiveAppRelease | null;
  accountDisabled?: boolean;
  canControlPlayback?: boolean;
  canDelete?: boolean;
  onRequestDelete: () => void;
}) {
  const adminRoutes = useAdminClientRoutes();
  const deviceSummary = deviceTelemetrySummaryLine(device);
  const disabledState = deviceDisabledPresentation(device, accountDisabled);
  return (
    <li className="relative flex h-full min-h-[15.5rem] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={deviceDetailPath(device.id, adminRoutes)}
        className="absolute inset-0 z-0 rounded-xl ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open screen: ${device.name}`}
      />
      <div className="pointer-events-none relative z-[1] min-h-[6.5rem] border-b border-border bg-gradient-to-br from-muted/80 to-muted/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
            <Tv className="h-6 w-6 text-foreground" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="space-y-0.5">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={device.name}>
                {device.name}
              </p>
              {deviceSummary ? <DeviceModelChip model={deviceSummary} /> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Active · {formatDeviceLastSeen(device.last_seen)}</p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none relative z-[1] min-h-[3.5rem] space-y-1 border-b border-border px-3 py-2">
        <div className="flex min-h-[1.25rem] flex-wrap items-center gap-1">
          <StatusBadge status={effectiveDeviceStatus(device)} />
          {disabledState.show ? (
            <DeviceDisabledBadge
              accountSuspended={disabledState.accountSuspended}
              pausedByQuota={disabledState.pausedByQuota}
            />
          ) : null}
        </div>
        <div className="flex min-h-[1.25rem] flex-wrap items-center gap-1">
          <DeviceAppVersionChip device={device} activeRelease={activeAppRelease} compact />
          <DeviceMediaCacheChip device={device} compact />
        </div>
      </div>
      <div className="relative z-[2] mt-auto flex items-center justify-between gap-1 border-t border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1">
          {canDelete ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={`Remove ${device.name}`}
              className={cn(
                deviceCardActionButtonClass("secondary"),
                "hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRequestDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {canControlPlayback ? (
            <DevicePlaybackPowerButton
              device={device}
              variant="secondary"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          ) : null}
          <Link
            href={deviceDetailPath(device.id, adminRoutes)}
            aria-label={`Settings for ${device.name}`}
            className={cn(
              deviceCardActionButtonClass("secondary"),
              "hover:text-foreground",
            )}
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </li>
  );
}

function DeviceListRow({
  device,
  activeAppRelease,
  accountDisabled = false,
  canControlPlayback = false,
  canDelete = true,
  onRequestDelete,
}: {
  device: Device;
  activeAppRelease: ActiveAppRelease | null;
  accountDisabled?: boolean;
  canControlPlayback?: boolean;
  canDelete?: boolean;
  onRequestDelete: () => void;
}) {
  const adminRoutes = useAdminClientRoutes();
  const deviceSummary = deviceTelemetrySummaryLine(device);
  const disabledState = deviceDisabledPresentation(device, accountDisabled);
  return (
    <li className="relative flex flex-row items-center justify-between gap-3 px-3 py-4 transition-colors hover:bg-muted/40">
      <Link
        href={deviceDetailPath(device.id, adminRoutes)}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open screen: ${device.name}`}
      />
      <div className="relative z-[1] flex min-w-0 flex-1 items-start gap-3 pointer-events-none">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
          <Tv className="h-5 w-5 text-foreground" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{device.name}</p>
          {deviceSummary ? (
            <div className="mt-0.5">
              <DeviceModelChip model={deviceSummary} />
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={effectiveDeviceStatus(device)} />
            {disabledState.show ? (
              <DeviceDisabledBadge
                accountSuspended={disabledState.accountSuspended}
                pausedByQuota={disabledState.pausedByQuota}
              />
            ) : null}
            <DeviceAppVersionChip device={device} activeRelease={activeAppRelease} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Active · {formatDeviceLastSeen(device.last_seen)}</p>
          <div className="mt-1">
            <DeviceMediaCacheChip device={device} compact />
          </div>
        </div>
      </div>

      <div className="relative z-[2] flex shrink-0 items-center gap-1">
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Remove ${device.name}`}
            className={cn(
              deviceCardActionButtonClass("outline"),
              "hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
        {canControlPlayback ? (
          <DevicePlaybackPowerButton
            device={device}
            variant="outline"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        ) : null}
        <Link
          href={deviceDetailPath(device.id, adminRoutes)}
          aria-label={`Settings for ${device.name}`}
          className={cn(
            deviceCardActionButtonClass("outline"),
            "hover:text-foreground",
          )}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
