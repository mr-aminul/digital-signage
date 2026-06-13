"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { usePlanQuota } from "@/components/console/plan-quota-context";
import { DEFAULT_TRIAL_DAYS } from "@/lib/plan-quota";
import { assets } from "@/lib/config/assets";
import {
  TRIAL_UPGRADE_MAILTO,
  formatTrialEndDate,
  formatTrialRemaining,
  isOnTrial,
  trialDaysRemaining,
  trialElapsedRatio,
} from "@/lib/trial";
import { cn } from "@/lib/utils";

function useTrialStatus() {
  const quota = usePlanQuota();
  if (!quota) return null;

  const active = quota.isOnTrial ?? isOnTrial(quota);
  if (!active || quota.trialExpired) return null;

  const daysLeft = trialDaysRemaining(quota.trialEndsAt);
  const remainingLabel = formatTrialRemaining(quota.trialEndsAt) ?? "Free trial";
  const endLabel = formatTrialEndDate(quota.trialEndsAt);

  return {
    ...quota,
    daysLeft,
    remainingLabel,
    endLabel,
    elapsed: trialElapsedRatio(quota.trialEndsAt, DEFAULT_TRIAL_DAYS),
  };
}

/** Compact pill — always visible in the top bar while on trial. */
export function TrialTopBarPill() {
  const trial = useTrialStatus();
  if (!trial) return null;

  const urgent = trial.daysLeft !== null && trial.daysLeft <= 2;

  return (
    <Link
      href={TRIAL_UPGRADE_MAILTO}
      className={cn(
        "group relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-full border px-3 py-1 text-[0.6875rem] font-semibold tracking-wide transition",
        urgent
          ? "border-amber-300/70 bg-amber-400/20 text-amber-50 shadow-[0_0_20px_rgba(251,191,36,0.35)]"
          : "border-amber-200/40 bg-amber-500/15 text-amber-50 hover:border-amber-200/60 hover:bg-amber-500/25",
      )}
      title={`${DEFAULT_TRIAL_DAYS}-day trial · ${trial.deviceLimit} screen · ${trial.remainingLabel}`}
    >
      <span
        className={cn(
          "relative flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300",
          urgent && "animate-pulse shadow-[0_0_8px_rgba(252,211,77,0.9)]",
        )}
        aria-hidden
      />
      <span className="uppercase tracking-[0.12em] opacity-90">Trial</span>
      <span className="tabular-nums">{trial.remainingLabel}</span>
    </Link>
  );
}

/** Full-width strip above navigation — impossible to miss. */
export function TrialStrip() {
  const trial = useTrialStatus();
  if (!trial) return null;

  const pct = Math.round(trial.elapsed * 100);

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-brand-faint25"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: assets.layoutBackgroundValue }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(105deg, transparent 0%, rgba(251,191,36,0.14) 45%, rgba(251,191,36,0.06) 70%, transparent 100%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center sm:justify-start sm:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.18em] text-amber-200 ring-1 ring-amber-400/30">
            <Sparkles className="h-3 w-3" aria-hidden />
            Free trial
          </span>
          <p className="text-sm font-medium text-white">
            <span className="font-semibold text-amber-200">{trial.remainingLabel}</span>
            <span className="text-white/70"> · {trial.deviceLimit} screen included</span>
            {trial.endLabel ? (
              <span className="hidden text-white/55 sm:inline"> · ends {trial.endLabel}</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-white/10 sm:block" aria-hidden>
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-700"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
          <Link
            href={TRIAL_UPGRADE_MAILTO}
            className="rounded-md bg-brand px-3 py-1 text-xs font-bold text-brand-contrast shadow-sm transition hover:bg-brand-hover"
          >
            Upgrade
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrialProgressRing({ daysLeft, elapsed }: { daysLeft: number | null; elapsed: number }) {
  const size = 88;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - elapsed);

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-amber-500/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-amber-500 transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
          {daysLeft ?? "—"}
        </span>
        <span className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
          days
        </span>
      </div>
    </div>
  );
}

/** Dashboard hero — trial status at a glance. */
export function TrialHomeCard() {
  const trial = useTrialStatus();
  if (!trial) return null;

  const urgent = trial.daysLeft !== null && trial.daysLeft <= 2;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border shadow-sm",
        urgent
          ? "border-amber-400/50 bg-gradient-to-br from-amber-50 via-card to-card dark:from-amber-950/30"
          : "border-amber-300/40 bg-gradient-to-br from-amber-50/80 via-card to-card dark:from-amber-950/20",
      )}
      aria-label="Trial status"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-5">
          <TrialProgressRing daysLeft={trial.daysLeft} elapsed={trial.elapsed} />
          <div className="min-w-0 space-y-1.5">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              {DEFAULT_TRIAL_DAYS}-day free trial
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {trial.remainingLabel} on your trial
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              You can link{" "}
              <strong className="font-semibold text-foreground">{trial.deviceLimit} screen</strong> and use
              cloud storage while you evaluate OneSign.
              {trial.endLabel ? (
                <>
                  {" "}
                  Trial ends <strong className="font-medium text-foreground">{trial.endLabel}</strong>.
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Link
          href={TRIAL_UPGRADE_MAILTO}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-contrast shadow-md transition hover:bg-brand-hover"
        >
          Upgrade plan
        </Link>
      </div>
    </section>
  );
}
