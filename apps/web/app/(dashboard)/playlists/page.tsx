import Link from "next/link";
import { CreatePlaylistForm } from "@/components/create-playlist-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Playlist } from "@signage/types";

export default async function PlaylistsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("playlists")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const playlists = (data as Playlist[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playlists</h1>
        <p className="mt-2 text-muted-foreground">Compose loops of media, then assign them to TVs on the Devices page.</p>
      </div>

      <CreatePlaylistForm ownerId={user.id} />

      <div className="grid gap-4 md:grid-cols-2">
        {playlists.length === 0 ? (
          <Card className="border-dashed border-border bg-card/60">
            <CardHeader>
              <CardTitle>No playlists yet</CardTitle>
              <CardDescription>Create your first playlist above.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          playlists.map((playlist) => (
            <Card key={playlist.id} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{playlist.name}</CardTitle>
                  <CardDescription>{new Date(playlist.created_at).toLocaleString()}</CardDescription>
                </div>
                <Link href={`/playlists/${playlist.id}`} className={cn(buttonVariants({ size: "sm" }))}>
                  Edit
                </Link>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
