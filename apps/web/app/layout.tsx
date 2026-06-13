import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AppProviders } from "@/app/providers";
import { getSupabaseConnectEnv } from "@/lib/supabase/env";
import "@fontsource-variable/google-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "OneSign Console",
  description: "OneSign admin dashboard — manage screens, playlists, and media.",
  icons: {
    icon: [{ url: "/images/onesign-brand-mark.svg", type: "image/svg+xml" }],
    shortcut: "/images/onesign-brand-mark.svg",
    apple: "/images/onesign-brand-mark.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabaseConnect = getSupabaseConnectEnv();
  const supabaseBootstrap =
    supabaseConnect &&
    `window.__SIGNAGE_SUPABASE__=${JSON.stringify(supabaseConnect)};`;

  return (
    <html lang="en">
      <head>
        {supabaseBootstrap ? (
          <script dangerouslySetInnerHTML={{ __html: supabaseBootstrap }} />
        ) : null}
      </head>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
