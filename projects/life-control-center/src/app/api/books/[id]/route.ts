/**
 * PATCH  /api/books/[id] · { status?, sortOrder?, covers?, payoff?, title?, author? } · sends final state (idempotent)
 * DELETE /api/books/[id]
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingQueue } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { rowToBook } from "@/lib/books/rows";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const bookId = parseInt(id, 10);
  const b = await req.json();
  const u: Partial<typeof readingQueue.$inferInsert> = {};
  if (b.status === "queue" || b.status === "reading" || b.status === "finished") {
    u.status = b.status;
    if (b.status === "reading") u.startedAt = b.startedAt ? new Date(Number(b.startedAt)) : new Date();
    if (b.status === "finished") u.finishedAt = b.finishedAt ? new Date(Number(b.finishedAt)) : new Date();
    if (b.status === "queue") { u.startedAt = null; u.finishedAt = null; }
  }
  if (typeof b.sortOrder === "number") u.sortOrder = Math.round(b.sortOrder);
  if (typeof b.covers === "string") u.covers = b.covers.trim().slice(0, 1000) || null;
  if (typeof b.payoff === "string") u.payoff = b.payoff.trim().slice(0, 1000) || null;
  if (typeof b.title === "string" && b.title.trim()) u.title = b.title.trim().slice(0, 200);
  if (typeof b.author === "string" && b.author.trim()) u.author = b.author.trim().slice(0, 120);

  const [row] = await db.update(readingQueue).set(u)
    .where(and(eq(readingQueue.id, bookId), eq(readingQueue.userId, session.user.id))).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rowToBook(row));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(readingQueue)
    .where(and(eq(readingQueue.id, parseInt(id, 10)), eq(readingQueue.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
