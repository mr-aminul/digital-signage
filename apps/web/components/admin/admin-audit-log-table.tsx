"use client";

import type { AdminAuditLogEntry } from "@signage/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useTransition } from "react";
import { ViewClientButton } from "@/components/admin/view-client-button";
import { useAppRouter } from "@/hooks/use-app-router";
import {
  auditActionLabel,
  formatAuditMetadata,
  formatAuditTimestamp,
} from "@/lib/admin/audit-log";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AUDIT_ACTION_FILTERS = [
  { id: "all", label: "All actions" },
  { id: "plan_update", label: "Plan updates" },
  { id: "account_disable", label: "Suspensions" },
  { id: "account_enable", label: "Re-enables" },
] as const;

export type AuditActionFilter = (typeof AUDIT_ACTION_FILTERS)[number]["id"];

function buildAuditListUrl({
  page,
  action,
  listPath,
  clientId,
}: {
  page: number;
  action: AuditActionFilter;
  listPath: string;
  clientId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (action !== "all") params.set("action", action);
  if (clientId && listPath === "/admin/audit") params.set("client", clientId);
  const qs = params.toString();
  return qs ? `${listPath}?${qs}` : listPath;
}

function ActionBadge({ action }: { action: string }) {
  const tone =
    action === "account_disable"
      ? "bg-red-500/10 text-red-800"
      : action === "account_enable"
        ? "bg-emerald-500/10 text-emerald-800"
        : "bg-brand-faint15 text-foreground";

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>
      {auditActionLabel(action)}
    </span>
  );
}

function targetDisplayName(entry: AdminAuditLogEntry): string {
  return entry.target_client_name?.trim() || entry.target_email?.split("@")[0] || "—";
}

function actorDisplayName(entry: AdminAuditLogEntry): string {
  return entry.actor_display_name?.trim() || entry.actor_email.split("@")[0] || entry.actor_email;
}

export function AdminAuditLogTable({
  entries,
  page,
  pageSize,
  totalCount,
  actionFilter,
  listPath = "/admin/audit",
  clientId,
  showClientColumn = true,
}: {
  entries: AdminAuditLogEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  actionFilter: AuditActionFilter;
  listPath?: string;
  clientId?: string | null;
  showClientColumn?: boolean;
}) {
  const router = useAppRouter();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  const navigate = useCallback(
    (next: { page?: number; action?: AuditActionFilter }) => {
      const url = buildAuditListUrl({
        page: next.page ?? 1,
        action: next.action ?? actionFilter,
        listPath,
        clientId,
      });
      startTransition(() => {
        router.push(url);
      });
    },
    [actionFilter, clientId, listPath, router],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/90 bg-card p-4 shadow-sm">
        {AUDIT_ACTION_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate({ page: 1, action: id })}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition",
              actionFilter === id
                ? "border-brand-faint25 bg-brand-faint15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        {clientId && listPath === "/admin/audit" ? (
          <div className="ml-auto flex items-center gap-3">
            <Link
              href={`/admin/clients/${clientId}/audit`}
              className="text-xs font-medium text-brand-strong transition hover:underline"
            >
              Open client audit tab
            </Link>
            <Link
              href="/admin/audit"
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              Clear client filter
            </Link>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {totalCount === 0
          ? "No audit entries match your filters."
          : `Showing ${rangeStart}–${rangeEnd} of ${totalCount} entries`}
        {isPending ? " Loading…" : ""}
      </p>

      <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Admin</th>
                {showClientColumn ? <th className="px-4 py-3">Client</th> : null}
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={showClientColumn ? 5 : 4} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No activity recorded yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Plan changes and account suspensions appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/80 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatAuditTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{actorDisplayName(entry)}</div>
                      <div className="text-xs text-muted-foreground">{entry.actor_email}</div>
                    </td>
                    {showClientColumn ? (
                      <td className="px-4 py-3">
                        {entry.target_user_id ? (
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">{targetDisplayName(entry)}</div>
                            <div className="text-xs text-muted-foreground">{entry.target_email}</div>
                            <ViewClientButton userId={entry.target_user_id} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatAuditMetadata(entry.action, entry.metadata ?? {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => navigate({ page: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => navigate({ page: page + 1 })}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
