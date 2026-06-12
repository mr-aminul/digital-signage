"use client";

import { usePathname } from "next/navigation";
import { ConsoleSyncProvider } from "@/components/console/console-sync-provider";

const ADMIN_CLIENT_RE = /^\/admin\/clients\/([0-9a-f-]{36})(?:\/|$)/i;

/** Syncs console data for the client being managed in the admin portal. */
export function AdminPortalSyncProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clientMatch = pathname.match(ADMIN_CLIENT_RE);
  const clientId = clientMatch?.[1] ?? null;

  if (!clientId) {
    return <>{children}</>;
  }

  return (
    <ConsoleSyncProvider userId={clientId}>
      {children}
    </ConsoleSyncProvider>
  );
}
