"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function AdminAccountActions({
  userId,
  email,
  isDisabled,
}: {
  userId: string;
  email: string;
  isDisabled: boolean;
}) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [loading, setLoading] = useState(false);
  const nextDisabled = !isDisabled;
  const label = isDisabled ? "Enable account" : "Disable account";

  if (!canWrite) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/90 bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Account control</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {isDisabled
          ? "This client cannot sign in and all screens are paused."
          : "Disabling suspends sign-in and pauses every linked screen immediately."}
      </p>
      <Button
        type="button"
        size="sm"
        variant={isDisabled ? "default" : "outline"}
        disabled={loading}
        className={cn("mt-3", !isDisabled && "text-destructive hover:text-destructive")}
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
    </div>
  );
}
