"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type AdminClientRoutes = {
  clientId: string;
  basePath: string;
  overviewPath: string;
  devicesPath: string;
  devicePath: (deviceId: string) => string;
  playlistsPath: string;
  playlistPath: (playlistId: string) => string;
  mediaPath: string;
  auditPath: string;
};

const AdminClientRouteContext = createContext<AdminClientRoutes | null>(null);

export function AdminClientRouteProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  const value = useMemo<AdminClientRoutes>(() => {
    const basePath = `/admin/clients/${clientId}`;
    return {
      clientId,
      basePath,
      overviewPath: basePath,
      devicesPath: `${basePath}/devices`,
      devicePath: (deviceId: string) => `${basePath}/devices/${deviceId}`,
      playlistsPath: `${basePath}/playlists`,
      playlistPath: (playlistId: string) => `${basePath}/playlists/${playlistId}`,
      mediaPath: `${basePath}/media`,
      auditPath: `${basePath}/audit`,
    };
  }, [clientId]);

  return (
    <AdminClientRouteContext.Provider value={value}>{children}</AdminClientRouteContext.Provider>
  );
}

export function useAdminClientRoutes(): AdminClientRoutes | null {
  return useContext(AdminClientRouteContext);
}

export function deviceDetailPath(deviceId: string, adminRoutes: AdminClientRoutes | null): string {
  return adminRoutes?.devicePath(deviceId) ?? `/devices/${deviceId}`;
}

export function playlistDetailPath(playlistId: string, adminRoutes: AdminClientRoutes | null): string {
  return adminRoutes?.playlistPath(playlistId) ?? `/playlists/${playlistId}`;
}
