function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (v != null && v.trim() !== "") return v.trim();
  }
  return undefined;
}

declare global {
  interface Window {
    __SIGNAGE_SUPABASE__?: { url: string; anonKey: string };
  }
}

/**
 * Supabase URL + anon key for browser code.
 * Uses build-time NEXT_PUBLIC_* when set; otherwise runtime injection from the root layout.
 */
export function getSupabasePublicEnv(): { url: string; anonKey: string } | null {
  const url = firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (url && anonKey) return { url, anonKey };

  if (typeof window !== "undefined" && window.__SIGNAGE_SUPABASE__) {
    const injected = window.__SIGNAGE_SUPABASE__;
    if (injected.url?.trim() && injected.anonKey?.trim()) {
      return { url: injected.url.trim(), anonKey: injected.anonKey.trim() };
    }
  }

  return null;
}
