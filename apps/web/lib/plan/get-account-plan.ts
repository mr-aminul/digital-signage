import type { PlanQuotaSnapshot } from "@/lib/plan-quota";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "@/lib/plan-quota";
import { isTrialExpired, isOnTrial } from "@/lib/trial";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAccountPlanSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanQuotaSnapshot> {
  const [{ data: profile, error: profileError }, { count, error: deviceError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("device_limit, storage_limit_bytes, storage_used_bytes, trial_ends_at, plan_kind")
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

  const trialEndsAt = profile?.trial_ends_at ?? null;
  const planKind = profile?.plan_kind ?? null;
  const trialExpired = isTrialExpired(trialEndsAt);

  return {
    deviceLimit: profile?.device_limit ?? 1,
    deviceCount: count ?? 0,
    storageLimitBytes: profile?.storage_limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES,
    storageUsedBytes: profile?.storage_used_bytes ?? 0,
    trialEndsAt,
    planKind,
    trialExpired,
    isOnTrial: isOnTrial({ trialEndsAt, trialExpired, planKind }),
  };
}

export function planSnapshotFromAdminEntry(entry: {
  device_count: number;
  device_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  is_disabled: boolean;
  trial_ends_at?: string | null;
  trial_expired?: boolean;
  plan_kind?: string | null;
}): PlanQuotaSnapshot {
  const trialEndsAt = entry.trial_ends_at ?? null;
  const planKind = entry.plan_kind ?? null;
  const trialExpired = entry.trial_expired ?? isTrialExpired(trialEndsAt);
  return {
    deviceCount: Number(entry.device_count),
    deviceLimit: entry.device_limit,
    storageUsedBytes: Number(entry.storage_used_bytes),
    storageLimitBytes: Number(entry.storage_limit_bytes),
    accountDisabled: entry.is_disabled,
    trialEndsAt,
    planKind,
    trialExpired,
    isOnTrial: isOnTrial({ trialEndsAt, trialExpired, planKind }),
  };
}
