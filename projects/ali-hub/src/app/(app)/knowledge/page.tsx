"use client";

/**
 * /knowledge · the things Ali KEEPS, not does (REDESIGN 2026-10-06 · until then the third segment
 * of /todo, `area: "list"` in the same table, nothing changed in how entries are stored).
 *
 *   Search first · one box that reads titles, text and the hidden search words (tagged every Sunday);
 *     a row that matched only through a hidden word says which one.
 *   Passwords and Birthdays are the first two ROWS (their own pages), then every entry with its
 *     shape as an icon: list · checklist · document · link. Pinned first, then the most recently touched.
 *   Laptop: a row opens the entry in a pane beside the list (the same view as the full page, Edit
 *     inside it). Phone: full screen, `/todo/entry/<id>`, as before.
 *   The add bar (portalled, `.todo-addbar`): a name opens the Knowledge sheet, a pasted address
 *     becomes a Link entry. Keyboard on the laptop: / search · n new · j k move · ⏎ open · esc close.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ListSheet, SheetFrame, useKeyboardInset } from "../todo/sheet";
import { EntryView } from "../todo/entry/EntryView";
import { useTodos } from "@/lib/todo/useTodos";
import { useBirthdays } from "@/lib/birthdays/useBirthdays";
import { daysUntil } from "@/lib/birthdays/types";
import { checklistToday } from "@/lib/checklist/day";
import { docFormat, fmtDue, isSleeping, isUrlText, linkOf, linkSource, newTodoId, parseSubtasks, type Todo } from "@/lib/todo/types";

const SHAPE: Record<string, { icon: IconName; label: string }> = {
  list: { icon: "list", label: "List" }, checklist: { icon: "checklist", label: "Checklist" }, doc: { icon: "doc", label: "Document" }, link: { icon: "link", label: "Link" },
};

/** "today" / "yesterday" / "5d ago" / "3w ago" for a ms timestamp. */
function fmtAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
/** First non-empty content line, with list markers stripped · the row preview. */
function firstLine(notes: string | null): string | null {
  if (!notes) return null;
  for (const raw of notes.split("\n")) {
    const l = raw.replace(/^#{1,3} /, "").replace(/^- \[[ xX]\] /, "").replace(/^- /, "").replace(/^\d+\. /, "").replace(/[*_]/g, "").trim();
    if (l) return l;
  }
  return null;
}

/** The laptop (≥ 1000 px) opens entries in a pane; the phone goes full screen. Read once per resize. */
function useLaptop(): boolean {
  const sub = (cb: () => void) => { const m = window.matchMedia("(min-width: 1000px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
  return useSyncExternalStore(sub, () => window.matchMedia("(min-width: 1000px)").matches, () => false);
}

function EntryRow({ t, today, q, cur, onOpen }: { t: Todo; today: string; q: string; cur: boolean; onOpen: () => void }) {
  const fmt = docFormat(t);
  const url = fmt === "link" ? linkOf(t) : null;
  const shape = (() => {
    if (fmt === "checklist") { const s = parseSubtasks(t.notes); return s.length ? `${s.filter((x) => !x.done).length} of ${s.length} open` : null; }
    if (fmt === "list") { const n = (t.notes?.match(/^- /gm) ?? []).length; return n ? `${n} item${n === 1 ? "" : "s"}` : null; }
    if (fmt === "link") return url ? linkSource(url) : "no address";
    return firstLine(t.notes);
  })();
  // A hit through a hidden word says so · the title and text would show it themselves.
  const viaWord = q && !t.title.toLowerCase().includes(q) && !(t.notes ?? "").toLowerCase().includes(q)
    ? (t.keywords ?? "").split(",").map((w) => w.trim()).find((w) => w.toLowerCase().includes(q)) ?? null : null;
  const bits = [
    t.priority > 0 ? "Pinned" : null,
    t.dueDate ? `remind ${fmtDue(t.dueDate, today)}${t.dueTime ? ` ${t.dueTime}` : ""}` : null,
    shape,
    fmtAgo(t.updatedAt),
  ].filter(Boolean) as string[];
  return (
    <button type="button" className={`kn-row${cur ? " cur" : ""}`} data-id={t.clientId} onClick={onOpen}>
      <span className={`kn-ic${t.priority > 0 ? " accent" : ""}`} aria-hidden><Icon name={SHAPE[fmt].icon} size={17} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="kn-t">{t.title}</span>
        <span className="kn-s">{viaWord ? <>found by <mark>{viaWord}</mark> · </> : null}{bits.join(" · ") || "empty · tap to write"}</span>
      </span>
      <Icon name="chevron" size={16} style={{ color: "var(--ink-4)" }} />
    </button>
  );
}

export default function KnowledgePage() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const laptop = useLaptop();
  const router = useRouter();
  const today = checklistToday();
  const { data, loading, stale, upsert, remove } = useTodos(today);
  const { data: bdays } = useBirthdays();
  const entries = useMemo(() => (data?.todos ?? [])
    .filter((t) => !t.deleted && (t.area ?? "personal") === "list" && !isSleeping(t, today))
    .sort((x, y) => (y.priority > 0 ? 1 : 0) - (x.priority > 0 ? 1 : 0) || y.updatedAt - x.updatedAt), [data, today]);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => !q ? entries : entries.filter((t) =>
    t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q) || (t.keywords ?? "").toLowerCase().includes(q)), [entries, q]);

  const [openId, setOpenId] = useState<string | null>(null);  // the laptop pane
  const open = openId ? entries.find((t) => t.clientId === openId) ?? null : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Todo | null>(null);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const kb = useKeyboardInset();

  const openEntry = (t: Todo) => { if (laptop) { setOpenId(t.clientId); setCursor(t.clientId); } else router.push(`/todo/entry/${t.clientId}`); };
  const newEntry = () => {
    const ts = Date.now();
    const pastedLink = isUrlText(text);
    setDraft({
      clientId: newTodoId(), title: pastedLink ? "" : text.trim(), area: "list",
      notes: pastedLink ? text.trim() : null, project: null, ...(pastedLink ? { format: "link" as const } : {}),
      dueDate: null, dueTime: null, evening: false, someday: false, priority: 0,
      sortOrder: ts, doneAt: null, createdAt: ts, updatedAt: ts, deleted: false,
    });
  };

  // Keyboard on the laptop · never while typing or while a sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") { if (openId || draft || editing) return; if (typing) { (el as HTMLElement).blur(); return; } if (cursor) setCursor(null); return; }
      if (typing || draft || editing || document.querySelector(".cc-pal.open")) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "n") { e.preventDefault(); inputRef.current?.focus(); return; }
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = shown.findIndex((t) => t.clientId === cursor);
        const next = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === "j" || e.key === "ArrowDown" ? 1 : -1)))];
        if (next) { setCursor(next.clientId); document.querySelector(`[data-id="${next.clientId}"]`)?.scrollIntoView({ block: "nearest" }); if (openId) setOpenId(next.clientId); }
        return;
      }
      if (e.key === "Enter" && cursor) { const t = shown.find((x) => x.clientId === cursor); if (t) openEntry(t); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nextBday = (bdays?.birthdays ?? []).filter((b) => !b.deleted).map((b) => ({ b, d: daysUntil(b, today) })).sort((x, y) => x.d - y.d)[0] ?? null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640, margin: "0 auto", width: "100%", paddingBottom: 84 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Knowledge</h1>
          <div className="sub">{loading && !data ? "…" : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · passwords · birthdays`}{stale ? " · saved copy" : ""}</div>
        </div>
      </div>

      {/* Search first · titles, text and the hidden words */}
      <label className="kn-search cc-rise">
        <Icon name="search" size={18} />
        <input ref={searchRef} data-local-search type="search" value={query} onChange={(e) => { setQuery(e.target.value); setCursor(null); }} placeholder="Search titles, text and hidden words…" aria-label="Search Knowledge" autoComplete="off" />
        {q ? <button type="button" onClick={() => setQuery("")} aria-label="Clear" style={{ background: "transparent", border: "none", color: "var(--ink-3)", cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}><Icon name="close" size={16} /></button> : <span />}
      </label>

      {/* Passwords · Birthdays · then every entry */}
      <section className="cc-card cc-rise">
        <div className="cc-card-list">
          {!q && (
            <>
              <Link href="/vault" className="kn-row">
                <span className="kn-ic accent" aria-hidden><Icon name="lock" size={17} /></span>
                <span style={{ minWidth: 0 }}><span className="kn-t">Passwords</span><span className="kn-s">end-to-end encrypted · needs the passphrase</span></span>
                <Icon name="chevron" size={16} style={{ color: "var(--ink-4)" }} />
              </Link>
              <Link href="/birthdays" className="kn-row">
                <span className="kn-ic accent" aria-hidden><Icon name="cake" size={17} /></span>
                <span style={{ minWidth: 0 }}><span className="kn-t">Birthdays</span><span className="kn-s">{nextBday ? `next · ${nextBday.b.name} ${nextBday.d === 0 ? "today" : nextBday.d === 1 ? "tomorrow" : `in ${nextBday.d} days`}` : "names and dates worth remembering"}</span></span>
                <Icon name="chevron" size={16} style={{ color: "var(--ink-4)" }} />
              </Link>
            </>
          )}
          {loading && !data && [0, 1, 2].map((i) => <div key={i} style={{ padding: "10px 16px" }}><div className="cc-skeleton" style={{ height: 40 }} /></div>)}
          {data && shown.length === 0 && (
            <div style={{ padding: "14px 16px", fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
              {q ? `Nothing matches “${query}”.` : "Nothing kept yet."}
            </div>
          )}
          {shown.map((t) => <EntryRow key={t.clientId} t={t} today={today} q={q} cur={laptop && cursor === t.clientId} onOpen={() => openEntry(t)} />)}
        </div>
      </section>

      {/* The add bar · pinned above the tab bar, portalled into <body> (`.todo-addbar`) */}
      {mounted && createPortal(
        <form className="todo-addbar" onSubmit={(e) => { e.preventDefault(); newEntry(); }} style={kb > 0 ? ({ "--kb": `${kb}px` } as React.CSSProperties) : undefined}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input ref={inputRef} className="cc-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="New entry or paste a link…" enterKeyHint="done" autoComplete="off" style={{ fontSize: 17, minHeight: 48, borderRadius: 14 }} />
            <button type="button" onClick={newEntry} className="cc-btn cc-btn-primary" style={{ minHeight: 48, minWidth: 48, borderRadius: 14, fontSize: 20, padding: 0 }} aria-label="New entry">+</button>
          </div>
        </form>, document.body)}

      {/* Laptop: the entry in a pane beside the list */}
      {laptop && open && !editing && (
        <SheetFrame label="Entry" onClose={() => setOpenId(null)} fill>
          <div style={{ overflowY: "auto", minHeight: 0, flex: 1, overscrollBehavior: "contain" }}>
            <EntryView t={open} today={today} onSave={upsert} onEdit={() => setEditing(true)} onClose={() => setOpenId(null)} closeKind="pane" />
          </div>
        </SheetFrame>
      )}
      {open && editing && (
        <ListSheet t={open} today={today} onSave={upsert} onDelete={() => { remove(open); setOpenId(null); }} onClose={() => setEditing(false)} />
      )}
      {draft && (
        <ListSheet t={draft} today={today} isNew
          onSave={(t) => { upsert(t); setText(""); if (laptop) setOpenId(t.clientId); else router.push(`/todo/entry/${t.clientId}`); }}
          onDelete={() => { /* discard the draft */ }}
          onClose={() => setDraft(null)} />
      )}
    </div>
  );
}
