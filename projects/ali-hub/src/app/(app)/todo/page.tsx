"use client";

/**
 * /todo · the To-do tab (spec §4.5 + §7c item 7) · REDESIGN 2026-10-06 (the prototype Ali approved).
 *
 * Personal · Work, a two-way switch (in the header on the laptop, under the title on the phone),
 * remembered · on the phone the page follows the finger left / right between them (a real slide,
 * 2026-09-27). Knowledge moved out to /knowledge (the old `?area=list` address forwards there).
 *   Buckets: Overdue · Today always open · Someday open by default · everything else folded by
 *     default, a fold's state is remembered · a group folds with a spring (rows stay mounted, inert).
 *   One-line quick add with natural-language dates, the detail sheet (a pane from the right on the
 *     laptop), one-tap defer. Delete lives in the sheet.
 *   Laptop keyboard: n new · j k move · ⏎ open · space tick · t tomorrow · esc. The cursor row is
 *     marked with the accent on its left edge.
 *   Motion: a tick chimes, strikes and collapses the row; a row born after the first paint (a quick
 *     add, a task landing in its new group) rises in.
 *
 * Works offline; the home-screen badge shows what's due today.
 */

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Linkify } from "@/components/Linkify";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { NotesPreview, SubtaskList } from "./notes";
import { Sheet, openPicker, useKeyboardInset } from "./sheet";
import { useTodos } from "@/lib/todo/useTodos";
import { newTodoId } from "@/lib/todo/types";
import { checklistToday, dayPart } from "@/lib/checklist/day";
import { useLaptop } from "@/lib/useLaptop";
import { playDoneSound } from "@/lib/todo/celebrate";
import {
  addDays, AREAS, badgeCount, bucketOf, fmtDue, isSleeping, parseQuickAdd, sortTodos,
  taskFormat, parseSubtasks,
  type Area, type Bucket, type Priority, type Todo,
} from "@/lib/todo/types";

const SEGMENTS: { key: Area; label: string }[] = AREAS;

// Fold defaults (Ali 2026-09-27): Today and Someday open, every other section closed. Overdue is
// never folded (late work must not hide). A section tapped open or closed stays that way across
// visits (openGroups, remembered on the phone). A task moves up into This week → Tomorrow → Today
// on its own as the date nears.
const BUCKETS: { key: Bucket; label: string; color: string; foldable?: boolean; openByDefault?: boolean; dated?: boolean }[] = [
  { key: "overdue",   label: "Overdue",      color: "var(--neg)",    dated: true },
  { key: "today",     label: "Today",        color: "var(--violet)" },
  { key: "evening",   label: "This evening", color: "var(--cyan)",   foldable: true },
  { key: "tomorrow",  label: "Tomorrow",     color: "var(--ink-2)",  foldable: true },
  { key: "week",      label: "This week",    color: "var(--ink-2)",  dated: true, foldable: true },
  { key: "nextWeek",  label: "Next week",    color: "var(--ink-3)",  dated: true, foldable: true },
  { key: "nextMonth", label: "Next month",   color: "var(--ink-3)",  dated: true, foldable: true },
  { key: "later",     label: "Later",        color: "var(--ink-3)",  dated: true, foldable: true },
  { key: "someday",   label: "Someday",      color: "var(--ink-3)",  foldable: true, openByDefault: true },
];

const PRIO_COLOR: Record<Priority, string> = { 0: "transparent", 1: "var(--warn)", 2: "var(--neg)" };
/** A timestamp taken in an event handler (kept out of the component so the compiler never sees it as render work). */
const stamp = () => Date.now();

// ─── Gestures ─────────────────────────────────────────────────────────────────

/** A quick horizontal flick: short, long enough, mostly sideways. Also switches segment before the drag threshold. */
export function isFlick(dx: number, dy: number, ms: number): boolean {
  return ms < 320 && Math.abs(dx) > 70 && Math.abs(dx) > 2.2 * Math.abs(dy);
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

function Row({ t, today, showDate, cur = false, bornLate = false, onToggle, onOpen, onNotes, onDefer, onLater }: {
  t: Todo; today: string; showDate: boolean;
  /** The keyboard cursor sits on this row (laptop). */
  cur?: boolean;
  /** Mounted after the first paint → rises in. */
  bornLate?: boolean;
  onToggle: () => void; onOpen: () => void; onNotes: (notes: string | null) => void; onDefer?: () => void; onLater?: (time: string) => void;
}) {
  const done = t.doneAt !== null;
  const [entered] = useState(bornLate);
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
  ].filter(Boolean).join(" · ");

  return (
    <div className={`todo-row-wrap${cur ? " cur" : ""}${entered ? " todo-row-in" : ""}`} data-id={t.clientId} style={{ borderBottom: "1px solid var(--line)" }}>
    <div className={`todo-row${celebrating ? " cc-done-row" : ""}`}
      style={{ display: "grid", gridTemplateColumns: `auto 1fr${t.notes && !subtasks ? " auto" : ""}${onLater && !done ? " auto" : ""}${onDefer && !done ? " auto" : ""}`, alignItems: "center", paddingRight: 8, background: "var(--bg-card)" }}>
      <button onClick={tick} data-tick aria-label={done ? "Mark not done" : "Mark done"} aria-pressed={showDone}
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
        {sub && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: t.dueTime && !showDate ? "var(--f-mono)" : undefined }}>{sub}</span>}
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
      <div style={{ background: "var(--bg-card)" }}>
        {subtasks ? <SubtaskList notes={t.notes} onChange={onNotes} /> : <NotesPreview notes={t.notes} />}
      </div>
    )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** The slide between segments · dx follows the finger, `settle` turns the transition on, `w` = pane width. */
type Slide = { dx: number; settle: boolean; w: number; neighbour: Area | null };
const SLIDE_MS = 230;
const SLIDE_EASE = `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1)`;

export default function TodoPage() {
  // true only on the client after hydration (the quick-add bar is portalled into <body>)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = checklistToday(now);
  const eveningNow = dayPart(now) === "evening";

  const { data, loading, stale, upsert, toggleDone, remove } = useTodos(today);
  const all = useMemo(() => (data?.todos ?? []).filter((t) => !t.deleted), [data]);

  const [text, setTextState] = useState("");
  // "Keep as typed" (2026-09-24): the line is saved word for word, no date read out of it.
  const [literal, setLiteral] = useState(false);
  const setText = (v: string) => { setTextState(v); setLiteral(false); };
  const [area, setAreaState] = useState<Area>("personal");
  useEffect(() => {
    try {
      // `?area=work` opens Work (the command bar); the old `?area=list` is Knowledge, its own page now.
      const q = new URLSearchParams(window.location.search).get("area");
      if (q === "list") { router.replace("/knowledge"); return; }
      const saved = localStorage.getItem("cc-todo-area");
      const a = q === "work" || q === "personal" ? q : saved === "work" ? "work" : "personal";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL and localStorage after mount
      if (a === "work") setAreaState(a);
      if (q) { localStorage.setItem("cc-todo-area", a); window.history.replaceState(null, "", "/todo"); }
    } catch { /* ignore */ }
  }, [router]);
  const setArea = (a: Area) => { setAreaState(a); setText(""); setCursor(null); try { localStorage.setItem("cc-todo-area", a); } catch { /* ignore */ } };
  const [open, setOpen] = useState<Todo | null>(null);
  // The laptop keyboard cursor (clientId) and whether the first paint is behind us (rows born later rise in).
  const [cursor, setCursor] = useState<string | null>(null);
  const [born, setBorn] = useState(false);
  useEffect(() => { if (data && !born) { const id = window.setTimeout(() => setBorn(true), 600); return () => clearTimeout(id); } }, [data, born]);
  const [draft, setDraft] = useState<Todo | null>(null); // new entry being composed in a sheet
  const [showDone, setShowDone] = useState(false);
  const [showVault, setShowVault] = useState(false);
  // Fold state per section · true = open, false = closed; a missing key = the section's default.
  const [openGroups, setOpenGroupsState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    try { const raw = JSON.parse(localStorage.getItem("cc-todo-open-groups") ?? "null"); if (raw && typeof raw === "object") setOpenGroupsState(raw); } catch { /* ignore */ }
  }, []);
  const setOpenGroups = (fn: (o: Record<string, boolean>) => Record<string, boolean>) => {
    setOpenGroupsState((o) => { const next = fn(o); try { localStorage.setItem("cc-todo-open-groups", JSON.stringify(next)); } catch { /* ignore */ } return next; });
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const kb = useKeyboardInset(); // the add bar rides on the keyboard

  const parsed = useMemo(() => (!literal && text.trim() ? parseQuickAdd(text, today) : null), [text, today, literal]);

  // ── The slide between Personal · Work · Knowledge (phone) ──
  // The page follows the finger (Ali 2026-09-27: "it needs to feel like a real swipe"): the
  // current pane moves with dx, the next pane rides alongside, clipped to the current height.
  // Release past a third of the width (or a flick) → both glide the rest of the way, then the
  // segment changes and the new pane is already in place. Otherwise everything glides back.
  // At an edge (no next pane) the page only gives a little · a rubber band.
  const idx = SEGMENTS.findIndex((s) => s.key === area);
  // While the finger is down the two panes are moved by hand (style.transform on their DOM nodes,
  // no React render per frame · responsiveness pass 2026-10-03); React only renders the neighbour
  // once, when the slide starts, and again on release to glide and switch.
  const [slide, setSlide] = useState<Slide>({ dx: 0, settle: false, w: 0, neighbour: null });
  const gesture = useRef<{ x: number; y: number; t: number; w: number; axis: "" | "x" | "y"; dx: number } | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const curPaneRef = useRef<HTMLDivElement>(null);
  const nextPaneRef = useRef<HTMLDivElement>(null);
  const switching = useRef<number | null>(null);
  useEffect(() => () => { if (switching.current) clearTimeout(switching.current); }, []);
  const neighbour = slide.neighbour ? SEGMENTS.find((sg) => sg.key === slide.neighbour) : undefined;
  // The listeners sit on the document, so the slide works from anywhere on the screen, empty
  // space under a short list included · not only on the page's own box.
  const onPageTouchStart = (e: TouchEvent) => {
    const el = e.target as HTMLElement;
    if (switching.current || el.closest('[role="dialog"], input, textarea, select, .todo-addbar, .cc-mobile-nav, header, nav')) { gesture.current = null; return; }
    gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, w: paneRef.current?.clientWidth ?? window.innerWidth, axis: "", dx: 0 };
  };
  const onPageTouchMove = (e: TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y"; // the first clear direction wins for the whole touch
    }
    if (g.axis !== "x") return;
    const side = dx < 0 ? 1 : -1;
    const next = SEGMENTS[idx + side];
    g.dx = dx;
    if (next && slide.neighbour !== next.key) setSlide({ dx: 0, settle: false, w: g.w, neighbour: next.key }); // mount the neighbour once
    const shown = next ? dx : dx * 0.25; // rubber band at an edge
    if (curPaneRef.current) curPaneRef.current.style.transform = `translateX(${shown}px)`;
    if (nextPaneRef.current) nextPaneRef.current.style.transform = `translateX(${shown + side * g.w}px)`;
  };
  const onPageTouchEnd = (e: TouchEvent) => {
    const g = gesture.current; gesture.current = null;
    if (!g || g.axis !== "x") return;
    const c = e.changedTouches[0];
    const dx = c ? c.clientX - g.x : g.dx;
    const next = SEGMENTS[idx + (dx < 0 ? 1 : -1)];
    if (c && next && (Math.abs(dx) > g.w / 3 || isFlick(dx, c.clientY - g.y, e.timeStamp - g.t))) {
      setSlide({ dx: dx < 0 ? -g.w : g.w, settle: true, w: g.w, neighbour: next.key });
      switching.current = window.setTimeout(() => {
        switching.current = null;
        setArea(next.key);
        setSlide({ dx: 0, settle: false, w: g.w, neighbour: null });
      }, SLIDE_MS);
    } else {
      setSlide({ dx: 0, settle: true, w: g.w, neighbour: next?.key ?? null });
    }
  };
  const touchHandlers = useRef({ start: onPageTouchStart, move: onPageTouchMove, end: onPageTouchEnd });
  useEffect(() => { touchHandlers.current = { start: onPageTouchStart, move: onPageTouchMove, end: onPageTouchEnd }; });
  useEffect(() => {
    const start = (e: TouchEvent) => touchHandlers.current.start(e);
    const move = (e: TouchEvent) => touchHandlers.current.move(e);
    const end = (e: TouchEvent) => touchHandlers.current.end(e);
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end); document.removeEventListener("touchcancel", end);
    };
  }, []);

  // Return SAVES the task at once (responsiveness pass 2026-10-03: "creating a to-do must feel
  // instant") · the line above the box already shows what was read, and the keyboard stays up for
  // the next one. "+" opens the full sheet instead, for the details. Knowledge entries always go
  // through the sheet: the name and the shape are chosen there (the shape is locked afterwards).
  const quickSave = () => {
    if (!text.trim()) { submit(); return; }
    const ts = stamp();
    upsert({
      clientId: newTodoId(),
      title: literal ? text.trim() : parsed?.title || text.trim(),
      area, notes: null, project: null,
      dueDate: parsed?.dueDate ?? null, dueTime: parsed?.dueTime ?? null,
      evening: parsed?.evening ?? false, someday: parsed?.someday ?? false,
      priority: parsed?.priority ?? 0,
      sortOrder: ts, doneAt: null, createdAt: ts, updatedAt: ts, deleted: false,
    });
    setText("");
    inputRef.current?.focus();
  };
  const submit = () => {
    const ts = Date.now();
    setDraft({
      clientId: newTodoId(),
      title: literal ? text.trim() : parsed?.title || text.trim(),
      area, notes: null, project: null,
      dueDate: parsed?.dueDate ?? null,
      dueTime: parsed?.dueTime ?? null,
      evening: parsed?.evening ?? false,
      someday: parsed?.someday ?? false,
      priority: parsed?.priority ?? 0,
      sortOrder: ts, doneAt: null, createdAt: ts, updatedAt: ts, deleted: false,
    });
  };

  // The Vault: items sleeping until a future wake date · out of every list, one place to browse.
  const sleeping = all.filter((t) => !t.doneAt && isSleeping(t, today)).sort((a, b) => (a.wakeDate ?? "").localeCompare(b.wakeDate ?? ""));
  /** Everything one segment shows · computed for the current segment and, mid-slide, for the next one. */
  const forArea = (a: Area) => {
    const inArea = all.filter((t) => (t.area ?? "personal") === a && !isSleeping(t, today));
    const openTasks = inArea.filter((t) => !t.doneAt);
    const doneToday = inArea.filter((t) => t.doneAt !== null).sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0));
    const groups = BUCKETS.map((b) => ({ ...b, items: openTasks.filter((t) => bucketOf(t, today, eveningNow) === b.key).sort(sortTodos) }));
    return { inArea, openTasks, doneToday, groups };
  };
  const cur = forArea(area);
  /** The rows the keyboard can walk, in page order: the open groups' items, top to bottom. */
  const walkable = cur.groups.filter((g) => g.items.length && !(g.foldable && !(openGroups[g.key] ?? !!g.openByDefault))).flatMap((g) => g.items);
  const nowishOf = (t: Todo) => { const b = bucketOf(t, today, eveningNow); return b === "overdue" || b === "today" || b === "evening"; };

  // Laptop keyboard: n new · j k move · ⏎ open · space tick · t tomorrow · esc. Never while typing,
  // never while a sheet or the command bar is open. Harmless on the phone (no keys arrive).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") { if (open || draft) return; if (typing) { el?.blur(); return; } if (cursor) setCursor(null); return; }
      if (typing || open || draft || document.querySelector(".cc-pal.open")) return;
      if (e.key === "n") { e.preventDefault(); inputRef.current?.focus(); return; }
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = walkable.findIndex((t) => t.clientId === cursor);
        const next = walkable[Math.max(0, Math.min(walkable.length - 1, i + (e.key === "j" || e.key === "ArrowDown" ? 1 : -1)))];
        if (next) { setCursor(next.clientId); document.querySelector(`[data-id="${next.clientId}"]`)?.scrollIntoView({ block: "nearest" }); }
        return;
      }
      const t = walkable.find((x) => x.clientId === cursor);
      if (!t) return;
      if (e.key === "Enter") { e.preventDefault(); setOpen(t); }
      else if (e.key === " ") { e.preventDefault(); (document.querySelector(`[data-id="${t.clientId}"] [data-tick]`) as HTMLElement | null)?.click(); }
      else if (e.key === "t" && nowishOf(t)) { e.preventDefault(); upsert({ ...t, dueDate: addDays(today, 1), evening: false }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // "due today" = the badge rule (overdue + today, evening included), so the header, the
  // home-screen badge and the widget all say the same number (Ali 2026-09-14).
  const dueCount = badgeCount(cur.inArea, today);

  const previewBits = parsed ? [
    parsed.someday ? "Someday" : parsed.dueDate ? fmtDue(parsed.dueDate, today) : null,
    parsed.dueTime, parsed.evening && !parsed.someday ? "evening" : null,
    parsed.priority === 2 ? "urgent" : parsed.priority === 1 ? "important" : null,
  ].filter(Boolean) : [];
  const readSomething = !!parsed && parsed.tokens.length > 0;

  // Personal · Work · the two-way switch (the header's right on the laptop, under the title on the phone).
  const segments = (
    <div role="tablist" aria-label="List" className="todo-seg"
      style={{ display: "grid", gridTemplateColumns: `repeat(${SEGMENTS.length}, 1fr)`, gap: 4, padding: 4, borderRadius: 14, background: "var(--fill-1)" }}>
      {SEGMENTS.map((a) => {
        const on = a.key === area;
        const n = badgeCount(all, today, a.key);
        return (
          <button key={a.key} role="tab" aria-selected={on} onClick={() => setArea(a.key)}
            style={{ minHeight: 44, borderRadius: 10, border: "none", cursor: "pointer", font: "inherit", fontSize: 16, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", boxShadow: on ? "var(--shadow-card)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 0, WebkitTapHighlightColor: "transparent", transition: "background var(--t-2) var(--easeOut), color var(--t-2)" }}>
            {a.label}
            {n > 0 && <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet)" : "var(--fill-3)", color: on ? "var(--on-accent)" : "var(--ink-2)" }}>{n}</span>}
          </button>
        );
      })}
    </div>
  );

  const laptop = useLaptop();
  const vault = sleeping.length > 0 && (
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
                    {(t.area ?? "personal") === "list" ? "knowledge" : t.area === "work" ? "work" : "personal"} · wakes {new Date(`${t.wakeDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-4)" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </section>
  );

  /** One segment's content · rendered for the current segment and, while sliding, for the next. */
  const pane = (a: Area) => {
    const { openTasks, doneToday, groups } = forArea(a);
    // LAPTOP (2026-10-08): two columns · what is due (Overdue to Later) left, Someday, Done and the Vault right.
    const live = groups.filter((g) => g.items.length > 0);
    const near = live.filter((g) => g.key !== "someday"), far = live.filter((g) => g.key === "someday");
    const group = (g: (typeof live)[number]) => {
          const isOpen = openGroups[g.key] ?? !!g.openByDefault;
          const folded = !!g.foldable && !isOpen;
          const nowish = g.key === "overdue" || g.key === "today" || g.key === "evening";
          return (
            <section key={g.key} className="cc-card">
              {g.foldable ? (
                <button onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !(o[g.key] ?? !!g.openByDefault) }))} className="cc-card-head" aria-expanded={!folded}
                  style={{ width: "100%", background: "transparent", border: "none", borderBottom: folded ? "none" : undefined, color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                  <span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length} {folded ? "▾" : "▴"}</span>
                </button>
              ) : (
                <div className="cc-card-head"><span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length}</span></div>
              )}
              <div className={`cc-fold${folded ? "" : " open"}`}>
                <div inert={folded}>
                  <div className="cc-card-list">
                    {g.items.map((t) => (
                      <Row key={t.clientId} t={t} today={today} showDate={!!g.dated} cur={cursor === t.clientId} bornLate={born}
                        onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onNotes={(n) => upsert({ ...t, notes: n })}
                        onDefer={nowish ? () => upsert({ ...t, dueDate: addDays(today, 1), evening: false }) : undefined}
                        onLater={nowish ? (time) => upsert({ ...t, dueDate: today, dueTime: time, evening: false }) : undefined} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        };
    const done = doneToday.length > 0 && (
      <section className="cc-card">
        <button onClick={() => setShowDone((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showDone ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
          <span className="title">Done</span><span className="tail">{doneToday.length} {showDone ? "▴" : "▾"}</span>
        </button>
        {showDone && <div className="cc-card-list">{doneToday.map((t) => <Row key={t.clientId} t={t} today={today} showDate={false} onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onNotes={(n) => upsert({ ...t, notes: n })} />)}</div>}
      </section>
    );
    const head = (
      <>
        {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}
        {data && openTasks.length === 0 && (
          <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Nothing here.
          </div></div>
        )}
      </>
    );
    if (!laptop) return <>{head}{live.map(group)}{done}</>;
    return (
      <div className="cc-cols">
        <div className="cc-stack">{head}{near.map(group)}{near.length === 0 && openTasks.length > 0 && <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)" }}>Nothing due.</div></div>}</div>
        <div className="cc-stack">{far.map(group)}{done}{vault}</div>
      </div>
    );
  };

  const moving = slide.neighbour !== null || slide.settle;
  return (
    <div className={laptop ? "cc-wide" : undefined} style={{ display: "grid", gap: 16, maxWidth: laptop ? undefined : 560, margin: "0 auto", width: "100%", paddingBottom: 84, touchAction: "pan-y" }}>
      <div className="todo-head">
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>To-do</h1>
            <div className="sub">
              {loading && !data ? "…"
                : `${dueCount === 0 ? "nothing due today" : `${dueCount} due today`}${cur.openTasks.length ? ` · ${cur.openTasks.length} open` : ""}`}
              {stale ? " · saved copy" : ""}
            </div>
          </div>
        </div>
        {/* Personal · Work · slide left/right on the phone */}
        {segments}
      </div>

      {/* The panes · the current one in flow, the next one riding alongside while the finger is down */}
      <div ref={paneRef} style={{ position: "relative", overflow: moving ? "hidden" : undefined }}>
        <div ref={curPaneRef} style={{ display: "grid", gap: 16, transform: moving ? `translateX(${slide.dx}px)` : undefined, transition: slide.settle ? SLIDE_EASE : "none" }}
          onTransitionEnd={() => setSlide((s) => (s.dx === 0 ? { ...s, settle: false, neighbour: null } : s))}>
          {pane(area)}
        </div>
        {neighbour && (
          <div ref={nextPaneRef} aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: "100%", overflow: "hidden", display: "grid", gap: 16, alignContent: "start",
            transform: `translateX(${slide.dx + (SEGMENTS.findIndex((sg) => sg.key === neighbour.key) > idx ? slide.w : -slide.w)}px)`, transition: slide.settle ? SLIDE_EASE : "none" }}>
            {pane(neighbour.key)}
          </div>
        )}
      </div>

      {/* Vault · far-future items, all areas together · on the laptop it sits in the pane's right column */}
      {!laptop && vault}

      {/* Quick add · pinned above the tab bar. Rendered into <body> through a portal (2026-09-14 evening:
          on the laptop the bar sometimes sat 60 px up, mid-page · a fixed box inside the page tree
          followed the page's box instead of the window; from <body> nothing can shift it) · the
          position lives in globals.css `.todo-addbar`. */}
      {mounted && createPortal(
      <form className="todo-addbar" onSubmit={(e) => { e.preventDefault(); quickSave(); }} style={kb > 0 ? ({ "--kb": `${kb}px` } as React.CSSProperties) : undefined}>
        <div style={{ maxWidth: laptop ? 1108 : 560, margin: "0 auto", display: "grid", gap: 6 }}>
          {(readSomething || literal) && text.trim() && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, minHeight: 28 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {literal
                  ? <span style={{ color: "var(--ink-3)" }}>Saved as typed</span>
                  : <><span style={{ color: "var(--ink)" }}>{parsed!.title || "(no title)"}</span><span style={{ color: "var(--cyan)", fontFamily: "var(--f-mono)" }}>{previewBits.length ? ` · ${previewBits.join(" · ")}` : ""}</span></>}
              </span>
              <button type="button" onClick={() => setLiteral((v) => !v)} className="cc-pill" style={{ minHeight: 28, padding: "0 10px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                {literal ? "Read the date" : "Keep as typed"}
              </button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input ref={inputRef} className="cc-input" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={area === "work" ? "Add a work task…" : "Add a task…"}
              enterKeyHint="done" autoComplete="off" style={{ fontSize: 17, minHeight: 48, borderRadius: 14 }} />
            <button type="button" onClick={submit} className="cc-btn cc-btn-primary" style={{ minHeight: 48, minWidth: 48, borderRadius: 14, fontSize: 20, padding: 0 }} aria-label="Add with details">+</button>
          </div>
        </div>
      </form>, document.body)}

      {open && <Sheet t={open} today={today} onSave={upsert} onDelete={() => remove(open)} onClose={() => setOpen(null)} />}
      {draft && (
        <Sheet t={draft} today={today} isNew
          onSave={(t) => { upsert(t); setText(""); }}
          onDelete={() => { /* discard the draft */ }}
          onClose={() => setDraft(null)} />
      )}

      <style>{`.todo-row-wrap:last-child { border-bottom: none !important; } .todo-row:active { background: var(--fill-1); }`}</style>
    </div>
  );
}
