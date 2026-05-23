import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "var(--bg)",
    }}>
      <div style={{
        fontSize: 80, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
        background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
        color: "transparent", filter: "drop-shadow(0 0 24px rgba(124,77,255,0.20))",
      }}>
        404
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-3)", letterSpacing: "0.02em" }}>
        Page not found
      </p>
      <Link
        href="/dashboard"
        style={{
          marginTop: 8, padding: "10px 20px", borderRadius: 8,
          background: "#E8E8F0", color: "#06060B",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
