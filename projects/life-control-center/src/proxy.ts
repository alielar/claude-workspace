/**
 * Proxy (Next.js 16 middleware) · the login gate.
 *
 * Off by default (AUTH_REQUIRED unset): everything passes, as before.
 * On: pages without a valid session cookie go to /login; API calls get 401,
 * unless they carry the widget/pinger key (`x-app-key`). Public: /login, /api/auth/*,
 * the offline page, the service worker, manifest, icons and the cron/pinger endpoints
 * (those check their own secrets).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authRequired, SESSION_COOKIE, sessionCookie, shouldReissue, signSession, verifySession } from "@/lib/session";

const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/offline", "/api/reminders/tick", "/api/news/cron", "/api/checklist/suggestions/cron", "/api/workouts/coach-cron", "/api/sleep/ingest"];
const PUBLIC_EXACT = new Set(["/sw.js", "/widget.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.ico", "/robots.txt"]);

export default async function proxy(req: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || /^\/(icon|apple-icon)[^/]*$/.test(pathname)) {
    return NextResponse.next();
  }
  if (req.headers.get("x-app-key") && req.headers.get("x-app-key") === process.env.APP_KEY) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    if (shouldReissue(session)) res.cookies.set(sessionCookie(await signSession(session.e)));
    return res;
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
