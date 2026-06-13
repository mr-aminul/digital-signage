import { notFound } from "next/navigation";
import type { AdminAuditLogEntry } from "@signage/types";
import {
  AdminAuditLogTable,
  type AuditActionFilter,
} from "@/components/admin/admin-audit-log-table";
import { getAdminClientEntry } from "@/lib/admin/get-client-entry";
import { getServerStaffAuth } from "@/lib/auth/staff";

const PAGE_SIZE = 50;

type AuditSearchParams = {
  page?: string;
  action?: string;
};

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseAction(value: string | undefined): AuditActionFilter {
  if (value === "plan_update" || value === "account_disable" || value === "account_enable") {
    return value;
  }
  return "all";
}

export default async function AdminClientAuditPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: AuditSearchParams;
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) notFound();

  const client = await getAdminClientEntry(ctx.supabase, params.userId);
  if (!client) notFound();

  const page = parsePage(searchParams.page);
  const action = parseAction(searchParams.action);
  const offset = (page - 1) * PAGE_SIZE;
  const listPath = `/admin/clients/${client.id}/audit`;

  const { data, error } = await ctx.supabase.rpc("admin_list_audit_log", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_target_user_id: client.id,
    p_action: action === "all" ? null : action,
  });

  if (error) {
    throw new Error(error.message);
  }

  const entries = (data as AdminAuditLogEntry[]) ?? [];
  const totalCount = entries[0]?.total_count ?? entries.length;
  const displayName = client.client_name?.trim() || client.email.split("@")[0];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Admin actions on {displayName} — plan changes, suspensions, and re-enables.
        </p>
      </div>

      <AdminAuditLogTable
        entries={entries}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        actionFilter={action}
        listPath={listPath}
        clientId={client.id}
        showClientColumn={false}
      />
    </div>
  );
}
