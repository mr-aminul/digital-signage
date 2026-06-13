"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type NavigationProgressContextValue = {
  pendingPath: string | null;
  beginNavigation: (href: string) => void;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

function navigationTarget(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const beginNavigation = useCallback(
    (href: string) => {
      if (typeof window === "undefined") return;
      const target = navigationTarget(href, window.location.origin);
      if (!target) return;
      const targetPath = target.split("?")[0] ?? target;
      if (targetPath === pathname) return;
      const current = pathname + window.location.search;
      if (target === current) return;
      setPendingPath(targetPath);
    },
    [pathname],
  );

  useEffect(() => {
    if (!pendingPath) return;
    const target = pendingPath.split("?")[0] ?? pendingPath;
    if (pathname !== target) return;

    const timeout = window.setTimeout(() => setPendingPath(null), 80);
    return () => window.clearTimeout(timeout);
  }, [pathname, pendingPath]);

  useEffect(() => {
    if (!pendingPath) return;
    const timeout = window.setTimeout(() => setPendingPath(null), 12000);
    return () => window.clearTimeout(timeout);
  }, [pendingPath]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const el = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!el) return;
      if (el.target && el.target !== "_self") return;
      const hrefAttr = el.getAttribute("href");
      if (!hrefAttr || hrefAttr.startsWith("#")) return;
      beginNavigation(el.href);
    };

    const onPopState = () => {
      setPendingPath(window.location.pathname);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [beginNavigation]);

  const value = useMemo(
    () => ({
      pendingPath,
      beginNavigation,
    }),
    [pendingPath, beginNavigation],
  );

  return (
    <NavigationProgressContext.Provider value={value}>{children}</NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress(): NavigationProgressContextValue {
  const ctx = useContext(NavigationProgressContext);
  if (!ctx) {
    throw new Error("useNavigationProgress must be used within NavigationProgressProvider");
  }
  return ctx;
}
