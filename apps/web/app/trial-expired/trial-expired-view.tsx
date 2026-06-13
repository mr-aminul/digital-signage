"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TrialExpiredView() {
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Your trial has ended</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your 7-day OneSign trial is over. Your screen has been paused and you can&apos;t make changes
          until you upgrade.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Contact us to add more screens, extend your trial, or move to a paid plan.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="mailto:aminulislamborhan@gmail.com?subject=OneSign%20upgrade"
            className={cn(buttonVariants({ size: "default" }))}
          >
            Contact us to upgrade
          </Link>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
