import { redirect } from "next/navigation";
import { TrialExpiredView } from "@/app/trial-expired/trial-expired-view";
import { fetchProfileRow } from "@/lib/supabase/profile";
import { getServerAuthWithProfile } from "@/lib/supabase/auth";
import { isTrialExpired } from "@/lib/trial";

export const dynamic = "force-dynamic";

export default async function TrialExpiredPage() {
  const { supabase, user } = await getServerAuthWithProfile();

  if (!user) {
    redirect("/login");
  }

  const profile = await fetchProfileRow(supabase, user.id);

  if (profile?.is_disabled) {
    redirect("/account-suspended");
  }

  if (!isTrialExpired(profile?.trial_ends_at)) {
    redirect("/dashboard");
  }

  return <TrialExpiredView />;
}
