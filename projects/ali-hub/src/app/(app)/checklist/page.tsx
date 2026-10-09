"use client";

/**
 * /checklist · "Routine" (named "Edit list" until 2026-10-03). Everything on Today is Ali's to
 * change here, and the morning clock lives here too (moved from Settings the same day).
 *
 *   MORNING CLOCK · a folded card: wake on a training day / rest day, when calls start, the
 *                   minutes of each micro-step, the Saturday shift · the buffer before work is
 *                   the number Ali watches ("12 min spare").
 *   THIS WEEK     · which weekday carries which day-specific item (every-day items are implied).
 *   the list, grouped by time of day (Morning · Afternoon · Evening · Anytime)
 *   + Add / tap an item → one sheet:
 *       name · time of day · an optional clock time · days of the week (none = every day) ·
 *       Routine (counts toward the streak) or Extra (tracked, never counted · the old "habit"
 *       kind is gone, Ali 2026-10-03) · a note or link · Delete (built-ins too · a deleted
 *       built-in never comes back on its own because its routine key stays in the database).
 *
 * Row subtitles say only the time, the days when the item is day-specific, and the note or the
 * link's host · never the kind or "every day" (Ali 2026-10-03: "clean, not cluttered").
 *
 * Reads `GET /api/checklist?all=1` · the WHOLE week (the plain endpoint returns only today's rows).
 * Ticking happens on Today; streak stats live there too. Nothing here needs the network to
 * render (phone copy first), edits go through the outbox.
 */

import { useProfile } from "@/lib/profile/useProfile";
import { Linkify } from "@/components/Linkify";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ensureMigrate } from "@/lib/ensureMigrate";
import type { ChecklistData, ChecklistItem, ItemKind, TimeOfDay } from "@/lib/checklist/types";
import { EVENING_HOUR } from "@/lib/checklist/day";
import { parseMorningPlan, computeMorning, type MorningPlan } from "@/lib/morning/plan";

const TIMES: { key: TimeOfDay; label: string; hint: string }[] = [
  { key: "morning",   label: "Morning",   hint: "04–12" },
  { key: "afternoon", label: "Afternoon", hint: "12–19" },
  { key: "evening",   label: "Evening",   hint: "19–04" },
  { key: "anytime",   label: "Anytime",   hint: "" },
];
const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" }, { key: "sun", label: "Sun" },
];
const KINDS: { key: ItemKind; label: string; hint: string }[] = [
  { key: "routine", label: "Routine", hint: "counts toward the streak" },
  { key: "manual",  label: "Extra",   hint: "something being added · never counted" },
];

const URL_RE = /https?:\/\/\S+/;
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 40, padding: "0 8px", borderRadius: 10, font: "inherit", fontSize: 14.5, cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

type Draft = { title: string; timeOfDay: TimeOfDay; notes: string; kind: ItemKind; weekdays: string[]; atTime: string };

/** Which part of the day an "HH:MM" falls in · Ali's clock (morning 04–12, afternoon 12–19, evening 19–04). */
function partOfTime(hhmm: string): TimeOfDay {
  const h = Number(hhmm.slice(0, 2));
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < EVENING_HOUR) return "afternoon";
  return "evening";
}

/** "every day" for the sheet; the row shows days only when they are specific. */
function daysLabel(days: string[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "every day";
  const order = DAYS.map((d) => d.key);
  const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (sorted.join() === "mon,tue,wed,thu,fri") return "weekdays";
  if (sorted.join() === "sat,sun") return "weekends";
  return sorted.map((d) => DAYS.find((x) => x.key === d)?.label ?? d).join(" · ");
}
const isSpecific = (days: string[] | null | undefined) => !!days && days.length > 0 && days.length < 7;

function Sheet({ item, onClose, onSave, onDelete }: {
  item: ChecklistItem | null;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<Draft>({
    title: item?.title ?? "", timeOfDay: item?.timeOfDay ?? "anytime", notes: item?.notes ?? "",
    kind: item?.kind ?? "manual", weekdays: item?.weekdays ?? [], atTime: item?.atTime ?? "",
  });
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

        {/* An optional clock time (Ali 2026-09-15) · Today is a chronological spine, so training and
            mobility should sit at the hour they are actually planned for. Setting one also moves the
            item into the matching part of the day, so nothing can contradict itself. */}
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Time · optional</span>
          <div style={{ display: "grid", gridTemplateColumns: d.atTime ? "1fr auto" : "1fr", gap: 8 }}>
            <input type="time" className="cc-input" value={d.atTime}
              onChange={(e) => set(e.target.value ? { atTime: e.target.value, timeOfDay: partOfTime(e.target.value) } : { atTime: "" })}
              style={{ fontSize: 17, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
            {d.atTime && <button onClick={() => set({ atTime: "" })} className="cc-btn cc-btn-ghost" style={{ minHeight: 44, padding: "0 12px", fontSize: 14 }}>No time</button>}
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Days · {daysLabel(d.weekdays)}{d.weekdays.length === 0 ? "" : " · tap all off for every day"}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
            {DAYS.map((day) => <button key={day.key} onClick={() => toggleDay(day.key)} aria-pressed={d.weekdays.includes(day.key)} style={{ ...chip(d.weekdays.includes(day.key)), padding: 0, fontSize: 14 }}>{day.label}</button>)}
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{KINDS.find((k) => k.key === d.kind)?.hint}{gym ? " · a training day never counts, so a skipped session cannot break the streak" : ""}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {KINDS.map((k) => <button key={k.key} onClick={() => set({ kind: k.key })} aria-pressed={d.kind === k.key} disabled={gym} style={{ ...chip(d.kind === k.key), opacity: gym && d.kind !== k.key ? 0.5 : 1 }}>{k.label}</button>)}
          </div>
        </div>

        <label style={{ display: "grid", gap: 4, fontSize: 13.5, color: "var(--ink-3)" }}>Note or link
          <input className="cc-input" value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Speediance · chest, shoulders  or  https://…" autoCapitalize="none" style={{ fontSize: 16, minHeight: 44 }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: item ? "1fr auto" : "1fr", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={save} disabled={!d.title.trim()} style={{ minHeight: 48, borderRadius: 14, fontSize: 17 }}>{item ? "Save" : "Add"}</button>
          {item && <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Delete “${item.title}” from your routine? Past ticks are kept.`)) { onDelete(); onClose(); } }} style={{ minHeight: 48, minWidth: 48, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Delete">✕</button>}
        </div>
      </div>
    </>
  );
}

/** The morning as a clock (moved here from Settings 2026-10-03) · folded to one line, every number editable. */
function MorningClock() {
  const { primary } = useProfile();
  const { data: settings, setData } = useCached<{ morningPlan?: string | null }>("settings", () => fetchJson("/api/settings"));
  const plan = parseMorningPlan(settings?.morningPlan);
  const [open, setOpen] = useState(false);
  const savePlan = async (next: MorningPlan) => {
    const json = JSON.stringify(next);
    if (settings) setData({ ...settings, morningPlan: json });
    try { await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { morningPlan: json }, dedupeKey: "settings:morningPlan" }); } catch { /* replayed later */ }
  };
  const setStepMinutes = (id: string, minutes: number) =>
    savePlan({ ...plan, steps: plan.steps.map((s) => (s.id === id ? { ...s, minutes: Math.max(0, Math.min(180, Math.round(minutes))) } : s)) });
  const trainDay = computeMorning(plan, true);
  const restDay = computeMorning(plan, false);
  const saturday = computeMorning(plan, true, "saturday");
  const spare = Math.min(trainDay.bufferMin, restDay.bufferMin);
  const num: React.CSSProperties = { fontSize: 16, minHeight: 40, width: 64, boxSizing: "border-box", textAlign: "right" };
  // A guest's morning (2026-10-09): one wake time, no training or calls clock.
  if (!primary) {
    return (
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Morning</span><span className="tail">wake {plan.restWake}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 15 }}>Wake up</span>
          <input type="time" className="cc-input" value={plan.restWake} onChange={(e) => e.target.value && savePlan({ ...plan, trainWake: e.target.value, restWake: e.target.value })}
            style={{ fontSize: 16, minHeight: 44, width: 120, boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} aria-label="Wake time" />
        </div>
      </section>
    );
  }
  return (
    <section className="cc-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="cc-card-head"
        style={{ width: "100%", background: "transparent", border: "none", borderBottom: open ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
        <span className="title">Morning clock</span>
        <span className="tail tabular-nums" style={{ color: spare < 0 ? "var(--warn)" : undefined }}>
          wake {plan.trainWake} · {spare >= 0 ? `${spare} min spare` : `${-spare} min over`} {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="cc-card-body" style={{ display: "grid", gap: 12, fontSize: 15, color: "var(--ink-2)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {([["Wake · training", plan.trainWake, (v: string) => savePlan({ ...plan, trainWake: v })],
               ["Wake · rest", plan.restWake, (v: string) => savePlan({ ...plan, restWake: v })],
               ["Calls start", plan.callsAt, (v: string) => savePlan({ ...plan, callsAt: v })]] as const).map(([label, value, save]) => (
              <label key={label} style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--ink-3)", minWidth: 0 }}>{label}
                <input type="time" className="cc-input" value={value} onChange={(e) => e.target.value && save(e.target.value)}
                  style={{ fontSize: 16, minHeight: 44, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            {plan.steps.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", minHeight: 44, borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 15 }}>{s.label}{s.trainOnly ? <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}> · training days</span> : null}</span>
                <input className="cc-input" type="number" inputMode="numeric" min={0} max={180} value={s.minutes} onChange={(e) => setStepMinutes(s.id, Number(e.target.value))} style={num} />
                <span style={{ fontSize: 13, color: "var(--ink-4)" }}>min</span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", minHeight: 44, borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontSize: 15 }}>Saturday · later by<span style={{ fontSize: 12.5, color: "var(--ink-4)" }}> · wake {saturday.wake}, calls {saturday.callsAt}</span></span>
              <input className="cc-input" type="number" inputMode="numeric" min={0} max={240} step={15} value={plan.saturdayShiftMin}
                onChange={(e) => savePlan({ ...plan, saturdayShiftMin: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })} style={num} />
              <span style={{ fontSize: 13, color: "var(--ink-4)" }}>min</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44, fontSize: 15 }}>
              <span>Sunday</span><span style={{ fontSize: 13, color: "var(--ink-4)" }}>no fixed times</span>
            </div>
          </div>
          <p className="tabular-nums" style={{ margin: 0, fontSize: 13.5, color: trainDay.bufferMin < 0 || restDay.bufferMin < 0 ? "var(--warn)" : "var(--ink-4)" }}>
            Training day ends {trainDay.rows.at(-1)?.end ?? "—"} · {trainDay.bufferMin} min spare · rest day ends {restDay.rows.at(-1)?.end ?? "—"} · {restDay.bufferMin} min spare
          </p>
        </div>
      )}
    </section>
  );
}

export default function ChecklistPage() {
  const { data, loading, setData, refresh } = useCached<ChecklistData>("checklist-all", () => fetchJson<ChecklistData>("/api/checklist?all=1"));
  useEffect(() => { ensureMigrate(); }, []);
  const [sheet, setSheet] = useState<{ open: boolean; item: ChecklistItem | null }>({ open: false, item: null });

  const items = useMemo(() => (data?.items ?? []).filter((i) => i.source !== "workout"), [data]);
  const groups = TIMES.map((t) => ({ ...t, items: items.filter((i) => i.timeOfDay === t.key) })).filter((g) => g.items.length > 0);
  const everyDay = items.filter((i) => !isSpecific(i.weekdays)).length;
  const routineCount = items.filter((i) => i.kind === "routine" && !i.routineKey?.startsWith("gym-")).length;
  const todayCode = DAYS[(new Date().getDay() + 6) % 7].key;

  const save = async (d: Draft) => {
    const body = { title: d.title, emoji: null, timeOfDay: d.timeOfDay, notes: d.notes || null, kind: d.kind, weekdays: d.weekdays.length ? d.weekdays : null, startDate: null, atTime: d.atTime || null };
    if (sheet.item) {
      const id = sheet.item.id;
      setData((prev) => prev ? { ...prev, items: prev.items.map((i) => i.id === id ? { ...i, title: d.title, timeOfDay: d.timeOfDay, notes: d.notes || null, kind: d.kind, weekdays: body.weekdays, atTime: body.atTime } : i) } : prev!);
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
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Routine</h1>
          <div className="sub">{routineCount} routine · {items.length - routineCount} other · {everyDay} every day</div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => setSheet({ open: true, item: null })} style={{ minHeight: 44, borderRadius: 12 }}>+ Add</button>
      </div>

      <MorningClock />

      {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}

      {/* The week at a glance · only the day-specific items (everything else is every day) */}
      {items.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">This week</span><span className="tail">{everyDay} every day, plus</span></div>
          <div className="cc-card-list">
            {DAYS.map((day, idx) => {
              const extras = items.filter((i) => isSpecific(i.weekdays) && i.weekdays!.includes(day.key));
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
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key} className="cc-card">
          <div className="cc-card-head"><span className="title">{g.label}</span><span className="tail">{g.hint}</span></div>
          <div className="cc-card-list">
            {g.items.map((i, idx) => {
              const link = i.notes?.match(URL_RE)?.[0];
              const sub = [
                i.atTime ?? null,
                isSpecific(i.weekdays) ? daysLabel(i.weekdays) : null,
                link ? link.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0] : i.notes || null,
              ].filter(Boolean).join(" · ");
              return (
                <button key={i.id} onClick={() => setSheet({ open: true, item: i })} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", width: "100%", minHeight: 54, padding: "8px 16px", background: "transparent", border: "none", borderBottom: idx < g.items.length - 1 ? "1px solid var(--line)" : "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17 }}><Linkify text={i.title} /></span>
                    {sub && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: i.atTime && sub === i.atTime ? "var(--f-mono)" : undefined }}>{sub}</span>}
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
