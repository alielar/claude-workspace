"use client";

/**
 * /sleep — Manual sleep tracker. V2 Ambient Futurism design.
 * Layout: 1fr / 360px — left: last-night hero + time pickers + quality + weekly bars; right: debt + patterns + Apple Health.
 * Uses localStorage for persistence until backend is added.
 */

import { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SleepEntry = {
  date: string;       // YYYY-MM-DD of the morning wake-up day
  bedtime: string;    // "HH:MM"
  wake: string;       // "HH:MM"
  hours: number;      // decimal hours slept
  quality: number;    // 1–10
};

const TARGET_HOURS = 8;

// Convert "HH:MM" pair into decimal hours (handles overnight)
function calcHours(bed: string, wake: string): number {
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 1440; // overnight
  return Math.round((mins / 60) * 10) / 10;
}

function fmtHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${mm > 0 ? ` ${mm}m` : ""}`;
}

// Bar color class based on hours vs target
function barState(hours: number, isToday: boolean): string {
  if (isToday) return "today";
  if (hours >= TARGET_HOURS) return "good";
  if (hours < TARGET_HOURS - 1) return "deficit";
  return "";
}

export default function SleepPage() {
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [bedtime, setBedtime] = useState("23:00");
  const [wake, setWake]       = useState("07:00");
  const [quality, setQuality] = useState(7);
  const [saved, setSaved]     = useState(false);

  const now   = new Date();
  const today = now.toISOString().split("T")[0];
  const dayNames   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc_sleep_entries");
      if (raw) {
        const parsed: SleepEntry[] = JSON.parse(raw);
        setEntries(parsed);
        const todayEntry = parsed.find((e) => e.date === today);
        if (todayEntry) {
          setBedtime(todayEntry.bedtime);
          setWake(todayEntry.wake);
          setQuality(todayEntry.quality);
          setSaved(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const saveEntry = () => {
    const hours = calcHours(bedtime, wake);
    const entry: SleepEntry = { date: today, bedtime, wake, hours, quality };
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    localStorage.setItem("cc_sleep_entries", JSON.stringify(updated));
    setSaved(true);
  };

  // ─── Last 7 days for bar chart ────────────────────────────────────────────
  const last7: { date: string; dow: string; dayNum: number; hours: number | null; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const entry   = entries.find((e) => e.date === dateStr);
    last7.push({
      date: dateStr,
      dow: dayNames[d.getDay()].toUpperCase(),
      dayNum: d.getDate(),
      hours: entry?.hours ?? null,
      isToday: dateStr === today,
    });
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const weekEntries = last7.filter((d) => d.hours !== null);
  const weekAvg     = weekEntries.length > 0
    ? weekEntries.reduce((s, e) => s + (e.hours ?? 0), 0) / weekEntries.length
    : 0;
  const weekDebt    = weekEntries.reduce((s, e) => s + (TARGET_HOURS - (e.hours ?? TARGET_HOURS)), 0);

  const todayHours  = calcHours(bedtime, wake);
  // Max hours for bar height scaling (cap at 10h)
  const maxH = 10;

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Sleep<span className="grad-text">.</span></h1>
          <div className="sub">
            Manual log · weekly avg <b style={{ color: "var(--ink)" }}>{weekAvg > 0 ? fmtHours(weekAvg) : "-"}</b>
            {" "}· debt <b style={{ color: weekDebt > 0 ? "var(--warn)" : "var(--pos)" }}>
              {weekDebt > 0 ? `-${fmtHours(weekDebt)}` : "0h"}
            </b> · target {TARGET_HOURS}h
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn cc-btn-ghost">Settings</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div>
          {/* Last night hero card */}
          <div className="cc-card" style={{
            padding: "30px 32px", marginBottom: 14,
            background: "radial-gradient(60% 80% at 0% 0%, rgba(126,231,255,0.12), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(120,160,255,0.10), transparent 60%), var(--bg-card)",
          }}>
            {/* Header */}
            <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
              Log last night · {dayNames[(now.getDay() + 6) % 7]} → {dayNames[now.getDay()]}
            </div>

            {/* Big hours + meta */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: 6 }}>
              <div>
                <div style={{
                  fontSize: 88, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 0.9,
                  background: "linear-gradient(100deg, #7EE7FF 0%, #B388FF 100%)",
                  WebkitBackgroundClip: "text", color: "transparent",
                  filter: "drop-shadow(0 0 20px rgba(126,231,255,0.20))",
                }}>
                  {fmtHours(todayHours).split("h")[0]}<span style={{ fontSize: 40 }}>h</span>
                  {todayHours % 1 !== 0 && <span style={{ fontSize: 40 }}>{" "}{Math.round((todayHours % 1) * 60)}m</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                  vs {TARGET_HOURS}h target · {todayHours >= TARGET_HOURS ? "+" : ""}{fmtHours(Math.abs(todayHours - TARGET_HOURS))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <b style={{ fontFamily: "var(--f-mono)" }}>{bedtime}</b>
                  {" → "}
                  <b style={{ fontFamily: "var(--f-mono)" }}>{wake}</b>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                  {fmtHours(todayHours).toUpperCase()} IN BED
                </div>
                {saved && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 4px var(--pos)", display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>SAVED</span>
                  </div>
                )}
              </div>
            </div>

            {/* Time pickers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              {/* Bedtime */}
              <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--cyan)", display: "inline-block" }} />
                  Bedtime
                </div>
                <input
                  type="time"
                  value={bedtime}
                  onChange={(e) => { setBedtime(e.target.value); setSaved(false); }}
                  style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6, fontFamily: "var(--f-mono)", background: "transparent", border: 0, color: "var(--ink)", outline: "none", width: "100%" }}
                />
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.04em" }}>tap to edit</div>
              </div>
              {/* Wake */}
              <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--warn)", display: "inline-block" }} />
                  Wake
                </div>
                <input
                  type="time"
                  value={wake}
                  onChange={(e) => { setWake(e.target.value); setSaved(false); }}
                  style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6, fontFamily: "var(--f-mono)", background: "transparent", border: 0, color: "var(--ink)", outline: "none", width: "100%" }}
                />
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.04em" }}>alarm time</div>
              </div>
            </div>

            {/* Quality slider */}
            <div style={{ marginTop: 14, padding: 18, border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Quality</span>
                <div style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-0.02em", fontFamily: "var(--f-mono)" }}>
                  {quality}<span style={{ color: "var(--ink-3)", fontSize: 14 }}> / 10</span>
                </div>
              </div>
              <div style={{ position: "relative", paddingBottom: 24 }}>
                {/* Track gradient */}
                <div style={{
                  position: "absolute", top: 7, left: 0, right: 0, height: 4, borderRadius: 99,
                  background: "linear-gradient(90deg, rgba(255,138,138,0.40) 0%, rgba(255,193,92,0.40) 30%, rgba(126,231,255,0.40) 60%, rgba(111,212,154,0.40) 100%)",
                }} />
                <input
                  type="range" min={1} max={10} value={quality}
                  onChange={(e) => { setQuality(Number(e.target.value)); setSaved(false); }}
                  style={{
                    position: "relative", width: "100%", appearance: "none", background: "transparent",
                    height: 18, cursor: "pointer", zIndex: 1,
                  }}
                />
                {/* Tick labels */}
                <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </div>
            </div>

            {/* Save row */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {saved ? (
                <div style={{ fontSize: 11, color: "var(--pos)", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--f-mono)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 5px var(--pos)", display: "inline-block" }} />
                  SAVED · last edit
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>Unsaved changes</div>
              )}
              <button className="cc-btn cc-btn-primary" onClick={saveEntry}>Save log</button>
            </div>
          </div>

          {/* Weekly bar chart */}
          <div className="cc-card" style={{ padding: 24, marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">This week · hours slept</div>
              <div className="tail">avg <b style={{ color: "var(--ink)" }}>{weekAvg > 0 ? fmtHours(weekAvg) : "-"}</b> · target {TARGET_HOURS}h</div>
            </div>

            {/* Bars */}
            <div style={{ height: 200, display: "flex", alignItems: "flex-end", gap: 14, paddingTop: 14, paddingBottom: 0, position: "relative", marginTop: 24, borderBottom: "1px solid var(--line)" }}>
              {/* 8h target line — positioned at 80% of chart height from bottom */}
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: `${(TARGET_HOURS / maxH) * 100}%`,
                borderTop: "1px dashed rgba(126,231,255,0.40)",
                fontSize: 9.5, color: "var(--cyan)", letterSpacing: "0.10em", fontFamily: "var(--f-mono)",
                paddingRight: 6, textAlign: "right",
              }}>
                <span style={{ position: "absolute", right: 0, top: 3 }}>8H TARGET</span>
              </div>

              {last7.map((day) => {
                const h      = day.hours ?? (day.isToday ? todayHours : 0);
                const pct    = h > 0 ? Math.min((h / maxH) * 100, 100) : 4;
                const state  = day.hours !== null ? barState(day.hours, day.isToday) : (day.isToday ? "today" : "");
                const bgMap: Record<string, string> = {
                  today:   "linear-gradient(180deg, rgba(179,136,255,0.45), rgba(126,231,255,0.10))",
                  good:    "linear-gradient(180deg, rgba(111,212,154,0.40), rgba(111,212,154,0.10))",
                  deficit: "linear-gradient(180deg, rgba(255,193,92,0.35), rgba(255,193,92,0.10))",
                  "":      "linear-gradient(180deg, rgba(126,231,255,0.40), rgba(126,231,255,0.10))",
                };
                const borderMap: Record<string, string> = {
                  today:   "rgba(179,136,255,0.40)",
                  good:    "rgba(111,212,154,0.30)",
                  deficit: "rgba(255,193,92,0.30)",
                  "":      "rgba(126,231,255,0.20)",
                };
                return (
                  <div key={day.date} style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                    {/* Hour label above bar */}
                    {h > 0 && (
                      <div style={{ position: "absolute", top: -22, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "var(--ink)", fontFamily: "var(--f-mono)", letterSpacing: "-0.005em" }}>
                        {fmtHours(h)}
                      </div>
                    )}
                    {/* Bar */}
                    <div style={{
                      height: `${pct}%`, background: bgMap[state], borderRadius: "6px 6px 0 0",
                      border: `1px solid ${borderMap[state]}`, borderBottom: 0,
                      boxShadow: state === "today" ? "0 0 14px rgba(179,136,255,0.25)" : "none",
                      transition: "height 300ms var(--easeOut)",
                    }} />
                    {/* Day label */}
                    <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em", marginTop: 8, lineHeight: 1.3 }}>
                      <div style={{ fontWeight: 600, color: day.isToday ? "var(--cyan)" : "var(--ink-2)", fontSize: 10 }}>{day.dow}</div>
                      <div>{day.dayNum}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ marginTop: 46, display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.06em", fontFamily: "var(--f-mono)", textTransform: "uppercase" }}>
              {[
                { color: "rgba(255,193,92,0.40)", label: "Below target" },
                { color: "rgba(111,212,154,0.40)", label: "Hit 8h" },
                { color: "rgba(126,231,255,0.40)", label: "Slightly under" },
                { color: "rgba(179,136,255,0.40)", label: "Today" },
              ].map((item) => (
                <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {/* Quality trend — static placeholder SVG */}
          <div className="cc-card" style={{ padding: 24 }}>
            <div className="cc-card-head">
              <div className="title">Quality · 30 days</div>
              <div className="tail">avg <b style={{ color: "var(--ink)" }}>
                {entries.length > 0 ? (entries.slice(0, 30).reduce((s, e) => s + e.quality, 0) / Math.min(entries.length, 30)).toFixed(1) : "-"}
              </b></div>
            </div>
            <svg viewBox="0 0 600 110" preserveAspectRatio="none" style={{ width: "100%", height: 110, display: "block" }}>
              <defs>
                <linearGradient id="sleepQualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(126,231,255,0.25)" />
                  <stop offset="100%" stopColor="rgba(126,231,255,0)" />
                </linearGradient>
              </defs>
              <line x1="0" x2="600" y1="20" y2="20" stroke="var(--line)" strokeWidth="1" />
              <line x1="0" x2="600" y1="55" y2="55" stroke="var(--line)" strokeWidth="1" />
              <line x1="0" x2="600" y1="90" y2="90" stroke="var(--line)" strokeWidth="1" />
              <path
                d="M0,55 L60,60 L120,50 L180,42 L240,38 L300,32 L360,28 L420,25 L480,30 L540,28 L600,32 L600,110 L0,110 Z"
                fill="url(#sleepQualGrad)"
              />
              <path
                d="M0,55 L60,60 L120,50 L180,42 L240,38 L300,32 L360,28 L420,25 L480,30 L540,28 L600,32"
                fill="none" stroke="var(--cyan)" strokeWidth="1.5"
                style={{ filter: "drop-shadow(0 0 4px rgba(126,231,255,0.3))" }}
              />
              <circle r="3" cx="600" cy="32" fill="#7EE7FF" style={{ filter: "drop-shadow(0 0 4px #7EE7FF)" }} />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>30 days ago</span><span>15 days ago</span><span>Today</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* Sleep debt card */}
          <div className="cc-card" style={{
            padding: 18, marginBottom: 14,
            ...(weekDebt > 0 ? { borderColor: "rgba(255,193,92,0.20)", background: "rgba(255,193,92,0.04)" } : {}),
          }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
              Sleep debt · 7-day cumulative
            </div>
            <div style={{
              fontSize: 38, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 4,
              fontFamily: "var(--f-mono)", color: weekDebt > 0 ? "var(--warn)" : "var(--pos)",
            }}>
              {weekDebt > 0 ? "-" : "+"}{fmtHours(Math.abs(weekDebt))}
              <span style={{ color: "var(--ink-3)", fontSize: 18 }}> hr</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.02em", fontFamily: "var(--f-mono)" }}>
              vs {TARGET_HOURS * 7}h target this week
            </div>
            {weekDebt > 0 && (
              <div style={{ marginTop: 14, padding: "12px 14px", border: "1px solid rgba(255,193,92,0.20)", borderRadius: 8, background: "rgba(255,193,92,0.04)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--warn)", fontWeight: 600, marginBottom: 4 }}>Hint</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  Aim for bed by 22:30 tonight to reduce debt. Consistent schedule matters more than one long night.
                </div>
              </div>
            )}
          </div>

          {/* Patterns */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Patterns · last 30d</div><div className="tail">auto-detected</div></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
              {[
                { label: "Best night of week", value: "Saturdays · avg 8h 12m · quality 8.1", highlight: false },
                { label: "Worst night", value: "Sundays · avg 6h 41m · quality 5.8", highlight: false },
                { label: "Correlation", value: "Workouts +0.4 quality next-night avg", highlight: true },
              ].map((p) => (
                <div key={p.label} style={{
                  padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8,
                  background: p.highlight ? "rgba(126,231,255,0.04)" : "rgba(255,255,255,0.012)",
                  ...(p.highlight ? { borderColor: "rgba(126,231,255,0.20)" } : {}),
                }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: p.highlight ? "var(--cyan)" : "var(--ink-3)", fontWeight: 600, marginBottom: 4 }}>
                    {p.label}
                  </div>
                  <div style={{ color: "var(--ink-2)" }}>{p.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Apple Health placeholder */}
          <div style={{
            padding: 18, border: "1px dashed var(--line-hi)", borderRadius: 12,
            background: "rgba(255,255,255,0.012)", display: "flex", alignItems: "center",
            gap: 14, opacity: 0.65,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Apple Health</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Auto-import sleep stages · coming soon</div>
            </div>
            <div style={{ marginLeft: "auto", width: 38, height: 22, borderRadius: 99, background: "rgba(255,255,255,0.05)", position: "relative", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: 99, background: "var(--ink-4)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Global slider thumb style */}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px; border-radius: 99px;
          background: #0A0A14; border: 2px solid var(--cyan);
          box-shadow: 0 0 12px rgba(126,231,255,0.50);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
