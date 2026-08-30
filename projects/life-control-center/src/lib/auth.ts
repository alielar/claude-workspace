/**
 * Auth — one user, optional Google sign-in.
 *
 * All API routes call `const session = await auth()` and read `session.user.id`.
 *  - Login off (AUTH_REQUIRED unset): always resolves to the one DB user (as before).
 *  - Login on: resolves only with a valid session cookie, or the `x-app-key` header
 *    (used by the home-screen widget and the reminder pinger). Otherwise null → 401.
 */

import { cookies, headers } from "next/headers";
import { getUserId } from "@/lib/user";
import { authRequired, SESSION_COOKIE, verifySession } from "@/lib/session";

type Session = {
  user: { id: string; name: string; email: string };
};

export async function auth(): Promise<Session | null> {
  const userId = await getUserId();
  if (!userId) return null; // no user in DB yet — graceful degradation
  let email = process.env.USER_EMAIL ?? "ali@control.center";
  if (authRequired()) {
    const h = await headers();
    const keyOk = !!process.env.APP_KEY && h.get("x-app-key") === process.env.APP_KEY;
    if (!keyOk) {
      const c = await cookies();
      const s = await verifySession(c.get(SESSION_COOKIE)?.value);
      if (!s) return null;
      email = s.e;
    }
  }
  return { user: { id: userId, name: "Ali", email } };
}

/** Kept for import compatibility. */
export const signIn  = async () => {};
export const signOut = async () => {};
