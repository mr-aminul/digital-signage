"use client";

import type { AdminDirectoryEntry } from "@signage/types";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatRole(role: AdminDirectoryEntry["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "viewer") return "Viewer";
  return "Admin";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RoleBadge({ role }: { role: AdminDirectoryEntry["role"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        role === "owner"
          ? "bg-brand-faint15 text-brand-strong"
          : "bg-muted text-muted-foreground",
      )}
    >
      {formatRole(role)}
    </span>
  );
}

export function AdminAdminsTable({ admins }: { admins: AdminDirectoryEntry[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function addAdmin() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Enter an email address");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmedEmail,
          displayName: displayName.trim() || undefined,
          role: "operator",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to add admin");
      }
      toast.success(`${trimmedEmail} now has admin portal access.`);
      setEmail("");
      setDisplayName("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to add admin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No admins yet.
                  </td>
                </tr>
              ) : (
                admins.map((row) => (
                  <tr key={row.user_id} className="border-b border-border/80 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.display_name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={row.role} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/25">
                <td className="px-4 py-3 align-middle">
                  <Input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Display name"
                    aria-label="New admin display name"
                    className="h-9 bg-background"
                    disabled={loading}
                  />
                </td>
                <td className="px-4 py-3 align-middle">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    aria-label="New admin email address"
                    className="h-9 bg-background"
                    disabled={loading}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addAdmin();
                      }
                    }}
                  />
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className="text-xs text-muted-foreground">Admin</span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <Button type="button" size="sm" disabled={loading} onClick={() => void addAdmin()}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                    {loading ? "Adding…" : "Add"}
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        New admins must already have a OneSign account. Ask them to complete registration before
        adding them here.
      </p>
    </div>
  );
}
