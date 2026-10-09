/**
 * Auth · Google sign-in, one account per e-mail (2026-10-09 · two people since Ali's father joined).
 *
 * All API routes call `const session = await auth()` and read `session.user.id`.
 *  - Login off (AUTH_REQUIRED unset): always resolves to the primary user (the local dev case).
 *  - Login on: the `ali_session` cookie names an e-mail → that person's row (`userIdByEmail`) ·
 *    no row = not signed in. The `x-app-key` header (the widget, the Watch pipe, the Mac worker,
 *    the reminders pinger) resolves to the PRIMARY user; with `x-as-email` beside it, to that
 *    existing account instead (how the guest experience is checked from a terminal · the key is
 *    already root, so this adds no power).
 */

import { cookies, headers } from "next/headers";
import { getUserId, isPrimaryUser, userIdByEmail, userNameById } from "@/lib/user";
import { authRequired, SESSION_COOKIE, verifySession } from "@/lib/session";

type Session = {
  user: { id: string; name: string; email: string; primary: boolean };
};

export async function auth(): Promise<Session | null> {
  const primaryId = await getUserId();
  if (!primaryId) return null; // no user in DB yet · graceful degradation
  let email = (process.env.USER_EMAIL ?? "ali@control.center").split(",")[0].trim().toLowerCase();
  let userId = primaryId;
  if (authRequired()) {
    const h = await headers();
    const keyOk = !!process.env.APP_KEY && h.get("x-app-key") === process.env.APP_KEY;
    if (keyOk) {
      const as = h.get("x-as-email");
      if (as) {
        const id = await userIdByEmail(as);
        if (!id) return null;
        userId = id; email = as.toLowerCase();
      }
    } else {
      const c = await cookies();
      const s = await verifySession(c.get(SESSION_COOKIE)?.value);
      if (!s) return null;
      const id = await userIdByEmail(s.e);
      if (!id) return null;
      userId = id; email = s.e;
    }
  }
  const primary = userId === primaryId;
  const name = primary ? "Ali" : (await userNameById(userId)) ?? "";
  return { user: { id: userId, name, email, primary } };
}

/** The signed-in session only when it is Ali's · the sections and endpoints that are his alone. */
export async function authPrimary(): Promise<Session | null> {
  const s = await auth();
  if (!s) return null;
  return (await isPrimaryUser(s.user.id)) ? s : null;
}

/** Kept for import compatibility. */
export const signIn  = async () => {};
export const signOut = async () => {};
