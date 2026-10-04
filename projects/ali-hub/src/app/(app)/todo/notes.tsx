"use client";

/**
 * Notes, shown four ways (2026-09-12, Ali):
 *   NotesPreview   · a task's notes under its title, only while the ≡ icon is open.
 *   SubtaskList    · a task's notes as subtasks, ticked inline with the same pop, ring, strike
 *                    and chime as a normal to-do. Three shown, "+N more" opens the rest.
 *   SubtaskEditor  · the same items inside a sheet: add, edit, tick, reorder, remove, reset.
 * Nothing here is hover-only · every control is a tap target.
 */

import { useEffect, useRef, useState } from "react";
import { Linkify } from "@/components/Linkify";
import { playDoneSound } from "@/lib/todo/celebrate";
import { parseSubtasks, serializeSubtasks, type SubTask } from "@/lib/todo/types";

/** Notes as shown in previews: list markers become glyphs, heading marks go. */
export function prettyNotes(notes: string): string {
  return notes
    .replace(/^(\s*)- \[ \] /gm, "$1☐ ")
    .replace(/^(\s*)- \[[xX]\] /gm, "$1☑ ")
    .replace(/^(\s*)- /gm, "$1• ")
    .replace(/^#{1,3} (.*)$/gm, "$1");
}

const PREVIEW_LINES = 3;

/**
 * One-line-looking field that grows with its text (Ali 2026-09-14: "checklist boxes must show
 * their full content, expand the box rather than making me scroll inside it"). A textarea
 * with rows=1 that resizes on every change; Return commits (blur) instead of adding a line.
 */
export function GrowInput({ value, onChange, onCommit, onEnter, inputRef, autoFocus, placeholder, ariaLabel, style }: {
  value: string; onChange: (v: string) => void; onCommit?: () => void; onEnter?: () => void;
  inputRef?: (el: HTMLTextAreaElement | null) => void; autoFocus?: boolean; placeholder?: string; ariaLabel?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return (
    <textarea ref={(el) => { ref.current = el; inputRef?.(el); }} className="cc-input" rows={1} value={value} placeholder={placeholder} aria-label={ariaLabel} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onBlur={onCommit}
      enterKeyHint={onEnter ? "next" : undefined}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (onEnter) onEnter(); else e.currentTarget.blur(); } }}
      style={{ fontSize: 16, lineHeight: 1.4, minHeight: 40, padding: "8px 10px", resize: "none", overflow: "hidden", width: "100%", boxSizing: "border-box", overflowWrap: "anywhere", ...style }} />
  );
}

/**
 * A task's notes under its row · shown ONLY while the ≡ icon is open (Ali 2026-09-13:
 * "when it's closed I shouldn't see anything"). Plain text, no click handler, so it can be
 * selected and copied on the phone (long-press) and on the laptop (drag).
 */
export function NotesPreview({ notes, indent = 48 }: { notes: string; indent?: number }) {
  return (
    <div style={{ padding: `0 12px 12px ${indent}px`, color: "var(--ink-2)", WebkitUserSelect: "text", userSelect: "text", WebkitTouchCallout: "default", cursor: "text",
      fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      <Linkify text={prettyNotes(notes)} />
    </div>
  );
}

// ─── Tick box · the pop, ring and chime every completion in the app uses ──────

// Presentational only · the ROW owns the timer, so the strike, the chime and the box all
// run in the same half second (before 2026-09-15 the box waited its own 650 ms first).
function TickBox({ done, celebrating, onTick, small = false }: { done: boolean; celebrating: boolean; onTick: () => void; small?: boolean }) {
  const show = done || celebrating;
  const size = small ? 20 : 22;
  return (
    <button type="button" onClick={onTick} aria-label={done ? "Clear this item" : "Mark done"} aria-pressed={show}
      style={{ width: 40, minHeight: small ? 38 : 44, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, WebkitTapHighlightColor: "transparent" }}>
      <span aria-hidden className={celebrating ? "cc-done-pop" : undefined}
        style={{ position: "relative", width: size, height: size, borderRadius: 8, border: `2px solid ${show ? "transparent" : "var(--line-strong)"}`, background: show ? "var(--pos)" : "var(--fill-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
        {show && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {celebrating && <span className="cc-done-ring" />}
      </span>
    </button>
  );
}

/** Returns whether this row is mid-celebration, so the caller can swap the input for struck text. */
function useCelebration(): [boolean, (run: () => void) => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const start = (run: () => void) => {
    if (on) return;
    setOn(true);
    playDoneSound();
    timer.current = window.setTimeout(() => { setOn(false); run(); }, 650);
  };
  return [on, start];
}

// ─── One read-only subtask row (under a task on /todo and /today) ─────────────
// Ticking KEEPS the line, struck through (Ali 2026-10-04: "1 of 2 done must stay 1 of 2, I want
// to see what I've done") · it was removed between 2026-09-14 and then. The pop, ring, strike
// and chime play first, then the line stays as `- [x]`; a tap on a done line clears the tick.

function SubtaskRow({ s, onTick }: { s: SubTask; onTick: () => void }) {
  const [celebrating, start] = useCelebration();
  const showDone = s.done || celebrating;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", alignItems: "center", minHeight: 38 }}>
      <TickBox done={s.done} celebrating={celebrating} onTick={() => (s.done ? onTick() : start(onTick))} small />
      <span className={celebrating ? "cc-done-strike" : undefined}
        style={{ display: "inline-block", fontSize: 15, lineHeight: 1.4, color: showDone ? "var(--ink-3)" : "var(--ink-2)", textDecoration: s.done ? "line-through" : "none", textDecorationColor: "var(--ink-4)", overflowWrap: "anywhere", paddingRight: 8 }}>
        <Linkify text={s.text} />
      </span>
    </div>
  );
}

/** Subtasks under a task row · three at a time (open ones first); a ticked one stays, struck through. */
export function SubtaskList({ notes, onChange, indent = 48 }: { notes: string; onChange: (notes: string | null) => void; indent?: number }) {
  const items = parseSubtasks(notes);
  const [open, setOpen] = useState(false);
  // Open items first, done ones after, so the three visible lines are the work left.
  const ordered = [...items.filter((s) => !s.done), ...items.filter((s) => s.done)];
  const shown = open ? ordered : ordered.slice(0, PREVIEW_LINES);
  const toggleAt = (i: number) => onChange(serializeSubtasks(items.map((s, j) => (j === i ? { ...s, done: !s.done } : s))));
  return (
    <div style={{ padding: `0 12px 8px ${indent - 8}px` }}>
      {shown.map((s) => { const i = items.indexOf(s); return <SubtaskRow key={`${i}-${s.text}`} s={s} onTick={() => toggleAt(i)} />; })}
      {(items.length > PREVIEW_LINES || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ background: "transparent", border: "none", font: "inherit", fontSize: 13, color: "var(--ink-4)", padding: "4px 0 2px 40px", cursor: "pointer", minHeight: 32 }}>
          {open ? "Show less" : `+${items.length - PREVIEW_LINES} more`}
        </button>
      )}
    </div>
  );
}

/**
 * Subtasks inside a sheet.
 *
 * TASKS (default, Ali 2026-09-15: "they're a simple checklist, not an ordered procedure"):
 * a checkbox and a full-width box per line, nothing else. Return jumps to the add box at the
 * bottom, which appends and keeps the caret there, so one Return per item fills the list;
 * ticking strikes the line through and chimes · the line STAYS as done (Ali 2026-10-04); a tap
 * on a done line clears it. Delete = empty the text (an empty line cannot be held in the stored
 * text, `parseSubtasks` drops it, so a new item is always born in the add box, never as a blank
 * row in the middle).
 *
 * DOCS (`ordered`): the arrows and the ✕ stay, because a doc may hold real steps.
 */
/** Notes plus whatever is still typed in the add box · what a sheet must save, however it was left. */
export function withDraftSubtask(notes: string | null, draft: string): string | null {
  const text = draft.trim();
  if (!text) return notes;
  return serializeSubtasks([...parseSubtasks(notes), { text, done: false }]);
}

export function SubtaskEditor({ notes, onChange, placeholder = "Add a subtask", autoFocus = false, ordered = false, draftRef }: {
  notes: string | null; onChange: (notes: string | null) => void; placeholder?: string; autoFocus?: boolean; ordered?: boolean;
  /** Mirrors the add box as typed, so the sheet can save an uncommitted line on Done / tap-away (Ali 2026-09-24: "subtasks get lost"). */
  draftRef?: React.MutableRefObject<string>;
}) {
  const items = parseSubtasks(notes);
  const [draft, setDraftState] = useState("");
  const setDraft = (v: string) => { if (draftRef) draftRef.current = v; setDraftState(v); };
  const addBox = useRef<HTMLInputElement | null>(null);
  const write = (next: SubTask[]) => onChange(next.length ? serializeSubtasks(next) : null);
  // Return in the add box appends and keeps the caret there · the next subtask is immediate.
  const add = (refocus = true) => {
    if (!draft.trim()) return;
    write([...items, { text: draft.trim(), done: false }]); setDraft("");
    if (refocus) addBox.current?.focus();
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; write(next);
  };

  return (
    <div style={{ display: "grid", gap: ordered ? 2 : 0 }}>

      {items.map((s, i) => (
        <SubtaskEditRow key={i} s={s} ordered={ordered}
          onTick={() => write(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
          onText={(v) => write(items.map((x, j) => (j === i ? { ...x, text: v } : x)))}
          onEnter={() => addBox.current?.focus()}
          onRemove={ordered ? () => write(items.filter((_, j) => j !== i)) : undefined}
          onMove={ordered ? (dir) => move(i, dir) : undefined}
          first={i === 0} last={i === items.length - 1} />
      ))}
      <div style={{ display: "grid", gridTemplateColumns: ordered ? "40px 1fr auto" : "40px 1fr", alignItems: "center", marginTop: 6 }}>
        <span aria-hidden style={{ color: "var(--ink-4)", fontSize: 19, textAlign: "center" }}>+</span>
        <input ref={addBox} className="cc-input" value={draft} autoFocus={autoFocus} onChange={(e) => setDraft(e.target.value)} enterKeyHint="next"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={() => add(false)}
          placeholder={placeholder} style={{ fontSize: 16, minHeight: 44, borderRadius: 10 }} />
        {ordered && <button type="button" onClick={() => add()} disabled={!draft.trim()} className="cc-btn cc-btn-secondary" style={{ minHeight: 44, minWidth: 44, borderRadius: 10, fontSize: 18, padding: 0, marginLeft: 8 }} aria-label="Add item">+</button>}
      </div>
    </div>
  );
}

/** One editable line: checkbox + full-width box (+ arrows and ✕ only in docs). */
function SubtaskEditRow({ s, ordered, onTick, onText, onEnter, onRemove, onMove, first, last }: {
  s: SubTask; ordered: boolean;
  onTick: () => void; onText: (v: string) => void; onEnter: () => void;
  onRemove?: () => void; onMove?: (dir: -1 | 1) => void; first: boolean; last: boolean;
}) {
  const [celebrating, start] = useCelebration();
  const cols = ordered ? "40px 1fr auto" : "40px 1fr";
  // The row keeps the text AS TYPED while it has focus. The stored line is trimmed on every
  // save (serializeSubtasks / parseSubtasks), so a write-through field lost a trailing space
  // before the next letter arrived: no space could ever be typed into an existing subtask
  // (Ali 2026-09-27). `expect` = the trimmed text the parent should now hold; while it matches,
  // the typed text is shown. An emptied line is removed on blur, never mid-typing.
  const [local, setLocal] = useState<{ typed: string; expect: string } | null>(null);
  const value = local && local.expect === s.text ? local.typed : s.text;
  const change = (v: string) => {
    const t = v.trim();
    setLocal((l) => ({ typed: v, expect: t || l?.expect || s.text }));
    if (t) onText(v);
  };
  const commit = () => {
    if (local && !local.typed.trim()) onText("");
    setLocal(null);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", minHeight: 46, borderBottom: "1px solid var(--line)" }}>
      <TickBox done={s.done} celebrating={celebrating} onTick={() => (s.done ? onTick() : start(onTick))} />
      {celebrating || s.done ? (
        // Struck-through text: during the half-second sweep (a textarea cannot carry the animation)
        // and for as long as the line is done · the box on the left clears it.
        <span className={celebrating ? "cc-done-strike" : undefined} style={{ display: "inline-block", fontSize: 16, lineHeight: 1.4, color: "var(--ink-3)", padding: "8px 10px 8px 0", overflowWrap: "anywhere", textDecoration: celebrating ? undefined : "line-through", textDecorationColor: "var(--ink-4)" }}>{s.text}</span>
      ) : (
        <GrowInput value={value} onChange={change} onCommit={commit} onEnter={onEnter} ariaLabel="Subtask"
          style={{ background: "transparent", border: "none", borderRadius: 0, padding: "8px 10px 8px 0" }} />
      )}
      {ordered && (
        <span style={{ display: "flex" }}>
          <button type="button" onClick={() => onMove?.(-1)} disabled={first} aria-label="Move up" style={{ width: 30, height: 40, background: "transparent", border: "none", color: first ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↑</button>
          <button type="button" onClick={() => onMove?.(1)} disabled={last} aria-label="Move down" style={{ width: 30, height: 40, background: "transparent", border: "none", color: last ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↓</button>
          <button type="button" onClick={onRemove} aria-label="Remove item" style={{ width: 34, height: 40, background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 15, cursor: "pointer" }}>✕</button>
        </span>
      )}
    </div>
  );
}
