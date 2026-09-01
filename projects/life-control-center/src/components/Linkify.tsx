"use client";

/**
 * Linkify — renders URLs inside any user text as real tappable links.
 * Used everywhere user-written text is displayed: to-do titles, list items,
 * checklist steps. Links always open externally (spec gate 6) and stop the
 * tap from also triggering the row underneath.
 */

export const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function shortLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function Linkify({ text }: { text: string }) {
  if (!/https?:\/\//.test(text)) return <>{text}</>;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer"
            onClick={stop} onTouchEnd={stop}
            style={{ color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 2, overflowWrap: "anywhere" }}>
            {shortLabel(p)}
          </a>
        ) : (
          p
        )
      )}
    </>
  );
}

/** Compact tappable chips for every URL found in a block of text — shown under
 * textareas (task notes, docs), where the text itself cannot hold live links. */
export function LinkChips({ text }: { text: string | null }) {
  const urls = Array.from(new Set((text ?? "").match(URL_RE) ?? [])).slice(0, 8);
  if (!urls.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" onClick={stop}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%",
            minHeight: 36, padding: "0 12px", borderRadius: 10, fontSize: 14,
            border: "1px solid var(--line-hi)", background: "var(--fill-1)",
            color: "var(--violet)", textDecoration: "none",
          }}>
          <span aria-hidden>↗</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{shortLabel(u)}</span>
        </a>
      ))}
    </div>
  );
}
