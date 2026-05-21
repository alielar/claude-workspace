/**
 * POST /api/workouts/exercises/upload-video
 * Uploads a video file to Vercel Blob and returns the URL.
 * Body: FormData with `file` field and `exerciseId` field.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { exerciseDb } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const exerciseIdStr = formData.get("exerciseId") as string | null;

  if (!file || !exerciseIdStr) {
    return NextResponse.json({ error: "Missing file or exerciseId" }, { status: 400 });
  }

  const exerciseId = parseInt(exerciseIdStr);
  if (isNaN(exerciseId)) {
    return NextResponse.json({ error: "Invalid exerciseId" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "mp4";
  const blobName = `exercise-videos/${exerciseId}-${Date.now()}.${ext}`;

  const blob = await put(blobName, file, { access: "public" });

  await db
    .update(exerciseDb)
    .set({ videoUrl: blob.url, videoType: "upload" })
    .where(eq(exerciseDb.id, exerciseId));

  return NextResponse.json({ url: blob.url });
}
