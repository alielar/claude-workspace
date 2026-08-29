import Link from "next/link";

/** Shown by the service worker only when a page was never cached and there is no network. */
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 40 }}>📡</div>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>You&rsquo;re offline</h1>
      <p style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 320 }}>
        This screen hasn&rsquo;t been saved to your phone yet. Today, Stretching, News and Settings still work offline.
      </p>
      <Link href="/today" className="cc-btn cc-btn-primary" style={{ marginTop: 8, textDecoration: "none" }}>
        Go to Today
      </Link>
    </div>
  );
}
