"use client";

import { useMemo } from "react";
import { Shield } from "lucide-react";
import { useAppRouter } from "@/hooks/use-app-router";
import { toast } from "sonner";
import { ClientConsoleSyncProvider } from "@/components/console/client-console-sync-provider";
import { ConsoleSyncButton } from "@/components/console/console-sync-button";
import { TrialStrip } from "@/components/console/trial-status";
import { AppLayout } from "./app-layout";
import { DashboardRoutePrefetch } from "./dashboard-route-prefetch";
import { NotificationsProvider } from "./notifications-context";
import { SettingsProvider } from "./settings-context";
import { getPageTitle, layoutConfig } from "@/lib/config/layout";
import { clearConsoleCachePersist } from "@/stores/console-data-store";
import { clearStaffPortalChoice } from "@/lib/auth/staff-portal-choice";

function DashboardShellInner({
  children,
  userEmail,
  displayName,
  isStaff,
}: {
  children: React.ReactNode;
  userEmail: string;
  displayName: string;
  isStaff: boolean;
}) {
  const router = useAppRouter();
  const prefetchPaths = useMemo(
    () => [
      ...layoutConfig.navItems.map((item) => item.path),
      ...(layoutConfig.bottomNavItem ? [layoutConfig.bottomNavItem.path] : []),
    ],
    [],
  );

  async function signOut() {
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) {
        toast.error("Sign out failed");
        return;
      }
      clearConsoleCachePersist();
      clearStaffPortalChoice();
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
      navItems={layoutConfig.navItems}
      getPageTitle={getPageTitle}
      userName={displayName}
      profileSubtext={userEmail}
      onSignOut={() => void signOut()}
      portalSwitch={
        isStaff
          ? {
              label: "Switch to admin portal",
              href: "/admin",
              icon: Shield,
              choice: "admin",
            }
          : undefined
      }
      searchPlaceholder="Search..."
      topBarSyncControl={<ConsoleSyncButton />}
      banner={<TrialStrip />}
    >
      <DashboardRoutePrefetch paths={prefetchPaths} />
      {children}
    </AppLayout>
  );
}

export function DashboardShell({
  children,
  authUserId,
  userEmail,
  displayName,
  isStaff = false,
}: {
  children: React.ReactNode;
  authUserId: string;
  userEmail: string;
  displayName: string;
  isStaff?: boolean;
}) {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <ClientConsoleSyncProvider authUserId={authUserId}>
          <DashboardShellInner userEmail={userEmail} displayName={displayName} isStaff={isStaff}>
            {children}
          </DashboardShellInner>
        </ClientConsoleSyncProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}
