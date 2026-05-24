/**
 * POST /api/library/upload
 * Handles Vercel Blob client-side upload token generation.
 *
 * The browser uploads the PDF directly to Vercel Blob (no size limit from our server).
 * This endpoint just generates the upload token and handles completion.
 *
 * Client calls: upload(file, { handleUploadUrl: '/api/library/upload' })
 */

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname: string) => {
      // Only allow PDFs, up to 500 MB
      return {
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 500 * 1024 * 1024,
        tokenPayload: JSON.stringify({ userId: session.user!.id, pathname }),
      };
    },
    onUploadCompleted: async () => {
      // Book record is updated by the client after upload (simpler & more reliable)
    },
  });

  return NextResponse.json(jsonResponse);
}
