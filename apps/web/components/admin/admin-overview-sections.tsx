"use client";

import type { AdminUserDirectoryEntry } from "@signage/types";
import { useState } from "react";
import {
  AdminInviteClientPanel,
  type InviteClientPrefill,
} from "@/components/admin/admin-invite-client-panel";
import { AdminUsersTable } from "@/components/admin/admin-users-table";

interface AdminOverviewSectionsProps {
  users: AdminUserDirectoryEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  initialQuery: string;
  initialStatus: "all" | "active" | "disabled";
}

export function AdminOverviewSections({
  users,
  page,
  pageSize,
  totalCount,
  initialQuery,
  initialStatus,
}: AdminOverviewSectionsProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePrefill, setInvitePrefill] = useState<InviteClientPrefill | null>(null);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Client accounts</h2>
          <AdminInviteClientPanel
            open={inviteOpen}
            onOpenChange={(open) => {
              setInviteOpen(open);
              if (!open) setInvitePrefill(null);
            }}
            prefill={invitePrefill}
          />
        </div>
        <AdminUsersTable
          users={users}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          initialQuery={initialQuery}
          initialStatus={initialStatus}
        />
      </section>
    </div>
  );
}
