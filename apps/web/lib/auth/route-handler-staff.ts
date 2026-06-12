import type { PlatformStaff, Profile } from "@signage/types";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Auth + profile + optional staff row for Route Handlers. */
export async function getRouteHandlerStaffAuth(): Promise<{
  supabase: ReturnType<typeof getSupabaseServerClient>;
  user: User | null;
  profile: Profile | null;
  staff: PlatformStaff | null;
}> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, profile: null, staff: null };
  }

  const [{ data: profile, error: profileError }, { data: staff, error: staffError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, created_at, is_disabled")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("platform_staff")
      .select("user_id, email, display_name, role, is_active, created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (profileError) {
    console.warn("[getRouteHandlerStaffAuth] profile", profileError.message);
  }
  if (staffError) {
    console.warn("[getRouteHandlerStaffAuth] staff", staffError.message);
  }

  return {
    supabase,
    user,
    profile: (profile as Profile | null) ?? null,
    staff: (staff as PlatformStaff | null) ?? null,
  };
}
