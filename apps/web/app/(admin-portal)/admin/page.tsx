import type { AdminDirectoryStats, AdminUserDirectoryEntry } from "@signage/types";
import { Clock3, Monitor, Users } from "lucide-react";
import { AdminOverviewSections } from "@/components/admin/admin-overview-sections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerStaffAuth } from "@/lib/auth/staff";

const PAGE_SIZE = 50;

type AdminOverviewSearchParams = {
  page?: string;
  q?: string;
  status?: string;
};

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseStatus(value: string | undefined): "all" | "active" | "disabled" {
  if (value === "active" || value === "disabled") return value;
  return "all";
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: AdminOverviewSearchParams;
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) {
    throw new Error("Unauthorized");
  }

  const page = parsePage(searchParams.page);
  const status = parseStatus(searchParams.status);
  const search = searchParams.q?.trim() || null;
  const offset = (page - 1) * PAGE_SIZE;

  const [statsResult, listResult] = await Promise.all([
    ctx.supabase.rpc("admin_directory_stats"),
    ctx.supabase.rpc("admin_list_users", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_search: search,
      p_status: status,
    }),
  ]);

  if (statsResult.error) {
    throw new Error(statsResult.error.message);
  }
  if (listResult.error) {
    throw new Error(listResult.error.message);
  }

  const statsRows = (statsResult.data as AdminDirectoryStats[]) ?? [];
  const stats = statsRows[0] ?? {
    client_count: 0,
    device_count: 0,
    online_device_count: 0,
    disabled_count: 0,
    active_trial_count: 0,
    expired_trial_count: 0,
  };

  const users = (listResult.data as AdminUserDirectoryEntry[]) ?? [];
  const totalCount = users[0]?.total_count ?? users.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client directory</h1>
        <p className="text-sm text-muted-foreground">
          Browse client accounts, manage devices and content, and control account status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Users className="h-4 w-4 text-brand-strong" aria-hidden />
              </div>
              <CardTitle className="text-base">Clients</CardTitle>
            </div>
            <CardDescription>Registered business accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{stats.client_count}</p>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Monitor className="h-4 w-4 text-brand-strong" aria-hidden />
              </div>
              <CardTitle className="text-base">Devices</CardTitle>
            </div>
            <CardDescription>Linked screens across all clients</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{stats.device_count}</p>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Monitor className="h-4 w-4 text-emerald-600" aria-hidden />
              </div>
              <CardTitle className="text-base">Online now</CardTitle>
            </div>
            <CardDescription>Screens reporting recent heartbeats</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{stats.online_device_count}</p>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
              </div>
              <CardTitle className="text-base">Active trials</CardTitle>
            </div>
            <CardDescription>Self-serve signups still in trial</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{stats.active_trial_count ?? 0}</p>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Users className="h-4 w-4 text-red-600" aria-hidden />
              </div>
              <CardTitle className="text-base">Expired trials</CardTitle>
            </div>
            <CardDescription>Need upgrade or extension</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{stats.expired_trial_count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <AdminOverviewSections
        users={users}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        initialQuery={search ?? ""}
        initialStatus={status}
      />
    </div>
  );
}
