"use client";

/**
 * /mood · Daily mood tracker. V2 Ambient Futurism design.
 * Layout: 1fr / 360px · left: today's scale + note + heatmap; right: stats + history.
 * Persisted in database via /api/mood.
 */

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MoodEntry = { date: string; score: number; note: string; time: string };

const MOODS = [
  { score: 1, emoji: "😞", name: "Awful" },
  { score: 2, emoji: "😔", name: "Low"   },
  { score: 3, emoji: "😐", name: "OK"    },
  { score: 4, emoji: "😊", name: "Good"  },
  { score: 5, emoji: "😄", name: "Great" },
];

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function nowTimeMadrid(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function moodCellStyle(score: number): React.CSSProperties {
  if (score === 1) return { background: "rgba(255,138,138,0.20)", borderColor: "rgba(255,138,138,0.30)" };
  if (score === 2) return { background: "rgba(255,193,92,0.18)",  borderColor: "rgba(255,193,92,0.30)"  };
  if (score === 3) return { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" };
  if (score === 4) return { background: "linear-gradient(135deg, rgba(124,77,255,0.30), rgba(100,255,218,0.10))", borderColor: "rgba(124,77,255,0.30)" };
  if (score === 5) return { background: "linear-gradient(135deg, rgba(124,77,255,0.55), rgba(100,255,218,0.25))", borderColor: "rgba(124,77,255,0.50)", boxShadow: "0 0 8px rgba(124,77,255,0.20)" };
  return {};
}

export default function MoodPage({ embedded = false }: { embedded?: boolean }) {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [todayScore, setTodayScore] = useState<number | null>(null);
  const [note, setNote]             = useState("");
  const [saved, setSaved]           = useState(false);
  const [noteOpen, setNoteOpen]     = useState(false);
  const [loading, setLoading]       = useState(true);

  const today = todayMadrid();
  const now   = new Date();
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Migrate localStorage → API (one-time)
  const migrateLocalStorage = useCallback(async () => {
    try {
      const raw = localStorage.getItem("cc_mood_entries");
      if (!raw) return;
      const parsed: MoodEntry[] = JSON.parse(raw);
      if (parsed.length === 0) return;
      for (const entry of parsed) {
        await fetch("/api/mood", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      }
      localStorage.removeItem("cc_mood_entries");
    } catch { /* ignore migration errors */ }
  }, []);

  // Load entries from API
  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/mood");
      if (!res.ok) return;
      const rows = await res.json();
      const mapped: MoodEntry[] = rows.map((r: Record<string, unknown>) => ({
        date: r.date as string,
        score: r.score as number,
        note: (r.note as string) || "",
        time: (r.time as string) || "",
      }));
      setEntries(mapped);
      const todayEntry = mapped.find((e) => e.date === today);
      if (todayEntry) {
        setTodayScore(todayEntry.score);
        setNote(todayEntry.note);
        setSaved(true);
        if (todayEntry.note) setNoteOpen(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [today]);

  useEffect(() => {
    (async () => {
      await migrateLocalStorage();
      await loadEntries();
    })();
  }, [migrateLocalStorage, loadEntries]);

  const saveEntry = async (score: number) => {
    const prevScore = todayScore;
    const prevEntries = entries;
    setTodayScore(score);
    setSaved(true);

    const time = nowTimeMadrid();
    const entry: MoodEntry = { date: today, score, note, time };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);

    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodayScore(prevScore);
      setEntries(prevEntries);
      setSaved(false);
    }
  };

  const saveNote = async () => {
    if (!todayScore) return;
    const time = nowTimeMadrid();
    const entry: MoodEntry = { date: today, score: todayScore, note, time };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    try {
      await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch { /* silent */ }
  };

  // Build last 30-day heatmap
  const last30: { date: string; score: number | null; isToday: boolean; dayNum: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const entry   = entries.find((e) => e.date === dateStr);
    last30.push({ date: dateStr, score: entry?.score ?? null, isToday: dateStr === today, dayNum: d.getDate() });
  }

  // Stats
  const scored    = entries.slice(0, 30);
  const avgScore  = scored.length > 0 ? (scored.reduce((s, e) => s + e.score, 0) / scored.length).toFixed(1) : "…";
  const streak    = (() => {
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      if (entries.find((e) => e.date === dateStr)) s++;
      else break;
    }
    return s;
  })();

  if (loading) {
    return (
      <div style={{ padding: "0 0 40px" }}>
        {!embedded && (
          <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
            <div><h1>Mood<span className="grad-text">.</span></h1><div className="sub">Loading...</div></div>
          </div>
        )}
        <div className="cc-card" style={{ padding: 32 }}>
          <div className="cc-skeleton" style={{ height: 200, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      {!embedded && (
        <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
          <div>
            <h1>Mood<span className="grad-text">.</span></h1>
            <div className="sub">5-second daily log · {streak}-day streak · avg {avgScore} / 5</div>
          </div>
        </div>
      )}

      <div className="mood-grid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div>
          {/* Today's mood card */}
          <div className="cc-card" style={{
            padding: 32, marginBottom: 14,
            background: "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.12), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.08), transparent 60%), var(--bg-card)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
                Today · {dayNames[now.getDay()]} {now.getDate()} {monthNames[now.getMonth()]}
              </div>
              {saved && (
                <div style={{ fontSize: 11, color: "var(--pos)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 4px var(--pos)", display: "inline-block" }} />
                  Logged · auto-saved
                </div>
              )}
            </div>

            {/* 5-point scale */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginTop: 24 }}>
              {MOODS.map(({ score, emoji, name }) => (
                <button
                  key={score}
                  className="mood-scale-btn"
                  onClick={() => saveEntry(score)}
                  aria-label={`${name}, ${score} of 5`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "22px 8px", border: "1px solid var(--line)", borderRadius: 14,
                    cursor: "pointer", transition: "all 0.2s var(--easeOut)",
                    background:
                      todayScore === score
                        ? "linear-gradient(160deg, rgba(124,77,255,0.15), rgba(100,255,218,0.08))"
                        : "rgba(255,255,255,0.012)",
                    borderColor: todayScore === score ? "rgba(124,77,255,0.40)" : "var(--line)",
                    boxShadow: todayScore === score ? "0 0 20px rgba(124,77,255,0.20), inset 0 0 12px rgba(124,77,255,0.05)" : "none",
                    transform: todayScore === score ? "translateY(-2px)" : "none",
                  }}
                >
                  <div style={{ fontSize: 40, lineHeight: 1, filter: todayScore === score ? "grayscale(0) opacity(1)" : "grayscale(50%) opacity(.65)", transform: todayScore === score ? "scale(1.08)" : "scale(1)", transition: "all 0.2s var(--easeOut)" }}>
                    {emoji}
                  </div>
                  <div style={{ fontSize: 10.5, color: todayScore === score ? "var(--ink)" : "var(--ink-4)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, fontFamily: "var(--f-mono)" }}>
                    {name}
                  </div>
                </button>
              ))}
            </div>

            {/* Collapsible note field */}
            <div style={{ marginTop: 24 }}>
              <button
                className="mood-note-toggle"
                onClick={() => setNoteOpen(!noteOpen)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                  fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-4)",
                  fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                  transition: "color 0.15s var(--easeOut)",
                }}
              >
                <span style={{ transform: noteOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s var(--easeOut)", display: "inline-block" }}>▸</span>
                Add a note
              </button>
              {noteOpen && (
                <div style={{ marginTop: 10, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)", transition: "border-color 0.15s var(--easeOut)" }}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={saveNote}
                    placeholder="What's on your mind today?"
                    style={{ width: "100%", background: "transparent", border: 0, color: "var(--ink)", fontSize: 14, lineHeight: 1.55, resize: "none", fontFamily: "var(--f-sans)", minHeight: 40, letterSpacing: "-0.005em", outline: "none" }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 30-day heatmap */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">30-day mood map</div>
              <div className="tail">1=low · 5=great</div>
            </div>
            <div className="cc-card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
              {["M","T","W","T","F","S","S"].map((d, i) => (
                <div key={i} style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, textAlign: "center", fontFamily: "var(--f-mono)" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
              {last30.slice(-35).map((cell, i) => (
                <div
                  key={i}
                  className="mood-heat-cell"
                  title={`${cell.date}: ${cell.score ? MOODS[cell.score - 1].name : "-"}`}
                  style={{
                    aspectRatio: "1/1",
                    border: `1px solid ${cell.score ? "rgba(124,77,255,0.25)" : "var(--line)"}`,
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.015)",
                    position: "relative",
                    cursor: "default",
                    transition: "transform 0.15s var(--easeOut), border-color 0.15s var(--easeOut)",
                    outline: cell.isToday ? "1.5px solid rgba(100,255,218,0.50)" : "none",
                    outlineOffset: 1,
                    ...( cell.score ? moodCellStyle(cell.score) : {} ),
                  }}
                >
                  <div style={{ position: "absolute", top: 3, left: 5, fontSize: 8.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>{cell.dayNum}</div>
                  {cell.score && (
                    <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: 11, lineHeight: 1, filter: "grayscale(35%)" }}>
                      {MOODS[cell.score - 1].emoji}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
              <span>Hover for details</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {[1,2,3,4,5].map((s) => (
                  <span key={s} style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, ...moodCellStyle(s) as Record<string, unknown>, border: "1px solid transparent" }} />
                ))}
                <span style={{ marginLeft: 4 }}>Low → High</span>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* Stats */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Monthly stats</div><div className="tail">{monthNames[now.getMonth()]}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 16px" }}>
              {[
                { label: "Avg score", value: avgScore, unit: "/5", color: "var(--grad)" },
                { label: "Streak",    value: streak,   unit: "d",   color: "var(--grad)" },
                { label: "Entries",   value: scored.length, unit: "", color: undefined },
                { label: "Best day",  value: entries.filter(e => e.score === 5).length, unit: "×5", color: undefined },
              ].map((stat) => (
                <div key={stat.label} style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>{stat.label}</div>
                  <div className={stat.color ? "grad-text" : undefined} style={{ fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
                    {stat.value}<span style={{ fontSize: 13, color: "var(--ink-4)", WebkitTextFillColor: "var(--ink-4)" }}>{stat.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent history */}
          <div className="cc-card">
            <div className="cc-card-head"><div className="title">Recent entries</div><div className="tail">last 14</div></div>
            <div className="cc-card-body" style={{ padding: entries.length === 0 ? "16px" : 0 }}>
            {entries.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-5)", textAlign: "center" }}>Log your first mood above.</div>
            )}
            {entries.slice(0, 14).map((entry, i, arr) => (
              <div key={entry.date} className="mood-history-row" style={{
                display: "grid", gridTemplateColumns: "60px 32px 1fr auto", gap: 12, alignItems: "center",
                padding: "10px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", fontSize: 12.5,
                transition: "background 0.15s var(--easeOut)",
              }}>
                <div style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 11, letterSpacing: "0.04em" }}>
                  {entry.date.slice(5).replace("-","/")}
                </div>
                <div style={{ fontSize: 20, lineHeight: 1 }}>{MOODS[entry.score - 1].emoji}</div>
                <div style={{ color: "var(--ink-2)", lineHeight: 1.4, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.note || MOODS[entry.score - 1].name}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em" }}>{entry.score}/5</div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mood-scale-btn:hover { border-color: var(--line-hi) !important; background: rgba(255,255,255,0.03) !important; }
        .mood-scale-btn:active { transform: scale(0.97) !important; }
        .mood-scale-btn:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
        .mood-note-toggle:hover { color: var(--ink-2) !important; }
        .mood-heat-cell:hover { transform: scale(1.08); border-color: var(--line-hi) !important; }
        .mood-history-row:hover { background: rgba(255,255,255,0.02); }
        @media (max-width: 768px) {
          .mood-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
