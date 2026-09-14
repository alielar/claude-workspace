"use client";

/**
 * /checklist · edit the daily list. Everything on Today is Ali's to change here
 * (2026-09-14: "make the whole thing customisable, I want to edit any of it without asking").
 *
 *   list grouped by time of day (Morning · Afternoon · Evening · Anytime)
 *   + Add / tap an item → one sheet:
 *       name · time of day · days of the week (none = every day) · what it counts for
 *       (Routine = counts toward the day's streak · Habit = own streak · Extra = tracked, not
 *       counted) · a note or link · Delete (built-ins too · a deleted built-in never comes back
 *       on its own because its routine key stays in the database).
 *
 * Reads `GET /api/checklist?all=1` · the WHOLE week (2026-09-14 evening: the plain endpoint
 * returns only today's rows, so on a Monday the Sun/Tue/Thu machine days were invisible here
 * and Ali "couldn't find those sessions anywhere"). A "This week" card on top shows which
 * day carries which extra; every-day items are implied.
 *
 * Ticking happens on Today; streak stats live there too. Nothing here needs the
 * network to render (phone copy first), edits go through the outbox.
 */

import { Linkify } from "@/components/Linkify";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ensureMigrate } from "@/lib/ensureMigrate";
import type { ChecklistData, ChecklistItem, ItemKind, TimeOfDay } from "@/lib/checklist/types";

const TIMES: { key: TimeOfDay; label: string; hint: string }[] = [
  { key: "morning",   label: "Morning",   hint: "04–12" },
  { key: "afternoon", label: "Afternoon", hint: "12–21" },
  { key: "evening",   label: "Evening",   hint: "21–04" },
  { key: "anytime",   label: "Anytime",   hint: "" },
];
const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" }, { key: "sun", label: "Sun" },
];
const KINDS: { key: ItemKind; label: string; hint: string }[] = [
  { key: "routine", label: "Routine", hint: "counts toward the day" },
  { key: "habit",   label: "Habit",   hint: "own streak, not counted yet" },
  { key: "manual",  label: "Extra",   hint: "tracked, never counted" },
];

const URL_RE = /https?:\/\/\S+/;
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 40, padding: "0 8px", borderRadius: 10, font: "inherit", fontSize: 14.5, cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

type Draft = { title: string; timeOfDay: TimeOfDay; notes: string; kind: ItemKind; weekdays: string[] };

function daysLabel(days: string[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "every day";
  const order = DAYS.map((d) => d.key);
  const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (sorted.join() === "mon,tue,wed,thu,fri") return "weekdays";
  if (sorted.join() === "sat,sun") return "weekends";
  return sorted.map((d) => DAYS.find((x) => x.key === d)?.label ?? d).join(" · ");
}

function Sheet({ item, onClose, onSave, onDelete }: {
  item: ChecklistItem | null;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<Draft>({
    title: item?.title ?? "", timeOfDay: item?.timeOfDay ?? "anytime", notes: item?.notes ?? "",
    kind: item?.kind ?? "manual", weekdays: item?.weekdays ?? [],
  });
  const builtIn = !!item?.routineKey;
  const gym = !!item?.routineKey?.startsWith("gym-");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const toggleDay = (k: string) => set({ weekdays: d.weekdays.includes(k) ? d.weekdays.filter((x) => x !== k) : [...d.weekdays, k] });
  const save = () => { if (d.title.trim()) { onSave({ ...d, title: d.title.trim(), notes: d.notes.trim() }); onClose(); } };
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label={item ? "Edit item" : "New item"} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "12px 16px calc(env(safe-area-inset-bottom) + 12px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", maxHeight: "calc(100dvh - env(safe-area-inset-top) - 20px)", overflowY: "auto" }}>
        <input className="cc-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="What do you do?" autoFocus={!item} onKeyDown={(e) => e.key === "Enter" && save()} style={{ fontSize: 17, fontWeight: 500, minHeight: 48 }} />

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>When in the day</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {TIMES.map((t) => <button key={t.key} onClick={() => set({ timeOfDay: t.key })} aria-pressed={d.timeOfDay === t.key} style={chip(d.timeOfDay === t.key)}>{t.label}</button>)}
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Days · {daysLabel(d.weekdays)}{d.weekdays.length === 0 ? "" : " · tap all off for every day"}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
            {DAYS.map((day) => <button key={day.key} onClick={() => toggleDay(day.key)} aria-pressed={d.weekdays.includes(day.key)} style={{ ...chip(d.weekdays.includes(day.key)), padding: 0, fontSize: 14 }}>{day.label}</button>)}
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Counts as · {KINDS.find((k) => k.key === d.kind)?.hint}{gym ? " (training days never count, so a skipped session cannot break the streak)" : ""}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {KINDS.map((k) => <button key={k.key} onClick={() => set({ kind: k.key })} aria-pressed={d.kind === k.key} disabled={gym} style={{ ...chip(d.kind === k.key), opacity: gym && d.kind !== k.key ? 0.5 : 1 }}>{k.label}</button>)}
          </div>
        </div>

        <label style={{ display: "grid", gap: 4, fontSize: 13.5, color: "var(--ink-3)" }}>Note or link · shown under the name on Today; a link opens with one tap
          <input className="cc-input" value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Speediance · chest, shoulders, triceps  or  https://…" autoCapitalize="none" style={{ fontSize: 16, minHeight: 44 }} />
        </label>

        {builtIn && <div style={{ fontSize: 13.5, color: "var(--ink-4)", lineHeight: 1.5 }}>Part of the built-in routine. You can change everything here, including deleting it · it will not come back by itself.</div>}

        <div style={{ display: "grid", gridTemplateColumns: item ? "1fr auto" : "1fr", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={save} disabled={!d.title.trim()} style={{ minHeight: 48, borderRadius: 14, fontSize: 17 }}>{item ? "Save" : "Add"}</button>
          {item && <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Delete “${item.title}” from your list? Past ticks are kept.`)) { onDelete(); onClose(); } }} style={{ minHeight: 48, minWidth: 48, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Delete">✕</button>}
        </div>
      </div>
    </>
  );
}

export default function ChecklistPage() {
  const { data, loading, setData, refresh } = useCached<ChecklistData>("checklist-all", () => fetchJson<ChecklistData>("/api/checklist?all=1"));
  useEffect(() => { ensureMigrate(); }, []);
  const [sheet, setSheet] = useState<{ open: boolean; item: ChecklistItem | null }>({ open: false, item: null });

  const items = useMemo(() => (data?.items ?? []).filter((i) => i.source !== "workout"), [data]);
  const groups = TIMES.map((t) => ({ ...t, items: items.filter((i) => i.timeOfDay === t.key) })).filter((g) => g.items.length > 0);
  const everyDay = items.filter((i) => !i.weekdays || i.weekdays.length === 0 || i.weekdays.length === 7).length;
  const todayCode = DAYS[(new Date().getDay() + 6) % 7].key;

  const save = async (d: Draft) => {
    const body = { title: d.title, emoji: null, timeOfDay: d.timeOfDay, notes: d.notes || null, kind: d.kind, weekdays: d.weekdays.length ? d.weekdays : null, startDate: null };
    if (sheet.item) {
      const id = sheet.item.id;
      setData((prev) => prev ? { ...prev, items: prev.items.map((i) => i.id === id ? { ...i, title: d.title, timeOfDay: d.timeOfDay, notes: d.notes || null, kind: d.kind, weekdays: body.weekdays } : i) } : prev!);
      try { await sendOrQueue({ url: `/api/checklist/${id}`, method: "PATCH", body, dedupeKey: `item:${id}` }); } catch { /* refresh shows truth */ }
    } else {
      try { const ok = await sendOrQueue({ url: "/api/checklist", method: "POST", body }); if (ok) refresh(); } catch { /* ignore */ }
    }
    refresh();
  };
  const remove = async () => {
    if (!sheet.item) return;
    const id = sheet.item.id;
    setData((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev!);
    try { await sendOrQueue({ url: `/api/checklist/${id}`, method: "DELETE", dedupeKey: `item:${id}:delete` }); } catch { /* ignore */ }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Edit list</h1>
          <div className="sub">{items.length} items · {everyDay} every day · tap one to change it</div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => setSheet({ open: true, item: null })} style={{ minHeight: 44, borderRadius: 12 }}>+ Add</button>
      </div>

      {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}

      {/* The week at a glance · only the day-specific items (everything else is every day) */}
      {items.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">This week</span><span className="tail">{everyDay} every day, plus</span></div>
          <div className="cc-card-list">
            {DAYS.map((day, idx) => {
              const extras = items.filter((i) => i.weekdays && i.weekdays.length > 0 && i.weekdays.length < 7 && i.weekdays.includes(day.key));
              const isToday = day.key === todayCode;
              return (
                <div key={day.key} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, alignItems: "center", minHeight: 44, padding: "6px 16px", borderBottom: idx < DAYS.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span style={{ fontSize: 14, fontWeight: isToday ? 600 : 500, color: isToday ? "var(--violet)" : "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{day.label}</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
                    {extras.length === 0 && <span style={{ fontSize: 14, color: "var(--ink-4)" }}>routine only</span>}
                    {extras.map((i) => (
                      <button key={i.id} onClick={() => setSheet({ open: true, item: i })} style={{ ...chip(false), minHeight: 32, fontSize: 13.5, padding: "0 10px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {i.title.replace(/\s*·\s*machine$/i, "")}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "8px 16px 12px", fontSize: 13, color: "var(--ink-4)" }}>The kettlebell day is set in Settings → Training days.</div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key} className="cc-card">
          <div className="cc-card-head"><span className="title">{g.label}</span><span className="tail">{g.hint}</span></div>
          <div className="cc-card-list">
            {g.items.map((i, idx) => {
              const link = i.notes?.match(URL_RE)?.[0];
              const what = i.kind === "habit" ? "habit" : i.routineKey?.startsWith("gym-") ? "training day" : i.kind === "routine" ? "routine" : "extra";
              return (
                <button key={i.id} onClick={() => setSheet({ open: true, item: i })} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", width: "100%", minHeight: 54, padding: "8px 16px", background: "transparent", border: "none", borderBottom: idx < g.items.length - 1 ? "1px solid var(--line)" : "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17 }}><Linkify text={i.title} /></span>
                    <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {what} · {daysLabel(i.weekdays)}{link ? ` · ${link.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0]}` : i.notes ? ` · ${i.notes}` : ""}
                    </span>
                  </span>
                  <span style={{ color: "var(--ink-4)" }}>›</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>

      {sheet.open && <Sheet item={sheet.item} onClose={() => setSheet({ open: false, item: null })} onSave={save} onDelete={remove} />}
    </div>
  );
}
