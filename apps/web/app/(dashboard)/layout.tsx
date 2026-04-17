import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meta = user.user_metadata as Record<string, string | undefined> | undefined;
  const fullName = meta?.full_name?.trim();
  const displayName = fullName || user.email?.split("@")[0] || "User";

  return (
    <DashboardShell userEmail={user.email ?? ""} displayName={displayName}>
      {children}
    </DashboardShell>
  );
}
