import type { AdminUserDirectoryEntry } from "@signage/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAdminClientEntry(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminUserDirectoryEntry | null> {
  const { data, error } = await supabase.rpc("admin_get_client", { p_user_id: userId });
  if (error) return null;
  const rows = (data as AdminUserDirectoryEntry[]) ?? [];
  return rows[0] ?? null;
}
