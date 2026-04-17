import { MediaLibrary } from "@/components/media-library";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Media } from "@signage/types";

export default async function MediaPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const publicBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!publicBaseUrl) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Missing NEXT_PUBLIC_SUPABASE_URL. Copy `apps/web/.env.example` to `.env.local`.
      </div>
    );
  }

  const { data } = await supabase
    .from("media")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return <MediaLibrary userId={user.id} initialMedia={(data as Media[]) ?? []} publicBaseUrl={publicBaseUrl} />;
}
