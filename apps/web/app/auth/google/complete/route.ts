import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  bridgeGoogleUserToSupabase,
} from "@/lib/auth/google-supabase-bridge";
import { establishSupabaseSessionOnResponse } from "@/lib/auth/supabase-session-from-email";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const session = await auth();
  const googleSub = session?.user?.googleSub;
  const email = session?.user?.email;

  if (!googleSub || !email) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  const nextPath = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const redirectUrl = new URL(nextPath, request.url);

  try {
    const userId = await bridgeGoogleUserToSupabase({
      googleSub,
      email,
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
    });

    const response = NextResponse.redirect(redirectUrl);
    await establishSupabaseSessionOnResponse(request, response, email);

    const admin = getSupabaseAdminClient();
    await admin
      .from("client_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending");

    return response;
  } catch (error) {
    console.error("Google Supabase bridge failed", error);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "google_bridge_failed");
    return NextResponse.redirect(loginUrl);
  }
}
