import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sessionCookie, signSession } from "@/lib/session";

/** Step 2: Google sends the browser back with a code → exchange → check it's Ali → set the cookie. */
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
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
  const email = (info.email ?? "").toLowerCase();
  if (!email || info.email_verified === false) return fail("profile");

  // Only Ali gets in: the one user in the database (or USER_EMAIL, if set).
  const allowed = new Set<string>();
  if (process.env.USER_EMAIL) allowed.add(process.env.USER_EMAIL.toLowerCase());
  try {
    const rows = await db.select({ email: users.email }).from(users).limit(5);
    for (const r of rows) if (r.email) allowed.add(r.email.toLowerCase());
  } catch { /* fall back to USER_EMAIL only */ }
  if (!allowed.has(email)) return fail("wrong-account");

  const res = NextResponse.redirect(new URL("/today", req.url));
  res.cookies.set(sessionCookie(await signSession(email)));
  res.cookies.set({ name: "ali_oauth_state", value: "", path: "/", maxAge: 0 });
  return res;
}
