import { NextResponse, type NextRequest } from "next/server";

/** Step 1: send the browser to Google. A random `state` cookie guards the round trip. */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=not-configured", req.url));
  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/callback/google", req.url).toString();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  const res = NextResponse.redirect(u);
  res.cookies.set({ name: "ali_oauth_state", value: state, httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
