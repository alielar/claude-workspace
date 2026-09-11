import Link from "next/link";
import { ARCHIVE } from "@/lib/archive";

/** /archive · the old modules, still working, out of the way. */
export default function ArchivePage() {
  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Archive</h1>
          <div className="sub">Kept, not deleted. These pages still work but are built for desktop.</div>
        </div>
      </div>

      <div className="cc-card">
        {ARCHIVE.map((m, i) => (
          <Link
            key={m.href}
            href={m.href}
            style={{
              display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
              padding: "14px 16px", textDecoration: "none", color: "inherit",
              borderBottom: i < ARCHIVE.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{m.label}</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>{m.what}</span>
              {m.comeback && (
                <span style={{ display: "block", fontSize: 13, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)" }}>
                  Comes back: {m.comeback}
                </span>
              )}
            </span>
            <span style={{ color: "var(--ink-4)" }}>›</span>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 14, color: "var(--ink-4)", lineHeight: 1.5 }}>
        Everything here is one line away from returning to the main navigation.
      </p>
    </div>
  );
}
