/**
 * GET /api/birthdays · every birthday, soft-deleted ones excluded
 * PUT /api/birthdays · upsert one by clientId (the full desired state · idempotent, replay-safe).
 *                       Older `updatedAt` than the stored row → ignored (last writer wins).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { birthdays } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureBirthdayTables } from "@/lib/birthdays/server";
import type { Birthday } from "@/lib/birthdays/types";

function rowToBirthday(r: typeof birthdays.$inferSelect): Birthday {
  return {
    clientId: r.clientId, name: r.name, month: r.month, day: r.day, year: r.year ?? null,
    remindDaysBefore: r.remindDaysBefore, notes: r.notes ?? null,
    createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(), deleted: r.deleted,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBirthdayTables();
  const rows = await db.select().from(birthdays).where(and(eq(birthdays.userId, session.user.id), eq(birthdays.deleted, false)));
  return NextResponse.json({ birthdays: rows.map(rowToBirthday) });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await ensureBirthdayTables();
  const b = await req.json();
  if (typeof b?.clientId !== "string" || !b.clientId || b.clientId.length > 64) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  if (!name && !b.deleted) return NextResponse.json({ error: "name required" }, { status: 400 });

  const month = Number(b.month), day = Number(b.day);
  if (!b.deleted && (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  const yearNum = Number(b.year);
  const year = Number.isInteger(yearNum) && yearNum > 1900 && yearNum <= new Date().getFullYear() ? yearNum : null;
  const updatedAt = new Date(Number(b.updatedAt) || Date.now());

  const values = {
    userId,
    clientId: b.clientId,
    name: name || "(deleted)",
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1,
    year,
    remindDaysBefore: Number.isInteger(Number(b.remindDaysBefore)) ? Math.min(30, Math.max(0, Number(b.remindDaysBefore))) : 3,
    notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) || null : null,
    deleted: !!b.deleted,
    createdAt: new Date(Number(b.createdAt) || Date.now()),
    updatedAt,
  };

  const [existing] = await db.select({ id: birthdays.id, updatedAt: birthdays.updatedAt }).from(birthdays)
    .where(and(eq(birthdays.userId, userId), eq(birthdays.clientId, b.clientId))).limit(1);

  if (existing) {
    if (existing.updatedAt.getTime() > updatedAt.getTime()) return NextResponse.json({ ok: true, ignored: "older" });
    await db.update(birthdays).set(values).where(eq(birthdays.id, existing.id));
  } else {
    try { await db.insert(birthdays).values(values); }
    catch { await db.update(birthdays).set(values).where(eq(birthdays.clientId, b.clientId)); }
  }
  return NextResponse.json({ ok: true });
}
