import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
  const fullName = meta?.full_name?.trim();

  return (
    <div style={{ maxWidth: "36rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 700, color: "#111827" }}>Profile</h1>
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#4b5563" }}>Signed-in account for this console.</p>
      <dl
        style={{
          display: "grid",
          gap: "0.75rem",
          fontSize: "0.875rem",
          color: "#111827",
        }}
      >
        <div>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Email</dt>
          <dd style={{ margin: "0.25rem 0 0" }}>{user?.email ?? "—"}</dd>
        </div>
        <div>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Display name</dt>
          <dd style={{ margin: "0.25rem 0 0" }}>{fullName || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
