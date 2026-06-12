import { NextResponse, type NextRequest } from "next/server";
import type { Media } from "@signage/types";
import { inferMediaFileType, isAcceptedSignageMime, readVideoFileDurationSeconds } from "@/lib/media";
import { putMediaObject } from "@/lib/object-storage/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { resolveDataOwnerId } from "@/lib/auth/resolve-data-owner";
import { durationSecondsForStorage } from "@/lib/video-duration-probe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ctx = await getRouteHandlerStaffAuth();
  if (!ctx.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.profile?.is_disabled && !ctx.staff) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const isStaff = ctx.staff != null;
  const requestedOwnerId = formData.get("ownerId")?.toString();
  const resolved = resolveDataOwnerId(
    ctx.user.id,
    ctx.staff,
    isStaff ? requestedOwnerId : ctx.user.id,
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { supabase } = ctx;
  const effectiveOwnerId = resolved.ownerId;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAcceptedSignageMime(file.type)) {
    return NextResponse.json({ error: `${file.name} is not a supported image/video type.` }, { status: 400 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${effectiveOwnerId}/${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await putMediaObject(effectiveOwnerId, storagePath, buffer, file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload to object storage failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const fileType = inferMediaFileType(file.type);
  const intrinsicSeconds =
    fileType === "video" ? durationSecondsForStorage(await readVideoFileDurationSeconds(file)) : null;

  const { data, error: insertError } = await supabase
    .from("media")
    .insert({
      owner_id: effectiveOwnerId,
      storage_path: storagePath,
      file_type: fileType,
      original_filename: file.name,
      duration_seconds: intrinsicSeconds,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ media: data as Media });
}
