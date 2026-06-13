import type { Profile } from "@signage/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "@/lib/plan-quota";

type ProfileRow = {
  id: string;
  client_name?: string | null;
  full_name?: string | null;
  created_at: string;
  is_disabled: boolean;
  device_limit?: number;
  storage_limit_bytes?: number;
  storage_used_bytes?: number;
  trial_ends_at?: string | null;
  plan_kind?: string | null;
};

function profileName(row: ProfileRow): string | null {
  return row.client_name ?? row.full_name ?? null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    client_name: profileName(row),
    created_at: row.created_at,
    is_disabled: row.is_disabled,
    device_limit: row.device_limit ?? 1,
    storage_limit_bytes: row.storage_limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES,
    storage_used_bytes: row.storage_used_bytes ?? 0,
    trial_ends_at: row.trial_ends_at ?? null,
    plan_kind: (row.plan_kind as Profile["plan_kind"]) ?? "standard",
  };
}

const PROFILE_SELECT_FULL =
  "id, client_name, created_at, is_disabled, device_limit, storage_limit_bytes, storage_used_bytes, trial_ends_at, plan_kind";
const PROFILE_SELECT_CORE =
  "id, client_name, created_at, is_disabled, device_limit, trial_ends_at, plan_kind";
const PROFILE_SELECT_MINIMAL = "id, client_name, created_at, is_disabled";
const PROFILE_SELECT_LEGACY_FULL =
  "id, full_name, created_at, is_disabled, device_limit, storage_limit_bytes";
const PROFILE_SELECT_LEGACY_CORE = "id, full_name, created_at, is_disabled, device_limit";
const PROFILE_SELECT_LEGACY_MINIMAL = "id, full_name, created_at, is_disabled";

/** Tolerates partial migrations when optional plan columns are not applied yet. */
export async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const attempts: { select: string; label: string }[] = [
    { select: PROFILE_SELECT_FULL, label: "full" },
    { select: PROFILE_SELECT_CORE, label: "core" },
    { select: PROFILE_SELECT_MINIMAL, label: "minimal" },
    { select: PROFILE_SELECT_LEGACY_FULL, label: "legacy-full" },
    { select: PROFILE_SELECT_LEGACY_CORE, label: "legacy-core" },
    { select: PROFILE_SELECT_LEGACY_MINIMAL, label: "legacy-minimal" },
  ];

  for (const { select, label } of attempts) {
    const { data, error } = await supabase.from("profiles").select(select).eq("id", userId).maybeSingle();
    if (!error && data) {
      return toProfile(data as unknown as ProfileRow);
    }
    if (error) {
      console.warn(`[fetchProfileRow] ${label}`, error.message);
    }
  }

  return null;
}

export async function fetchProfileIsDisabled(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_disabled")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[fetchProfileIsDisabled]", error.message);
    return null;
  }

  return Boolean(data?.is_disabled);
}
