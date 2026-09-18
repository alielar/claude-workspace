"use client";

/**
 * /todo · the To-do tab (spec §4.5 + §7c item 7).
 *
 * Three segments at the top, remembered on the phone:
 *   Personal · Work · tasks: buckets (Overdue · Today · Evening · Tomorrow · This week · then folded
 *     Next week · Next month · Later · Someday),
 *     one-line quick add with natural-language dates, detail sheet, one-tap defer, swipe to delete.
 *   Docs · things to KEEP, not do (spec §7c item 7): notes and running lists.
 *     No checkboxes, no buckets, no nagging. Type a name → straight into the editor. Pin the ones
 *     you reach for; search finds the rest (titles and content). A list can carry one optional
 *     reminder (date + time) · then it behaves like a reminder: Today card, badge, notifications.
 *
 * Works offline; the home-screen badge shows what's due today.
 */

import Link from "next/link";
import { createPortal } from "react-dom";
import { Linkify } from "@/components/Linkify";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { NotesPreview, SubtaskList } from "./notes";
import { Sheet, ListSheet, openPicker } from "./sheet";
import { useTodos } from "@/lib/todo/useTodos";
import { newTodoId } from "@/lib/todo/types";
import { checklistToday, dayPart } from "@/lib/checklist/day";
import { playDoneSound } from "@/lib/todo/celebrate";
import {
  addDays, AREAS, badgeCount, bucketOf, fmtDue, isSleeping, parseQuickAdd, sortTodos,
  docFormat, taskFormat, parseSubtasks, parseSections,
  type Area, type Bucket, type Priority, type Todo,
} from "@/lib/todo/types";

const SEGMENTS: { key: Area; label: string }[] = [...AREAS, { key: "list", label: "Docs" }];

// Far buckets are folded by default (Ali 2026-09-11: "Upcoming" was one lump);
// a task moves up into This week → Tomorrow → Today on its own as the date nears.
const BUCKETS: { key: Bucket; label: string; color: string; folded?: boolean; dated?: boolean }[] = [
  { key: "overdue",   label: "Overdue",      color: "var(--neg)",    dated: true },
  { key: "today",     label: "Today",        color: "var(--violet)" },
  { key: "evening",   label: "This evening", color: "var(--cyan)" },
  { key: "tomorrow",  label: "Tomorrow",     color: "var(--ink-2)" },
  { key: "week",      label: "This week",    color: "var(--ink-2)",  dated: true },
  { key: "nextWeek",  label: "Next week",    color: "var(--ink-3)",  dated: true, folded: true },
  { key: "nextMonth", label: "Next month",   color: "var(--ink-3)",  dated: true, folded: true },
  { key: "later",     label: "Later",        color: "var(--ink-3)",  dated: true, folded: true },
  // Someday folds too (Ali 2026-09-12) · closed by default, and once opened it stays
  // open until closed again (openGroups is remembered on the phone).
  { key: "someday",   label: "Someday",      color: "var(--ink-3)",  folded: true },
];

const PRIO_COLOR: Record<Priority, string> = { 0: "transparent", 1: "var(--warn)", 2: "var(--neg)" };

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
    const l = raw.replace(/^- \[[ xX]\] /, "").replace(/^- /, "").replace(/^\d+\. /, "").replace(/[*_]/g, "").trim();
    if (l) return l;
  }
  return null;
}

// ─── Swipe left to delete (shared by task rows and list rows) ─────────────────

function useSwipeDelete(onDelete: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: offset, active: false }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; } // vertical scroll wins
      g.active = true; setDragging(true);
    }
    setOffset(Math.min(0, Math.max(-170, g.base + dx)));
  };
  const onTouchEnd = () => {
    const g = gesture.current; gesture.current = null; setDragging(false);
    if (!g || !g.active) return;
    setOffset((o) => {
      if (o < -140) { onDelete(); return 0; }
      return o < -48 ? -88 : 0;
    });
  };
  return {
    offset,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    style: {
      background: "var(--bg-card)", position: "relative", touchAction: "pan-y",
      transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.18s ease",
    } as React.CSSProperties,
  };
}

function SwipeWrap({ swipe, onDelete, children }: { swipe: ReturnType<typeof useSwipeDelete>; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--line)" }} className="todo-row-wrap">
      <button onClick={onDelete} tabIndex={-1} aria-label="Delete"
        style={{ position: "absolute", inset: "0 0 0 auto", width: 96, border: "none", background: "var(--neg)", color: "#fff", fontSize: 15, fontWeight: 600, font: "inherit", cursor: "pointer", opacity: swipe.offset < -10 ? 1 : 0 }}>
        Delete
      </button>
      {children}
    </div>
  );
}

// One tap must open a date/time picker. Left alone, the first tap on iOS often
// only moves focus (or dismisses the keyboard) and the wheel needs a second or
// third tap · showPicker() opens it straight from the tap.
// ─── Task row ─────────────────────────────────────────────────────────────────

/** "HH:00" one hour from now (23:30 late at night) · the Later picker's starting value. */
function nextFullHour(): string {
  const h = new Date().getHours() + 1;
  return h > 23 ? "23:30" : `${String(h).padStart(2, "0")}:00`;
}

function Row({ t, today, showDate, onToggle, onOpen, onNotes, onDefer, onLater, onDelete }: {
  t: Todo; today: string; showDate: boolean;
  onToggle: () => void; onOpen: () => void; onNotes: (notes: string | null) => void; onDefer?: () => void; onLater?: (time: string) => void; onDelete: () => void;
}) {
  const done = t.doneAt !== null;
  const swipe = useSwipeDelete(onDelete);
  // Ticking should feel rewarding: chime + pop + strike-through sweep, then the
  // row folds away and the real state change lands. Un-ticking stays instant.
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimer = useRef<number | null>(null);
  useEffect(() => () => { if (celebrateTimer.current) clearTimeout(celebrateTimer.current); }, []);
  const tick = () => {
    if (done) { onToggle(); return; }
    if (celebrating) return;
    setCelebrating(true);
    playDoneSound();
    celebrateTimer.current = window.setTimeout(() => { setCelebrating(false); onToggle(); }, 900);
  };
  const showDone = done || celebrating;
  // Notes live under the row (Ali 2026-09-12): the first three lines, tap for all of it;
  // or, when the task's notes are Subtasks, real tick boxes right here.
  const subtasks = taskFormat(t) === "checklist" && t.notes ? parseSubtasks(t.notes) : null;
  const [peek, setPeek] = useState(false); // ≡ icon: tap opens the whole note, tap closes (phone and laptop alike)
  const sub = [
    showDate && t.dueDate ? fmtDue(t.dueDate, today) : null,
    t.dueTime,
    subtasks && subtasks.length ? `${subtasks.filter((s) => s.done).length}/${subtasks.length}` : null,
    t.evening && !showDate && t.dueDate === today ? null : t.evening && t.dueDate ? "evening" : null,
    t.project ? `#${t.project}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SwipeWrap swipe={swipe} onDelete={onDelete}>
    <div className={`todo-row${celebrating ? " cc-done-row" : ""}`} {...swipe.handlers}
      style={{ display: "grid", gridTemplateColumns: `auto 1fr${t.notes && !subtasks ? " auto" : ""}${onLater && !done ? " auto" : ""}${onDefer && !done ? " auto" : ""}`, alignItems: "center", paddingRight: 8, ...swipe.style }}>
      <button onClick={tick} aria-label={done ? "Mark not done" : "Mark done"} aria-pressed={showDone}
        style={{ width: 48, minHeight: 54, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span aria-hidden className={celebrating ? "cc-done-pop" : undefined} style={{ position: "relative", width: 24, height: 24, borderRadius: 8, border: `2px solid ${showDone ? "transparent" : t.priority ? PRIO_COLOR[t.priority] : "var(--line-strong)"}`, background: showDone ? "var(--pos)" : "var(--fill-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
          {showDone && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          {celebrating && <span className="cc-done-ring" />}
        </span>
      </button>
      <button onClick={onOpen} style={{ minHeight: 54, padding: "8px 4px 8px 0", background: "transparent", border: "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", minWidth: 0, WebkitTapHighlightColor: "transparent" }}>
        <span className={celebrating ? "cc-done-strike" : undefined} style={{ display: "inline-block", fontSize: 17, lineHeight: 1.3, color: showDone ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-4)" }}>
          {t.priority === 2 && !done && <span style={{ color: "var(--neg)", marginRight: 6 }}>!!</span>}
          {t.priority === 1 && !done && <span style={{ color: "var(--warn)", marginRight: 6 }}>!</span>}
          <Linkify text={t.title} />
        </span>
        {sub && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, fontFamily: t.dueTime && !showDate ? "var(--f-mono)" : undefined }}>{sub}</span>}
      </button>
      {t.notes && !subtasks && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPeek((p) => !p); }}
          aria-label={peek ? "Close notes" : "Open notes"} aria-expanded={peek} title="Notes"
          style={{ width: 44, minHeight: 54, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
          <span aria-hidden style={{ width: 24, height: 24, borderRadius: 8, border: `1.5px solid ${peek ? "var(--violet)" : "var(--line-strong)"}`, background: peek ? "var(--accent-soft)" : "var(--fill-1)", color: peek ? "var(--violet)" : "var(--ink-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "var(--f-mono)" }}>≡</span>
        </button>
      )}
      {onLater && !done && (
        // "Later today" (Ali 2026-09-11): opens the native time wheel; the reminder
        // comes back at that time, same day.
        <label className="cc-btn cc-btn-ghost" aria-label="Later today" style={{ minHeight: 40, padding: "0 8px", fontSize: 13.5, borderRadius: 10, marginRight: 3, position: "relative", display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          Later
          <input type="time" defaultValue={nextFullHour()} onClick={openPicker} onChange={(e) => { if (e.target.value) onLater(e.target.value); }}
            aria-label="Pick a time for later today" style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", fontSize: 17 }} />
        </label>
      )}
      {onDefer && !done && (
        <button onClick={onDefer} className="cc-btn cc-btn-ghost" aria-label="Move to tomorrow" style={{ minHeight: 40, padding: "0 8px", fontSize: 13.5, borderRadius: 10, marginRight: 2 }}>Tmrw →</button>
      )}
    </div>
    {t.notes && !done && !celebrating && (subtasks || peek) && (
      <div style={{ background: "var(--bg-card)", transform: `translateX(${swipe.offset}px)` }}>
        {subtasks ? <SubtaskList notes={t.notes} onChange={onNotes} /> : <NotesPreview notes={t.notes} />}
      </div>
    )}
    </SwipeWrap>
  );
}

// ─── List row (Lists segment · kept things, no checkbox) ──────────────────────

function ListRow({ t, onOpen, onDelete }: { t: Todo; onOpen: () => void; onDelete: () => void }) {
  const swipe = useSwipeDelete(onDelete);
  const preview = firstLine(t.notes);
  const fmt = docFormat(t);
  const shape = (() => {
    if (fmt === "checklist") { const s = parseSubtasks(t.notes); return s.length ? `${s.length} open` : null; }
    if (fmt === "sections" || fmt === "accordion") { const n = parseSections(t.notes).filter((s) => s.title !== null).length; return n ? `${n} section${n === 1 ? "" : "s"}` : preview; }
    if (fmt === "list") { const n = (t.notes?.match(/^- /gm) ?? []).length; return n ? `${n} item${n === 1 ? "" : "s"}` : null; }
    return preview;
  })();
  const sub = [
    t.priority > 0 ? "Pinned" : null,
    t.dueDate ? `remind ${fmtDue(t.dueDate, checklistToday())}${t.dueTime ? ` ${t.dueTime}` : ""}` : null,
    t.project ? `#${t.project}` : null,
    shape,
    fmtAgo(t.updatedAt),
  ].filter(Boolean).join(" · ");

  return (
    <SwipeWrap swipe={swipe} onDelete={onDelete}>
      <button onClick={onOpen} className="todo-row" {...swipe.handlers}
        style={{ display: "grid", gridTemplateColumns: "1fr", alignItems: "center", width: "100%", minHeight: 58, padding: "8px 16px", border: "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", WebkitTapHighlightColor: "transparent", ...swipe.style }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
          <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub || "empty · tap to write"}</span>
        </span>
      </button>
    </SwipeWrap>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodoPage() {
  // true only on the client after hydration (the quick-add bar is portalled into <body>)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = checklistToday(now);
  const eveningNow = dayPart(now) === "evening";

  const { data, loading, stale, upsert, toggleDone, remove } = useTodos(today);
  const all = useMemo(() => (data?.todos ?? []).filter((t) => !t.deleted), [data]);

  const [text, setText] = useState("");
  const [area, setAreaState] = useState<Area>("personal");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    try { const a = localStorage.getItem("cc-todo-area"); if (a === "work" || a === "list") setAreaState(a); } catch { /* ignore */ }
  }, []);
  const setArea = (a: Area) => { setAreaState(a); setText(""); setFilter(null); try { localStorage.setItem("cc-todo-area", a); } catch { /* ignore */ } };
  const isLists = area === "list";
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Todo | null>(null);
  const [draft, setDraft] = useState<Todo | null>(null); // new entry being composed in a sheet
  const [showDone, setShowDone] = useState(false);
  const [showVault, setShowVault] = useState(false);
  // Folded buckets (Next week · Next month · Later · Someday): closed by default, an
  // opened one stays open across visits until closed (localStorage cc-todo-open-groups).
  const [openGroups, setOpenGroupsState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    try { const raw = JSON.parse(localStorage.getItem("cc-todo-open-groups") ?? "null"); if (raw && typeof raw === "object") setOpenGroupsState(raw); } catch { /* ignore */ }
  }, []);
  const setOpenGroups = (fn: (o: Record<string, boolean>) => Record<string, boolean>) => {
    setOpenGroupsState((o) => { const next = fn(o); try { localStorage.setItem("cc-todo-open-groups", JSON.stringify(next)); } catch { /* ignore */ } return next; });
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (!isLists && text.trim() ? parseQuickAdd(text, today) : null), [text, today, isLists]);
  const projects = useMemo(() => [...new Set(all.filter((t) => (t.area ?? "personal") === area).map((t) => t.project).filter((p): p is string => !!p))].sort(), [all, area]);

  // "+" opens the full sheet so every detail is set at creation. For tasks the typed
  // line is already parsed in ("fri 9am #money !!"); for lists the line is the name.
  const submit = () => {
    const ts = Date.now();
    setDraft({
      clientId: newTodoId(),
      title: isLists ? text.trim() : parsed?.title ?? "",
      area, notes: null,
      project: isLists ? filter : parsed?.project ?? filter,
      dueDate: isLists ? null : parsed?.dueDate ?? null,
      dueTime: isLists ? null : parsed?.dueTime ?? null,
      evening: !isLists && (parsed?.evening ?? false),
      someday: !isLists && (parsed?.someday ?? false),
      priority: isLists ? 0 : parsed?.priority ?? 0,
      sortOrder: ts, doneAt: null, createdAt: ts, updatedAt: ts, deleted: false,
    });
  };

  // The Vault: items sleeping until a future wake date · out of every list, one place to browse.
  const sleeping = all.filter((t) => !t.doneAt && isSleeping(t, today)).sort((a, b) => (a.wakeDate ?? "").localeCompare(b.wakeDate ?? ""));
  const inArea = all.filter((t) => (t.area ?? "personal") === area && !isSleeping(t, today));
  const visible = filter ? inArea.filter((t) => t.project === filter) : inArea;

  // Tasks (Personal / Work)
  const openTasks = visible.filter((t) => !t.doneAt);
  const doneToday = visible.filter((t) => t.doneAt !== null).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const groups = BUCKETS.map((b) => ({ ...b, items: openTasks.filter((t) => bucketOf(t, today, eveningNow) === b.key).sort(sortTodos) }));
  // "due today" = the badge rule (overdue + today, evening included), so the header, the
  // home-screen badge and the widget all say the same number (Ali 2026-09-14).
  const dueCount = badgeCount(visible, today);

  // Lists · pinned first, then most recently touched; search covers names and content.
  const q = query.trim().toLowerCase();
  const lists = (isLists ? visible : [])
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.priority > 0 ? 1 : 0) - (a.priority > 0 ? 1 : 0) || b.updatedAt - a.updatedAt);

  const previewBits = parsed ? [
    parsed.someday ? "Someday" : parsed.dueDate ? fmtDue(parsed.dueDate, today) : null,
    parsed.dueTime, parsed.evening && !parsed.someday ? "evening" : null,
    parsed.project ? `#${parsed.project}` : filter ? `#${filter}` : null,
    parsed.priority === 2 ? "urgent" : parsed.priority === 1 ? "important" : null,
  ].filter(Boolean) : [];

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, margin: "0 auto", width: "100%", paddingBottom: 84 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>To-do</h1>
          <div className="sub">
            {loading && !data ? "…"
              : isLists ? `${inArea.length} doc${inArea.length === 1 ? "" : "s"} kept`
              : `${dueCount === 0 ? "nothing due today" : `${dueCount} due today`}${openTasks.length ? ` · ${openTasks.length} open` : ""}`}
            {stale ? " · saved copy" : ""}
          </div>
        </div>
      </div>

      {/* Personal · Work · Lists */}
      <div role="tablist" aria-label="List" style={{ display: "grid", gridTemplateColumns: `repeat(${SEGMENTS.length}, 1fr)`, gap: 4, padding: 4, borderRadius: 14, background: "var(--fill-1)" }}>
        {SEGMENTS.map((a) => {
          const on = a.key === area;
          const n = badgeCount(all, today, a.key);
          return (
            <button key={a.key} role="tab" aria-selected={on} onClick={() => setArea(a.key)}
              className={a.key === "list" ? "seg-docs" : undefined}
              style={{ minHeight: 44, borderRadius: 10, border: "none", cursor: "pointer", font: "inherit", fontSize: 16, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
              {a.label}
              {n > 0 && <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet)" : "var(--fill-3)", color: on ? "var(--on-accent)" : "var(--ink-2)" }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* Tag chips · tasks use projects, docs use tags; same mechanism */}
      {projects.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
          {[null, ...projects].map((p) => (
            <button key={p ?? "all"} onClick={() => setFilter(p)} className="cc-pill" style={{ minHeight: 34, padding: "0 12px", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap", background: filter === p ? "var(--accent-soft)" : undefined, borderColor: filter === p ? "var(--violet)" : undefined, color: filter === p ? "var(--ink)" : undefined }}>
              {p ? `#${p}` : "All"}
            </button>
          ))}
        </div>
      )}

      {/* ── Docs segment ── */}
      {isLists && (
        <>
          {/* Passwords · a doc type of its own: end-to-end encrypted, its own page (2026-09-12) */}
          <Link href="/vault" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 500 }}>Passwords</span>
                <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>Logins, API keys, recovery codes · encrypted on this phone</span>
              </span>
              <span style={{ color: "var(--ink-3)", fontSize: 15 }}>›</span>
            </div>
          </Link>
          {/* Birthdays · names and dates worth remembering, with a push a few days ahead (2026-09-19) */}
          <Link href="/birthdays" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 6v3M8 6v3M16 6v3" /><path d="M4 21v-7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7" /><path d="M4 21h16" /><path d="M4 15c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0" /></svg>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 500 }}>Birthdays</span>
                <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>Names and dates worth remembering · reminds you ahead</span>
              </span>
              <span style={{ color: "var(--ink-3)", fontSize: 15 }}>›</span>
            </div>
          </Link>
          {inArea.length > 3 && (
            <input className="cc-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docs…" style={{ fontSize: 16, minHeight: 44, borderRadius: 12 }} />
          )}

          {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1].map((i) => <div key={i} className="cc-skeleton" style={{ height: 48 }} />)}</div></div>}

          {data && lists.length === 0 && (
            <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
              {q ? `Nothing matches “${query}”.` : "Notes and running lists to keep, not to do. Type a name below and start writing."}
            </div></div>
          )}

          {lists.length > 0 && (
            <section className="cc-card">
              <div className="cc-card-list">
                {lists.map((t) => <ListRow key={t.clientId} t={t} onOpen={() => setOpen(t)} onDelete={() => remove(t)} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Tasks segments ── */}
      {!isLists && (
        <>
          {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}

          {data && openTasks.length === 0 && (
            <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
              Nothing on the {area} list{filter ? ` in #${filter}` : ""}. Type below to add one.
            </div></div>
          )}

          {groups.filter((g) => g.items.length > 0).map((g) => {
            const folded = !!g.folded && !openGroups[g.key];
            const nowish = g.key === "overdue" || g.key === "today" || g.key === "evening";
            return (
              <section key={g.key} className="cc-card">
                {g.folded ? (
                  <button onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !o[g.key] }))} className="cc-card-head" aria-expanded={!folded}
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: folded ? "none" : undefined, color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                    <span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length} {folded ? "▾" : "▴"}</span>
                  </button>
                ) : (
                  <div className="cc-card-head"><span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length}</span></div>
                )}
                {!folded && (
                  <div className="cc-card-list">
                    {g.items.map((t) => (
                      <Row key={t.clientId} t={t} today={today} showDate={!!g.dated}
                        onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onNotes={(n) => upsert({ ...t, notes: n })} onDelete={() => remove(t)}
                        onDefer={nowish ? () => upsert({ ...t, dueDate: addDays(today, 1), evening: false }) : undefined}
                        onLater={nowish ? (time) => upsert({ ...t, dueDate: today, dueTime: time, evening: false }) : undefined} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {doneToday.length > 0 && (
            <section className="cc-card">
              <button onClick={() => setShowDone((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showDone ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                <span className="title">Done</span><span className="tail">{doneToday.length} {showDone ? "▴" : "▾"}</span>
              </button>
              {showDone && <div className="cc-card-list">{doneToday.map((t) => <Row key={t.clientId} t={t} today={today} showDate={false} onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onNotes={(n) => upsert({ ...t, notes: n })} onDelete={() => remove(t)} />)}</div>}
            </section>
          )}
        </>
      )}

      {/* Vault · far-future items, all areas together */}
      {sleeping.length > 0 && (
        <section className="cc-card">
          <button onClick={() => setShowVault((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showVault ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span className="title">Vault</span><span className="tail">{sleeping.length} sleeping {showVault ? "▴" : "▾"}</span>
          </button>
          {showVault && (
            <div style={{ padding: "0 0 6px" }}>
              {sleeping.map((t) => (
                <button key={t.clientId} onClick={() => setOpen(t)}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", width: "100%", minHeight: 54, padding: "8px 16px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)", marginTop: 1 }}>
                      {(t.area ?? "personal") === "list" ? "doc" : t.area === "work" ? "work" : "personal"} · wakes {new Date(`${t.wakeDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-4)" }}>›</span>
                </button>
              ))}
              <div style={{ padding: "10px 16px 4px", fontSize: 13, color: "var(--ink-4)" }}>On its wake day an item comes back to your normal lists with one notification.</div>
            </div>
          )}
        </section>
      )}

      {/* Quick add · pinned above the tab bar. Rendered into <body> through a portal (2026-09-14 evening:
          on the laptop the bar sometimes sat 60 px up, mid-page · a fixed box inside the page tree
          followed the page's box instead of the window; from <body> nothing can shift it) · the
          position lives in globals.css `.todo-addbar`. */}
      {mounted && createPortal(
      <form className="todo-addbar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 6 }}>
          {previewBits.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 14, fontFamily: "var(--f-mono)", color: "var(--cyan)" }}>
              {previewBits.map((b) => <span key={b as string}>{b}</span>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input ref={inputRef} className="cc-input" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={isLists ? "New doc…" : filter ? `Add to #${filter}…` : area === "work" ? "Add a work task…" : "Add a task…"}
              enterKeyHint="done" autoComplete="off" style={{ fontSize: 17, minHeight: 48, borderRadius: 14 }} />
            <button type="submit" className="cc-btn cc-btn-primary" style={{ minHeight: 48, minWidth: 48, borderRadius: 14, fontSize: 20, padding: 0 }} aria-label="Add">+</button>
          </div>
        </div>
      </form>, document.body)}

      {open && ((open.area ?? "personal") === "list"
        ? <ListSheet t={open} today={today} tags={projects} onSave={upsert} onDelete={() => remove(open)} onClose={() => setOpen(null)} />
        : <Sheet t={open} today={today} projects={projects} onSave={upsert} onDelete={() => remove(open)} onClose={() => setOpen(null)} />)}
      {draft && (draft.area === "list"
        ? <ListSheet t={draft} today={today} tags={projects} isNew
            onSave={(t) => { upsert(t); setText(""); }}
            onDelete={() => { /* discard the draft */ }}
            onClose={() => setDraft(null)} />
        : <Sheet t={draft} today={today} projects={projects} isNew
            onSave={(t) => { upsert(t); setText(""); }}
            onDelete={() => { /* discard the draft */ }}
            onClose={() => setDraft(null)} />)}

      <style>{`.seg-docs { position: relative; } .seg-docs::before { content: ""; position: absolute; left: -2.75px; top: 8px; bottom: 8px; width: 1.5px; background: var(--line-strong); border-radius: 1px; }
        .todo-row-wrap:last-child { border-bottom: none !important; } .todo-row:active { background: var(--fill-1); }`}</style>
    </div>
  );
}
