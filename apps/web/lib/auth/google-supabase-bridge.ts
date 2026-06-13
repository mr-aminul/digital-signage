import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/auth/find-user-by-email";

export interface GoogleBridgeInput {
  googleSub: string;
  email: string;
  name?: string;
  image?: string;
}

export class GoogleBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleBridgeError";
  }
}

async function linkGoogleIdentity(admin: SupabaseClient, googleSub: string, userId: string): Promise<void> {
  const { error } = await admin.from("auth_google_identities").upsert(
    { google_sub: googleSub, user_id: userId },
    { onConflict: "google_sub" },
  );

  if (error) {
    throw error;
  }
}

async function lookupLinkedUserId(admin: SupabaseClient, googleSub: string): Promise<string | null> {
  const { data, error } = await admin
    .from("auth_google_identities")
    .select("user_id")
    .eq("google_sub", googleSub)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.user_id ?? null;
}

async function createGoogleUser(
  admin: SupabaseClient,
  input: GoogleBridgeInput,
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: input.name?.trim() || undefined,
      avatar_url: input.image || undefined,
    },
  });

  if (error || !data.user?.id) {
    throw new GoogleBridgeError(error?.message ?? "Could not create your account.");
  }

  await linkGoogleIdentity(admin, input.googleSub.trim(), data.user.id);
  return data.user.id;
}

export async function bridgeGoogleUserToSupabase(input: GoogleBridgeInput): Promise<string> {
  const admin = getSupabaseAdminClient();
  const email = input.email.trim();
  const googleSub = input.googleSub.trim();

  const linkedUserId = await lookupLinkedUserId(admin, googleSub);
  if (linkedUserId) {
    return linkedUserId;
  }

  const existingUserId = await findAuthUserIdByEmail(admin, email);
  if (existingUserId) {
    await linkGoogleIdentity(admin, googleSub, existingUserId);
    return existingUserId;
  }

  return createGoogleUser(admin, input);
}
