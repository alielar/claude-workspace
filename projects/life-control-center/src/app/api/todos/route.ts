/**
 * GET /api/todos — all open tasks + tasks done in the last 7 days (soft-deleted ones excluded)
 * PUT /api/todos — upsert one task by clientId (the full desired state — idempotent, replay-safe).
 *                  Older `updatedAt` than the stored row → ignored (last writer wins).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Todo, Priority, Area } from "@/lib/todo/types";

function rowToTodo(r: typeof todos.$inferSelect): Todo {
  return {
    clientId: r.clientId, title: r.title, area: (r.area === "work" || r.area === "list" ? r.area : "personal") as Area, notes: r.notes, project: r.project,
    dueDate: r.dueDate, dueTime: r.dueTime, evening: r.evening, someday: r.someday,
    priority: (r.priority as Priority) ?? 0, sortOrder: r.sortOrder,
    doneAt: r.doneAt ? r.doneAt.getTime() : null,
    createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(), deleted: r.deleted,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(todos).where(and(eq(todos.userId, session.user.id), eq(todos.deleted, false)));
  const cutoff = Date.now() - 7 * 86400000;
  const list = rows.map(rowToTodo).filter((t) => t.doneAt === null || t.doneAt >= cutoff);
  return NextResponse.json({ todos: list });
}

const YMD = /^\d{4}-\d{2}-\d{2}$/, HM = /^\d{2}:\d{2}$/;

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const b = await req.json();
  if (typeof b?.clientId !== "string" || !b.clientId || b.clientId.length > 64) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 300) : "";
  if (!title && !b.deleted) return NextResponse.json({ error: "title required" }, { status: 400 });

  const updatedAt = new Date(Number(b.updatedAt) || Date.now());
  const values = {
    userId,
    clientId: b.clientId,
    title: title || "(deleted)",
    area: b.area === "work" || b.area === "list" ? b.area : "personal",
    notes: typeof b.notes === "string" ? b.notes.slice(0, 4000) || null : null,
    project: typeof b.project === "string" ? b.project.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24) || null : null,
    dueDate: typeof b.dueDate === "string" && YMD.test(b.dueDate) ? b.dueDate : null,
    dueTime: typeof b.dueTime === "string" && HM.test(b.dueTime) ? b.dueTime : null,
    evening: !!b.evening,
    someday: !!b.someday,
    priority: b.priority === 2 ? 2 : b.priority === 1 ? 1 : 0,
    sortOrder: Number.isFinite(Number(b.sortOrder)) ? Math.round(Number(b.sortOrder)) : 0,
    doneAt: b.doneAt ? new Date(Number(b.doneAt)) : null,
    deleted: !!b.deleted,
    createdAt: new Date(Number(b.createdAt) || Date.now()),
    updatedAt,
  };

  const [existing] = await db.select({ id: todos.id, updatedAt: todos.updatedAt }).from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.clientId, b.clientId))).limit(1);

  if (existing) {
    if (existing.updatedAt.getTime() > updatedAt.getTime()) return NextResponse.json({ ok: true, ignored: "older" });
    await db.update(todos).set(values).where(eq(todos.id, existing.id));
  } else {
    try { await db.insert(todos).values(values); }
    catch { await db.update(todos).set(values).where(eq(todos.clientId, b.clientId)); }
  }
  return NextResponse.json({ ok: true });
}
