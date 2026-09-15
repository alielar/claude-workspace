"use client";

/**
 * The to-do sheets and the pieces they are built from · extracted from /todo 2026-09-15
 * so the Today page can open the SAME task sheet (Ali: "tapping a to-do on Today should
 * open the edit screen, not send me to the To-do page").
 *
 *   Sheet      · the task detail sheet (title, list, priority, when, reminder, notes/subtasks)
 *   ListSheet  · the doc sheet (five display shapes, ordering kept on purpose)
 *   SheetFrame · bottom sheet that always sits inside the keyboard-free viewport
 *   NotesEditor· auto-growing notes textarea that follows the caret
 *
 * Nothing here talks to the network: every sheet takes a Todo and hands back a Todo.
 */

import { useEffect, useRef, useState } from "react";
import { Linkify, LinkChips } from "@/components/Linkify";
import { SubtaskEditor, SectionsView, GrowInput } from "./notes";
import {
  addDays, AREAS, fmtDue, nextMonday, nextWeekend, docFormat, taskFormat, DOC_FORMATS, TASK_FORMATS,
  type Format, type Priority, type Todo,
} from "@/lib/todo/types";

export function openPicker(e: React.SyntheticEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.focus(); el.showPicker?.(); } catch { /* focus alone still works */ }
}

// While a sheet is open, the page behind it must not scroll (iOS otherwise keeps
// scrolling the background and gets stuck until the app is reopened).
export function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

// The part of the screen the keyboard does NOT cover (2026-09-13, Ali: "the keyboard
// hides the line I'm typing"). iOS shrinks and shifts the visual viewport when the
// keyboard opens; `position: fixed; bottom: 0` knows nothing about that and the sheet's
// lower part ends up under the keys. Sheets are therefore placed inside this box.
export function useVisualViewport() {
  const read = () => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    return { top: vv?.offsetTop ?? 0, height: vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 800) };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setBox(read());
    update();
    vv?.addEventListener("resize", update); vv?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { vv?.removeEventListener("resize", update); vv?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return box;
}

/** Bottom sheet that always sits inside the visible (keyboard-free) part of the screen. */
export function SheetFrame({ label, onClose, fill = false, children }: { label: string; onClose: () => void; fill?: boolean; children: React.ReactNode }) {
  const vv = useVisualViewport();
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div style={{ position: "fixed", left: 0, right: 0, top: vv.top, height: vv.height, zIndex: 71, display: "flex", flexDirection: "column", justifyContent: "flex-end", pointerEvents: "none" }}>
        <div role="dialog" aria-label={label} className="cc-sheet-panel" style={{ pointerEvents: "auto", background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0",
          padding: `${fill ? 12 : 12}px 16px calc(env(safe-area-inset-bottom) + ${fill ? 12 : 12}px)`, width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box",
          display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: "0 1 auto",
          // never under the clock: the status bar (safe-area top) plus a sliver of the page stay visible
          maxHeight: "calc(100% - env(safe-area-inset-top) - 20px)", height: fill ? "calc(100% - env(safe-area-inset-top) - 20px)" : undefined,
          overflowY: fill ? "hidden" : "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ─── Notes editor (tasks + lists) ─────────────────────────────────────────────
//
// Google-Docs feel (Ali 2026-09-11): the textarea grows with its text and never
// scrolls inside itself; after every keystroke the caret line is scrolled into view
// above the keyboard. Textareas expose no caret coordinates, so the caret is
// measured with a hidden mirror element carrying the same font and width.
// Structure: headings (# ), bullets (- ), numbers (1. ), checkboxes (- [ ] / - [x]),
// indent/outdent · return continues a list, return on an empty item ends it.

function caretLine(el: HTMLTextAreaElement): { top: number; height: number } {
  const cs = getComputedStyle(el);
  const m = document.createElement("div");
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "width"] as const) {
    m.style[prop] = cs[prop];
  }
  Object.assign(m.style, { position: "absolute", top: "0", left: "-9999px", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", height: "auto" });
  m.textContent = el.value.slice(0, el.selectionStart);
  const mark = document.createElement("span");
  mark.textContent = "\u200b";
  m.appendChild(mark);
  document.body.appendChild(m);
  const out = { top: mark.offsetTop, height: mark.offsetHeight || parseFloat(cs.lineHeight) || 24 };
  document.body.removeChild(m);
  return out;
}

function scrollCaretIntoView(el: HTMLTextAreaElement) {
  const { top, height } = caretLine(el);
  // 1 · inside the textarea (it scrolls itself once it reaches its cap).
  const pad = 8;
  if (el.scrollHeight > el.clientHeight + 1) {
    if (top + height > el.scrollTop + el.clientHeight - pad) el.scrollTop = top + height - el.clientHeight + pad;
    else if (top < el.scrollTop + pad) el.scrollTop = Math.max(0, top - pad);
  }
  // 2 · the caret line, now in textarea coordinates, must sit inside the keyboard-free viewport.
  const y = el.getBoundingClientRect().top + top - el.scrollTop;
  const vv = window.visualViewport;
  const vTop = vv?.offsetTop ?? 0;
  const vBottom = vTop + (vv?.height ?? window.innerHeight);
  const margin = 56;
  let sc: HTMLElement | null = el.parentElement;
  while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const target = sc ?? (document.scrollingElement as HTMLElement | null);
  if (!target) return;
  if (y + height > vBottom - margin) target.scrollTop += y + height - (vBottom - margin);
  else if (y < vTop + margin) target.scrollTop -= vTop + margin - y;
}

const LIST_PREFIX = /^(\s*)(- \[[ xX]\] |- |(\d+)\. )/;

export function NotesEditor({ value, onChange, rows = 4, placeholder, autoFocus = false, fill = false }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder: string; autoFocus?: boolean; fill?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const vv = useVisualViewport();
  const minHeight = fill ? 160 : rows * 24 + 24;
  // Grows with the text up to ~40 % of the keyboard-free screen, then scrolls inside itself:
  // the browser keeps the caret visible in a scrolling textarea natively, and the box
  // itself always fits above the keyboard (Ali 2026-09-13). `fill` = the doc editor,
  // which simply takes all the room the sheet has.
  const cap = fill ? undefined : Math.max(minHeight, Math.round(vv.height * 0.4));

  const grow = () => {
    const el = ref.current; if (!el || fill) return;
    const keep = el.scrollTop;
    el.style.height = "auto";
    const want = Math.max(minHeight, el.scrollHeight + 2);
    el.style.height = `${cap ? Math.min(want, cap) : want}px`;
    el.scrollTop = keep;
  };
  const follow = () => { const el = ref.current; if (el && document.activeElement === el) scrollCaretIntoView(el); };
  // Ali 2026-09-13: "when I tap into the notes it recentres · it should just scroll down so
  // the Done button sits above the keyboard and the notes above it". iOS centres a focused
  // field on its own; once the keyboard has settled we park the sheet at its bottom instead.
  const parkAtBottom = () => {
    const el = ref.current; if (!el || fill || document.activeElement !== el) return;
    let sc: HTMLElement | null = el.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (sc) sc.scrollTop = sc.scrollHeight;
    follow();
  };
  useEffect(() => { grow(); }, [value, cap]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The keyboard opening shrinks the visual viewport · park then re-check the caret (twice:
    // iOS reports the final size a moment after the first event).
    const v = window.visualViewport; if (!v) return;
    const onResize = () => { parkAtBottom(); setTimeout(parkAtBottom, 150); setTimeout(parkAtBottom, 400); };
    v.addEventListener("resize", onResize);
    return () => v.removeEventListener("resize", onResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (v: string, selStart: number, selEnd: number) => {
    onChange(v);
    requestAnimationFrame(() => {
      const el = ref.current; if (!el) return;
      el.focus(); el.setSelectionRange(selStart, selEnd); grow(); scrollCaretIntoView(el);
    });
  };
  // Toolbar taps must not steal focus from the textarea · on iOS a focus change
  // closes and reopens the keyboard and the whole sheet jumps, losing the caret.
  const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();
  const lineBounds = (v: string, a: number) => {
    const ls = v.lastIndexOf("\n", a - 1) + 1;
    const leRaw = v.indexOf("\n", a);
    return { ls, le: leRaw === -1 ? v.length : leRaw };
  };
  /** Put a list/heading marker on the current line (replacing any existing marker). */
  const setMarker = (marker: string) => {
    const el = ref.current; if (!el) return;
    const v = el.value, a = el.selectionStart;
    const { ls, le } = lineBounds(v, a);
    const line = v.slice(ls, le);
    const m = line.match(/^(\s*)(- \[[ xX]\] |- |\d+\. |#{1,3} )?/);
    const indent = m?.[1] ?? "", old = m?.[2] ?? "";
    const same = old === marker;
    const next = indent + (same ? "" : marker) + line.slice(indent.length + old.length);
    const shift = (same ? 0 : marker.length) - old.length;
    apply(v.slice(0, ls) + next + v.slice(le), Math.max(ls, a + shift), Math.max(ls, a + shift));
  };
  /** Tick / untick the checkbox on the current line (adds one if there is none). */
  const toggleCheck = () => {
    const el = ref.current; if (!el) return;
    const v = el.value, a = el.selectionStart;
    const { ls, le } = lineBounds(v, a);
    const line = v.slice(ls, le);
    let next: string;
    if (/^\s*- \[ \] /.test(line)) next = line.replace("- [ ] ", "- [x] ");
    else if (/^\s*- \[[xX]\] /.test(line)) next = line.replace(/- \[[xX]\] /, "- [ ] ");
    else if (/^\s*- /.test(line)) next = line.replace("- ", "- [ ] ");
    else next = line.replace(/^(\s*)/, "$1- [ ] ");
    const shift = next.length - line.length;
    apply(v.slice(0, ls) + next + v.slice(le), a + shift, a + shift);
  };
  const indent = (dir: 1 | -1) => {
    const el = ref.current; if (!el) return;
    const v = el.value, a = el.selectionStart;
    const { ls, le } = lineBounds(v, a);
    const line = v.slice(ls, le);
    const next = dir === 1 ? `  ${line}` : line.replace(/^ {1,2}/, "");
    const shift = next.length - line.length;
    apply(v.slice(0, ls) + next + v.slice(le), Math.max(ls, a + shift), Math.max(ls, a + shift));
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") { e.preventDefault(); indent(e.shiftKey ? -1 : 1); return; }
    if (e.key !== "Enter") return;
    const el = e.currentTarget, v = el.value, a = el.selectionStart;
    const ls = v.lastIndexOf("\n", a - 1) + 1;
    const line = v.slice(ls, a);
    const m = line.match(LIST_PREFIX);
    if (!m) return;
    e.preventDefault();
    if (line === m[0]) { apply(v.slice(0, ls) + v.slice(a), ls, ls); return; } // empty item ends the list
    const marker = m[3] ? `${Number(m[3]) + 1}. ` : m[2].startsWith("- [") ? "- [ ] " : m[2];
    const next = m[1] + marker;
    apply(v.slice(0, a) + "\n" + next + v.slice(el.selectionEnd), a + 1 + next.length, a + 1 + next.length);
  };
  const btn: React.CSSProperties = { minWidth: 38, minHeight: 36, padding: "0 6px", borderRadius: 10, border: "1px solid var(--line-hi)", background: "var(--fill-1)", color: "var(--ink-2)", font: "inherit", fontSize: 14, cursor: "pointer" };
  return (
    <div style={fill ? { display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 } : { display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }} aria-label="Formatting">
        <button type="button" title="Heading" onMouseDown={keepFocus} onClick={() => setMarker("# ")} style={{ ...btn, fontWeight: 700 }}>H</button>
        <button type="button" title="Bullet list" onMouseDown={keepFocus} onClick={() => setMarker("- ")} style={btn}>•</button>
        <button type="button" title="Numbered list" onMouseDown={keepFocus} onClick={() => setMarker("1. ")} style={btn}>1.</button>
        <button type="button" title="Checklist" onMouseDown={keepFocus} onClick={() => setMarker("- [ ] ")} style={btn}>☐</button>
        <button type="button" title="Tick / untick this line" onMouseDown={keepFocus} onClick={toggleCheck} style={btn}>✓</button>
        <button type="button" title="Indent" onMouseDown={keepFocus} onClick={() => indent(1)} style={btn}>⇥</button>
        <button type="button" title="Outdent" onMouseDown={keepFocus} onClick={() => indent(-1)} style={btn}>⇤</button>
        <span style={{ flex: 1 }} />
        <button type="button" title="Jump to the end" onMouseDown={keepFocus} style={btn} onClick={() => {
          const el = ref.current; if (!el) return;
          const n = el.value.length; apply(el.value, n, n);
        }}>⇣</button>
      </div>
      <textarea ref={ref} className="cc-input" value={value} onChange={(e) => { onChange(e.target.value); requestAnimationFrame(() => { grow(); follow(); }); }}
        onKeyDown={onKey} onKeyUp={(e) => { if (e.key.startsWith("Arrow")) follow(); }} onClick={follow} onFocus={() => { requestAnimationFrame(parkAtBottom); setTimeout(parkAtBottom, 350); }}
        placeholder={placeholder} rows={rows} autoFocus={autoFocus} spellCheck
        style={fill
          ? { fontSize: 16, lineHeight: 1.5, resize: "none", overflowY: "auto", flex: 1, minHeight, width: "100%", boxSizing: "border-box", WebkitOverflowScrolling: "touch" }
          : { fontSize: 16, lineHeight: 1.5, resize: "none", overflowY: "auto", minHeight, maxHeight: cap, width: "100%", boxSizing: "border-box", WebkitOverflowScrolling: "touch" }} />
      <LinkChips text={value} />
    </div>
  );
}


// ─── Shared chip style ────────────────────────────────────────────────────────

export const chipStyle = (on: boolean): React.CSSProperties => ({
  minHeight: 38, padding: "0 11px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

// Reminder cadence · a real picker (Ali 2026-09-11: the tap-to-cycle chip is gone).
// A <select> opens the same native wheel iOS uses for the date and time fields.
const NAG_OPTIONS = [5, 10, 15, 30, 60];
export function NagSelect({ value, onChange }: { value: number | null | undefined; onChange: (m: number) => void }) {
  const cur = value ?? 30;
  return (
    <select className="cc-input" value={NAG_OPTIONS.includes(cur) ? cur : 30} onChange={(e) => onChange(Number(e.target.value))} aria-label="How often it reminds until done"
      style={{ fontSize: 15, minHeight: 36, padding: "0 8px", borderRadius: 10, width: "auto", color: "var(--ink-2)", WebkitAppearance: "menulist", appearance: "auto" }}>
      {NAG_OPTIONS.map((m) => <option key={m} value={m}>every {m} min</option>)}
    </select>
  );
}

// Project · rarely used, so one quiet line (Ali 2026-09-11: it was a full-size
// field). Tap to reveal a compact input with the known projects as suggestions.
export function ProjectField({ value, onChange, projects, listId, label = "project" }: { value: string | null | undefined; onChange: (v: string | null) => void; projects: string[]; listId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", fontSize: 13.5, color: value ? "var(--ink-3)" : "var(--ink-4)", minHeight: 32, display: "flex", alignItems: "center", gap: 6 }}>
        {value ? `#${value}` : `+ ${label}`} <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <input className="cc-input" list={listId} value={value ?? ""} autoFocus onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") || null)} placeholder="none"
            style={{ fontSize: 16, minHeight: 36, width: 150, padding: "0 10px", borderRadius: 10 }} />
          <datalist id={listId}>{projects.map((p) => <option key={p} value={p} />)}</datalist>
          {value && <button type="button" onClick={() => onChange(null)} className="cc-btn cc-btn-ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }}>Clear</button>}
        </>
      )}
    </div>
  );
}

// Title field that grows with its text · long titles wrap instead of hiding
// their end behind horizontal scroll. Enter closes the keyboard.
export function TitleInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [value]);
  return (
    <textarea ref={ref} className="cc-input" rows={1} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      style={{ fontSize: 18, fontWeight: 500, minHeight: 48, resize: "none", overflow: "hidden", lineHeight: 1.35, width: "100%", boxSizing: "border-box" }} />
  );
}

// One discreet line · tap to open the sleep-until date, tap again to fold it away.
export function VaultField({ wakeDate, setWake, today }: { wakeDate: string | null | undefined; setWake: (v: string | null) => void; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "grid", gap: 4, flexBasis: open ? "100%" : undefined }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", fontSize: 13.5, color: wakeDate ? "var(--ink-3)" : "var(--ink-4)", minHeight: 32, display: "flex", alignItems: "center", gap: 6 }}>
        {wakeDate ? `Sleeping until ${fmtDue(wakeDate, today)}` : "Vault"} <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: wakeDate ? "1fr auto" : "1fr", gap: 8 }}>
          <input type="date" className="cc-input" value={wakeDate ?? ""} min={addDays(today, 1)} onClick={openPicker} onChange={(e) => setWake(e.target.value || null)} style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
          {wakeDate && <button type="button" onClick={() => setWake(null)} className="cc-btn cc-btn-ghost" style={{ minHeight: 44, padding: "0 12px", fontSize: 14 }}>Wake now</button>}
        </div>
      )}
    </div>
  );
}

// ─── Task detail sheet ────────────────────────────────────────────────────────

export function Sheet({ t, today, projects, isNew = false, onSave, onDelete, onClose }: {
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
    { label: "Next week", on: isWhen(nextMonday(today), false, false),  go: () => when(nextMonday(today)) },
    { label: "Tomorrow",  on: isWhen(addDays(today, 1), false, false),  go: () => when(addDays(today, 1)) },
    { label: "Weekend",   on: isWhen(nextWeekend(today), false, false), go: () => when(nextWeekend(today)) },
    { label: "Someday",   on: d.someday || !d.dueDate,                 go: () => when(null, false, true) },
  ];

  return (
    <SheetFrame label="Edit task" onClose={close}>
        <TitleInput value={d.title} onChange={(v) => set({ title: v })} placeholder="What needs doing?" />

        {/* One row: list (Personal / Work) and priority (none / ! / !!) · was two rows (Ali 2026-09-13: fit the phone) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 10px 44px 44px 48px", gap: 6 }}>
          {AREAS.map((a) => <button key={a.key} onClick={() => set({ area: a.key })} style={chipStyle((d.area ?? "personal") === a.key)}>{a.label}</button>)}
          <span aria-hidden />
          {([0, 1, 2] as Priority[]).map((p) => (
            <button key={p} onClick={() => set({ priority: p })} aria-label={p === 0 ? "Normal priority" : p === 1 ? "Important" : "Urgent"} aria-pressed={d.priority === p}
              style={{ ...chipStyle(d.priority === p), padding: 0, color: d.priority === p ? (p === 2 ? "var(--neg)" : p === 1 ? "var(--warn)" : "var(--ink)") : "var(--ink-3)", fontWeight: p ? 700 : 500 }}>{p === 0 ? "–" : p === 1 ? "!" : "!!"}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <button key={c.label} onClick={c.go} style={chipStyle(c.on)}>{c.label}</button>)}
          <label style={{ ...chipStyle(!!d.dueDate && !chips.slice(0, 4).some((c) => c.on)), display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
            {d.dueDate && !chips.slice(0, 4).some((c) => c.on) ? fmtDue(d.dueDate, today) : "Pick a date"}
            <input type="date" value={d.dueDate ?? ""} min={today} onClick={openPicker} onChange={(e) => e.target.value && when(e.target.value, d.evening)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 17 }} />
          </label>
        </div>

        {/* Reminder time + cadence on one line, label inline */}
        <div style={{ display: "grid", gridTemplateColumns: !!d.dueDate && !d.someday ? "auto minmax(0, 1fr) auto" : "auto minmax(0, 1fr)", gap: 8, alignItems: "center", minWidth: 0 }}>
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>Remind</span>
          <input type="time" className="cc-input" value={d.dueTime ?? ""} disabled={d.someday} onClick={openPicker} onChange={(e) => set({ dueTime: e.target.value || null, dueDate: d.dueDate ?? (e.target.value ? today : null) })} style={{ fontSize: 17, minHeight: 42, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
          {!!d.dueDate && !d.someday && <NagSelect value={d.nagMinutes} onChange={(m) => set({ nagMinutes: m })} />}
        </div>
        {!!d.dueDate && !d.dueTime && !d.someday && <span style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: -6 }}>no time = reminds from 9:00</span>}

        {/* project · Vault · Notes/Subtasks switch on one quiet line */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <ProjectField value={d.project} onChange={(v) => set({ project: v })} projects={projects} listId="todo-projects" />
          <VaultField wakeDate={d.wakeDate} setWake={(v) => set({ wakeDate: v })} today={today} />
          <span style={{ flex: 1 }} />
          <div role="tablist" aria-label="Notes shape" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, padding: 2, borderRadius: 10, background: "var(--fill-1)" }}>
            {TASK_FORMATS.map((f) => {
              const on = taskFormat(d) === f.key;
              return <button key={f.key} role="tab" aria-selected={on} onClick={() => set({ format: f.key })} style={{ minHeight: 32, padding: "0 10px", borderRadius: 8, border: "none", font: "inherit", fontSize: 13.5, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", cursor: "pointer" }}>{f.label}</button>;
            })}
          </div>
        </div>

        {/* Notes / Subtasks · last field on purpose: with the keyboard open the sheet parks at its bottom, notes right above Done. */}
        {taskFormat(d) === "checklist"
          ? <SubtaskEditor notes={d.notes ?? null} onChange={(v) => set({ notes: v })} />
          : <NotesEditor value={d.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="Notes" rows={3} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={close} style={{ minHeight: 48, borderRadius: 14, fontSize: 17 }}>{isNew ? "Add task" : "Done"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={() => { if (isNew || confirm("Delete this task?")) { onDelete(); onClose(); } }} style={{ minHeight: 48, minWidth: 48, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label={isNew ? "Discard" : "Delete"}>✕</button>
        </div>
    </SheetFrame>
  );
}

// ─── List sheet (Lists segment) · a place to write, not to schedule ──────────

export function ListSheet({ t, today, tags, isNew = false, onSave, onDelete, onClose }: {
  t: Todo; today: string; tags: string[]; isNew?: boolean;
  onSave: (t: Todo) => void; onDelete: () => void; onClose: () => void;
}) {
  useLockBodyScroll();
  const [d, setD] = useState<Todo>(t);
  const set = (p: Partial<Todo>) => setD((x) => ({ ...x, ...p }));
  const close = () => { if (d.title.trim()) onSave({ ...d, title: d.title.trim() }); onClose(); };
  const [remind, setRemind] = useState(!!t.dueDate);

  // Five shapes for the same stored text (Ali 2026-09-12): List, Checklist, Document,
  // Sections, Accordion. Saved on the doc (`format`); older docs are detected from the text.
  const mode: Format = docFormat(d);
  const [editingDoc, setEditingDoc] = useState(isNew); // Sections / Accordion: read view by default, Edit to write
  const items = (d.notes ?? "").split("\n").map((l) => l.replace(/^- (\[[ xX]\] )?/, "")).filter((l) => l.trim());
  const writeItems = (list: string[]) => set({ notes: list.length ? list.map((i) => `- ${i.trim()}`).join("\n") : null });
  const setFormat = (f: Format) => {
    if (f === "list") set({ format: f, notes: (d.notes ?? "").split("\n").map((l) => l.replace(/^- (\[[ xX]\] )?/, "").replace(/^\d+\. /, "")).filter((l) => l.trim()).map((l) => `- ${l.trim()}`).join("\n") || null });
    else set({ format: f });
    if (f === "sections" || f === "accordion") setEditingDoc(!(d.notes ?? "").trim());
  };

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

  return (
    <SheetFrame label="Edit doc" onClose={close} fill>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}><TitleInput value={d.title} onChange={(v) => set({ title: v })} placeholder="Name" /></div>
          <select className="cc-input" value={mode} onChange={(e) => setFormat(e.target.value as Format)} aria-label="How this doc displays"
            style={{ minHeight: 44, fontSize: 15, padding: "0 8px", borderRadius: 12, width: "auto", maxWidth: 132, color: "var(--ink-2)", WebkitAppearance: "menulist", appearance: "auto" }}>
            {DOC_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={close} aria-label="Close" style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "var(--fill-1)", color: "var(--ink-2)", fontSize: 17, cursor: "pointer" }}>✕</button>
        </div>

        {isNew && !(d.notes ?? "").trim() && (
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>How should it display? You can change this any time.</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {DOC_FORMATS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFormat(f.key)} aria-pressed={mode === f.key}
                  style={{ ...chipStyle(mode === f.key), minHeight: 52, padding: "6px 10px", textAlign: "left", display: "grid", gap: 1 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{f.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: mode === "doc" || (editingDoc && (mode === "sections" || mode === "accordion")) ? "hidden" : "auto", display: "flex", flexDirection: "column", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {mode === "doc" ? (
          <NotesEditor value={d.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="" fill />
        ) : mode === "checklist" ? (
          <SubtaskEditor notes={d.notes ?? null} onChange={(v) => set({ notes: v })} placeholder="Add an item" autoFocus={isNew} />
        ) : mode === "sections" || mode === "accordion" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>{editingDoc ? "Start each section with a # heading (the H button)." : DOC_FORMATS.find((f) => f.key === mode)?.hint}</span>
              <button type="button" onClick={() => setEditingDoc((v) => !v)} className="cc-btn cc-btn-ghost" style={{ minHeight: 40, padding: "0 12px", fontSize: 14 }}>{editingDoc ? "Read" : "Edit"}</button>
            </div>
            {editingDoc
              ? <NotesEditor value={d.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="# First section" fill />
              : <SectionsView notes={d.notes ?? ""} single={mode === "accordion"} />}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {items.length === 0 && <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "10px 2px" }}>Nothing here yet · add the first item below.</div>}
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 10, alignItems: "center", minHeight: 48, borderBottom: "1px solid var(--line)" }}>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: 4, background: "var(--violet)", justifySelf: "center" }} />
                {editIdx === i ? (
                  <GrowInput value={editText} autoFocus onChange={setEditText} onCommit={commitEdit} ariaLabel="List item" />
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
          <button onClick={() => set({ priority: d.priority > 0 ? 0 : 1 })} style={chipStyle(d.priority > 0)} aria-pressed={d.priority > 0}>{d.priority > 0 ? "Pinned" : "Pin"}</button>
          <button onClick={() => { if (remind) { set({ dueDate: null, dueTime: null }); } setRemind(!remind); }} style={chipStyle(remind)} aria-pressed={remind}>Remind me</button>
          {remind && !!d.dueDate && <NagSelect value={d.nagMinutes} onChange={(m) => set({ nagMinutes: m })} />}
          <ProjectField value={d.project} onChange={(v) => set({ project: v })} projects={tags} listId="doc-tags" label="tag" />
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

        <VaultField wakeDate={d.wakeDate} setWake={(v) => set({ wakeDate: v })} today={today} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={close} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{isNew ? "Keep it" : "Done"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={() => { if (isNew || confirm("Delete this doc?")) { onDelete(); onClose(); } }} style={{ minHeight: 50, borderRadius: 14, padding: "0 16px", color: "var(--neg)", fontSize: 15 }}>{isNew ? "Discard" : "Delete"}</button>
        </div>
    </SheetFrame>
  );
}

