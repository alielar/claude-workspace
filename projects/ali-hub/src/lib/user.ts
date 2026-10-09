/**
 * Who is who (2026-10-09 · the hub opened to a second person, Ali's father).
 *
 * Every table already carries `user_id`; this file is the one place that turns an identity into a
 * row in `users`.
 *
 *   getUserId()        the PRIMARY user = Ali. `USER_ID` in Vercel, else the oldest row. Everything
 *                      that reaches the server with the key instead of a cookie (the widget, the
 *                      Watch pipe, the Mac worker, the reminders pinger) belongs to him.
 *   userIdByEmail()    the row behind a signed-in e-mail (a cookie carries the e-mail, not the id).
 *   ensureUserForEmail() creates the row on a first sign-in (the Google callback) · never called
 *                      from a plain request.
 *   allUserIds()       every account, for the crons that run per person.
 *   isPrimaryUser()    "is this Ali" · what gates the sections only he has (Train, Health, Mind,
 *                      R2-D2) and the seeds that are his (routine, books, objectives).
 *
 * Caches are per server instance; a user row never changes id, so they never go stale.
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

let _primary: string | null = null;
const _byEmail = new Map<string, string>();

export async function getUserId(): Promise<string> {
  if (process.env.USER_ID) return process.env.USER_ID;
  if (_primary) return _primary;
  try {
    const [user] = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt), asc(users.id)).limit(1);
    _primary = user?.id ?? "";
  } catch {
    _primary = "";
  }
  return _primary;
}

export async function isPrimaryUser(userId: string): Promise<boolean> {
  const p = await getUserId();
  return !!p && p === userId;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const hit = _byEmail.get(e);
  if (hit) return hit;
  try {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
    if (row) { _byEmail.set(e, row.id); return row.id; }
  } catch { /* table missing · nobody */ }
  return null;
}

export async function userNameById(userId: string): Promise<string | null> {
  try {
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.name ?? null;
  } catch { return null; }
}

/** The row for an e-mail, created if missing · returns the id and whether it was just born. */
export async function ensureUserForEmail(email: string, name?: string | null): Promise<{ id: string; created: boolean }> {
  const e = email.trim().toLowerCase();
  const have = await userIdByEmail(e);
  if (have) return { id: have, created: false };
  const id = crypto.randomUUID();
  try {
    await db.insert(users).values({ id, email: e, name: name?.trim() || null, emailVerified: new Date() });
  } catch {
    // Raced with another sign-in · read the row that won.
    const again = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
    if (again[0]) { _byEmail.set(e, again[0].id); return { id: again[0].id, created: false }; }
    throw new Error("could not create the user");
  }
  _byEmail.set(e, id);
  return { id, created: true };
}

export async function allUserIds(): Promise<string[]> {
  try {
    const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt), asc(users.id));
    return rows.map((r) => r.id);
  } catch { return []; }
}
