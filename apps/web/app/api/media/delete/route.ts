import { NextResponse, type NextRequest } from "next/server";
import { deleteMediaObject } from "@/lib/object-storage/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; storagePath?: string };
  try {
    body = (await request.json()) as { id?: string; storagePath?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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
  if (!row || row.owner_id !== user.id || row.storage_path !== storagePath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    await deleteMediaObject(user.id, storagePath);
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
