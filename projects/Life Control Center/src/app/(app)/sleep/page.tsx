"use client";

/**
 * /sleep — Manual sleep tracker.
 * Layout: 1fr / 300px — left: log hero + time pickers + quality + weekly bars; right: stats + debt.
 * Persisted in database via /api/sleep.
 */

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SleepEntry = {
  date: string;
  bedtime: string;
  wake: string;
  hours: number;
  quality: number;
};

const TARGET_HOURS = 8;

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function calcHours(bed: string, wake: string): number {
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 1440;
  return Math.round((mins / 60) * 10) / 10;
}

function fmtHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${mm > 0 ? ` ${mm}m` : ""}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SleepPage() {
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [bedtime, setBedtime] = useState("23:00");
  const [wake,    setWake]    = useState("07:00");
  const [quality, setQuality] = useState(7);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  const now     = new Date();
  const today   = todayMadrid();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Migrate localStorage → API (one-time)
  const migrateLocalStorage = useCallback(async () => {
    try {
      const raw = localStorage.getItem("cc_sleep_entries");
      if (!raw) return;
      const parsed: SleepEntry[] = JSON.parse(raw);
      if (parsed.length === 0) return;
      for (const entry of parsed) {
        await fetch("/api/sleep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      }
      localStorage.removeItem("cc_sleep_entries");
    } catch { /* ignore */ }
  }, []);

  // Load entries from API
  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/sleep");
      if (!res.ok) return;
      const rows = await res.json();
      const mapped: SleepEntry[] = rows.map((r: Record<string, unknown>) => ({
        date: r.date as string,
        bedtime: r.bedtime as string,
        wake: r.wake as string,
        hours: r.hours as number,
        quality: r.quality as number,
      }));
      setEntries(mapped);
      const e = mapped.find((e) => e.date === today);
      if (e) { setBedtime(e.bedtime); setWake(e.wake); setQuality(e.quality); setSaved(true); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [today]);

  useEffect(() => {
    (async () => {
      await migrateLocalStorage();
      await loadEntries();
    })();
  }, [migrateLocalStorage, loadEntries]);

  async function saveEntry() {
    const hours = calcHours(bedtime, wake);
    const entry: SleepEntry = { date: today, bedtime, wake, hours, quality };
    const prevEntries = entries;
    const updated = [...entries.filter((e) => e.date !== today), entry].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(updated);
    setSaved(true);

    try {
      const res = await fetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEntries(prevEntries);
      setSaved(false);
    }
  }

  // Last 7 days for bar chart
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const entry   = entries.find((e) => e.date === dateStr);
    return {
      date: dateStr,
      dow: dayNames[d.getDay()].toUpperCase().slice(0, 3),
      dayNum: d.getDate(),
      hours: entry?.hours ?? null,
      isToday: dateStr === today,
    };
  });

  const weekEntries = last7.filter((d) => d.hours !== null);
  const weekAvg     = weekEntries.length > 0
    ? weekEntries.reduce((s, e) => s + (e.hours ?? 0), 0) / weekEntries.length
    : 0;
  const weekDebt    = weekEntries.reduce((s, e) => s + (TARGET_HOURS - (e.hours ?? TARGET_HOURS)), 0);
  const todayHours  = calcHours(bedtime, wake);
  const maxH = 10;

  const qualAvg = entries.length > 0
    ? (entries.slice(0, 30).reduce((s, e) => s + e.quality, 0) / Math.min(entries.length, 30)).toFixed(1)
    : null;

  if (loading) {
    return (
      <div style={{ padding: "0 0 40px" }}>
        <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
          <div><h1>Sleep<span className="grad-text">.</span></h1><div className="sub">Loading...</div></div>
        </div>
        <div className="cc-card" style={{ padding: 32 }}>
          <div className="cc-skeleton" style={{ height: 300, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Sleep<span className="grad-text">.</span></h1>
          <div className="sub">
            Manual log · weekly avg <b style={{ color: "var(--ink)" }}>{weekAvg > 0 ? fmtHours(weekAvg) : "—"}</b>
            {weekDebt !== 0 && (
              <> · debt <b style={{ color: weekDebt > 0 ? "var(--warn)" : "var(--pos)" }}>
                {weekDebt > 0 ? `-${fmtHours(weekDebt)}` : "0h"}
              </b></>
            )}
          </div>
        </div>
      </div>

      <div className="sleep-grid" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>

        {/* ── LEFT ──────────────────────────────────────────────────────── */}
        <div>

          {/* Log hero card */}
          <div className="cc-card" style={{
            padding: "28px 30px", marginBottom: 14,
            background: "radial-gradient(60% 80% at 0% 0%, rgba(100,255,218,0.10), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(120,160,255,0.08), transparent 60%), var(--bg-card)",
          }}>
            <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
              Log last night
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: 6 }}>
              <div>
                <div style={{
                  fontSize: 80, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 0.9,
                  background: "linear-gradient(100deg, #64FFDA 0%, #7C4DFF 100%)",
                  WebkitBackgroundClip: "text", color: "transparent",
                  filter: "drop-shadow(0 0 20px rgba(100,255,218,0.18))",
                }}>
                  {Math.floor(todayHours)}<span style={{ fontSize: 36 }}>h</span>
                  {todayHours % 1 !== 0 && <span style={{ fontSize: 36 }}>{" "}{Math.round((todayHours % 1) * 60)}m</span>}
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
                {saved && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 4px var(--pos)", display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>SAVED</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 22, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
              {[
                { label: "Bedtime", value: bedtime, set: setBedtime, accent: "var(--cyan)", sub: "tap to edit" },
                { label: "Wake",    value: wake,    set: setWake,    accent: "var(--warn)", sub: "alarm time"  },
              ].map(({ label, value, set, accent, sub }) => (
                <div key={label} style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: accent, display: "inline-block" }} />
                    {label}
                  </div>
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => { set(e.target.value); setSaved(false); }}
                    style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6, fontFamily: "var(--f-mono)", background: "transparent", border: 0, color: "var(--ink)", outline: "none", width: "100%" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.04em" }}>{sub}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, padding: 18, border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Quality</span>
                <div style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-0.02em", fontFamily: "var(--f-mono)" }}>
                  {quality}<span style={{ color: "var(--ink-3)", fontSize: 14 }}> / 10</span>
                </div>
              </div>
              <div style={{ position: "relative", paddingBottom: 22 }}>
                <div style={{
                  position: "absolute", top: 7, left: 0, right: 0, height: 4, borderRadius: 99,
                  background: "linear-gradient(90deg, rgba(255,138,138,0.40) 0%, rgba(255,193,92,0.40) 30%, rgba(100,255,218,0.40) 60%, rgba(111,212,154,0.40) 100%)",
                }} />
                <input
                  type="range" min={1} max={10} value={quality}
                  onChange={(e) => { setQuality(Number(e.target.value)); setSaved(false); }}
                  style={{ position: "relative", width: "100%", appearance: "none", background: "transparent", height: 18, cursor: "pointer", zIndex: 1 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {saved
                ? <div style={{ fontSize: 11, color: "var(--pos)", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--f-mono)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 5px var(--pos)", display: "inline-block" }} />
                    SAVED
                  </div>
                : <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>Unsaved changes</div>
              }
              <button className="cc-btn cc-btn-primary" onClick={saveEntry}>Save log</button>
            </div>
          </div>

          {/* Weekly bar chart */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">This week · hours slept</div>
              <div className="tail">avg <b style={{ color: "var(--ink)" }}>{weekAvg > 0 ? fmtHours(weekAvg) : "—"}</b> · target {TARGET_HOURS}h</div>
            </div>
            <div style={{ padding: "24px 18px 18px" }}>
              <div style={{ height: 180, display: "flex", alignItems: "flex-end", gap: 12, position: "relative", borderBottom: "1px solid var(--line)" }}>
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: `${(TARGET_HOURS / maxH) * 100}%`,
                  borderTop: "1px dashed rgba(100,255,218,0.35)",
                }}>
                  <span style={{ position: "absolute", right: 0, top: 3, fontSize: 9, color: "var(--cyan)", fontFamily: "var(--f-mono)", letterSpacing: "0.10em" }}>8H</span>
                </div>

                {last7.map((day) => {
                  const h     = day.hours ?? (day.isToday ? todayHours : 0);
                  const pct   = h > 0 ? Math.min((h / maxH) * 100, 100) : 3;
                  const isGood = h >= TARGET_HOURS;
                  const bg = day.isToday
                    ? "linear-gradient(180deg, rgba(124,77,255,0.45), rgba(100,255,218,0.10))"
                    : isGood
                      ? "linear-gradient(180deg, rgba(111,212,154,0.40), rgba(111,212,154,0.08))"
                      : "linear-gradient(180deg, rgba(255,193,92,0.35), rgba(255,193,92,0.08))";
                  const border = day.isToday ? "rgba(124,77,255,0.40)" : isGood ? "rgba(111,212,154,0.30)" : "rgba(255,193,92,0.25)";

                  return (
                    <div key={day.date} style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                      {h > 0 && (
                        <div style={{ position: "absolute", top: -20, left: 0, right: 0, textAlign: "center", fontSize: 10.5, color: "var(--ink-2)", fontFamily: "var(--f-mono)" }}>
                          {fmtHours(h)}
                        </div>
                      )}
                      <div style={{
                        height: `${pct}%`, background: bg, borderRadius: "5px 5px 0 0",
                        border: `1px solid ${border}`, borderBottom: 0,
                        boxShadow: day.isToday ? "0 0 12px rgba(124,77,255,0.20)" : "none",
                        transition: "height 300ms var(--easeOut)",
                      }} />
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {last7.map((day) => (
                  <div key={day.date} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: day.isToday ? "var(--cyan)" : "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>{day.dow}</div>
                    <div style={{ fontSize: 9.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{day.dayNum}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div className="cc-card" style={{
            ...(weekDebt > 0 ? { borderColor: "rgba(255,193,92,0.20)" } : {}),
          }}>
            <div className="cc-card-head">
              <div className="title">Sleep debt</div>
              <div className="tail">7-day</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{
                fontSize: 36, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                fontFamily: "var(--f-mono)", color: weekDebt > 0 ? "var(--warn)" : "var(--pos)",
              }}>
                {weekDebt > 0 ? "-" : "+"}{fmtHours(Math.abs(weekDebt))}
                <span style={{ color: "var(--ink-3)", fontSize: 16 }}> hr</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                vs {TARGET_HOURS * 7}h target this week
              </div>
              {weekDebt > 0 && (
                <div style={{ marginTop: 14, padding: "12px 14px", border: "1px solid rgba(255,193,92,0.20)", borderRadius: 8, background: "rgba(255,193,92,0.04)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--warn)", fontWeight: 600, marginBottom: 4 }}>Tip</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    Consistent sleep schedule matters more than catching up on weekends.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Quality · 30 days</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              {qualAvg ? (
                <>
                  <div style={{
                    fontSize: 44, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                    background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent",
                  }}>
                    {qualAvg}<span style={{ fontSize: 20, WebkitTextFillColor: "var(--ink-3)" }}> / 10</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--f-mono)" }}>average quality rating</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Log your first night to see quality stats.</div>
              )}
            </div>
          </div>

          {entries.length > 0 && (
            <div className="cc-card">
              <div className="cc-card-head">
                <div className="title">Recent</div>
                <div className="tail">last 7</div>
              </div>
              <div style={{ padding: "0 16px 14px" }}>
                {entries.slice(0, 7).map((e, i, arr) => (
                  <div key={e.date} style={{
                    display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 10, alignItems: "center",
                    padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
                  }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                      {e.date.slice(5).replace("-","/")}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink)", fontFamily: "var(--f-mono)" }}>
                      {fmtHours(e.hours)}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                      q{e.quality}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px; border-radius: 99px;
          background: #0A0A14; border: 2px solid var(--cyan);
          box-shadow: 0 0 12px rgba(100,255,218,0.50);
          cursor: pointer;
        }
        @media (max-width: 768px) {
          .sleep-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
