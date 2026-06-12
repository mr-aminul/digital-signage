import type { PlatformStaff } from "@signage/types";

/** Operators and owners may mutate client data; viewers are read-only. */
export function isStaffWriter(staff: PlatformStaff): boolean {
  return staff.role === "owner" || staff.role === "operator";
}
