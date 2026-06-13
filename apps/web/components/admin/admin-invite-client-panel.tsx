"use client";

import { MailPlus, X } from "lucide-react";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface InviteClientPrefill {
  email?: string;
  clientName?: string;
  deviceLimit?: number;
}

interface AdminInviteClientPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: InviteClientPrefill | null;
}

export function AdminInviteClientPanel({
  open,
  onOpenChange,
  prefill,
}: AdminInviteClientPanelProps) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [email, setEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [deviceLimit, setDeviceLimit] = useState("1");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(prefill?.email ?? "");
    setClientName(prefill?.clientName ?? "");
    setDeviceLimit(String(prefill?.deviceLimit ?? 1));
  }, [open, prefill]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Enter an email address");
      return;
    }

    const parsedLimit = Number.parseInt(deviceLimit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      toast.error("Screen limit must be at least 1");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/invite-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmedEmail,
          clientName: clientName.trim() || undefined,
          deviceLimit: parsedLimit,
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Could not send invitation");
      }

      toast.success(body?.message ?? `Invitation sent to ${trimmedEmail}`);

      onOpenChange(false);
      setEmail("");
      setClientName("");
      setDeviceLimit("1");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invitation");
    } finally {
      setLoading(false);
    }
  }

  if (!canWrite) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="gap-2 shadow-sm"
        onClick={() => onOpenChange(true)}
      >
        <MailPlus className="h-4 w-4" aria-hidden />
        Invite client
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => onOpenChange(false)}
        >
          <div
            role="dialog"
            aria-labelledby="invite-client-title"
            aria-modal="true"
            className={cn(
              "w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border/70 bg-gradient-to-br from-brand-soft/40 via-card to-card px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 id="invite-client-title" className="text-base font-semibold text-foreground">
                    Invite a new client
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    They&apos;ll receive an email to set a password or sign in with Google.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close invite dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Work email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="client@company.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-client-name">Client / business name</Label>
                  <Input
                    id="invite-client-name"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Acme Retail"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-device-limit">Screen limit</Label>
                  <Input
                    id="invite-device-limit"
                    type="number"
                    min={1}
                    value={deviceLimit}
                    onChange={(event) => setDeviceLimit(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[9rem]">
                  {loading ? "Sending…" : "Send invitation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
