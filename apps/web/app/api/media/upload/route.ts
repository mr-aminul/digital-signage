import type { Media } from "@signage/types";
import { NextResponse, type NextRequest } from "next/server";
import { inferMediaFileType, isAcceptedSignageMime, readVideoFileDurationSeconds } from "@/lib/media";
import { putMediaObject } from "@/lib/object-storage/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { durationSecondsForStorage } from "@/lib/video-duration-probe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAcceptedSignageMime(file.type)) {
    return NextResponse.json({ error: `${file.name} is not a supported image/video type.` }, { status: 400 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await putMediaObject(user.id, storagePath, buffer, file.type);
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
      owner_id: user.id,
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
