"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body style={{ background: "#0a0a0f", margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            color: "#fff",
          }}
        >
          <p style={{ fontSize: "48px", fontWeight: "bold", color: "#f87171" }}>!</p>
          <p style={{ fontSize: "18px", fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", maxWidth: "400px", textAlign: "center" }}>
            {error.message ?? "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                borderRadius: "12px",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
