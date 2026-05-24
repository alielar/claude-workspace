"use client";

/**
 * /mood — Daily mood tracker. V2 Ambient Futurism design.
 * Layout: 1fr / 360px — left: today's scale + note + heatmap; right: stats + history.
 * Uses localStorage for persistence until backend is added.
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MoodEntry = { date: string; score: number; note: string; time: string };

const MOODS = [
  { score: 1, emoji: "😞", name: "Awful" },
  { score: 2, emoji: "😔", name: "Low"   },
  { score: 3, emoji: "😐", name: "OK"    },
  { score: 4, emoji: "😊", name: "Good"  },
  { score: 5, emoji: "😄", name: "Great" },
];

// Heatmap cell color per mood score
function moodCellStyle(score: number): React.CSSProperties {
  if (score === 1) return { background: "rgba(255,138,138,0.20)", borderColor: "rgba(255,138,138,0.30)" };
  if (score === 2) return { background: "rgba(255,193,92,0.18)",  borderColor: "rgba(255,193,92,0.30)"  };
  if (score === 3) return { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" };
  if (score === 4) return { background: "linear-gradient(135deg, rgba(124,77,255,0.30), rgba(100,255,218,0.10))", borderColor: "rgba(124,77,255,0.30)" };
  if (score === 5) return { background: "linear-gradient(135deg, rgba(124,77,255,0.55), rgba(100,255,218,0.25))", borderColor: "rgba(124,77,255,0.50)", boxShadow: "0 0 8px rgba(124,77,255,0.20)" };
  return {};
}

export default function MoodPage() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [todayScore, setTodayScore] = useState<number | null>(null);
  const [note, setNote]             = useState("");
  const [saved, setSaved]           = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc_mood_entries");
      if (raw) {
        const parsed: MoodEntry[] = JSON.parse(raw);
        setEntries(parsed);
        const todayEntry = parsed.find((e) => e.date === today);
        if (todayEntry) { setTodayScore(todayEntry.score); setNote(todayEntry.note); setSaved(true); }
      }
    } catch { /* ignore */ }
  }, []);

  const saveEntry = (score: number) => {
    setTodayScore(score);
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const entry: MoodEntry = { date: today, score, note, time };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    localStorage.setItem("cc_mood_entries", JSON.stringify(updated));
    setSaved(true);
  };

  const saveNote = () => {
    if (!todayScore) return;
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const entry: MoodEntry = { date: today, score: todayScore, note, time };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    localStorage.setItem("cc_mood_entries", JSON.stringify(updated));
  };

  // Build last 30-day heatmap (5 rows × 7 cols, latest week last)
  const last30: { date: string; score: number | null; isToday: boolean; isFuture: boolean; dayNum: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const entry   = entries.find((e) => e.date === dateStr);
    last30.push({ date: dateStr, score: entry?.score ?? null, isToday: dateStr === today, isFuture: false, dayNum: d.getDate() });
  }

  // Stats
  const scored    = entries.slice(0, 30);
  const avgScore  = scored.length > 0 ? (scored.reduce((s, e) => s + e.score, 0) / scored.length).toFixed(1) : "-";
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

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Mood<span className="grad-text">.</span></h1>
          <div className="sub">5-second daily log · {streak}-day streak · avg {avgScore} / 5</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

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
                  onClick={() => saveEntry(score)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "24px 8px", border: "1px solid var(--line)", borderRadius: 14,
                    cursor: "pointer", transition: "all 200ms var(--easeOut)",
                    background:
                      todayScore === score
                        ? "linear-gradient(160deg, rgba(124,77,255,0.18), rgba(100,255,218,0.10))"
                        : "rgba(255,255,255,0.012)",
                    borderColor: todayScore === score ? "rgba(124,77,255,0.40)" : "var(--line)",
                    boxShadow: todayScore === score ? "0 0 24px rgba(124,77,255,0.25), inset 0 0 16px rgba(124,77,255,0.06)" : "none",
                    transform: todayScore === score ? "translateY(-2px)" : "none",
                  }}
                >
                  <div style={{ fontSize: 42, lineHeight: 1, filter: todayScore === score ? "grayscale(0) opacity(1)" : "grayscale(50%) opacity(.7)", transform: todayScore === score ? "scale(1.1)" : "scale(1)", transition: "all 200ms" }}>
                    {emoji}
                  </div>
                  <div style={{ fontSize: 11, color: todayScore === score ? "var(--ink)" : "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, fontFamily: "var(--f-mono)" }}>
                    {name}
                  </div>
                </button>
              ))}
            </div>

            {/* Note field */}
            <div style={{ marginTop: 24, padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>
                Note (optional)
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={saveNote}
                placeholder="What's on your mind today?"
                style={{ width: "100%", background: "transparent", border: 0, color: "var(--ink)", fontSize: 14, lineHeight: 1.55, resize: "none", fontFamily: "var(--f-sans)", minHeight: 40, letterSpacing: "-0.005em", outline: "none" }}
              />
            </div>
          </div>

          {/* 30-day heatmap */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">30-day mood map</div>
              <div className="tail">1=low · 5=great</div>
            </div>
            <div className="cc-card-body">

            {/* Day-of-week headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
              {["M","T","W","T","F","S","S"].map((d, i) => (
                <div key={i} style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, textAlign: "center", fontFamily: "var(--f-mono)" }}>{d}</div>
              ))}
            </div>

            {/* 5 weeks of cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
              {last30.slice(-35).map((cell, i) => (
                <div
                  key={i}
                  title={`${cell.date}: ${cell.score ? MOODS[cell.score - 1].name : "-"}`}
                  style={{
                    aspectRatio: "1/1",
                    border: `1px solid ${cell.score ? "rgba(124,77,255,0.30)" : "var(--line)"}`,
                    borderRadius: 5,
                    background: cell.score ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.015)",
                    position: "relative",
                    cursor: "pointer",
                    transition: "transform 100ms",
                    outline: cell.isToday ? "1px solid rgba(100,255,218,0.60)" : "none",
                    outlineOffset: 1,
                    ...( cell.score ? moodCellStyle(cell.score) : {} ),
                  }}
                >
                  <div style={{ position: "absolute", top: 3, left: 5, fontSize: 8.5, color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>{cell.dayNum}</div>
                  {cell.score && (
                    <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: 11, lineHeight: 1, filter: "grayscale(40%)" }}>
                      {MOODS[cell.score - 1].emoji}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
              <span>Hover for details</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {[1,2,3,4,5].map((s) => (
                  <span key={s} style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, ...moodCellStyle(s) as any, border: "1px solid transparent" }} />
                ))}
                <span style={{ marginLeft: 4 }}>Low → High</span>
              </div>
            </div>
            </div>{/* /cc-card-body */}
          </div>
        </div>

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* Stats */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Monthly stats</div><div className="tail">{monthNames[now.getMonth()]}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Avg score", value: avgScore, unit: "/5", color: "var(--grad)", suffix: "" },
                { label: "Streak",    value: streak,   unit: "d",   color: "var(--grad)", suffix: "" },
                { label: "Entries",   value: scored.length, unit: "", color: undefined, suffix: "" },
                { label: "Best day",  value: entries.filter(e => e.score === 5).length, unit: "×5", color: undefined, suffix: "" },
              ].map((stat) => (
                <div key={stat.label} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                  <div className={stat.color ? "grad-text" : undefined} style={{ fontSize: 30, fontWeight: 200, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 4 }}>
                    {stat.value}<span style={{ fontSize: 14, color: "var(--ink-3)", WebkitTextFillColor: "var(--ink-3)" }}>{stat.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent history */}
          <div className="cc-card">
            <div className="cc-card-head"><div className="title">Recent entries</div><div className="tail">last 14</div></div>
            {entries.length === 0 && (
              <div style={{ padding: "16px 0", fontSize: 12, color: "var(--ink-4)", textAlign: "center" }}>Log your first mood above.</div>
            )}
            {entries.slice(0, 14).map((entry, i, arr) => (
              <div key={entry.date} style={{
                display: "grid", gridTemplateColumns: "60px 32px 1fr auto", gap: 12, alignItems: "center",
                padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer", fontSize: 12.5,
              }}>
                <div style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.04em" }}>
                  {entry.date.slice(5).replace("-","/")}
                </div>
                <div style={{ fontSize: 20, lineHeight: 1 }}>{MOODS[entry.score - 1].emoji}</div>
                <div style={{ color: "var(--ink-2)", lineHeight: 1.4, fontSize: 12 }}>{entry.note || MOODS[entry.score - 1].name}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>{entry.score}/5</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
