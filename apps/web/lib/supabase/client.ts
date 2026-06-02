"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./public-env";

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const connect = getSupabasePublicEnv();
  if (!connect) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY on Vercel), then redeploy.",
    );
  }

  const { url, anonKey } = connect;

  const fetchNoStore: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: "no-store" });

  browserClient = createBrowserClient(url, anonKey, {
    global: { fetch: fetchNoStore },
  });
  return browserClient;
}
