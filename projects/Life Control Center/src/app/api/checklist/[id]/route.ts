/**
 * PATCH  /api/checklist/[id] — update title/emoji/active
 * DELETE /api/checklist/[id] — soft-delete (sets active=false)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const itemId = parseInt(id, 10);

  const body = await req.json();
  const updates: Partial<typeof checklistItems.$inferInsert> = {};
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.emoji !== undefined) updates.emoji = body.emoji?.trim() || null;
  if (body.active !== undefined) updates.active = body.active;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  const [updated] = await db.update(checklistItems)
    .set(updates)
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const itemId = parseInt(id, 10);

  // Soft delete — preserve completion history for streak accuracy
  await db.update(checklistItems)
    .set({ active: false })
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.userId, userId)));

  return NextResponse.json({ ok: true });
}
