/**
 * Auth — single-user bypass.
 *
 * Replaces NextAuth entirely. auth() is a drop-in for all existing API routes
 * and server components — they all call `const session = await auth()` and
 * read `session.user.id`, which now resolves to the one DB user.
 *
 * signIn / signOut are no-ops (kept for import compatibility if anything still
 * references them, though they should be removed from UI components).
 */

import { getUserId } from "@/lib/user";

type Session = {
  user: { id: string; name: string; email: string };
};

/** Drop-in replacement for NextAuth's auth(). Always resolves to the single user. */
export async function auth(): Promise<Session | null> {
  const userId = await getUserId();
  if (!userId) return null; // no user in DB yet — graceful degradation
  return {
    user: {
      id:    userId,
      name:  "Ali",
      email: process.env.USER_EMAIL ?? "ali@control.center",
    },
  };
}

/** Stub handlers — the /api/auth/[...nextauth] route is kept for build compat. */
export const handlers = {
  GET:  () => Response.redirect("/dashboard"),
  POST: () => Response.redirect("/dashboard"),
};

/** No-op stubs kept so any stray imports don't break the build. */
export const signIn  = async () => {};
export const signOut = async () => {};
