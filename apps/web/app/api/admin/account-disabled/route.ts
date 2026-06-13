import { NextResponse, type NextRequest } from "next/server";
import { parseUserId } from "@/lib/auth/resolve-data-owner";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; disabled?: boolean };
  try {
    body = (await request.json()) as { userId?: string; disabled?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = parseUserId(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  if (typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "Missing disabled flag" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_set_account_disabled", {
    p_user_id: userId,
    p_disabled: body.disabled,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.disabled) {
    try {
      const admin = getSupabaseAdminClient();
      const { error: signOutError } = await admin.auth.admin.signOut(userId, "global");
      if (signOutError) {
        console.warn("[account-disabled] signOut", signOutError.message);
      }
    } catch (err) {
      console.warn("[account-disabled] signOut unavailable", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true });
}
