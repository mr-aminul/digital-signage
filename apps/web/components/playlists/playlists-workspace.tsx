"use client";

import type { Playlist } from "@signage/types";
import { FolderOpen, Home, ListVideo, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
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
  const router = useRouter();
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
      <div className="flex min-h-[min(70vh,560px)] gap-6">
        <div className="hidden w-64 shrink-0 md:block">
          <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
          <div className="mt-4 h-10 animate-pulse rounded-lg bg-muted" />
          <div className="mt-6 space-y-2">
            <div className="h-12 animate-pulse rounded-lg bg-muted/80" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/80" />
          </div>
        </div>
        <div className="min-h-[240px] flex-1 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(70vh,560px)] flex-col gap-0 md:flex-row md:gap-0">
      <aside className="flex w-full shrink-0 flex-col border-border md:w-[260px] md:border-r md:pr-5">
        <div className="sticky top-0 z-10 space-y-3 bg-[hsl(var(--card))] pb-4 pt-0 md:-mt-1 md:bg-transparent">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search playlists…"
              className="h-9 rounded-lg border-border bg-background pl-9 text-sm shadow-sm"
              aria-label="Search playlists"
            />
          </div>
          <CreatePlaylistForm ownerId={ownerId} variant="cta" />
        </div>

        <nav className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 md:max-h-[calc(100vh-220px)]">
          <div>
            <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">Library</p>
            <Link
              href="/playlists"
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                pathname === "/playlists"
                  ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Home className="h-4 w-4 shrink-0 opacity-80" />
              Home
            </Link>
          </div>

          <div>
            <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Playlists ({playlists.length})
            </p>
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                {query.trim() ? "No matches." : "No playlists yet. Create one above."}
              </div>
            ) : (
              <ul className="space-y-1">
                {filtered.map((p) => {
                  const items = playlistItemsByPlaylistId[p.id] ?? [];
                  const timingLabel = formatPlaylistClockLabel(items);
                  const isActive = activePlaylistId === p.id;
                  return (
                    <li key={p.id} className="group flex items-stretch gap-1">
                      <Link
                        href={`/playlists/${p.id}`}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm transition-colors",
                          isActive
                            ? "bg-white text-foreground shadow-sm ring-1 ring-border dark:bg-card"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isActive ? "bg-emerald-500" : "bg-muted-foreground/30",
                          )}
                          aria-hidden
                        />
                        <ListVideo className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                        <span className="shrink-0 tabular-nums text-[0.625rem] text-muted-foreground">
                          {items.length} · {timingLabel}
                        </span>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto shrink-0 px-2 text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label={`Delete playlist “${p.name}”`}
                        onClick={(e) => {
                          e.preventDefault();
                          setPlaylistPendingDelete(p);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-3">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              Folders
            </p>
            <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground/90">
              Organize into folders soon. For now, use search and naming.
            </p>
          </div>
        </nav>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 md:pl-6">{children}</div>

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
