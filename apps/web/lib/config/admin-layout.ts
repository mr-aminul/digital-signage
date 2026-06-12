export function getAdminPageTitle(pathname: string): string {
  if (pathname === "/admin") return "Clients";
  if (pathname === "/admin/admins") return "Admins";
  if (pathname === "/admin/staff") return "Admins";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/devices/")) return "Screen";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/playlists/")) return "Playlist";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/devices")) return "Devices";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/playlists")) return "Playlists";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/media")) return "Media";
  if (pathname.startsWith("/admin/clients/")) return "Client";
  return "Admin";
}
