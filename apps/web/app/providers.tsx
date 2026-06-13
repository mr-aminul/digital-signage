"use client";

import { usePathname } from "next/navigation";
import {
  NavigationProgressProvider,
  useNavigationProgress,
} from "@/components/navigation/navigation-progress-context";
import { PageContentLoading } from "@/components/shell/page-content-loading";

function usesAppShell(pathname: string): boolean {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
}

function GlobalNavigationFallback() {
  const pathname = usePathname();
  const { pendingPath } = useNavigationProgress();

  if (!pendingPath || usesAppShell(pathname)) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 backdrop-blur-[2px]"
      aria-busy
      aria-label="Loading page"
    >
      <div className="w-full max-w-lg px-6">
        <PageContentLoading label="Loading page…" />
      </div>
    </div>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProgressProvider>
      {children}
      <GlobalNavigationFallback />
    </NavigationProgressProvider>
  );
}
