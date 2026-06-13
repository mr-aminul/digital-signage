import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PlanQuotaProvider } from "@/components/console/plan-quota-context";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { PageContentLoading } from "@/components/shell/page-content-loading";
import { getAccountPlanSnapshot } from "@/lib/plan/get-account-plan";
import { getServerAuthWithProfile } from "@/lib/supabase/auth";

async function DashboardPlanQuota({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const { supabase } = await getServerAuthWithProfile();
  const plan = await getAccountPlanSnapshot(supabase, userId);

  return <PlanQuotaProvider quota={plan}>{children}</PlanQuotaProvider>;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getServerAuthWithProfile();

  if (!user) {
    redirect("/login");
  }

  if (profile?.is_disabled) {
    redirect("/account-suspended");
  }

  const displayName =
    profile?.client_name?.trim() ||
    (user.user_metadata as Record<string, string | undefined> | undefined)?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "User";

  return (
    <DashboardShell authUserId={user.id} userEmail={user.email ?? ""} displayName={displayName}>
      <Suspense fallback={<PageContentLoading label="Loading account data…" />}>
        <DashboardPlanQuota userId={user.id}>{children}</DashboardPlanQuota>
      </Suspense>
    </DashboardShell>
  );
}
