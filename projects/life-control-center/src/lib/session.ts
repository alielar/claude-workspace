/**
 * Signed session cookie — works in the proxy (edge) and in route handlers.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET)).
 * Payload: { e: email, i: issued ms, x: expires ms }. Lives 400 days (the browser maximum),
 * re-issued by the proxy when it is older than 30 days — so one sign-in lasts for good on
 * a phone that opens the app regularly.
 */

export const SESSION_COOKIE = "ali_session";
export const SESSION_DAYS = 400;
const REISSUE_AFTER_MS = 30 * 86400000;

export type SessionPayload = { e: string; i: number; x: number };

/** Login is enforced only when all three are configured. */
export function authRequired(): boolean {
  return !!(process.env.AUTH_REQUIRED === "1" && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(process.env.AUTH_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(email: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = { e: email.toLowerCase(), i: now, x: now + SESSION_DAYS * 86400000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, now = Date.now()): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as SessionPayload;
    if (typeof p.e !== "string" || typeof p.x !== "number" || p.x < now) return null;
    return p;
  } catch { return null; }
}

export function shouldReissue(p: SessionPayload, now = Date.now()): boolean {
  return now - p.i > REISSUE_AFTER_MS;
}

export function sessionCookie(token: string) {
  return { name: SESSION_COOKIE, value: token, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86400 };
}
