"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AccountSuspendedView() {
  const router = useRouter();

  async function signOut() {
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) {
        toast.error("Sign out failed");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Account suspended</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your OneSign account has been disabled by an administrator. All of your screens are paused and the
          dashboard is unavailable until your account is re-enabled.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Contact your OneSign administrator if you believe this is a mistake.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void signOut()}>
            Sign out
          </Button>
          <Link
            href="mailto:aminulislamborhan@gmail.com"
            className={cn(buttonVariants({ variant: "outline", size: "default" }))}
          >
            Contact admin
          </Link>
        </div>
      </div>
    </div>
  );
}
