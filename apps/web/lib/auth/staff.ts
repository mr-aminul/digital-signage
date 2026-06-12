import { cache } from "react";
import type { PlatformStaff } from "@signage/types";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type StaffAuthContext = {
  user: User;
  staff: PlatformStaff;
  supabase: ReturnType<typeof getSupabaseServerClient>;
};

/** Authenticated platform operator (admin portal). */
export const getServerStaffAuth = cache(async (): Promise<StaffAuthContext | null> => {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from("platform_staff")
    .select("user_id, email, display_name, role, is_active, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn("[getServerStaffAuth]", error.message);
    return null;
  }

  if (!data) return null;

  return {
    user,
    staff: data as PlatformStaff,
    supabase,
  };
});

export async function requireServerStaffAuth(): Promise<StaffAuthContext> {
  const ctx = await getServerStaffAuth();
  if (!ctx) {
    throw new Error("Forbidden");
  }
  return ctx;
}
