import type { PlatformStaff } from "@signage/types";
import { isStaffWriter } from "@/lib/auth/staff-utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUserId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

type ResolveResult = { ownerId: string } | { error: string; status: number };

/** Resolves media/console owner id — clients use auth id; staff pass the client owner id. */
export function resolveDataOwnerId(
  authUserId: string,
  staff: PlatformStaff | null,
  requestedOwnerId: string | null | undefined,
): ResolveResult {
  if (!staff) {
    return { ownerId: authUserId };
  }

  if (!isStaffWriter(staff)) {
    return { error: "Read-only access", status: 403 };
  }

  const ownerId = parseUserId(requestedOwnerId);
  if (!ownerId) {
    return { error: "Missing ownerId", status: 400 };
  }

  return { ownerId };
}
