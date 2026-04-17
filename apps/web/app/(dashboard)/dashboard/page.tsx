import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardHomePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: deviceCount }, { count: playlistCount }, { count: mediaCount }] = await Promise.all([
    supabase.from("devices").select("*", { count: "exact", head: true }).eq("owner_id", user?.id ?? ""),
    supabase.from("playlists").select("*", { count: "exact", head: true }).eq("owner_id", user?.id ?? ""),
    supabase.from("media").select("*", { count: "exact", head: true }).eq("owner_id", user?.id ?? ""),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Manage TV screens, playlists, and uploads. Pair TVs using anonymous auth + six-digit codes.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Linked TV players</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold tabular-nums">{deviceCount ?? 0}</p>
            <Link href="/devices" className={cn(buttonVariants({ size: "sm" }))}>
              Open
            </Link>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Playlists</CardTitle>
            <CardDescription>Sequences shown on screens</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold tabular-nums">{playlistCount ?? 0}</p>
            <Link href="/playlists" className={cn(buttonVariants({ size: "sm" }))}>
              Open
            </Link>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Media</CardTitle>
            <CardDescription>Images &amp; videos in storage</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold tabular-nums">{mediaCount ?? 0}</p>
            <Link href="/media" className={cn(buttonVariants({ size: "sm" }))}>
              Open
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
