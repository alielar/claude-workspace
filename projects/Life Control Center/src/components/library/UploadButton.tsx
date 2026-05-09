"use client";

/**
 * Client component — handles PDF file selection and upload.
 * Wrapped in a label so the hidden file input is clickable.
 */

import { Upload } from "lucide-react";

export default function UploadButton({ bookId }: { bookId: number }) {
  return (
    <label
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
      title="Upload PDF"
    >
      <Upload size={12} /> Upload
      <input
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append("file", file);
          form.append("bookId", String(bookId));
          await fetch("/api/library/upload", { method: "POST", body: form });
          window.location.reload();
        }}
      />
    </label>
  );
}
