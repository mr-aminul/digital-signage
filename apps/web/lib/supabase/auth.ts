import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@signage/types";
import { fetchProfileRow } from "./profile";
import { getSupabaseServerClient } from "./server";

/**
 * Single Supabase client + session read per request (layout + page share via cache()).
 *
 * Uses getClaims() (local JWT validation) to avoid Auth HTTP round-trips that can stall SSR.
 * PostgREST/RLS still validates the JWT on each query; middleware already gates routes.
 */
export const getServerAuth = cache(async (): Promise<{ supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>; user: User | null }> => {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return { supabase, user: null };
  }

  const claims = data.claims;
  const user: User = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    user_metadata:
      claims.user_metadata && typeof claims.user_metadata === "object"
        ? (claims.user_metadata as User["user_metadata"])
        : {},
    app_metadata:
      claims.app_metadata && typeof claims.app_metadata === "object"
        ? (claims.app_metadata as User["app_metadata"])
        : {},
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    created_at: typeof claims.created_at === "string" ? claims.created_at : new Date(0).toISOString(),
  };

  return { supabase, user };
});

export const getServerAuthWithProfile = cache(
  async (): Promise<{
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
    user: User | null;
    profile: Profile | null;
  }> => {
    const { supabase, user } = await getServerAuth();
    if (!user) {
      return { supabase, user: null, profile: null };
    }

    const profile = await fetchProfileRow(supabase, user.id);
    return { supabase, user, profile };
  },
);
