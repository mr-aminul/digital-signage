import { notFound } from "next/navigation";
import { AdminClientRouteProvider } from "@/components/admin/admin-client-route-context";
import { AdminClientShell } from "@/components/admin/admin-client-shell";
import { getAdminClientEntry } from "@/lib/admin/get-client-entry";
import { getServerStaffAuth } from "@/lib/auth/staff";

export default async function AdminClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { userId: string };
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) notFound();

  const client = await getAdminClientEntry(ctx.supabase, params.userId);
  if (!client) notFound();

  return (
    <AdminClientRouteProvider clientId={client.id}>
      <AdminClientShell client={client}>{children}</AdminClientShell>
    </AdminClientRouteProvider>
  );
}
