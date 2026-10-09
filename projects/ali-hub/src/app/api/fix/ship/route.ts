/**
 * POST /api/fix/ship · Ali's "Ship now": every held message becomes queued, so the Mac takes
 * them all as one batch on its next poll (within 30 s). Nothing is built before this tap
 * (Ali 2026-09-27: "hold until I say go"). Same login gate as the rest of /api/fix.
 */

import { NextResponse } from "next/server";
import { authPrimary as auth } from "@/lib/auth"; // Ali's section (2026-10-09): a guest gets 401 here
import { db } from "@/db";
import { fixRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureFixTables } from "@/lib/fix/server";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureFixTables();
  const held = await db.select({ id: fixRequests.id }).from(fixRequests)
    .where(and(eq(fixRequests.userId, session.user.id), eq(fixRequests.status, "held")));
  if (held.length) {
    await db.update(fixRequests).set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(fixRequests.userId, session.user.id), eq(fixRequests.status, "held")));
  }
  return NextResponse.json({ released: held.length });
}
