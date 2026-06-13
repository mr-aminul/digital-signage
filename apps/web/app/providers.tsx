"use client";

import {
  NavigationProgressProvider,
  useNavigationProgress,
} from "@/components/navigation/navigation-progress-context";
import { NavigationProgressBar } from "@/components/shell/page-loading-skeleton";

function GlobalTopLoadingBar() {
  const { pendingPath } = useNavigationProgress();
  if (!pendingPath) return null;
  return <NavigationProgressBar />;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProgressProvider>
      {children}
      <GlobalTopLoadingBar />
    </NavigationProgressProvider>
  );
}
