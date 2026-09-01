"use client";

/**
 * /journal · Three-question nightly journal.
 * Layout: 1fr / 320px · left: writing area + history; right: stats + yearly progress.
 * Persisted in localStorage until a backend is added.
 */

import { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Answer = { q1: string; q2: string; q3: string };
type JournalEntry = {
  date: string;    // YYYY-MM-DD
  time: string;    // HH:MM
  answers: Answer;
  complete: boolean;
};

const QUESTIONS: [string, string, string] = [
  "What went well today?",
  "What didn't go well?",
  "One thing for tomorrow?",
];

const PLACEHOLDERS: [string, string, string] = [
  "Tap to start writing. Autosaves every pause.",
  "Be honest. No one's watching.",
  "One sentence is enough.",
];

const MONTHS      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function wordCount(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }
function totalWords(a: Answer)   { return wordCount(a.q1) + wordCount(a.q2) + wordCount(a.q3); }
function answeredCount(a: Answer){ return [a.q1, a.q2, a.q3].filter((x) => x.trim().length > 0).length; }

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAYS_SHORT[d.getDay()].toUpperCase()} · ${d.getDate()} ${MONTH_SHORT[d.getMonth()].toUpperCase()}`;
}

function groupByMonth(entries: JournalEntry[]) {
  const groups: Record<string, JournalEntry[]> = {};
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JournalPage({ embedded = false }: { embedded?: boolean }) {
  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [answers,    setAnswers]    = useState<Answer>({ q1: "", q2: "", q3: "" });
  const [autoSaved,  setAutoSaved]  = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now   = new Date();
  const today = now.toISOString().split("T")[0];

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc_journal_entries");
      if (raw) {
        const parsed: JournalEntry[] = JSON.parse(raw);
        setEntries(parsed);
        const e = parsed.find((e) => e.date === today);
        if (e) { setAnswers(e.answers); setAutoSaved(true); }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on change (debounced 1.5 s)
  function persistEntry(newAnswers: Answer, complete = false) {
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const entry: JournalEntry = { date: today, time, answers: newAnswers, complete };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    localStorage.setItem("cc_journal_entries", JSON.stringify(updated));
    setAutoSaved(true);
  }

  function handleChange(key: keyof Answer, value: string) {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    setAutoSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistEntry(newAnswers), 1500);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  const thisMonth    = entries.filter((e) => e.date.startsWith(today.slice(0, 7)));
  const monthWords   = thisMonth.reduce((s, e) => s + totalWords(e.answers), 0);
  const avgWords     = thisMonth.length > 0 ? Math.round(monthWords / thisMonth.length) : 0;

  const streak = (() => {
    let s = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (entries.find((e) => e.date === ds)) s++;
      else break;
    }
    return s;
  })();

  const yearStart   = new Date(now.getFullYear(), 0, 1);
  const dayOfYear   = Math.ceil((now.getTime() - yearStart.getTime()) / 86400000);
  const yearEntries = entries.filter((e) => e.date.startsWith(String(now.getFullYear()))).length;
  const yearPct     = Math.round((yearEntries / 365) * 100);

  const grouped     = groupByMonth(entries);
  const words       = totalWords(answers);
  const done        = answeredCount(answers);

  return (
    <div style={{ padding: "0 0 40px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600&display=swap');`}</style>

      {/* Page title */}
      {!embedded && (
        <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
          <div>
            <h1>Journal<span className="grad-text">.</span></h1>
            <div className="sub">
              Three questions a night · {thisMonth.length} entries this month · {streak}-day streak
            </div>
          </div>
        </div>
      )}

      {/* Status banner · shows dynamic current-time and tonight's progress */}
      <div style={{
        padding: "16px 22px", border: "1px solid rgba(100,255,218,0.20)", borderRadius: 12,
        background: "rgba(100,255,218,0.04)",
        marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", flexShrink: 0, display: "inline-block" }} />
          <span>
            {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {done === 3 ? "All three questions answered tonight." : `${done} of 3 questions answered tonight.`}
          </span>
        </div>
        {autoSaved && (
          <div style={{ fontSize: 10.5, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", display: "inline-block" }} />
            AUTO-SAVED
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, alignItems: "start" }}>

        {/* ── LEFT ──────────────────────────────────────────────────────── */}
        <div>

          {/* Writing card */}
          <div className="cc-card" style={{
            padding: "32px 40px",
            background: "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.08), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.05), transparent 60%), var(--bg-card)",
          }}>
            {/* Date row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
                {DAYS_SHORT[now.getDay()]}day · {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
              </div>
            </div>

            {/* Question blocks */}
            {(["q1","q2","q3"] as (keyof Answer)[]).map((key, idx) => {
              const isAnswered = answers[key].trim().length > 0;
              return (
                <div key={key} style={{ padding: "14px 0", borderBottom: idx < 2 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 21, fontWeight: 500, letterSpacing: "-0.01em", color: isAnswered ? "var(--ink)" : "var(--ink-3)", lineHeight: 1.3 }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.20em", marginRight: 10, verticalAlign: "top", fontWeight: 500, display: "inline-block", paddingTop: 5 }}>
                      0{idx + 1}
                    </span>
                    {QUESTIONS[idx]}
                  </div>
                  <textarea
                    value={answers[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={PLACEHOLDERS[idx]}
                    rows={1}
                    style={{
                      width: "calc(100% - 38px)", marginLeft: 38, background: "transparent", border: 0,
                      color: "var(--ink-2)", fontFamily: "var(--f-sans)", fontSize: 15, lineHeight: 1.65,
                      letterSpacing: "-0.005em", resize: "none", padding: "12px 0 4px", minHeight: 24, outline: "none",
                    }}
                    onInput={(e) => {
                      const el = e.target as HTMLTextAreaElement;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }}
                  />
                  {isAnswered && (
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-4)", marginLeft: 38, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {wordCount(answers[key])} words
                    </div>
                  )}
                </div>
              );
            })}

            {/* Footer */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)", textTransform: "uppercase" }}>
                {words} words · {done} / 3 answered
              </div>
              <button className="cc-btn cc-btn-primary" onClick={() => persistEntry(answers, true)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mark complete
              </button>
            </div>
          </div>

          {/* History section */}
          <div style={{ marginTop: 24 }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
                Past entries
              </h3>
            </div>

            {Object.entries(grouped).map(([monthKey, monthEntries]) => {
              const [yr, mo] = monthKey.split("-");
              const label = `${MONTHS[Number(mo) - 1]} ${yr}`;
              return (
                <div key={monthKey} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, padding: "14px 0 8px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                    <span>{label}</span>
                    <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10, letterSpacing: "0.06em" }}>{monthEntries.length} entries</span>
                  </div>
                  {monthEntries.map((entry) => {
                    const isExpanded = expandedId === entry.date;
                    const preview    = entry.answers.q1 || entry.answers.q2 || entry.answers.q3;
                    const wc         = totalWords(entry.answers);
                    return (
                      <div
                        key={entry.date}
                        onClick={() => setExpandedId(isExpanded ? null : entry.date)}
                        style={{
                          padding: "14px 16px",
                          border: `1px solid ${isExpanded ? "rgba(124,77,255,0.30)" : "var(--line)"}`,
                          borderRadius: 10,
                          background: isExpanded ? "rgba(124,77,255,0.04)" : "rgba(255,255,255,0.012)",
                          marginTop: 8, cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                          <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            <b style={{ color: "var(--ink)", fontWeight: 500 }}>{fmtDate(entry.date)}</b>
                            {" · "}{entry.time}{" · "}{wc} words
                          </div>
                          <span style={{ fontSize: 12, color: entry.complete ? "var(--pos)" : "var(--ink-4)" }}>
                            {entry.complete ? "✓" : "○"}
                          </span>
                        </div>
                        <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}>
                          "{preview.length > 100 ? preview.slice(0, 100) + "…" : (preview || "…")}"
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                            {(["q1","q2","q3"] as (keyof Answer)[]).map((key, idx) => (
                              entry.answers[key] && (
                                <div key={key} style={{ marginTop: idx > 0 ? 12 : 0 }}>
                                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                                    0{idx+1} · {QUESTIONS[idx]}
                                  </div>
                                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.6, paddingLeft: 14, borderLeft: "1.5px solid rgba(124,77,255,0.30)" }}>
                                    {entry.answers[key]}
                                  </div>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {entries.length === 0 && (
              <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "var(--ink-4)" }}>
                Write your first entry above.
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Monthly stats */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">This month</div>
              <div className="tail">{MONTHS[now.getMonth()]}</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Entries", value: String(thisMonth.length),         note: "this month" },
                  { label: "Streak",  value: `${streak}d`,                     note: "current streak" },
                  { label: "Words",   value: monthWords.toLocaleString(),       note: `avg ${avgWords}/entry` },
                  { label: "Total",   value: String(entries.length),            note: "all entries" },
                ].map((stat) => (
                  <div key={stat.label} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 200, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 5, fontFamily: "var(--f-mono)", background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent" }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3, fontFamily: "var(--f-mono)" }}>
                      {stat.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Yearly progress */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Yearly progress</div>
              <div className="tail">{now.getFullYear()}</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 36, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)", background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent" }}>
                  {yearEntries}
                </span>
                <span style={{ color: "var(--ink-3)", fontSize: 13 }}>/ {dayOfYear} days</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
                <div style={{ height: "100%", width: `${yearPct}%`, background: "var(--grad)", borderRadius: 99, transition: "width 0.5s var(--easeOut)" }} />
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 8, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                {yearPct}% · {dayOfYear} days elapsed
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
