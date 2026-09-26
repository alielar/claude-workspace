import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";

/** A family photo from the database. `?t=1` gives the small copy used in grids. Ids never change, so caches may keep it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,40}$/.test(id)) return new NextResponse(null, { status: 404 });
  const small = new URL(req.url).searchParams.get("t") === "1";
  const [row] = await db.select({ mime: photos.mime, bytes: photos.bytes, thumb: photos.thumb }).from(photos).where(eq(photos.id, id));
  if (!row) return new NextResponse(null, { status: 404 });
  const body = (small && row.thumb) || row.bytes;
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", "Content-Length": String(body.length) },
  });
}
