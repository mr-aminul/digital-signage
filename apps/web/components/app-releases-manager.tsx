"use client";

import type { AppRelease } from "@signage/types";
import { CheckCircle2, Download, History, Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { getReleasesPublicBaseUrl, releasePublicUrl } from "@/lib/object-storage/urls";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function releaseApkDownloadName(release: AppRelease): string {
  const safeVersion = release.version_name.replace(/[^\w.-]+/g, "-");
  return `onesign-tv-v${safeVersion}.apk`;
}

function ReleaseRow({
  release,
  showDownload,
}: {
  release: AppRelease;
  showDownload?: boolean;
}) {
  const releasesBaseUrl = getReleasesPublicBaseUrl();

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">
            v{release.version_name}
            <span className="ml-1.5 font-normal text-muted-foreground">({release.version_code})</span>
          </span>
          {release.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-badge dark:text-brand-onDark">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Active
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{formatReleaseDate(release.created_at)}</p>
        {release.release_notes ? (
          <p className="text-sm text-muted-foreground">{release.release_notes}</p>
        ) : null}
      </div>
      {showDownload && release.is_active && releasesBaseUrl ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={releasePublicUrl(release.storage_path)}
            download={releaseApkDownloadName(release)}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download APK
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function AppReleasesManager() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);

  const activeRelease = useMemo(() => releases.find((r) => r.is_active) ?? null, [releases]);
  const previousReleases = useMemo(() => releases.filter((r) => !r.is_active), [releases]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_releases")
      .select("*")
      .order("version_code", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setReleases((data ?? []) as AppRelease[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mb-7 space-y-6 border-b border-border pb-7">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Package className="h-[1.125rem] w-[1.125rem] text-brand" strokeWidth={2} aria-hidden />
          <h2 className="text-base font-semibold text-foreground">TV app updates (OTA)</h2>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paired TVs check for updates on startup and every few hours. They download the{" "}
          <span className="font-medium text-foreground">active</span> build and prompt to install when a newer{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">versionCode</code> is available.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Active release</h3>
          <p className="text-xs text-muted-foreground">What TVs and new installs receive today.</p>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : activeRelease ? (
          <ReleaseRow release={activeRelease} showDownload />
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">No active release configured.</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Previous releases</h3>
          </div>
          <p className="text-xs text-muted-foreground">Older builds kept for reference.</p>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : previousReleases.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No previous releases.</div>
        ) : (
          <ul className="divide-y divide-border">
            {previousReleases.map((release) => (
              <li key={release.id}>
                <ReleaseRow release={release} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
