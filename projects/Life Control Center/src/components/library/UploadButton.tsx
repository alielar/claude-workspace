"use client";

/**
 * PDF upload button for a specific book.
 * Shows upload progress, file-size warning, and error state.
 * Calls onDone() after a successful upload so the parent can refetch.
 */

import { useState } from "react";

const MAX_MB = 30; // Warn above this size; Turso can handle up to ~50 MB per row

export default function UploadButton({
  bookId,
  onDone,
}: {
  bookId: number;
  onDone?: () => void;
}) {
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Warn about very large files before uploading
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_MB) {
      setErrorMsg(`File is ${mb.toFixed(0)} MB. Max ${MAX_MB} MB.`);
      setState("error");
      return;
    }

    setState("uploading");
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bookId", String(bookId));

      const res = await fetch("/api/library/upload", { method: "POST", body: form });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Upload failed");
      }

      setState("idle");
      onDone?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }

    // Reset input so the same file can be re-selected after an error
    e.target.value = "";
  }

  const uploading = state === "uploading";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <label
        className="cc-btn"
        style={{
          fontSize: 12,
          padding: "7px 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: uploading ? "wait" : "pointer",
          opacity: uploading ? 0.6 : 1,
          pointerEvents: uploading ? "none" : "auto",
        }}
        title="Upload PDF for this book"
      >
        {uploading ? (
          // Minimal spinner using CSS animation
          <span style={{
            display: "inline-block",
            width: 11,
            height: 11,
            border: "2px solid var(--ink-4)",
            borderTopColor: "var(--cyan)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }} />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        )}
        {uploading ? "Uploading…" : "Upload PDF"}
        <input
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {state === "error" && (
        <div style={{ fontSize: 10.5, color: "var(--neg)", maxWidth: 160, textAlign: "right", lineHeight: 1.4 }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}
