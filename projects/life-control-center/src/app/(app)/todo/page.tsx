"use client";

/**
 * /todo · the To-do tab (spec §4.5 + §7c item 7).
 *
 * Three segments at the top, remembered on the phone:
 *   Personal · Work · tasks: buckets (Overdue · Today · Evening · Upcoming · Anytime · Someday),
 *     one-line quick add with natural-language dates, detail sheet, one-tap defer, swipe to delete.
 *   Docs · things to KEEP, not do (spec §7c item 7): notes and running lists.
 *     No checkboxes, no buckets, no nagging. Type a name → straight into the editor. Pin the ones
 *     you reach for; search finds the rest (titles and content). A list can carry one optional
 *     reminder (date + time) · then it behaves like a reminder: Today card, badge, notifications.
 *
 * Works offline; the home-screen badge shows what's due today.
 */

import { Linkify, LinkChips } from "@/components/Linkify";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTodos } from "@/lib/todo/useTodos";
import { newTodoId } from "@/lib/todo/types";
import { checklistToday, dayPart } from "@/lib/checklist/day";
import {
  addDays, AREAS, badgeCount, bucketOf, fmtDue, nextWeekend, parseQuickAdd, sortTodos,
  type Area, type Bucket, type Priority, type Todo,
} from "@/lib/todo/types";

const SEGMENTS: { key: Area; label: string }[] = [...AREAS, { key: "list", label: "Docs" }];

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: "overdue",  label: "Overdue",      color: "var(--neg)" },
  { key: "today",    label: "Today",        color: "var(--violet)" },
  { key: "evening",  label: "This evening", color: "var(--cyan)" },
  { key: "upcoming", label: "Upcoming",     color: "var(--ink-2)" },
  { key: "someday",  label: "Someday",      color: "var(--ink-3)" },
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
function openPicker(e: React.SyntheticEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.focus(); el.showPicker?.(); } catch { /* focus alone still works */ }
}

// While a sheet is open, the page behind it must not scroll (iOS otherwise keeps
// scrolling the background and gets stuck until the app is reopened).
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

// ─── Notes editor (tasks + lists) ─────────────────────────────────────────────

function NotesEditor({ value, onChange, rows = 4, placeholder, autoFocus = false, fill = false }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder: string; autoFocus?: boolean; fill?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Prefix the current line (dash / numbered list); pressing return inside a
  // list continues it, return on an empty item ends it.
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (v: string, selStart: number, selEnd: number) => {
    onChange(v);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(selStart, selEnd); } });
  };
  const prefixLine = (prefix: string) => {
    const el = ref.current; if (!el) return;
    const v = el.value, a = el.selectionStart;
    const ls = v.lastIndexOf("\n", a - 1) + 1;
    apply(v.slice(0, ls) + prefix + v.slice(ls), a + prefix.length, a + prefix.length);
  };
  const onEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    const el = e.currentTarget, v = el.value, a = el.selectionStart;
    const ls = v.lastIndexOf("\n", a - 1) + 1;
    const line = v.slice(ls, a);
    const m = line.match(/^(- |(\d+)\. )/);
    if (!m) return;
    e.preventDefault();
    if (line === m[1]) { apply(v.slice(0, ls) + v.slice(a), ls, ls); return; } // empty item ends the list
    const next = m[2] ? `${Number(m[2]) + 1}. ` : m[1];
    apply(v.slice(0, a) + "\n" + next + v.slice(el.selectionEnd), a + 1 + next.length, a + 1 + next.length);
  };
  const btn: React.CSSProperties = { minWidth: 40, minHeight: 36, borderRadius: 9, border: "1px solid var(--line-hi)", background: "var(--fill-1)", color: "var(--ink-2)", font: "inherit", fontSize: 14, cursor: "pointer" };
  return (
    <div style={fill ? { display: "flex", flexDirection: "column", gap: 6, height: "100%" } : { display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }} aria-label="Formatting">
        <button type="button" title="Dash list" onClick={() => prefixLine("- ")} style={btn}>−</button>
        <button type="button" title="Numbered list" onClick={() => prefixLine("1. ")} style={btn}>1.</button>
        <span style={{ flex: 1 }} />
        <button type="button" title="Jump to the end" style={btn} onClick={() => {
          const el = ref.current; if (!el) return;
          el.focus(); const n = el.value.length; el.setSelectionRange(n, n); el.scrollTop = el.scrollHeight;
        }}>⇣</button>
        {!fill && (
          <button type="button" title={expanded ? "Shrink" : "Expand"} style={btn} onClick={() => {
            setExpanded(!expanded);
            requestAnimationFrame(() => { const el = ref.current; if (el && !expanded) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); el.scrollTop = el.scrollHeight; } });
          }}>{expanded ? "⤡" : "⤢"}</button>
        )}
      </div>
      <textarea ref={ref} className="cc-input" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onEnter}
        placeholder={placeholder} rows={rows} autoFocus={autoFocus}
        style={fill ? { fontSize: 16, resize: "none", lineHeight: 1.5, flex: 1, minHeight: 240, width: "100%", boxSizing: "border-box" } : { fontSize: 16, resize: "vertical", lineHeight: 1.5, ...(expanded ? { minHeight: "45vh" } : {}) }} />
      <LinkChips text={value} />
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function Row({ t, today, showDate, onToggle, onOpen, onDefer, onDelete }: {
  t: Todo; today: string; showDate: boolean;
  onToggle: () => void; onOpen: () => void; onDefer?: () => void; onDelete: () => void;
}) {
  const done = t.doneAt !== null;
  const swipe = useSwipeDelete(onDelete);
  // Quick peek: tap the ⓘ dot (hover shows it on desktop too) to read the notes
  // right in the list, without opening the task.
  const [peek, setPeek] = useState(false);
  const sub = [
    showDate && t.dueDate ? fmtDue(t.dueDate, today) : null,
    t.dueTime,
    t.evening && !showDate && t.dueDate === today ? null : t.evening && t.dueDate ? "evening" : null,
    t.project ? `#${t.project}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SwipeWrap swipe={swipe} onDelete={onDelete}>
    <div className="todo-row" {...swipe.handlers}
      style={{ display: "grid", gridTemplateColumns: `auto 1fr${t.notes ? " auto" : ""}${onDefer ? " auto" : ""}`, alignItems: "center", ...swipe.style }}>
      <button onClick={onToggle} aria-label={done ? "Mark not done" : "Mark done"} aria-pressed={done}
        style={{ width: 48, minHeight: 54, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span aria-hidden style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${done ? "transparent" : t.priority ? PRIO_COLOR[t.priority] : "var(--line-strong)"}`, background: done ? "var(--pos)" : "var(--fill-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
          {done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        </span>
      </button>
      <button onClick={onOpen} style={{ minHeight: 54, padding: "8px 4px 8px 0", background: "transparent", border: "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", minWidth: 0, WebkitTapHighlightColor: "transparent" }}>
        <span style={{ display: "block", fontSize: 17, lineHeight: 1.3, color: done ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-4)" }}>
          {t.priority === 2 && !done && <span style={{ color: "var(--neg)", marginRight: 6 }}>!!</span>}
          {t.priority === 1 && !done && <span style={{ color: "var(--warn)", marginRight: 6 }}>!</span>}
          <Linkify text={t.title} />
        </span>
        {sub && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, fontFamily: t.dueTime && !showDate ? "var(--f-mono)" : undefined }}>{sub}</span>}
      </button>
      {t.notes && (
        <button
          onClick={(e) => { e.stopPropagation(); if (!window.matchMedia?.("(hover: hover)").matches) setPeek((p) => !p); }}
          onMouseEnter={() => { if (window.matchMedia?.("(hover: hover)").matches) setPeek(true); }}
          onMouseLeave={() => { if (window.matchMedia?.("(hover: hover)").matches) setPeek(false); }}
          aria-label={peek ? "Hide notes" : "Show notes"} aria-expanded={peek} title="Notes"
          style={{ width: 40, minHeight: 54, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        >
          <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${peek ? "var(--violet)" : "var(--line-strong)"}`, background: peek ? "var(--accent-soft)" : "var(--fill-1)", color: peek ? "var(--violet)" : "var(--ink-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--f-mono)" }}>≡</span>
        </button>
      )}
      {onDefer && !done && (
        <button onClick={onDefer} className="cc-btn cc-btn-ghost" aria-label="Move to tomorrow" style={{ minHeight: 40, padding: "0 10px", fontSize: 14, borderRadius: 10, marginRight: 2 }}>→ tmrw</button>
      )}
    </div>
    {peek && t.notes && (
      <div onClick={() => setPeek(false)} style={{ padding: "0 12px 12px 48px", fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "var(--bg-card)" }}>
        <Linkify text={t.notes} />
      </div>
    )}
    </SwipeWrap>
  );
}

// ─── List row (Lists segment · kept things, no checkbox) ──────────────────────

function ListRow({ t, onOpen, onDelete }: { t: Todo; onOpen: () => void; onDelete: () => void }) {
  const swipe = useSwipeDelete(onDelete);
  const preview = firstLine(t.notes);
  const items = (t.notes?.match(/^- (\[[ xX]\] )?/gm) ?? []).length;
  const sub = [
    t.dueDate ? `remind ${fmtDue(t.dueDate, checklistToday())}${t.dueTime ? ` ${t.dueTime}` : ""}` : null,
    t.project ? `#${t.project}` : null,
    items > 0 ? `${items} item${items === 1 ? "" : "s"}` : preview,
    fmtAgo(t.updatedAt),
  ].filter(Boolean).join(" · ");

  return (
    <SwipeWrap swipe={swipe} onDelete={onDelete}>
      <button onClick={onOpen} className="todo-row" {...swipe.handlers}
        style={{ display: "grid", gridTemplateColumns: t.priority > 0 ? "32px 1fr" : "1fr", alignItems: "center", width: "100%", minHeight: 58, padding: "8px 10px", border: "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", WebkitTapHighlightColor: "transparent", ...swipe.style }}>
        {t.priority > 0 && <span aria-hidden style={{ fontSize: 16, textAlign: "center" }}>📌</span>}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
          <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub || "empty · tap to write"}</span>
        </span>
      </button>
    </SwipeWrap>
  );
}

// ─── Shared chip style ────────────────────────────────────────────────────────

const chipStyle = (on: boolean): React.CSSProperties => ({
  minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

const NAG_STEPS = [30, 15, 10, 5];
const nextNag = (cur: number | null | undefined) => NAG_STEPS[(NAG_STEPS.indexOf(cur ?? 30) + 1) % NAG_STEPS.length];
const nagChip: React.CSSProperties = { minHeight: 28, padding: "0 8px", borderRadius: 8, fontSize: 13, font: "inherit", cursor: "pointer", border: "1px solid var(--line-hi)", background: "var(--fill-1)", color: "var(--ink-2)" };

// Title field that grows with its text · long titles wrap instead of hiding
// their end behind horizontal scroll. Enter closes the keyboard.
function TitleInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [value]);
  return (
    <textarea ref={ref} className="cc-input" rows={1} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      style={{ fontSize: 18, fontWeight: 500, minHeight: 48, resize: "none", overflow: "hidden", lineHeight: 1.35, width: "100%", boxSizing: "border-box" }} />
  );
}

// ─── Task detail sheet ────────────────────────────────────────────────────────

function Sheet({ t, today, projects, isNew = false, onSave, onDelete, onClose }: {
  t: Todo; today: string; projects: string[]; isNew?: boolean;
  onSave: (t: Todo) => void; onDelete: () => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const [d, setD] = useState<Todo>(t);
  const set = (p: Partial<Todo>) => setD((x) => ({ ...x, ...p }));
  const close = () => { if (d.title.trim()) onSave({ ...d, title: d.title.trim() }); onClose(); };
  const when = (dueDate: string | null, evening = false, someday = false) => set({ dueDate, evening, someday, dueTime: someday ? null : d.dueTime });
  const isWhen = (dueDate: string | null, evening: boolean, someday: boolean) => d.someday === someday && (someday || (d.dueDate === dueDate && d.evening === evening));
  const chips: { label: string; on: boolean; go: () => void }[] = [
    { label: "Today",     on: isWhen(today, false, false),             go: () => when(today) },
    { label: "Evening",   on: isWhen(today, true, false),              go: () => when(today, true) },
    { label: "Tomorrow",  on: isWhen(addDays(today, 1), false, false),  go: () => when(addDays(today, 1)) },
    { label: "Weekend",   on: isWhen(nextWeekend(today), false, false), go: () => when(nextWeekend(today)) },
    { label: "Someday",   on: d.someday || !d.dueDate,                 go: () => when(null, false, true) },
  ];

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label="Edit task" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "14px 18px calc(env(safe-area-inset-bottom) + 14px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", maxHeight: "88vh", overflowY: "auto" }}>
        <TitleInput value={d.title} onChange={(v) => set({ title: v })} placeholder="What needs doing?" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {AREAS.map((a) => <button key={a.key} onClick={() => set({ area: a.key })} style={chipStyle((d.area ?? "personal") === a.key)}>{a.label}</button>)}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <button key={c.label} onClick={c.go} style={chipStyle(c.on)}>{c.label}</button>)}
          <label style={{ ...chipStyle(!!d.dueDate && !chips.slice(0, 4).some((c) => c.on)), display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
            {d.dueDate && !chips.slice(0, 4).some((c) => c.on) ? fmtDue(d.dueDate, today) : "Pick a date"}
            <input type="date" value={d.dueDate ?? ""} min={today} onClick={openPicker} onChange={(e) => e.target.value && when(e.target.value, d.evening)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 17 }} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)", minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>Time (reminder)
              {!!d.dueDate && !d.someday && (
                <button type="button" onClick={(e) => { e.preventDefault(); set({ nagMinutes: nextNag(d.nagMinutes) }); }} style={nagChip} title="How often it nags until done">
                  every {d.nagMinutes ?? 30}m
                </button>
              )}
            </span>
            <input type="time" className="cc-input" value={d.dueTime ?? ""} disabled={d.someday} onClick={openPicker} onChange={(e) => set({ dueTime: e.target.value || null, dueDate: d.dueDate ?? (e.target.value ? today : null) })} style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
            {!!d.dueDate && !d.dueTime && !d.someday && (
              <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>no time = reminds from 9:00</span>
            )}
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)", minWidth: 0 }}>Project
            <input className="cc-input" list="todo-projects" value={d.project ?? ""} onChange={(e) => set({ project: e.target.value.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") || null })} placeholder="none" style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box" }} />
            <datalist id="todo-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {([0, 1, 2] as Priority[]).map((p) => (
            <button key={p} onClick={() => set({ priority: p })} style={chipStyle(d.priority === p)}>{p === 0 ? "Normal" : p === 1 ? "! Important" : "!! Urgent"}</button>
          ))}
        </div>

        <NotesEditor value={d.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="Notes" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={close} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{isNew ? "Add task" : "Done"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={() => { if (isNew || confirm("Delete this task?")) { onDelete(); onClose(); } }} style={{ minHeight: 50, minWidth: 50, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label={isNew ? "Discard" : "Delete"}>✕</button>
        </div>
      </div>
    </>
  );
}

// ─── List sheet (Lists segment) · a place to write, not to schedule ──────────

function ListSheet({ t, today, tags, isNew = false, onSave, onDelete, onClose }: {
  t: Todo; today: string; tags: string[]; isNew?: boolean;
  onSave: (t: Todo) => void; onDelete: () => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const [d, setD] = useState<Todo>(t);
  const set = (p: Partial<Todo>) => setD((x) => ({ ...x, ...p }));
  const close = () => { if (d.title.trim()) onSave({ ...d, title: d.title.trim() }); onClose(); };
  const [remind, setRemind] = useState(!!t.dueDate);

  // Two shapes for the same stored text: a LIST (each line "- item", shown as real
  // rows) or a DOC (free text). Detected from the content; switchable any time.
  const looksLikeList = (notes: string | null) => {
    const lines = (notes ?? "").split("\n").filter((l) => l.trim());
    return lines.length === 0 || lines.every((l) => /^- /.test(l));
  };
  const [mode, setMode] = useState<"list" | "doc">(isNew || looksLikeList(t.notes) ? "list" : "doc");
  const items = (d.notes ?? "").split("\n").map((l) => l.replace(/^- /, "")).filter((l) => l.trim());
  const writeItems = (list: string[]) => set({ notes: list.length ? list.map((i) => `- ${i.trim()}`).join("\n") : null });
  const toList = () => { writeItems((d.notes ?? "").split("\n").map((l) => l.replace(/^- /, "").replace(/^\d+\. /, "")).filter((l) => l.trim())); setMode("list"); };

  const [newItem, setNewItem] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const addItem = () => {
    if (!newItem.trim()) return;
    writeItems([...items, newItem]);
    setNewItem("");
  };
  const commitEdit = () => {
    if (editIdx === null) return;
    const next = [...items];
    if (editText.trim()) next[editIdx] = editText; else next.splice(editIdx, 1);
    writeItems(next);
    setEditIdx(null);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    writeItems(next);
    if (editIdx === i) setEditIdx(j);
  };

  const seg = (on: boolean): React.CSSProperties => ({
    minHeight: 40, borderRadius: 10, border: "none", font: "inherit", fontSize: 15, fontWeight: on ? 600 : 500,
    color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", cursor: "pointer",
  });

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label="Edit doc" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "12px 18px calc(env(safe-area-inset-bottom) + 12px)", display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, margin: "0 auto", height: "92dvh" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}><TitleInput value={d.title} onChange={(v) => set({ title: v })} placeholder="Name" /></div>
          <div role="tablist" aria-label="Shape" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 3, borderRadius: 12, background: "var(--fill-1)", minWidth: 118 }}>
            <button role="tab" aria-selected={mode === "list"} onClick={toList} style={seg(mode === "list")}>List</button>
            <button role="tab" aria-selected={mode === "doc"} onClick={() => setMode("doc")} style={seg(mode === "doc")}>Doc</button>
          </div>
          <button onClick={close} aria-label="Close" style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "var(--fill-1)", color: "var(--ink-2)", fontSize: 17, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {mode === "doc" ? (
          <NotesEditor value={d.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="" fill />
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {items.length === 0 && <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "10px 2px" }}>Nothing here yet · add the first item below.</div>}
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 10, alignItems: "center", minHeight: 48, borderBottom: "1px solid var(--line)" }}>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: 3, background: "var(--violet)", justifySelf: "center" }} />
                {editIdx === i ? (
                  <input
                    className="cc-input" value={editText} autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
                    style={{ fontSize: 16, minHeight: 40 }}
                  />
                ) : (
                  <button onClick={() => { setEditIdx(i); setEditText(it); }} style={{ background: "transparent", border: "none", textAlign: "left", color: "var(--ink)", font: "inherit", fontSize: 16, lineHeight: 1.4, padding: "10px 0", cursor: "pointer", minWidth: 0, overflowWrap: "anywhere" }}>
                    <Linkify text={it} />
                  </button>
                )}
                <span style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" style={{ width: 34, height: 40, background: "transparent", border: "none", color: i === 0 ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" style={{ width: 34, height: 40, background: "transparent", border: "none", color: i === items.length - 1 ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↓</button>
                  <button onClick={() => writeItems(items.filter((_, j) => j !== i))} aria-label="Remove item" style={{ width: 34, height: 40, background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 15, cursor: "pointer" }}>✕</button>
                </span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}>
              <input className="cc-input" value={newItem} autoFocus={isNew} onChange={(e) => setNewItem(e.target.value)} enterKeyHint="done"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                placeholder="Add an item" style={{ fontSize: 16, minHeight: 46, borderRadius: 12 }} />
              <button onClick={addItem} disabled={!newItem.trim()} className="cc-btn cc-btn-secondary" style={{ minHeight: 46, minWidth: 46, borderRadius: 12, fontSize: 18, padding: 0 }} aria-label="Add item">+</button>
            </div>
          </div>
        )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <button onClick={() => set({ priority: d.priority > 0 ? 0 : 1 })} style={chipStyle(d.priority > 0)} aria-pressed={d.priority > 0}>📌 Pin</button>
          <button onClick={() => { if (remind) { set({ dueDate: null, dueTime: null }); } setRemind(!remind); }} style={chipStyle(remind)} aria-pressed={remind}>Remind me</button>
          {remind && !!d.dueDate && (
            <button onClick={() => set({ nagMinutes: nextNag(d.nagMinutes) })} style={nagChip} title="How often it nags until done">every {d.nagMinutes ?? 30}m</button>
          )}
          <input className="cc-input" list="doc-tags" value={d.project ?? ""} onChange={(e) => set({ project: e.target.value.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") || null })} placeholder="Tag" style={{ fontSize: 16, minHeight: 40, flex: 1, minWidth: 110, borderRadius: 10 }} />
          <datalist id="doc-tags">{tags.map((p) => <option key={p} value={p} />)}</datalist>
        </div>

        {remind && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)", minWidth: 0 }}>Date
              <input type="date" className="cc-input" value={d.dueDate ?? ""} min={today} onChange={(e) => set({ dueDate: e.target.value || null })} style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)", minWidth: 0 }}>Time (optional)
              <input type="time" className="cc-input" value={d.dueTime ?? ""} onClick={openPicker} onChange={(e) => set({ dueTime: e.target.value || null, dueDate: d.dueDate ?? (e.target.value ? today : null) })} style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
            </label>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={close} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{isNew ? "Keep it" : "Done"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={() => { if (isNew || confirm("Delete this doc?")) { onDelete(); onClose(); } }} style={{ minHeight: 50, borderRadius: 14, padding: "0 16px", color: "var(--neg)", fontSize: 15 }}>{isNew ? "Discard" : "Delete"}</button>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodoPage() {
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

  const inArea = all.filter((t) => (t.area ?? "personal") === area);
  const visible = filter ? inArea.filter((t) => t.project === filter) : inArea;

  // Tasks (Personal / Work)
  const openTasks = visible.filter((t) => !t.doneAt);
  const doneToday = visible.filter((t) => t.doneAt !== null).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const groups = BUCKETS.map((b) => ({ ...b, items: openTasks.filter((t) => bucketOf(t, today, eveningNow) === b.key).sort(sortTodos) }));
  const dueCount = groups.filter((g) => g.key === "overdue" || g.key === "today").reduce((s, g) => s + g.items.length, 0);

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
              style={{ minHeight: 44, borderRadius: 11, border: "none", cursor: "pointer", font: "inherit", fontSize: 16, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
              {a.label}
              {n > 0 && <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet)" : "var(--fill-3)", color: on ? "var(--on-accent)" : "var(--ink-2)" }}>{n}</span>}
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
              <div style={{ padding: "0 8px 0 0" }}>
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

          {groups.filter((g) => g.items.length > 0).map((g) => (
            <section key={g.key} className="cc-card">
              <div className="cc-card-head"><span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length}</span></div>
              <div style={{ padding: "0 8px 0 0" }}>
                {g.items.map((t) => (
                  <Row key={t.clientId} t={t} today={today} showDate={g.key === "upcoming" || g.key === "overdue"}
                    onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onDelete={() => remove(t)}
                    onDefer={g.key === "overdue" || g.key === "today" || g.key === "evening" ? () => upsert({ ...t, dueDate: addDays(today, 1), evening: false }) : undefined} />
                ))}
              </div>
            </section>
          ))}

          {doneToday.length > 0 && (
            <section className="cc-card">
              <button onClick={() => setShowDone((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showDone ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                <span className="title">Done</span><span className="tail">{doneToday.length} {showDone ? "▴" : "▾"}</span>
              </button>
              {showDone && <div>{doneToday.map((t) => <Row key={t.clientId} t={t} today={today} showDate={false} onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} onDelete={() => remove(t)} />)}</div>}
            </section>
          )}
        </>
      )}

      {/* Quick add · pinned above the tab bar */}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ position: "fixed", left: 0, right: 0, bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))", zIndex: 30, padding: "8px 12px 10px", background: "var(--bg-chrome)", borderTop: "1px solid var(--line)" }}>
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
      </form>

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
        .todo-row-wrap:last-child { border-bottom: none !important; } .todo-row:active { background: var(--fill-1); }
        @media (min-width: 768px) { form[style*="position: fixed"] { bottom: 0 !important; left: 56px !important; } }`}</style>
    </div>
  );
}
