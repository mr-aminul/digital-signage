/** Trial period helpers (mirrors profiles.trial_ends_at in the database). */

import { DEFAULT_TRIAL_DAYS } from "@/lib/plan-quota";

export { DEFAULT_TRIAL_DAYS };

export function isTrialExpired(trialEndsAt: string | null | undefined): boolean {
  if (!trialEndsAt) return false;
  return Date.now() > new Date(trialEndsAt).getTime();
}

export function isOnTrial(input: {
  trialEndsAt?: string | null;
  trialExpired?: boolean;
  planKind?: string | null;
}): boolean {
  if (input.trialExpired || isTrialExpired(input.trialEndsAt)) return false;
  if (input.trialEndsAt) return true;
  return input.planKind === "trial";
}

export function trialDaysRemaining(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** 0–1 elapsed through the trial window (for progress rings). */
export function trialElapsedRatio(
  trialEndsAt: string | null | undefined,
  totalDays = DEFAULT_TRIAL_DAYS,
): number {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 0;
  if (remaining <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining / totalDays));
}

export function formatTrialRemaining(trialEndsAt: string | null | undefined): string | null {
  const days = trialDaysRemaining(trialEndsAt);
  if (days === null) return null;
  if (days <= 0) return "Trial ended";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function formatTrialEndDate(trialEndsAt: string | null | undefined): string | null {
  if (!trialEndsAt) return null;
  return new Date(trialEndsAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export const TRIAL_UPGRADE_MAILTO =
  "mailto:aminulislamborhan@gmail.com?subject=OneSign%20upgrade";
