import type { AdminAuditLogEntry } from "@signage/types";
import { ScrollText } from "lucide-react";
import { AdminAuditLogTable } from "@/components/admin/admin-audit-log-table";
import { parseAuditActionFilter } from "@/lib/admin/audit-log";
import { getServerStaffAuth } from "@/lib/auth/staff";

const PAGE_SIZE = 50;

type AuditSearchParams = {
  page?: string;
  action?: string;
  client?: string;
};

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseAction(value: string | undefined) {
  return parseAuditActionFilter(value);
}

function parseClientId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: AuditSearchParams;
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) {
    throw new Error("Unauthorized");
  }

  const page = parsePage(searchParams.page);
  const action = parseAction(searchParams.action);
  const clientId = parseClientId(searchParams.client);
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await ctx.supabase.rpc("admin_list_audit_log", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_target_user_id: clientId,
    p_action: action === "all" ? null : action,
  });

  if (error) {
    throw new Error(error.message);
  }

  const entries = (data as AdminAuditLogEntry[]) ?? [];
  const totalCount = entries[0]?.total_count ?? entries.length;

  let clientLabel: string | null = null;
  if (clientId && entries.length > 0) {
    const first = entries[0]!;
    clientLabel = first.target_client_name?.trim() || first.target_email;
  } else if (clientId) {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("client_name")
      .eq("id", clientId)
      .maybeSingle();
    clientLabel = profile?.client_name?.trim() ?? null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-brand-strong" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit log</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {clientId
            ? clientLabel
              ? `Activity for ${clientLabel}.`
              : "Activity for this client account."
            : "Platform staff actions — plan updates, suspensions, invitations, and trial changes."}
        </p>
      </div>

      <AdminAuditLogTable
        entries={entries}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        actionFilter={action}
        clientId={clientId}
        showClientColumn={!clientId}
      />
    </div>
  );
}
