import { formatStorageBytes } from "@/lib/plan-quota";

export const AUDIT_ACTION_FILTERS = [
  { id: "all", label: "All actions" },
  { id: "plan_update", label: "Plan updates" },
  { id: "account_disable", label: "Suspensions" },
  { id: "account_enable", label: "Re-enables" },
  { id: "client_invite", label: "Invitations" },
  { id: "trial_extend", label: "Trial extensions" },
  { id: "trial_convert", label: "Trial conversions" },
] as const;

export type AuditActionFilter = (typeof AUDIT_ACTION_FILTERS)[number]["id"];

export function parseAuditActionFilter(value: string | undefined): AuditActionFilter {
  if (AUDIT_ACTION_FILTERS.some((filter) => filter.id === value)) {
    return value as AuditActionFilter;
  }
  return "all";
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  plan_update: "Plan updated",
  account_disable: "Account disabled",
  account_enable: "Account enabled",
  client_invite: "Client invited",
  trial_extend: "Trial extended",
  trial_convert: "Trial converted",
  "staff.remove": "Admin removed",
};

const WAITLIST_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  invited: "Invited",
  dismissed: "Dismissed",
};

export function auditActionLabel(action: string, metadata?: Record<string, unknown>): string {
  if (action === "waitlist_status") {
    const statusAfter = typeof metadata?.status_after === "string" ? metadata.status_after : null;
    if (statusAfter === "invited") return "Waitlist invited";
    if (statusAfter === "dismissed") return "Waitlist dismissed";
    if (statusAfter === "reviewed") return "Waitlist reviewed";
    if (statusAfter === "pending") return "Waitlist reopened";
  }

  return AUDIT_ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
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

function waitlistStatusLabel(status: unknown): string | null {
  return typeof status === "string" ? (WAITLIST_STATUS_LABELS[status] ?? status) : null;
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
      ? "Client account suspended; screens pause via account status"
      : "Client account re-enabled; quota-active screens resumed (manual disables preserved)";
  }

  if (action === "client_invite") {
    const email = typeof metadata.email === "string" ? metadata.email : null;
    const clientName = typeof metadata.client_name === "string" ? metadata.client_name : null;
    if (email && clientName) return `Invitation sent to ${email} (${clientName})`;
    if (email) return `Invitation sent to ${email}`;
    return "Client invitation sent";
  }

  if (action === "trial_extend") {
    const days = metadata.days_added;
    const after = metadata.trial_ends_at_after;
    const parts: string[] = [];
    if (typeof days === "number") parts.push(`+${days} day${days === 1 ? "" : "s"}`);
    if (typeof after === "string") {
      parts.push(
        `ends ${new Date(after).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
      );
    }
    return parts.length > 0 ? parts.join(" · ") : "Trial extended";
  }

  if (action === "trial_convert") {
    return "Trial removed · account converted to paid";
  }

  if (action === "waitlist_status") {
    const before = waitlistStatusLabel(metadata.status_before);
    const after = waitlistStatusLabel(metadata.status_after ?? metadata.status);
    const parts: string[] = [];

    if (before && after && before !== after) {
      parts.push(`${before} → ${after}`);
    } else if (after) {
      parts.push(`Status set to ${after}`);
    }

    const screens = metadata.screen_count;
    if (typeof screens === "number" && screens > 0) {
      parts.push(`${screens} screen${screens === 1 ? "" : "s"} requested`);
    }

    const company = typeof metadata.company_name === "string" ? metadata.company_name.trim() : "";
    if (company) {
      parts.push(company);
    }

    return parts.length > 0 ? parts.join(" · ") : "Waitlist entry updated";
  }

  if (action === "staff.remove") {
    const role = typeof metadata.role === "string" ? metadata.role : null;
    return role ? `Removed ${role} access` : "Admin portal access revoked";
  }

  const keys = Object.keys(metadata);
  if (keys.length === 0) return "—";
  return keys.slice(0, 3).join(", ");
}

export function auditSubjectKind(entry: {
  action: string;
  target_user_id: string | null;
}): "client" | "waitlist" | "none" {
  if (entry.target_user_id) return "client";
  if (entry.action === "waitlist_status" || entry.action === "client_invite") return "waitlist";
  return "none";
}
