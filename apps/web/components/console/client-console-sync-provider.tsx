"use client";

import { ConsoleSyncProvider } from "@/components/console/console-sync-provider";

/** Client console always syncs the signed-in user's tenant data. */
export function ClientConsoleSyncProvider({
  authUserId,
  children,
}: {
  authUserId: string;
  children: React.ReactNode;
}) {
  return (
    <ConsoleSyncProvider userId={authUserId}>
      {children}
    </ConsoleSyncProvider>
  );
}
