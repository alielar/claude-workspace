"use client";

/**
 * /journal — Three-question nightly journal. V2 Ambient Futurism design.
 * Layout: 1fr / 340px — left: today's writing area + history; right: stats + themes + yearly.
 * Uses localStorage for persistence until backend is added.
 * EB Garamond for question text — loaded via globals.css or inline @import.
 */

import { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Answer = { q1: string; q2: string; q3: string };
type JournalEntry = {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  answers: Answer;
  complete: boolean;
};

// The three nightly prompts
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

// Month name list
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function totalWords(answers: Answer): number {
  return wordCount(answers.q1) + wordCount(answers.q2) + wordCount(answers.q3);
}

function answeredCount(answers: Answer): number {
  return [answers.q1, answers.q2, answers.q3].filter((a) => a.trim().length > 0).length;
}

// Format YYYY-MM-DD to display label
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAYS_SHORT[d.getDay()].toUpperCase()} · ${d.getDate()} ${MONTH_SHORT[d.getMonth()].toUpperCase()}`;
}

// Group entries by YYYY-MM
function groupByMonth(entries: JournalEntry[]): Record<string, JournalEntry[]> {
  const groups: Record<string, JournalEntry[]> = {};
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

export default function JournalPage() {
  const [entries, setEntries]       = useState<JournalEntry[]>([]);
  const [answers, setAnswers]       = useState<Answer>({ q1: "", q2: "", q3: "" });
  const [autoSaved, setAutoSaved]   = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [histTab, setHistTab]       = useState<"month" | "starred">("month");
  const saveTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now   = new Date();
  const today = now.toISOString().split("T")[0];

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc_journal_entries");
      if (raw) {
        const parsed: JournalEntry[] = JSON.parse(raw);
        setEntries(parsed);
        const todayEntry = parsed.find((e) => e.date === today);
        if (todayEntry) {
          setAnswers(todayEntry.answers);
          setAutoSaved(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-save on answer change (debounced 1.5s)
  const persistEntry = (newAnswers: Answer, complete = false) => {
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const entry: JournalEntry = { date: today, time, answers: newAnswers, complete };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    localStorage.setItem("cc_journal_entries", JSON.stringify(updated));
    setAutoSaved(true);
  };

  const handleChange = (key: keyof Answer, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    setAutoSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistEntry(newAnswers), 1500);
  };

  const markComplete = () => persistEntry(answers, true);

  // ─── Stats ────────────────────────────────────────────────────────────────
  const thisMonth    = entries.filter((e) => e.date.startsWith(today.slice(0, 7)));
  const totalEntries = entries.length;

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

  const monthWords   = thisMonth.reduce((s, e) => s + totalWords(e.answers), 0);
  const avgWords     = thisMonth.length > 0 ? Math.round(monthWords / thisMonth.length) : 0;

  // Yearly stats
  const yearStart    = new Date(now.getFullYear(), 0, 1);
  const dayOfYear    = Math.ceil((now.getTime() - yearStart.getTime()) / 86400000);
  const yearEntries  = entries.filter((e) => e.date.startsWith(String(now.getFullYear()))).length;
  const yearPct      = Math.round((yearEntries / 365) * 100);

  const grouped = groupByMonth(entries);

  // Dummy theme tags (no NLP backend)
  const THEMES = [
    { tag: "Work focus", ct: 23 }, { tag: "Workouts", ct: 18 },
    { tag: "Phone habits", ct: 14 }, { tag: "Family", ct: 12 },
    { tag: "Reading", ct: 11 }, { tag: "Sleep", ct: 9 },
    { tag: "Friends", ct: 8 }, { tag: "Travel", ct: 6 },
  ];

  const words   = totalWords(answers);
  const done    = answeredCount(answers);
  const todayEntry = entries.find((e) => e.date === today);

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Load EB Garamond if not in globals */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600&display=swap');`}</style>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Journal<span className="grad-text">.</span></h1>
          <div className="sub">
            Three questions a night · {thisMonth.length} entries this month · {streak}-day streak
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn cc-btn-ghost">Edit prompts</button>
        </div>
      </div>

      {/* Reminder banner */}
      <div style={{
        padding: "18px 22px", border: "1px solid rgba(126,231,255,0.25)", borderRadius: 12,
        background: "radial-gradient(60% 80% at 0% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.012)",
        marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0, display: "inline-block" }} />
          <span>
            It's <b>{now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</b>
            {done === 3
              ? " · All three questions answered tonight. "
              : " · Three questions waiting tonight."}
          </span>
        </div>
        <span className="cc-tag cyan" style={{ flexShrink: 0 }}>Reminder set · 21:30</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, alignItems: "start" }}>

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div>
          {/* Writing card */}
          <div className="cc-card" style={{
            padding: "36px 44px",
            background: "radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.10), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.06), transparent 60%), var(--bg-card)",
          }}>
            {/* Date row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
                {DAYS_SHORT[now.getDay()]}day · {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()} · Tonight's entry
              </div>
              {autoSaved && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, fontFamily: "var(--f-mono)", color: "var(--pos)", letterSpacing: "0.04em" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 4px var(--pos)", display: "inline-block" }} />
                  Auto-saved
                </div>
              )}
            </div>

            {/* Question blocks */}
            {(["q1","q2","q3"] as (keyof Answer)[]).map((key, idx) => {
              const isAnswered = answers[key].trim().length > 0;
              return (
                <div key={key} style={{ padding: "14px 0", borderBottom: idx < 2 ? "1px solid var(--line)" : "none" }}>
                  {/* Question text — EB Garamond */}
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: isAnswered ? "var(--ink)" : "var(--ink-3)", lineHeight: 1.3 }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.20em", marginRight: 10, verticalAlign: "top", fontWeight: 500, display: "inline-block", paddingTop: 6 }}>
                      0{idx + 1}
                    </span>
                    {QUESTIONS[idx]}
                  </div>
                  {/* Answer textarea */}
                  <textarea
                    value={answers[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={PLACEHOLDERS[idx]}
                    rows={1}
                    style={{
                      width: "calc(100% - 38px)", marginLeft: 38, background: "transparent", border: 0,
                      color: "var(--ink-2)", fontFamily: "var(--f-sans)", fontSize: 15, lineHeight: 1.65,
                      letterSpacing: "-0.005em", resize: "none", padding: "14px 0 4px", minHeight: 24,
                      outline: "none",
                    }}
                    onInput={(e) => {
                      const el = e.target as HTMLTextAreaElement;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }}
                  />
                  {isAnswered && (
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-4)", marginLeft: 38, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "99px", background: "var(--ink-4)", display: "inline-block" }} />
                      {wordCount(answers[key])} WORDS
                    </div>
                  )}
                </div>
              );
            })}

            {/* Footer */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)", textTransform: "uppercase" }}>
                {words} words · {done} of 3 answered · {3 - done} to go
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="cc-btn cc-btn-ghost">Skip tonight</button>
                <button className="cc-btn cc-btn-primary" onClick={markComplete}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Mark complete
                </button>
              </div>
            </div>
          </div>

          {/* History section */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
                Past entries
                <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>{totalEntries} in May</span>
              </h3>
              <div className="cc-tabs">
                {(["month","starred"] as const).map((t) => (
                  <button key={t} className={`cc-tab${histTab === t ? " cur" : ""}`} onClick={() => setHistTab(t)}>
                    {t === "month" ? "By month" : "Starred"}
                  </button>
                ))}
              </div>
            </div>

            {/* Grouped history */}
            {Object.entries(grouped).map(([monthKey, monthEntries]) => {
              const [yr, mo] = monthKey.split("-");
              const label = `${MONTHS[Number(mo) - 1]} ${yr}`;
              return (
                <div key={monthKey}>
                  <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, padding: "14px 0 8px", borderBottom: "1px solid var(--line)", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>{label}</span>
                    <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10, letterSpacing: "0.06em" }}>{monthEntries.length} entries</span>
                  </div>
                  {monthEntries.map((entry) => {
                    const isExpanded = expandedId === entry.date;
                    const preview    = entry.answers.q2 || entry.answers.q1 || entry.answers.q3;
                    const wc         = totalWords(entry.answers);
                    return (
                      <div
                        key={entry.date}
                        onClick={() => setExpandedId(isExpanded ? null : entry.date)}
                        style={{
                          padding: "14px 16px", border: `1px solid ${isExpanded ? "rgba(179,136,255,0.30)" : "var(--line)"}`,
                          borderRadius: 10, background: isExpanded ? "rgba(179,136,255,0.04)" : "rgba(255,255,255,0.012)",
                          marginTop: 8, cursor: "pointer", transition: "all var(--t-1)",
                        }}
                      >
                        {/* Entry header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                          <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            <b style={{ color: "var(--ink)", fontWeight: 500 }}>{fmtDate(entry.date)}</b>
                            {" · "}{entry.time}{" · "}{wc} WORDS
                          </div>
                          <span style={{ fontSize: 14 }}>
                            {entry.complete ? "✓" : "○"}
                          </span>
                        </div>
                        {/* Preview */}
                        <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}>
                          "{preview.length > 100 ? preview.slice(0, 100) + "…" : (preview || <span style={{ color: "var(--ink-4)" }}>No answer yet</span>)}"
                        </div>
                        {/* Expanded full */}
                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                            {(["q1","q2","q3"] as (keyof Answer)[]).map((key, idx) => (
                              entry.answers[key] && (
                                <div key={key} style={{ marginTop: idx > 0 ? 10 : 0 }}>
                                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                                    0{idx+1} · {QUESTIONS[idx]}
                                  </div>
                                  <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.55, paddingLeft: 14, borderLeft: "1.5px solid rgba(179,136,255,0.30)" }}>
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

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* Monthly stats */}
          <div className="cc-card" style={{ marginBottom: 14, padding: 18 }}>
            <div className="cc-card-head"><div className="title">This month</div><div className="tail">{MONTHS[now.getMonth()]}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Entries", value: thisMonth.length,  unit: "",   note: `+${Math.max(0, thisMonth.length - 8)} vs last` },
                { label: "Streak",  value: streak,            unit: "d",  note: "longest active"    },
                { label: "Words",   value: monthWords.toLocaleString(), unit: "", note: `avg ${avgWords}/entry` },
                { label: "Done at", value: "21:42",           unit: "",   note: "median time",  small: true },
              ].map((stat) => (
                <div key={stat.label} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                  <div style={{
                    fontSize: stat.small ? 22 : 30, fontWeight: 200, letterSpacing: "-0.03em", lineHeight: 1, marginTop: stat.small ? 8 : 4,
                    fontFamily: "var(--f-mono)", background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent",
                  }}>
                    {stat.value}<span style={{ fontSize: 14, WebkitTextFillColor: "var(--ink-3)" }}>{stat.unit}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--pos)", marginTop: 3, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                    {stat.note}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Themes */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Themes</div><div className="tail">last 90d · auto-clustered</div></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {THEMES.map((t) => (
                <span key={t.tag} style={{ padding: "4px 10px", fontSize: 10.5, border: "1px solid var(--line)", borderRadius: 99, color: "var(--ink-2)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {t.tag}
                  <span style={{ color: "var(--ink-4)", fontFamily: "var(--f-mono)", fontSize: 10 }}>{t.ct}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--violet)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
                Pattern · last 30d
              </div>
              "Phone habits" appears in 14 entries · usually flagged as <i>didn't go well</i>.
            </div>
          </div>

          {/* Yearly progress */}
          <div className="cc-card">
            <div className="cc-card-head"><div className="title">Yearly</div><div className="tail">{now.getFullYear()}</div></div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="grad-text" style={{ fontSize: 34, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)" }}>{yearEntries}</span>
              <span style={{ color: "var(--ink-3)", fontSize: 13 }}>/ 365 days</span>
            </div>
            <div className="cc-bar" style={{ marginTop: 10 }}>
              <div className="fg" style={{ width: `${yearPct}%` }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
              {yearPct}% · {dayOfYear} days elapsed this year
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
