"use client";

import type { AdminUserDirectoryEntry } from "@signage/types";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ViewClientButton } from "@/components/admin/view-client-button";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "disabled";

async function setAccountDisabled(userId: string, disabled: boolean) {
  const response = await fetch("/api/admin/account-disabled", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId, disabled }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to update account");
  }
}

function AccountStatusBadge({ isDisabled }: { isDisabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isDisabled
          ? "bg-red-500/10 text-red-700 dark:text-red-300"
          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      )}
    >
      {isDisabled ? "Disabled" : "Active"}
    </span>
  );
}

function AccountDisableToggle({
  userId,
  isDisabled,
  email,
}: {
  userId: string;
  isDisabled: boolean;
  email: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const nextDisabled = !isDisabled;
  const label = isDisabled ? "Enable" : "Disable";

  return (
    <Button
      type="button"
      size="sm"
      variant={isDisabled ? "default" : "outline"}
      disabled={loading}
      className={cn(!isDisabled && "text-destructive hover:text-destructive")}
      onClick={() => {
        const message = nextDisabled
          ? `Disable ${email}? All of their screens will pause immediately.`
          : `Re-enable ${email}? All of their screens will resume playback.`;
        if (!window.confirm(message)) return;

        setLoading(true);
        void (async () => {
          try {
            await setAccountDisabled(userId, nextDisabled);
            toast.success(nextDisabled ? "Account disabled" : "Account enabled");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not update account");
          } finally {
            setLoading(false);
          }
        })();
      }}
    >
      {loading ? "Saving…" : label}
    </Button>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function filterUsers(users: AdminUserDirectoryEntry[], query: string, status: StatusFilter) {
  let rows = users;
  if (status === "active") rows = rows.filter((user) => !user.is_disabled);
  if (status === "disabled") rows = rows.filter((user) => user.is_disabled);

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return rows;

  return rows.filter((user) => {
    const name = user.full_name?.toLowerCase() ?? "";
    return user.email.toLowerCase().includes(trimmed) || name.includes(trimmed);
  });
}

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "disabled", label: "Disabled" },
];

export function AdminUsersTable({ users }: { users: AdminUserDirectoryEntry[] }) {
  const { canWrite } = useAdminStaff();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredUsers = useMemo(
    () => filterUsers(users, query, statusFilter),
    [users, query, statusFilter],
  );

  const activeCount = users.filter((user) => !user.is_disabled).length;
  const disabledCount = users.filter((user) => user.is_disabled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border/90 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email…"
            className="h-10 pl-9 pr-9"
            aria-label="Search client accounts"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map(({ id, label }) => {
            const count =
              id === "all" ? users.length : id === "active" ? activeCount : disabledCount;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  statusFilter === id
                    ? "border-brand-faint25 bg-brand-faint15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                {label}
                <span className="tabular-nums text-[0.6875rem] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredUsers.length} of {users.length} accounts
        {query.trim() ? ` matching “${query.trim()}”` : ""}.
        Use <span className="font-medium text-foreground">View</span> to open a client workspace.
      </p>

      <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Devices</th>
                <th className="px-4 py-3">Online</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No accounts match your filters</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try a different search or clear the status filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/80 last:border-0",
                      row.is_disabled && "bg-muted/20",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.full_name?.trim() || "—"}</span>
                        {row.is_staff ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                            Admin
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                    <td className="px-4 py-3">
                      <AccountStatusBadge isDisabled={row.is_disabled} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.device_count}</td>
                    <td className="px-4 py-3 tabular-nums">{row.online_device_count}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <ViewClientButton userId={row.id} />
                        {!row.is_staff && canWrite ? (
                          <AccountDisableToggle
                            userId={row.id}
                            isDisabled={row.is_disabled}
                            email={row.email}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
