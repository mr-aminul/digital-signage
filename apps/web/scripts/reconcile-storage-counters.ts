/**
 * Verify profiles.storage_used_bytes matches sum(media.size_bytes) and repair drift.
 *
 * Usage (from apps/web with env loaded):
 *   npx tsx scripts/reconcile-storage-counters.ts
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: profiles, error } = await supabase.from("profiles").select("id, storage_used_bytes");
  if (error) throw error;

  let repaired = 0;
  for (const profile of profiles ?? []) {
    const { data: mediaRows, error: mediaError } = await supabase
      .from("media")
      .select("size_bytes")
      .eq("owner_id", profile.id);

    if (mediaError) throw mediaError;

    const sum = (mediaRows ?? []).reduce(
      (total, row) => total + (typeof row.size_bytes === "number" ? row.size_bytes : 0),
      0,
    );

    const tracked = profile.storage_used_bytes ?? 0;
    if (sum !== tracked) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ storage_used_bytes: sum })
        .eq("id", profile.id);

      if (updateError) throw updateError;
      console.log(`Repaired ${profile.id}: ${tracked} -> ${sum}`);
      repaired += 1;
    }
  }

  console.log(`Checked ${profiles?.length ?? 0} profile(s); repaired ${repaired}.`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
