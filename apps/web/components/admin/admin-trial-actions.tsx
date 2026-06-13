"use client";

import type { AdminUserDirectoryEntry } from "@signage/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { Button } from "@/components/ui/button";

async function extendTrial(userId: string, days: number) {
  const response = await fetch("/api/admin/trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId, action: "extend", days }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to extend trial");
  }
}

async function convertAccount(userId: string) {
  const response = await fetch("/api/admin/trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId, action: "convert" }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to convert account");
  }
}

export function AdminTrialActions({
  client,
}: {
  client: Pick<AdminUserDirectoryEntry, "id" | "email" | "trial_ends_at" | "trial_expired" | "plan_kind">;
}) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [loading, setLoading] = useState<"extend" | "convert" | null>(null);

  if (!canWrite || !client.trial_ends_at) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading !== null}
        onClick={() => {
          setLoading("extend");
          void (async () => {
            try {
              await extendTrial(client.id, 7);
              toast.success(`Trial extended by 7 days for ${client.email}`);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not extend trial");
            } finally {
              setLoading(null);
            }
          })();
        }}
      >
        <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {loading === "extend" ? "Extending…" : "+7 days"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading !== null}
        onClick={() => {
          if (!window.confirm(`Convert ${client.email} to a paid account and remove trial limits?`)) {
            return;
          }
          setLoading("convert");
          void (async () => {
            try {
              await convertAccount(client.id);
              toast.success(`Account converted for ${client.email}`);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not convert account");
            } finally {
              setLoading(null);
            }
          })();
        }}
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {loading === "convert" ? "Converting…" : "Convert to paid"}
      </Button>
    </div>
  );
}
