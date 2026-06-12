"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { playlistDetailPath, useAdminClientRoutes } from "@/components/admin/admin-client-route-context";
import { useOptionalAdminStaff } from "@/components/admin/admin-staff-context";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function CreatePlaylistForm({
  ownerId,
  variant = "default",
}: {
  ownerId: string;
  variant?: "default" | "cta" | "empty";
}) {
  const router = useRouter();
  const adminRoutes = useAdminClientRoutes();
  const adminStaff = useOptionalAdminStaff();
  const readOnly = adminStaff != null && !adminStaff.canWrite;
  const { syncNow } = useConsoleSync();
  const [name, setName] = useState("New playlist");
  const [creating, setCreating] = useState(false);

  async function createPlaylist() {
    if (readOnly) return;
    setCreating(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("playlists")
        .insert({ owner_id: ownerId, name: name.trim() || "Untitled playlist" })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Playlist created");
      await syncNow();
      router.push(playlistDetailPath(data.id, adminRoutes));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create playlist";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  if (readOnly) {
    return null;
  }

  if (variant === "cta") {
    return (
      <Button
        type="button"
        className="h-10 w-full gap-2 font-semibold shadow-sm"
        onClick={() => void createPlaylist()}
        disabled={creating}
      >
        {creating ? "Creating…" : "+ Create playlist"}
      </Button>
    );
  }

  if (variant === "empty") {
    return (
      <Button
        type="button"
        className="h-11 gap-2 px-6 font-semibold shadow-sm"
        onClick={() => void createPlaylist()}
        disabled={creating}
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        {creating ? "Creating…" : "Create playlist"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="playlist-name">Name</Label>
        <Input id="playlist-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="button" onClick={() => void createPlaylist()} disabled={creating}>
        {creating ? "Creating…" : "Create playlist"}
      </Button>
    </div>
  );
}
