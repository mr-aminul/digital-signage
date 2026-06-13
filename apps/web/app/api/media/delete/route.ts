import { NextResponse, type NextRequest } from "next/server";
import { deleteMediaObject } from "@/lib/object-storage/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { resolveDataOwnerId } from "@/lib/auth/resolve-data-owner";
import { isTrialExpired } from "@/lib/trial";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  const ctx = await getRouteHandlerStaffAuth();
  if (!ctx.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.profile?.is_disabled && !ctx.staff) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }
  if (isTrialExpired(ctx.profile?.trial_ends_at) && !ctx.staff) {
    return NextResponse.json({ error: "Your trial has ended." }, { status: 403 });
  }

  let body: { id?: string; storagePath?: string; ownerId?: string };
  try {
    body = (await request.json()) as { id?: string; storagePath?: string; ownerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isStaff = ctx.staff != null;
  const resolved = resolveDataOwnerId(
    ctx.user.id,
    ctx.staff,
    isStaff ? body.ownerId : ctx.user.id,
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { supabase } = ctx;
  const effectiveOwnerId = resolved.ownerId;

  const mediaId = body.id?.trim();
  const storagePath = body.storagePath?.trim();
  if (!mediaId || !storagePath) {
    return NextResponse.json({ error: "Missing id or storagePath" }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("media")
    .select("id, owner_id, storage_path")
    .eq("id", mediaId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!row || row.owner_id !== effectiveOwnerId || row.storage_path !== storagePath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    await deleteMediaObject(effectiveOwnerId, storagePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete from object storage failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { error: deleteError } = await supabase.from("media").delete().eq("id", mediaId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
