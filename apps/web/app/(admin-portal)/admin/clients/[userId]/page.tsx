import { notFound } from "next/navigation";
import { AdminClientOverview } from "@/components/admin/admin-client-shell";
import { AdminAccountActions } from "@/components/admin/admin-account-actions";
import { getAdminClientEntry } from "@/lib/admin/get-client-entry";
import { getServerStaffAuth } from "@/lib/auth/staff";

export default async function AdminClientOverviewPage({
  params,
}: {
  params: { userId: string };
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) notFound();

  const client = await getAdminClientEntry(ctx.supabase, params.userId);
  if (!client) notFound();

  return (
    <AdminClientOverview client={client}>
      <AdminAccountActions userId={client.id} email={client.email} isDisabled={client.is_disabled} />
    </AdminClientOverview>
  );
}
