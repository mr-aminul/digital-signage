"use client";

import { useSettings } from "@/components/shell/settings-context";

export default function SettingsPage() {
  const { settings, setNotifications, setLanguage } = useSettings();

  return (
    <div style={{ padding: "0.25rem 0", maxWidth: "36rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 700, color: "#111827" }}>Settings</h1>
      <section style={{ marginBottom: "1.75rem", paddingBottom: "1.75rem", borderBottom: "1px solid #e5e7eb" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#4b5563" }}>
          Show in-app notifications and updates.
        </p>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            style={{ width: "1.125rem", height: "1.125rem", accentColor: "#111827" }}
          />
          <span style={{ fontSize: "0.9375rem", color: "#111827" }}>Enable in-app notifications</span>
        </label>
      </section>

      <section style={{ marginBottom: "1.75rem", paddingBottom: "1.75rem", borderBottom: "1px solid #e5e7eb" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#4b5563" }}>Preferred language for the interface.</p>
        <select
          value={settings.language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9375rem",
            color: "#111827",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
            minWidth: "10rem",
          }}
          aria-label="Language"
        >
          <option value="en">English</option>
        </select>
      </section>
    </div>
  );
}
