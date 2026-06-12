import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getServerAuthWithProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getServerAuthWithProfile();

  if (!user) {
    redirect("/login");
  }

  if (profile?.is_disabled) {
    redirect("/account-suspended");
  }

  const meta = user.user_metadata as Record<string, string | undefined> | undefined;
  const fullName = meta?.full_name?.trim();
  const displayName = fullName || user.email?.split("@")[0] || "User";

  return (
    <DashboardShell authUserId={user.id} userEmail={user.email ?? ""} displayName={displayName}>
      {children}
    </DashboardShell>
  );
}
