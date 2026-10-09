import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sessionCookie, signSession } from "@/lib/session";
import { ensureUserForEmail } from "@/lib/user";

/**
 * Step 2: Google sends the browser back with a code → exchange → check the address is allowed →
 * set the cookie. ALLOWED = `USER_EMAIL` (Ali, comma-separated) + `GUEST_EMAILS` (the people Ali
 * invited, comma-separated · his father since 2026-10-09) + every row already in `users`.
 * A first sign-in creates the account (empty: nothing of Ali's is copied) and lands on /welcome,
 * the onboarding; later sign-ins go to /today.
 */
export async function GET(req: NextRequest) {
  const fail = (why: string) => NextResponse.redirect(new URL(`/login?error=${why}`, req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("ali_oauth_state")?.value) return fail("state");

  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("not-configured");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: new URL("/api/auth/callback/google", req.url).toString(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("token");
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) return fail("token");

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!infoRes.ok) return fail("profile");
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; given_name?: string };
  const email = (info.email ?? "").toLowerCase();
  if (!email || info.email_verified === false) return fail("profile");

  if (!(await isAllowed(email))) return fail("wrong-account");

  let created = false;
  try {
    const r = await ensureUserForEmail(email, info.given_name || info.name || null);
    created = r.created;
  } catch { return fail("profile"); }

  const res = NextResponse.redirect(new URL(created ? "/welcome" : "/today", req.url));
  res.cookies.set(sessionCookie(await signSession(email)));
  res.cookies.set({ name: "ali_oauth_state", value: "", path: "/", maxAge: 0 });
  return res;
}

export async function isAllowed(email: string): Promise<boolean> {
  const allowed = new Set<string>();
  for (const v of [process.env.USER_EMAIL ?? "", process.env.GUEST_EMAILS ?? ""]) {
    for (const e of v.split(",")) if (e.trim()) allowed.add(e.trim().toLowerCase());
  }
  try {
    const rows = await db.select({ email: users.email }).from(users).limit(20);
    for (const r of rows) if (r.email) allowed.add(r.email.toLowerCase());
  } catch { /* fall back to the env lists only */ }
  return allowed.has(email.toLowerCase());
}
