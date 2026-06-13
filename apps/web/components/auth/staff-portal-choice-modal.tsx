"use client";

import { LayoutDashboard, Shield } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { setStaffPortalChoice } from "@/lib/auth/staff-portal-choice";
import { cn } from "@/lib/utils";

interface StaffPortalChoiceModalProps {
  onChooseUser?: () => void;
}

export function StaffPortalChoiceModal({ onChooseUser }: StaffPortalChoiceModalProps) {
  const router = useAppRouter();
  const pathname = usePathname();
  const onAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  function chooseAdmin() {
    setStaffPortalChoice("admin");
    if (!onAdminRoute) {
      router.replace("/admin");
      router.refresh();
    } else {
      onChooseUser?.();
    }
  }

  function chooseUser() {
    setStaffPortalChoice("user");
    if (onAdminRoute) {
      router.replace("/dashboard");
      router.refresh();
    }
    onChooseUser?.();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="staff-portal-choice-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <h2 id="staff-portal-choice-title" className="text-lg font-semibold text-foreground">
            How would you like to continue?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You have admin access. Choose your workspace for this session.
          </p>
        </div>

        <div className="grid gap-3 p-5">
          <button
            type="button"
            onClick={chooseAdmin}
            className={cn(
              "flex items-start gap-3 rounded-xl border border-border/90 bg-background p-4 text-left transition-colors",
              "hover:border-brand-strong/40 hover:bg-brand-soft/30",
            )}
          >
            <span className="rounded-lg bg-red-500/10 p-2 text-red-600">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Admin portal</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Manage clients, trials, and platform settings.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={chooseUser}
            className={cn(
              "flex items-start gap-3 rounded-xl border border-border/90 bg-background p-4 text-left transition-colors",
              "hover:border-brand-strong/40 hover:bg-brand-soft/30",
            )}
          >
            <span className="rounded-lg bg-brand-soft p-2 text-brand-strong">
              <LayoutDashboard className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">My dashboard</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Manage your own screens, playlists, and media.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
