"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useNavigationProgress } from "@/components/navigation/navigation-progress-context";

/** App Router wrapper that shows navigation loading UI before route transitions. */
export function useAppRouter() {
  const router = useRouter();
  const { beginNavigation } = useNavigationProgress();

  return useMemo(
    () => ({
      push(href: string) {
        beginNavigation(href);
        router.push(href);
      },
      replace(href: string) {
        beginNavigation(href);
        router.replace(href);
      },
      refresh: router.refresh.bind(router),
      back: router.back.bind(router),
      forward: router.forward.bind(router),
      prefetch: router.prefetch.bind(router),
    }),
    [router, beginNavigation],
  );
}
