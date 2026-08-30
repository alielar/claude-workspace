import Link from "next/link";

/**
 * /login — the only page shown to someone who isn't signed in.
 * One button. After a successful sign-in the cookie lasts 400 days and is renewed on use.
 */

const ERRORS: Record<string, string> = {
  "wrong-account": "That Google account isn't the one this app belongs to. Try again with your own.",
  "state": "The sign-in didn't complete. Please try again.",
  "token": "Google didn't accept the sign-in. Please try again.",
  "profile": "Couldn't read your Google account. Please try again.",
  "not-configured": "Sign-in isn't set up on the server yet.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px", background: "var(--bg)", color: "var(--ink)" }}>
      <div style={{ width: "min(360px, 100%)", display: "grid", gap: 20, textAlign: "center" }}>
        <svg width="88" height="88" viewBox="0 0 512 512" aria-hidden style={{ margin: "0 auto", borderRadius: 22 }}>
          <rect width="512" height="512" fill="#0B0B10" />
          <defs><clipPath id="a"><path d="M256 130 L150 400 L362 400 Z" /></clipPath></defs>
          <circle cx="256" cy="330" r="70" fill="#8B7CF0" clipPath="url(#a)" />
          <g stroke="#FFFFFF" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M120 404 L256 106 L392 404" /><path d="M182 330 L330 330" />
          </g>
        </svg>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "0.18em" }}>A L I</h1>
          <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--ink-3)" }}>Private. Sign in once — it stays signed in.</p>
        </div>
        {error && <p role="alert" style={{ margin: 0, fontSize: 15, color: "var(--neg)", lineHeight: 1.45 }}>{ERRORS[error] ?? "Something went wrong. Please try again."}</p>}
        <a href="/api/auth/google" className="cc-btn cc-btn-primary" style={{ minHeight: 52, fontSize: 17, borderRadius: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#fff" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z"/></svg>
          Sign in with Google
        </a>
        <Link href="/offline" style={{ fontSize: 14, color: "var(--ink-4)", textDecoration: "none" }}>Offline? Your saved copy still opens.</Link>
      </div>
    </main>
  );
}
