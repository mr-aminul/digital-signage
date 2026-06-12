import type { AdminUserDirectoryEntry } from "@signage/types";
import { Monitor, Users } from "lucide-react";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerStaffAuth } from "@/lib/auth/staff";

export default async function AdminOverviewPage() {
  const ctx = await getServerStaffAuth();
  if (!ctx) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await ctx.supabase.rpc("admin_list_users");
  if (error) {
    throw new Error(error.message);
  }

  const users = (data as AdminUserDirectoryEntry[]) ?? [];
  const totalDevices = users.reduce((sum, row) => sum + Number(row.device_count), 0);
  const onlineDevices = users.reduce((sum, row) => sum + Number(row.online_device_count), 0);
  const disabledAccounts = users.filter((row) => row.is_disabled).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client directory</h1>
        <p className="text-sm text-muted-foreground">
          Browse client accounts, manage devices and content, and control account status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="text-3xl font-semibold tabular-nums">{users.length}</p>
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
            <p className="text-3xl font-semibold tabular-nums">{totalDevices}</p>
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
            <p className="text-3xl font-semibold tabular-nums">{onlineDevices}</p>
          </CardContent>
        </Card>

        <Card className="border-border/90 shadow-sm">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted/60 p-2">
                <Users className="h-4 w-4 text-red-600" aria-hidden />
              </div>
              <CardTitle className="text-base">Disabled</CardTitle>
            </div>
            <CardDescription>Suspended client accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{disabledAccounts}</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Client accounts</h2>
        <AdminUsersTable users={users} />
      </section>
    </div>
  );
}
