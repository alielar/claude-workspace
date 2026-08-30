"use client";

/**
 * /todo — the To-do tab (spec §4.5).
 *
 *   list, grouped by intent:  Overdue · Today · This evening · Upcoming · Anytime · Someday · Done
 *   quick add, pinned above the tab bar (thumb zone): one line that understands
 *   "tomorrow 10am", "fri", "weekend", "next week", "15/9", "#project", "!!", "someday"
 *   tap a task → detail sheet: when (Today · Evening · Tomorrow · Weekend · Date · Someday), time,
 *   project, priority, notes, delete
 *   one-tap defer from the list on overdue/today rows ("→ tomorrow")
 *   optional project filter chips when you have projects
 *   two lists — Personal · Work — switched at the top (remembered on the phone); each has its own
 *   due count, the home-screen badge adds both
 *
 * Works offline; the home-screen badge shows what's due today.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTodos } from "@/lib/todo/useTodos";
import { checklistToday, dayPart } from "@/lib/checklist/day";
import {
  addDays, AREAS, badgeCount, bucketOf, fmtDue, nextWeekend, parseQuickAdd, sortTodos,
  type Area, type Bucket, type Priority, type Todo,
} from "@/lib/todo/types";

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: "overdue",  label: "Overdue",      color: "var(--neg)" },
  { key: "today",    label: "Today",        color: "var(--violet)" },
  { key: "evening",  label: "This evening", color: "var(--cyan)" },
  { key: "upcoming", label: "Upcoming",     color: "var(--ink-2)" },
  { key: "anytime",  label: "Anytime",      color: "var(--ink-3)" },
  { key: "someday",  label: "Someday",      color: "var(--ink-4)" },
];

const PRIO_COLOR: Record<Priority, string> = { 0: "transparent", 1: "var(--warn)", 2: "var(--neg)" };

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ t, today, showDate, onToggle, onOpen, onDefer }: {
  t: Todo; today: string; showDate: boolean;
  onToggle: () => void; onOpen: () => void; onDefer?: () => void;
}) {
  const done = t.doneAt !== null;
  const sub = [
    showDate && t.dueDate ? fmtDue(t.dueDate, today) : null,
    t.dueTime,
    t.evening && !showDate && t.dueDate === today ? null : t.evening && t.dueDate ? "evening" : null,
    t.project ? `#${t.project}` : null,
    t.notes ? "has notes" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="todo-row" style={{ display: "grid", gridTemplateColumns: onDefer ? "auto 1fr auto" : "auto 1fr", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
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
          {t.title}
        </span>
        {sub && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, fontFamily: t.dueTime && !showDate ? "var(--f-mono)" : undefined }}>{sub}</span>}
      </button>
      {onDefer && !done && (
        <button onClick={onDefer} className="cc-btn cc-btn-ghost" aria-label="Move to tomorrow" style={{ minHeight: 40, padding: "0 10px", fontSize: 14, borderRadius: 10, marginRight: 2 }}>→ tmrw</button>
      )}
    </div>
  );
}

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function Sheet({ t, today, projects, onSave, onDelete, onClose }: {
  t: Todo; today: string; projects: string[];
  onSave: (t: Todo) => void; onDelete: () => void; onClose: () => void;
}) {
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
    { label: "Anytime",   on: isWhen(null, false, false),              go: () => when(null) },
    { label: "Someday",   on: d.someday,                               go: () => when(null, false, true) },
  ];
  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
    border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
  });

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label="Edit task" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "14px 18px calc(env(safe-area-inset-bottom) + 14px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", maxHeight: "88vh", overflowY: "auto" }}>
        <input className="cc-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="What needs doing?" style={{ fontSize: 18, fontWeight: 500, minHeight: 48 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {AREAS.map((a) => <button key={a.key} onClick={() => set({ area: a.key })} style={chip((d.area ?? "personal") === a.key)}>{a.label}</button>)}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => <button key={c.label} onClick={c.go} style={chip(c.on)}>{c.label}</button>)}
          <label style={{ ...chip(!!d.dueDate && !chips.slice(0, 4).some((c) => c.on)), display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
            {d.dueDate && !chips.slice(0, 4).some((c) => c.on) ? fmtDue(d.dueDate, today) : "Pick a date"}
            <input type="date" value={d.dueDate ?? ""} min={today} onChange={(e) => e.target.value && when(e.target.value, d.evening)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 17 }} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Time (reminder)
            <input type="time" className="cc-input" value={d.dueTime ?? ""} disabled={d.someday} onChange={(e) => set({ dueTime: e.target.value || null, dueDate: d.dueDate ?? (e.target.value ? today : null) })} style={{ fontSize: 17, minHeight: 44 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Project
            <input className="cc-input" list="todo-projects" value={d.project ?? ""} onChange={(e) => set({ project: e.target.value.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") || null })} placeholder="none" style={{ fontSize: 17, minHeight: 44 }} />
            <datalist id="todo-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {([0, 1, 2] as Priority[]).map((p) => (
            <button key={p} onClick={() => set({ priority: p })} style={chip(d.priority === p)}>{p === 0 ? "Normal" : p === 1 ? "! Important" : "!! Urgent"}</button>
          ))}
        </div>

        <textarea className="cc-input" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} placeholder="Notes" rows={2} style={{ fontSize: 16, resize: "vertical" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={close} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>Done</button>
          <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm("Delete this task?")) { onDelete(); onClose(); } }} style={{ minHeight: 50, minWidth: 50, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Delete">✕</button>
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

  const { data, loading, stale, add, upsert, toggleDone, remove } = useTodos(today);
  const all = useMemo(() => (data?.todos ?? []).filter((t) => !t.deleted), [data]);

  const [text, setText] = useState("");
  const [area, setAreaState] = useState<Area>("personal");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    try { if (localStorage.getItem("cc-todo-area") === "work") setAreaState("work"); } catch { /* ignore */ }
  }, []);
  const setArea = (a: Area) => { setAreaState(a); try { localStorage.setItem("cc-todo-area", a); } catch { /* ignore */ } };
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Todo | null>(null);
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, today) : null), [text, today]);
  const projects = useMemo(() => [...new Set(all.filter((t) => (t.area ?? "personal") === area).map((t) => t.project).filter((p): p is string => !!p))].sort(), [all, area]);

  const submit = () => {
    if (!parsed || !parsed.title) return;
    add({ ...parsed, area, project: parsed.project ?? filter });
    setText("");
    inputRef.current?.focus();
  };

  const inArea = all.filter((t) => (t.area ?? "personal") === area);
  const visible = filter ? inArea.filter((t) => t.project === filter) : inArea;
  const openTasks = visible.filter((t) => !t.doneAt);
  const doneToday = visible.filter((t) => t.doneAt !== null).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const groups = BUCKETS.map((b) => ({ ...b, items: openTasks.filter((t) => bucketOf(t, today, eveningNow) === b.key).sort(sortTodos) }));
  const dueCount = groups.filter((g) => g.key === "overdue" || g.key === "today").reduce((s, g) => s + g.items.length, 0);

  const previewBits = parsed ? [
    parsed.someday ? "Someday" : parsed.dueDate ? fmtDue(parsed.dueDate, today) : null,
    parsed.dueTime, parsed.evening && !parsed.someday ? "evening" : null,
    parsed.project ? `#${parsed.project}` : filter ? `#${filter}` : null,
    parsed.priority === 2 ? "urgent" : parsed.priority === 1 ? "important" : null,
  ].filter(Boolean) : [];

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, paddingBottom: 84 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>To-do</h1>
          <div className="sub">
            {loading && !data ? "—" : dueCount === 0 ? "nothing due today" : `${dueCount} due today`}
            {openTasks.length ? ` · ${openTasks.length} open` : ""}{stale ? " · saved copy" : ""}
          </div>
        </div>
      </div>

      {/* Personal · Work */}
      <div role="tablist" aria-label="List" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 14, background: "var(--fill-1)" }}>
        {AREAS.map((a) => {
          const on = a.key === area;
          const n = badgeCount(all, today, a.key);
          return (
            <button key={a.key} role="tab" aria-selected={on} onClick={() => setArea(a.key)}
              style={{ minHeight: 44, borderRadius: 11, border: "none", cursor: "pointer", font: "inherit", fontSize: 16, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
              {a.label}
              {n > 0 && <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet)" : "var(--fill-3)", color: on ? "var(--on-accent)" : "var(--ink-2)" }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {projects.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
          {[null, ...projects].map((p) => (
            <button key={p ?? "all"} onClick={() => setFilter(p)} className="cc-pill" style={{ minHeight: 34, padding: "0 12px", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap", background: filter === p ? "var(--accent-soft)" : undefined, borderColor: filter === p ? "var(--violet)" : undefined, color: filter === p ? "var(--ink)" : undefined }}>
              {p ? `#${p}` : "All"}
            </button>
          ))}
        </div>
      )}

      {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}

      {data && openTasks.length === 0 && (
        <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
          Nothing on the {area} list{filter ? ` in #${filter}` : ""}. Type below — try <span style={{ color: "var(--ink-2)" }}>“Call the bank tomorrow 10am #money !!”</span>
        </div></div>
      )}

      {groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.key} className="cc-card">
          <div className="cc-card-head"><span className="title" style={{ color: g.color }}>{g.label}</span><span className="tail">{g.items.length}</span></div>
          <div style={{ padding: "0 8px 0 0" }}>
            {g.items.map((t) => (
              <Row key={t.clientId} t={t} today={today} showDate={g.key === "upcoming" || g.key === "overdue"}
                onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)}
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
          {showDone && <div>{doneToday.map((t) => <Row key={t.clientId} t={t} today={today} showDate={false} onToggle={() => toggleDone(t)} onOpen={() => setOpen(t)} />)}</div>}
        </section>
      )}

      {/* Quick add — pinned above the tab bar */}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ position: "fixed", left: 0, right: 0, bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))", zIndex: 30, padding: "8px 12px 10px", background: "var(--bg-chrome)", borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 6 }}>
          {previewBits.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 14, fontFamily: "var(--f-mono)", color: "var(--cyan)" }}>
              {previewBits.map((b) => <span key={b as string}>{b}</span>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input ref={inputRef} className="cc-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={filter ? `Add to #${filter}…` : area === "work" ? "Add a work task… “fri 9am !!”" : "Add a task… “tomorrow 10am #money !!”"} enterKeyHint="done" autoComplete="off" style={{ fontSize: 17, minHeight: 48, borderRadius: 14 }} />
            <button type="submit" className="cc-btn cc-btn-primary" disabled={!parsed?.title} style={{ minHeight: 48, minWidth: 48, borderRadius: 14, fontSize: 20, padding: 0 }} aria-label="Add">+</button>
          </div>
        </div>
      </form>

      {open && <Sheet t={open} today={today} projects={projects} onSave={upsert} onDelete={() => remove(open)} onClose={() => setOpen(null)} />}

      <style>{`.todo-row:last-child { border-bottom: none !important; } .todo-row > button:active { background: var(--fill-1); }
        @media (min-width: 768px) { form[style*="position: fixed"] { bottom: 0 !important; left: 56px !important; } }`}</style>
    </div>
  );
}
