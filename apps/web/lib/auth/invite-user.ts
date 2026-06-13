import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/auth/find-user-by-email";

export class InviteUserError extends Error {
  constructor(
    public readonly code: "already_active" | "invite_failed",
    message: string,
  ) {
    super(message);
    this.name = "InviteUserError";
  }
}

export interface InviteAuthUserInput {
  email: string;
  clientName?: string;
  redirectTo: string;
}

export interface InviteAuthUserResult {
  userId: string;
  user: User;
  resent: boolean;
}

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("email exists") ||
    lower.includes("user already")
  );
}

export async function inviteAuthUser(
  input: InviteAuthUserInput,
): Promise<InviteAuthUserResult> {
  const admin = getSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  const clientName = input.clientName?.trim() || undefined;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: input.redirectTo,
    data: {
      full_name: clientName,
      skip_trial: "true",
    },
  });

  if (!error && data.user?.id) {
    return { userId: data.user.id, user: data.user, resent: false };
  }

  if (!error || !isAlreadyRegisteredError(error.message)) {
    throw new InviteUserError("invite_failed", error?.message ?? "Invitation failed");
  }

  const existingId = await findAuthUserIdByEmail(admin, email);
  if (!existingId) {
    throw new InviteUserError("invite_failed", error.message);
  }

  const { data: existingData, error: existingError } =
    await admin.auth.admin.getUserById(existingId);
  if (existingError || !existingData.user) {
    throw new InviteUserError("invite_failed", existingError?.message ?? error.message);
  }

  const existing = existingData.user;
  if (existing.last_sign_in_at) {
    throw new InviteUserError(
      "already_active",
      "This email already has an active account. They can use Forgot password on the login page.",
    );
  }

  const { data: resentData, error: resentError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: input.redirectTo,
      data: {
        full_name: clientName ?? existing.user_metadata?.full_name ?? undefined,
        skip_trial: "true",
      },
    },
  );

  if (resentError) {
    throw new InviteUserError(
      "invite_failed",
      resentError.message || "Could not resend invitation",
    );
  }

  if (!resentData.user?.id) {
    throw new InviteUserError("invite_failed", "Invitation resent but user id was missing");
  }

  return { userId: resentData.user.id, user: resentData.user, resent: true };
}
