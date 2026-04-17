"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppLayout } from "./app-layout";
import { NotificationsProvider } from "./notifications-context";
import { SettingsProvider } from "./settings-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPageTitle, layoutConfig } from "@/lib/config/layout";

function DashboardShellInner({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail: string;
  displayName: string;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      toast.error(message);
    }
  }

  return (
    <AppLayout
      {...layoutConfig}
      getPageTitle={getPageTitle}
      userName={displayName}
      profileSubtext={userEmail}
      onSignOut={() => void signOut()}
      searchPlaceholder="Search..."
    >
      {children}
    </AppLayout>
  );
}

export function DashboardShell({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail: string;
  displayName: string;
}) {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <DashboardShellInner userEmail={userEmail} displayName={displayName}>
          {children}
        </DashboardShellInner>
      </NotificationsProvider>
    </SettingsProvider>
  );
}
