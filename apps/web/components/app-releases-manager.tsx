"use client";

import type { AppRelease } from "@signage/types";
import { CheckCircle2, Package, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AppReleasesManager({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);

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

  const onPublish = useCallback(async () => {
    if (!apkFile) {
      toast.error("Choose an APK file first.");
      return;
    }
    const parsedCode = Number.parseInt(versionCode, 10);
    if (!Number.isFinite(parsedCode) || parsedCode <= 0) {
      toast.error("Version code must be a positive integer (must increase every release).");
      return;
    }
    if (!versionName.trim()) {
      toast.error("Version name is required (for example 0.2.0).");
      return;
    }

    setUploading(true);
    try {
      const digest = await sha256Hex(apkFile);
      const objectPath = `android/${parsedCode}-${crypto.randomUUID()}.apk`;
      const { error: uploadError } = await supabase.storage.from("releases").upload(objectPath, apkFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/vnd.android.package-archive",
      });
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("app_releases")
        .insert({
          version_code: parsedCode,
          version_name: versionName.trim(),
          storage_path: objectPath,
          sha256: digest,
          release_notes: releaseNotes.trim() || null,
          package_name: "dev.signage.tv",
          created_by: userId,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        toast.error(insertError?.message ?? "Could not save release metadata.");
        return;
      }

      const { error: activateError } = await supabase.rpc("activate_app_release", {
        p_release_id: inserted.id,
      });
      if (activateError) {
        toast.error(activateError.message);
        return;
      }

      toast.success(`Published v${versionName.trim()} — TVs will pick this up on their next update check.`);
      setVersionCode("");
      setVersionName("");
      setReleaseNotes("");
      setApkFile(null);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [apkFile, refresh, releaseNotes, supabase, userId, versionCode, versionName]);

  const onActivate = useCallback(
    async (releaseId: string) => {
      const { error } = await supabase.rpc("activate_app_release", { p_release_id: releaseId });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Release activated.");
      await refresh();
    },
    [refresh, supabase],
  );

  const onDelete = useCallback(
    async (release: AppRelease) => {
      if (release.is_active) {
        toast.error("Activate a different release before deleting the active one.");
        return;
      }
      const { error: storageError } = await supabase.storage.from("releases").remove([release.storage_path]);
      if (storageError) {
        toast.error(storageError.message);
        return;
      }
      const { error } = await supabase.from("app_releases").delete().eq("id", release.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Release deleted.");
      await refresh();
    },
    [refresh, supabase],
  );

  return (
    <section style={{ marginBottom: "1.75rem", paddingBottom: "1.75rem", borderBottom: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <Package size={18} strokeWidth={2} aria-hidden />
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#111827" }}>TV app updates (OTA)</h2>
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#4b5563", lineHeight: 1.5 }}>
        Upload a signed release APK here. Paired TVs check every few hours, download the active build, and prompt to
        install when a newer <code style={{ fontSize: "0.8125rem" }}>versionCode</code> is available.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", maxWidth: "28rem", marginBottom: "1.25rem" }}>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Version code (integer, must increase)</span>
          <Input
            type="number"
            min={1}
            value={versionCode}
            onChange={(e) => setVersionCode(e.target.value)}
            placeholder="2"
            disabled={uploading}
          />
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Version name</span>
          <Input
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder="0.2.0"
            disabled={uploading}
          />
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Release notes (optional)</span>
          <Input
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Bug fixes and performance improvements"
            disabled={uploading}
          />
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Release APK</span>
          <input
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            disabled={uploading}
            onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="button" onClick={() => void onPublish()} disabled={uploading}>
          <Upload size={16} style={{ marginRight: "0.35rem" }} aria-hidden />
          {uploading ? "Publishing…" : "Publish and activate"}
        </Button>
      </div>

      <div>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem", fontWeight: 600, color: "#111827" }}>
          Published builds
        </h3>
        {loading ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Loading releases…</p>
        ) : releases.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>No releases yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.65rem" }}>
            {releases.map((release) => (
              <li
                key={release.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 0.875rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <strong style={{ color: "#111827" }}>
                      v{release.version_name} ({release.version_code})
                    </strong>
                    {release.is_active ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.75rem",
                          color: "#047857",
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle2 size={14} aria-hidden />
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
                    {formatReleaseDate(release.created_at)}
                    {release.release_notes ? ` · ${release.release_notes}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {!release.is_active ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void onActivate(release.id)}>
                      Activate
                    </Button>
                  ) : null}
                  {!release.is_active ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void onDelete(release)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
