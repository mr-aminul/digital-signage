import { PlaylistsWorkspace } from "@/components/playlists/playlists-workspace";

export default function AdminClientPlaylistsLayout({ children }: { children: React.ReactNode }) {
  return <PlaylistsWorkspace>{children}</PlaylistsWorkspace>;
}
