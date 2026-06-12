import { redirect } from "next/navigation";
import { AccountSuspendedView } from "@/app/account-suspended/account-suspended-view";
import { getServerAuthWithProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AccountSuspendedPage() {
  const { user, profile } = await getServerAuthWithProfile();

  if (!user) {
    redirect("/login");
  }

  if (!profile?.is_disabled) {
    redirect("/dashboard");
  }

  return <AccountSuspendedView />;
}
