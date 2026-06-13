import type { PlanQuotaSnapshot } from "@/lib/plan-quota";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "@/lib/plan-quota";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAccountPlanSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanQuotaSnapshot> {
  const [{ data: profile, error: profileError }, { count, error: deviceError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("device_limit, storage_limit_bytes, storage_used_bytes")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("devices").select("id", { count: "exact", head: true }).eq("owner_id", userId),
  ]);

  if (profileError) {
    console.warn("[getAccountPlanSnapshot] profile", profileError.message);
  }
  if (deviceError) {
    console.warn("[getAccountPlanSnapshot] devices", deviceError.message);
  }

  return {
    deviceLimit: profile?.device_limit ?? 1,
    deviceCount: count ?? 0,
    storageLimitBytes: profile?.storage_limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES,
    storageUsedBytes: profile?.storage_used_bytes ?? 0,
  };
}

export function planSnapshotFromAdminEntry(entry: {
  device_count: number;
  device_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
}): PlanQuotaSnapshot {
  return {
    deviceCount: Number(entry.device_count),
    deviceLimit: entry.device_limit,
    storageUsedBytes: Number(entry.storage_used_bytes),
    storageLimitBytes: Number(entry.storage_limit_bytes),
  };
}
