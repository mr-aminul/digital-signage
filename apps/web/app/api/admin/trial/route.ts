import { NextResponse, type NextRequest } from "next/server";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    action?: "extend" | "convert";
    days?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (body.action === "extend") {
    const days = typeof body.days === "number" ? Math.floor(body.days) : 7;
    if (days < 1 || days > 365) {
      return NextResponse.json({ error: "days must be between 1 and 365" }, { status: 400 });
    }

    const { error } = await supabase.rpc("admin_extend_trial", {
      p_user_id: userId,
      p_days: days,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: `Trial extended by ${days} days.` });
  }

  if (body.action === "convert") {
    const { error } = await supabase.rpc("admin_convert_account", {
      p_user_id: userId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Account converted to paid." });
  }

  return NextResponse.json({ error: "action must be extend or convert" }, { status: 400 });
}
