import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (staff.role !== "owner") {
    return NextResponse.json({ error: "Only account owners can manage admins" }, { status: 403 });
  }

  let body: { email?: string; displayName?: string; role?: string };
  try {
    body = (await request.json()) as { email?: string; displayName?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_upsert_staff", {
    p_email: email,
    p_display_name: body.displayName?.trim() || null,
    p_role: body.role?.trim() || "operator",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
