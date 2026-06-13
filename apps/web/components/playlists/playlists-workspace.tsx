"use client";

import type { Playlist } from "@signage/types";
import { FolderOpen, Home, ListVideo, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { playlistDetailPath, useAdminClientRoutes } from "@/components/admin/admin-client-route-context";
import { useOptionalAdminStaff } from "@/components/admin/admin-staff-context";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { CreatePlaylistForm } from "@/components/create-playlist-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPlaylistClockLabel } from "@/lib/playlist-timing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useConsoleDataStore } from "@/stores/console-data-store";

export function PlaylistsWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useAppRouter();
  const adminRoutes = useAdminClientRoutes();
  const adminStaff = useOptionalAdminStaff();
  const readOnly = adminStaff != null && !adminStaff.canWrite;
  const playlistsHomePath = adminRoutes?.playlistsPath ?? "/playlists";
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { syncNow } = useConsoleSync();
  const ownerId = useConsoleDataStore((s) => s.ownerId);
  const playlists = useConsoleDataStore((s) => s.playlists) as Playlist[];
  const playlistItemsByPlaylistId = useConsoleDataStore((s) => s.playlistItemsByPlaylistId);
  const [query, setQuery] = useState("");
  const [playlistPendingDelete, setPlaylistPendingDelete] = useState<Playlist | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const sorted = useMemo(
    () => [...playlists].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [playlists],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, sorted]);

  const activePlaylistId = useMemo(() => {
    const m = pathname.match(/^\/playlists\/([^/]+)/);
    return m?.[1] && m[1] !== "new" ? m[1] : null;
  }, [pathname]);

  const activePlaylist = useMemo(
    () => (activePlaylistId ? playlists.find((p) => p.id === activePlaylistId) : null),
    [activePlaylistId, playlists],
  );

  const mainPanelSubtitle = useMemo(() => {
    if (activePlaylist) {
      const items = playlistItemsByPlaylistId[activePlaylist.id] ?? [];
      return `${items.length} item${items.length === 1 ? "" : "s"} · ${formatPlaylistClockLabel(items)}`;
    }
    const count = playlists.length;
    if (count === 0) return "No playlists yet";
    return `${count} playlist${count === 1 ? "" : "s"}`;
  }, [activePlaylist, playlistItemsByPlaylistId, playlists.length]);

  const confirmDeletePlaylist = useCallback(async () => {
    if (!playlistPendingDelete) return;
    setDeleteInProgress(true);
    try {
      const deletedId = playlistPendingDelete.id;
      const { error } = await supabase.from("playlists").delete().eq("id", deletedId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Playlist deleted");
      setPlaylistPendingDelete(null);
      await syncNow();
      if (activePlaylistId === deletedId) {
        router.push("/playlists");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete playlist";
      toast.error(message);
    } finally {
      setDeleteInProgress(false);
    }
  }, [activePlaylistId, playlistPendingDelete, router, supabase, syncNow]);

  if (!ownerId) {
    return (
      <div className="flex min-h-[min(70vh,720px)] flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="hidden w-56 shrink-0 space-y-4 xl:w-60 lg:block">
          <div className="h-[4.25rem] animate-pulse rounded-xl bg-muted" />
          <div className="h-36 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted/80" />
        </div>
        <div className="min-h-[240px] flex-1 animate-pulse rounded-xl border border-border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(70vh,720px)] flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-56 xl:w-60">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search playlists…"
              className="h-9 border-border bg-background pl-8 text-sm"
              aria-label="Search playlists"
            />
          </div>
        </div>

        {!readOnly ? (
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              New playlist
            </p>
            <CreatePlaylistForm ownerId={ownerId} variant="cta" />
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
              Opens the editor right away. Name it on the right, then drag media from your library.
            </p>
          </div>
        ) : null}

        <nav className="rounded-xl border border-border bg-muted/30 p-2" aria-label="Playlist library">
          <p className="mb-2 px-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Library</p>
          <ul className="space-y-0.5">
            <li>
              <Link
                href={playlistsHomePath}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  pathname === playlistsHomePath
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                <Home className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                Home
              </Link>
            </li>
          </ul>
        </nav>

        <nav
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          aria-label="Your playlists"
        >
          <div className="border-b border-border bg-muted/30 px-3 py-2.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Playlists ({playlists.length})
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 md:max-h-[min(420px,calc(100vh-380px))]">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                {query.trim() ? "No matches." : "No playlists yet. Create one above."}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((p) => {
                  const items = playlistItemsByPlaylistId[p.id] ?? [];
                  const timingLabel = formatPlaylistClockLabel(items);
                  const isActive = activePlaylistId === p.id;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "group flex items-center gap-0.5 rounded-lg transition-colors",
                        isActive
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                      )}
                    >
                      <Link
                        href={playlistDetailPath(p.id, adminRoutes)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-border",
                            isActive ? "bg-brand-soft text-brand-strong dark:text-brand-onDark" : "bg-muted/80 text-muted-foreground",
                          )}
                        >
                          <ListVideo className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1 py-0.5">
                          <span className="block truncate font-medium text-foreground">{p.name}</span>
                          <span className="mt-0.5 block tabular-nums text-[0.6875rem] text-muted-foreground">
                            {items.length} item{items.length === 1 ? "" : "s"} · {timingLabel}
                          </span>
                        </span>
                      </Link>
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mr-1 h-8 shrink-0 px-2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`Delete playlist “${p.name}”`}
                          onClick={() => setPlaylistPendingDelete(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>

        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-3">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
            Folders
          </p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Organize into folders soon. For now, use search and naming.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-full flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="text-foreground">Playlists</span>
                <span className="text-muted-foreground/70">/</span>
                {activePlaylist ? (
                  <span className="rounded-md bg-muted/80 px-2 py-0.5 text-xs font-normal text-foreground">{activePlaylist.name}</span>
                ) : (
                  <span className="rounded-md bg-muted/80 px-2 py-0.5 text-xs font-normal text-foreground">Home</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{mainPanelSubtitle}</p>
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-5">{children}</div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={playlistPendingDelete !== null}
        title={playlistPendingDelete ? `Delete “${playlistPendingDelete.name}”?` : "Delete playlist?"}
        description="This permanently deletes the playlist and unassigns it from any screens. This cannot be undone."
        confirmLabel="Delete playlist"
        onClose={() => !deleteInProgress && setPlaylistPendingDelete(null)}
        onConfirm={confirmDeletePlaylist}
        isConfirming={deleteInProgress}
      />
    </div>
  );
}
