import type { SupabaseClient } from "@supabase/supabase-js";
import { getObjectStorageServerConfig } from "@/lib/object-storage/env";
import { headMediaObjectSize } from "@/lib/object-storage/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/** Read denormalized storage counter from profiles (falls back to RPC sum). */
export async function getOwnerStorageUsedBytes(
  ownerId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("storage_used_bytes")
    .eq("id", ownerId)
    .maybeSingle();

  if (!profileError && profile && typeof profile.storage_used_bytes === "number") {
    return profile.storage_used_bytes;
  }

  if (profileError) {
    console.warn("[getOwnerStorageUsedBytes] profile", profileError.message);
  }

  const { data: used, error } = await supabase.rpc("get_owner_storage_used", { p_owner_id: ownerId });
  if (error) {
    console.warn("[getOwnerStorageUsedBytes] rpc", error.message);
    return 0;
  }

  return typeof used === "number" ? used : Number(used ?? 0);
}

/** One-time / admin repair: HEAD missing sizes from object storage and persist on media rows. */
export async function reconcileOwnerMediaSizes(ownerId: string): Promise<number> {
  if (!getObjectStorageServerConfig()) {
    throw new Error("Object storage is not configured");
  }

  const supabase = getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("media")
    .select("id, owner_id, storage_path, size_bytes")
    .eq("owner_id", ownerId)
    .or("size_bytes.is.null,size_bytes.eq.0");

  if (error) throw error;

  for (const row of rows ?? []) {
    const size = await headMediaObjectSize(row.owner_id, row.storage_path);
    if (size == null || size <= 0) continue;

    const { error: updateError } = await supabase
      .from("media")
      .update({ size_bytes: size })
      .eq("id", row.id);

    if (updateError) {
      console.warn("[reconcileOwnerMediaSizes] update failed", row.id, updateError.message);
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("storage_used_bytes")
    .eq("id", ownerId)
    .maybeSingle();

  if (!profileError && profile && typeof profile.storage_used_bytes === "number") {
    return profile.storage_used_bytes;
  }

  const { data: used, error: rpcError } = await supabase.rpc("get_owner_storage_used", {
    p_owner_id: ownerId,
  });
  if (rpcError) throw rpcError;
  return typeof used === "number" ? used : Number(used ?? 0);
}
