import { NextResponse, type NextRequest } from "next/server";
import type { Media } from "@signage/types";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/plan-quota";
import { inferMediaFileType, isAcceptedSignageMime, readVideoFileDurationSeconds } from "@/lib/media";
import { deleteMediaObject, putMediaObject } from "@/lib/object-storage/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { resolveDataOwnerId } from "@/lib/auth/resolve-data-owner";
import { checkRateLimit } from "@/lib/rate-limit";
import { durationSecondsForStorage } from "@/lib/video-duration-probe";

export const runtime = "nodejs";

const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const ctx = await getRouteHandlerStaffAuth();
  if (!ctx.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.profile?.is_disabled && !ctx.staff) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  const rate = checkRateLimit(`media-upload:${ctx.user.id}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
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

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return NextResponse.json(
      { error: `Each file must be ${Math.round(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)} MB or smaller.` },
      { status: 400 },
    );
  }

  const { error: quotaError } = await supabase.rpc("check_storage_quota", {
    p_owner_id: effectiveOwnerId,
    p_add_bytes: file.size,
  });
  if (quotaError) {
    const message = quotaError.message.includes("storage_limit_reached")
      ? "Storage is full. Remove files from your library or ask your administrator to increase your plan."
      : quotaError.message;
    return NextResponse.json({ error: message }, { status: 403 });
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
      size_bytes: file.size,
    })
    .select("*")
    .single();

  if (insertError) {
    try {
      await deleteMediaObject(effectiveOwnerId, storagePath);
    } catch (cleanupErr) {
      console.error("[media/upload] orphan cleanup failed", storagePath, cleanupErr);
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ media: data as Media });
}
