import type { Metadata } from "next";
import { Toaster } from "sonner";
import { getSupabaseConnectEnv } from "@/lib/supabase/env";
import "@fontsource-variable/google-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signage Console",
  description: "Digital signage dashboard",
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
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
