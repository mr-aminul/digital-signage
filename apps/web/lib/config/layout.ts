import { Image as ImageIcon, LayoutDashboard, ListVideo, Monitor, Settings, User } from "lucide-react";
import type { AppLayoutConfig } from "@/components/shell/types";
import { assets } from "./assets";

export const layoutConfig: Omit<AppLayoutConfig, "getPageTitle"> = {
  brand: {
    name: "Signage",
    subtitle: "Console",
    icon: LayoutDashboard,
    logoColor: "#2CA85A",
    logoUrl: assets.logoUrl || undefined,
  },
  navItems: [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
    { path: "/devices", label: "Devices", icon: Monitor, end: true },
    { path: "/playlists", label: "Playlists", icon: ListVideo, end: false },
    { path: "/media", label: "Media", icon: ImageIcon, end: true },
    { path: "/profile", label: "Profile", icon: User, end: true },
    { path: "/settings", label: "Settings", icon: Settings, end: true },
  ],
};

export function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/devices": "Devices",
    "/playlists": "Playlists",
    "/media": "Media",
    "/profile": "Profile",
    "/settings": "Settings",
  };
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/playlists/")) return "Playlist";
  return "App";
}
