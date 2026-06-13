"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { ScrollText, Settings, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import type { PlatformStaff } from "@signage/types";
import { AdminPortalSyncProvider } from "@/components/console/admin-portal-sync-provider";
import { AdminStaffProvider } from "@/components/admin/admin-staff-context";
import { ConsoleSyncButton } from "@/components/console/console-sync-button";
import { AppLayout } from "@/components/shell/app-layout";
import { DashboardRoutePrefetch } from "@/components/shell/dashboard-route-prefetch";
import { NotificationsProvider } from "@/components/shell/notifications-context";
import { SettingsProvider } from "@/components/shell/settings-context";
import { clearConsoleCachePersist } from "@/stores/console-data-store";
import type { NavItem } from "@/components/shell/types";
import { getAdminPageTitle } from "@/lib/config/admin-layout";

const adminNavItems: NavItem[] = [
  { path: "/admin", label: "Clients", icon: Users, end: true },
  { path: "/admin/audit", label: "Audit log", icon: ScrollText, end: true },
  { path: "/admin/admins", label: "Admins", icon: Settings, end: true },
];

export function AdminPortalShell({
  children,
  staff,
}: {
  children: React.ReactNode;
  staff: PlatformStaff;
}) {
  const router = useAppRouter();
  const navItems = useMemo(() => {
    if (staff.role === "owner") return adminNavItems;
    return adminNavItems.filter((item) => item.path !== "/admin/admins");
  }, [staff.role]);
  const prefetchPaths = useMemo(
    () => navItems.map((item) => item.path),
    [navItems],
  );

  const displayName = staff.display_name?.trim() || staff.email.split("@")[0] || "Admin";
  const profileSubtext =
    staff.role === "viewer" ? `${staff.email} · Read-only` : staff.email;

  const brand = useMemo(
    () => ({
      name: "OneSign",
      subtitle: "Admin",
      icon: Shield,
      logoColor: "#DC2626",
    }),
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
      router.replace("/login?next=/admin");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      toast.error(message);
    }
  }

  return (
    <SettingsProvider>
      <NotificationsProvider>
        <AdminStaffProvider staff={staff}>
          <AdminPortalSyncProvider>
            <AppLayout
            brand={brand}
            navItems={navItems}
            getPageTitle={getAdminPageTitle}
            userName={displayName}
            profileSubtext={profileSubtext}
            onSignOut={() => void signOut()}
            searchPlaceholder="Search clients…"
            topBarSyncControl={<AdminPortalSyncControl />}
            outerBg="#1f2937"
            contentCardBg="#F4F7FB"
          >
            <DashboardRoutePrefetch paths={prefetchPaths} />
            {children}
          </AppLayout>
        </AdminPortalSyncProvider>
        </AdminStaffProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}

function AdminPortalSyncControl() {
  const pathname = usePathname();
  const onClientRoute = /^\/admin\/clients\/[0-9a-f-]{36}/i.test(pathname);
  if (!onClientRoute) return null;
  return <ConsoleSyncButton />;
}
