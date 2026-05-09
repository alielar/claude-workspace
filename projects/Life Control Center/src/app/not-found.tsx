import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "var(--bg-base)" }}
    >
      <p className="text-6xl font-bold" style={{ color: "var(--accent)" }}>404</p>
      <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Page not found</p>
      <Link
        href="/dashboard"
        className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
