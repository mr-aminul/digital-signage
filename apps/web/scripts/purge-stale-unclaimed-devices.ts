/**
 * Remove abandoned TV pairing rows (owner_id null, no heartbeat within N days).
 * Also deletes the anonymous auth sessions tied to those devices.
 *
 * Usage (from apps/web with prod env loaded):
 *   npx tsx scripts/purge-stale-unclaimed-devices.ts
 *   npx tsx scripts/purge-stale-unclaimed-devices.ts 14
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const staleDays = Number(process.argv[2] ?? 7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("purge_stale_unclaimed_devices", {
    p_stale_days: staleDays,
  });

  if (error) throw error;
  console.log(`Purged ${data ?? 0} stale unclaimed device(s) (>${staleDays}d without heartbeat).`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
