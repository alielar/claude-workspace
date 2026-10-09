/**
 * Accounts, from a terminal only (`x-app-key`) · 2026-10-09.
 *   GET    → every account (id, e-mail, name, created, primary) and whether it may sign in.
 *   POST   { email, name? } → creates the row (how a guest account is checked before the person
 *           signs in; signing in still needs the address in GUEST_EMAILS).
 *   DELETE { email } → removes an account and everything it owns (cascade) · never the primary one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ensureUserForEmail, getUserId } from "@/lib/user";
import { isAllowed } from "@/app/api/auth/callback/google/route";

const keyOk = (req: NextRequest) => !!process.env.APP_KEY && req.headers.get("x-app-key") === process.env.APP_KEY;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const primary = await getUserId();
  const rows = await db.select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt }).from(users).orderBy(asc(users.createdAt));
  const out = [];
  for (const r of rows) out.push({ ...r, primary: r.id === primary, canSignIn: await isAllowed(r.email) });
  return NextResponse.json({ users: out });
}

export async function POST(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { email?: string; name?: string } | null;
  if (!b?.email || !EMAIL.test(b.email)) return NextResponse.json({ error: "email required" }, { status: 400 });
  const r = await ensureUserForEmail(b.email, b.name ?? null);
  return NextResponse.json({ ...r, canSignIn: await isAllowed(b.email) }, { status: r.created ? 201 : 200 });
}

export async function DELETE(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!b?.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, b.email.toLowerCase())).limit(1);
  if (!row) return NextResponse.json({ error: "no such account" }, { status: 404 });
  if (row.id === (await getUserId())) return NextResponse.json({ error: "the primary account stays" }, { status: 403 });
  await db.delete(users).where(eq(users.id, row.id));
  return NextResponse.json({ deleted: row.id });
}
