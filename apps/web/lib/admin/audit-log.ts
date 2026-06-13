import { formatStorageBytes } from "@/lib/plan-quota";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  plan_update: "Plan updated",
  account_disable: "Account disabled",
  account_enable: "Account enabled",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function formatAuditTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAuditMetadata(action: string, metadata: Record<string, unknown>): string {
  if (action === "plan_update") {
    const parts: string[] = [];
    const deviceBefore = metadata.device_limit_before;
    const deviceAfter = metadata.device_limit_after;
    if (typeof deviceBefore === "number" && typeof deviceAfter === "number" && deviceBefore !== deviceAfter) {
      parts.push(`Screens ${deviceBefore} → ${deviceAfter}`);
    } else if (typeof deviceAfter === "number") {
      parts.push(`${deviceAfter} screen limit`);
    }

    const storageBefore = metadata.storage_limit_bytes_before;
    const storageAfter = metadata.storage_limit_bytes_after;
    if (
      typeof storageBefore === "number" &&
      typeof storageAfter === "number" &&
      storageBefore !== storageAfter
    ) {
      parts.push(`Storage ${formatStorageBytes(storageBefore)} → ${formatStorageBytes(storageAfter)}`);
    } else if (typeof storageAfter === "number") {
      parts.push(`${formatStorageBytes(storageAfter)} storage limit`);
    }

    const activeIds = metadata.active_device_ids;
    if (Array.isArray(activeIds) && activeIds.length > 0) {
      parts.push(`${activeIds.length} active screen${activeIds.length === 1 ? "" : "s"} selected`);
    }

    return parts.length > 0 ? parts.join(" · ") : "Plan limits saved";
  }

  if (action === "account_disable" || action === "account_enable") {
    return action === "account_disable"
      ? "Client account suspended; all screens paused"
      : "Client account re-enabled; quota rules reapplied";
  }

  const keys = Object.keys(metadata);
  if (keys.length === 0) return "—";
  return keys.slice(0, 3).join(", ");
}
