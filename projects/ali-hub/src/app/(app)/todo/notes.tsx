"use client";

/**
 * Notes, shown four ways (2026-09-12, Ali):
 *   NotesPreview   · a task's notes under its title: first 3 lines, tap = whole text, tap = back.
 *   SubtaskList    · a task's notes as subtasks, ticked inline with the same pop, ring, strike
 *                    and chime as a normal to-do. Three shown, "+N more" opens the rest.
 *   SubtaskEditor  · the same items inside a sheet: add, edit, tick, reorder, remove, reset.
 *   SectionsView   · a doc split at "# Heading" lines: Sections (several open) or Accordion (one).
 * Nothing here is hover-only · every control is a tap target.
 */

import { useEffect, useRef, useState } from "react";
import { Linkify } from "@/components/Linkify";
import { playDoneSound } from "@/lib/todo/celebrate";
import { parseSections, parseSubtasks, serializeSubtasks, type SubTask } from "@/lib/todo/types";

/** Notes as shown in previews: list markers become glyphs, heading marks go. */
export function prettyNotes(notes: string): string {
  return notes
    .replace(/^(\s*)- \[ \] /gm, "$1☐ ")
    .replace(/^(\s*)- \[[xX]\] /gm, "$1☑ ")
    .replace(/^(\s*)- /gm, "$1• ")
    .replace(/^#{1,3} (.*)$/gm, "$1");
}

const PREVIEW_LINES = 3;

/** First 3 lines, tap to read all of it, tap again to fold. */
export function NotesPreview({ notes, indent = 48 }: { notes: string; indent?: number }) {
  const [open, setOpen] = useState(false);
  const lines = notes.split("\n").filter((l) => l.trim());
  const more = lines.length > PREVIEW_LINES;
  const text = open ? prettyNotes(notes) : prettyNotes(lines.slice(0, PREVIEW_LINES).join("\n"));
  return (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", font: "inherit", cursor: "pointer",
        padding: `0 12px 10px ${indent}px`, color: "var(--ink-2)", WebkitTapHighlightColor: "transparent" }}>
      <span style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: open ? "unset" : PREVIEW_LINES, overflow: "hidden",
        fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        <Linkify text={text} />
      </span>
      {(more || open) && <span style={{ display: "block", fontSize: 13, color: "var(--ink-4)", marginTop: 2 }}>{open ? "Show less" : `Show all · ${lines.length} lines`}</span>}
    </button>
  );
}

// ─── One subtask row · shared by the inline list and the sheet editor ─────────

function SubtaskRow({ s, onTick, onText, onRemove, editable }: {
  s: SubTask; onTick: () => void; onText?: (v: string) => void; onRemove?: () => void; editable: boolean;
}) {
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const tick = () => {
    if (s.done) { onTick(); return; }
    if (celebrating) return;
    setCelebrating(true);
    playDoneSound();
    timer.current = window.setTimeout(() => { setCelebrating(false); onTick(); }, 650);
  };
  const showDone = s.done || celebrating;
  return (
    <div style={{ display: "grid", gridTemplateColumns: editable ? "40px 1fr auto" : "40px 1fr", alignItems: "center", minHeight: editable ? 46 : 38 }}>
      <button type="button" onClick={tick} aria-label={s.done ? "Mark subtask not done" : "Mark subtask done"} aria-pressed={showDone}
        style={{ width: 40, minHeight: editable ? 46 : 38, background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span aria-hidden className={celebrating ? "cc-done-pop" : undefined} style={{ position: "relative", width: 20, height: 20, borderRadius: 6, border: `2px solid ${showDone ? "transparent" : "var(--line-strong)"}`, background: showDone ? "var(--pos)" : "var(--fill-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}>
          {showDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          {celebrating && <span className="cc-done-ring" />}
        </span>
      </button>
      {editable && onText ? (
        <input className="cc-input" value={s.text} onChange={(e) => onText(e.target.value)} aria-label="Subtask"
          style={{ fontSize: 16, minHeight: 40, padding: "0 10px", textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--ink-3)" : "var(--ink)" }} />
      ) : (
        <span className={celebrating ? "cc-done-strike" : undefined} style={{ display: "inline-block", fontSize: 15, lineHeight: 1.4, color: showDone ? "var(--ink-3)" : "var(--ink-2)", textDecoration: s.done ? "line-through" : "none", textDecorationColor: "var(--ink-4)", overflowWrap: "anywhere", paddingRight: 8 }}>
          <Linkify text={s.text} />
        </span>
      )}
      {editable && onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove subtask" style={{ width: 40, height: 46, background: "transparent", border: "none", color: "var(--ink-3)", fontSize: 15, cursor: "pointer" }}>✕</button>
      )}
    </div>
  );
}

/** Subtasks under a task row · open ones first, three at a time. */
export function SubtaskList({ notes, onChange, indent = 48 }: { notes: string; onChange: (notes: string | null) => void; indent?: number }) {
  const items = parseSubtasks(notes);
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, PREVIEW_LINES);
  const done = items.filter((s) => s.done).length;
  const toggle = (i: number) => onChange(serializeSubtasks(items.map((s, j) => (j === i ? { ...s, done: !s.done } : s))));
  return (
    <div style={{ padding: `0 12px 8px ${indent - 8}px` }}>
      {shown.map((s, i) => <SubtaskRow key={`${i}-${s.text}`} s={s} onTick={() => toggle(items.indexOf(s))} editable={false} />)}
      {(items.length > PREVIEW_LINES || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ background: "transparent", border: "none", font: "inherit", fontSize: 13, color: "var(--ink-4)", padding: "4px 0 2px 40px", cursor: "pointer", minHeight: 32 }}>
          {open ? "Show less" : `+${items.length - PREVIEW_LINES} more · ${done}/${items.length} done`}
        </button>
      )}
    </div>
  );
}

/** Subtasks inside a sheet: add, edit, tick, reorder, remove, reset. */
export function SubtaskEditor({ notes, onChange, placeholder = "Add a subtask", autoFocus = false, showReset = false }: {
  notes: string | null; onChange: (notes: string | null) => void; placeholder?: string; autoFocus?: boolean; showReset?: boolean;
}) {
  const items = parseSubtasks(notes);
  const [draft, setDraft] = useState("");
  const write = (next: SubTask[]) => onChange(serializeSubtasks(next));
  const add = () => { if (!draft.trim()) return; write([...items, { text: draft.trim(), done: false }]); setDraft(""); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; write(next);
  };
  const done = items.filter((s) => s.done).length;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {items.length === 0 && <div style={{ fontSize: 14.5, color: "var(--ink-3)", padding: "6px 2px" }}>No subtasks yet · add the first one below.</div>}
      {items.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
          <SubtaskRow s={s} editable
            onTick={() => write(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
            onText={(v) => write(items.map((x, j) => (j === i ? { ...x, text: v } : x)))}
            onRemove={() => write(items.filter((_, j) => j !== i))} />
          <span style={{ display: "flex" }}>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" style={{ width: 30, height: 40, background: "transparent", border: "none", color: i === 0 ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" style={{ width: 30, height: 40, background: "transparent", border: "none", color: i === items.length - 1 ? "var(--ink-4)" : "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>↓</button>
          </span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}>
        <input className="cc-input" value={draft} autoFocus={autoFocus} onChange={(e) => setDraft(e.target.value)} enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} style={{ fontSize: 16, minHeight: 46, borderRadius: 12 }} />
        <button type="button" onClick={add} disabled={!draft.trim()} className="cc-btn cc-btn-secondary" style={{ minHeight: 46, minWidth: 46, borderRadius: 12, fontSize: 18, padding: 0 }} aria-label="Add subtask">+</button>
      </div>
      {items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--ink-4)", padding: "6px 2px 0" }}>
          <span>{done}/{items.length} done</span>
          {showReset && done > 0 && <button type="button" onClick={() => write(items.map((s) => ({ ...s, done: false })))} className="cc-btn cc-btn-ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }}>Untick all</button>}
        </div>
      )}
    </div>
  );
}

/** A doc split at "# Heading" lines. `single` = accordion (one open at a time). */
export function SectionsView({ notes, single }: { notes: string; single: boolean }) {
  const sections = parseSections(notes);
  const [open, setOpen] = useState<Record<number, boolean>>(() => (single ? {} : {}));
  const toggle = (i: number) => setOpen((o) => (single ? { [i]: !o[i] } : { ...o, [i]: !o[i] }));
  if (sections.length === 0) return <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "10px 2px" }}>Nothing here yet · tap Edit and start a section with a # heading.</div>;
  return (
    <div style={{ display: "grid" }}>
      {sections.map((s, i) => {
        if (s.title === null) {
          return <div key={i} style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "6px 2px 12px" }}><Linkify text={prettyNotes(s.body)} /></div>;
        }
        const on = !!open[i];
        return (
          <div key={i} style={{ borderBottom: "1px solid var(--line)" }}>
            <button type="button" onClick={() => toggle(i)} aria-expanded={on}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", minHeight: 50, padding: "8px 2px", background: "transparent", border: "none", textAlign: "left", color: "var(--ink)", font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{s.title}</span>
              <span aria-hidden style={{ color: "var(--ink-4)", fontSize: 13, transform: on ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
            </button>
            {on && (
              <div style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "0 2px 14px" }}>
                {s.body.trim() ? <Linkify text={prettyNotes(s.body)} /> : <span style={{ color: "var(--ink-4)" }}>Empty section</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
