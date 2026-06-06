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
  source?: string;
  stage_deep_minutes?: number | null;
  stage_core_minutes?: number | null;
  stage_rem_minutes?: number | null;
  stage_awake_minutes?: number | null;
  heart_rate_avg?: number | null;
  heart_rate_min?: number | null;
  heart_rate_max?: number | null;
  respiratory_rate_avg?: number | null;
  blood_oxygen_avg?: number | null;
  sleep_score?: number | null;
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

// ─── Apple Health Card ───────────────────────────────────────────────────────

const STAGE_COLORS = {
  deep: "#7C4DFF",
  core: "#4D9FFF",
  rem:  "#64FFDA",
  awake: "#FFB74D",
} as const;

function fmtMin(m: number): string {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

function AppleHealthCard({ entry, yesterdayEntry }: { entry: SleepEntry | null; yesterdayEntry?: SleepEntry | null }) {
  // Check today first, fall back to yesterday (the shortcut might store sleep under last night's date)
  const displayEntry = (entry?.source === "apple_health" ? entry : null)
    ?? (yesterdayEntry?.source === "apple_health" ? yesterdayEntry : null);
  const hasAppleData = displayEntry != null;
  const todayDate = todayMadrid();
  const dateLabel = new Date(todayDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const glassStyle: React.CSSProperties = {
    background: "rgba(22,22,38,0.55)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    border: "1px solid rgba(180,180,240,0.08)",
    borderRadius: 16,
    marginBottom: 14,
  };

  if (!hasAppleData) {
    return (
      <div style={glassStyle}>
        <div className="cc-card-head">
          <div className="title">Apple Health</div>
          <div className="tail">{dateLabel}</div>
        </div>
        <div className="cc-card-body" style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 16px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(180,180,240,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
          <div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>No Apple Health data for tonight yet</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-5)", marginTop: 2, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>Syncs automatically at 10:00 AM via Shortcuts</div>
          </div>
        </div>
      </div>
    );
  }

  // Build stages array from available data
  const e = displayEntry!;
  const stages = [
    { key: "deep",  label: "Deep",  minutes: e.stage_deep_minutes,  color: STAGE_COLORS.deep },
    { key: "core",  label: "Core",  minutes: e.stage_core_minutes,  color: STAGE_COLORS.core },
    { key: "rem",   label: "REM",   minutes: e.stage_rem_minutes,   color: STAGE_COLORS.rem },
    { key: "awake", label: "Awake", minutes: e.stage_awake_minutes, color: STAGE_COLORS.awake },
  ].filter((s) => s.minutes != null && s.minutes > 0) as { key: string; label: string; minutes: number; color: string }[];

  const totalStageMin = stages.reduce((s, st) => s + st.minutes, 0);

  return (
    <div style={glassStyle}>
      <div className="cc-card-head">
        <div className="title">Apple Health · Last night</div>
        <div className="tail">{dateLabel}</div>
      </div>
      <div className="cc-card-body">
        {/* Sleep score */}
        {e.sleep_score != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, padding: "12px 14px", border: "1px solid rgba(124,77,255,0.12)", borderRadius: 10, background: "rgba(124,77,255,0.04)" }}>
            <div style={{ fontSize: 36, fontWeight: 200, letterSpacing: "-0.04em", fontFamily: "var(--f-mono)", color: "var(--ink)", lineHeight: 1 }}>
              {e.sleep_score}
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>Sleep Score</div>
              <div style={{ fontSize: 11, color: e.sleep_score >= 80 ? "var(--pos)" : e.sleep_score >= 60 ? "var(--ink-3)" : "var(--warn)", marginTop: 2 }}>
                {e.sleep_score >= 85 ? "Excellent" : e.sleep_score >= 70 ? "Good" : e.sleep_score >= 55 ? "Fair" : "Poor"}
              </div>
            </div>
          </div>
        )}

        {/* Sleep stages bar */}
        {stages.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div className="ah-stages-bar" style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 1.5 }}>
              {stages.map((s) => (
                <div key={s.key} style={{
                  flex: s.minutes / totalStageMin,
                  background: s.color,
                  opacity: 0.75,
                  borderRadius: 3,
                  minWidth: 4,
                }} />
              ))}
            </div>
            <div className="ah-stages-legend" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 }}>
              {stages.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, opacity: 0.75, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    {s.label} · <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-2)" }}>{fmtMin(s.minutes)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vitals tiles */}
        <div className="ah-vitals-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {/* Heart Rate */}
          <div style={{ padding: "12px 14px", border: "1px solid rgba(180,180,240,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.012)" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)", marginBottom: 6 }}>Heart rate</div>
            <div style={{ fontSize: 24, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
              {e.heart_rate_avg != null ? Math.round(e.heart_rate_avg) : "—"}
              <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 3 }}>bpm</span>
            </div>
            {e.heart_rate_min != null && e.heart_rate_max != null && (
              <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                {Math.round(e.heart_rate_min)}–{Math.round(e.heart_rate_max)}
              </div>
            )}
          </div>

          {/* Respiratory Rate */}
          <div style={{ padding: "12px 14px", border: "1px solid rgba(180,180,240,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.012)" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)", marginBottom: 6 }}>Resp. rate</div>
            <div style={{ fontSize: 24, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
              {e.respiratory_rate_avg != null ? e.respiratory_rate_avg.toFixed(1) : "—"}
              <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 3 }}>br/m</span>
            </div>
          </div>

          {/* Blood Oxygen */}
          <div style={{ padding: "12px 14px", border: "1px solid rgba(180,180,240,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.012)" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)", marginBottom: 6 }}>SpO₂</div>
            <div style={{ fontSize: 24, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
              {e.blood_oxygen_avg != null ? e.blood_oxygen_avg.toFixed(1) : "—"}
              <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 3 }}>%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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

  // Load entries from API (uses /api/sleep/logs to get all columns including Apple Health)
  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/sleep/logs");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const rows = await res.json();
      const mapped: SleepEntry[] = rows.map((r: Record<string, unknown>) => ({
        date: r.date as string,
        bedtime: r.bedtime as string,
        wake: r.wake as string,
        hours: r.hours as number,
        quality: r.quality as number,
        source: (r.source as string) ?? "manual",
        stage_deep_minutes: (r.stageDeepMinutes as number | null) ?? null,
        stage_core_minutes: (r.stageCoreMinutes as number | null) ?? null,
        stage_rem_minutes: (r.stageRemMinutes as number | null) ?? null,
        stage_awake_minutes: (r.stageAwakeMinutes as number | null) ?? null,
        heart_rate_avg: (r.heartRateAvg as number | null) ?? null,
        heart_rate_min: (r.heartRateMin as number | null) ?? null,
        heart_rate_max: (r.heartRateMax as number | null) ?? null,
        respiratory_rate_avg: (r.respiratoryRateAvg as number | null) ?? null,
        blood_oxygen_avg: (r.bloodOxygenAvg as number | null) ?? null,
        sleep_score: (r.sleepScore as number | null) ?? null,
      }));
      setEntries(mapped);
      const e = mapped.find((e) => e.date === today);
      if (e) { setBedtime(e.bedtime); setWake(e.wake); setQuality(e.quality); setSaved(true); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [today]);

  useEffect(() => {
    (async () => {
      // Ensure new columns exist before loading
      try { await fetch("/api/admin/migrate", { method: "POST" }); } catch { /* ignore */ }
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

  // Last 7 days for bar chart (use Madrid timezone to match stored dates)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    // Use Madrid timezone for consistent date matching
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
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
            padding: "26px 28px", marginBottom: 14,
            background: "radial-gradient(60% 80% at 0% 0%, rgba(100,255,218,0.08), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(120,160,255,0.06), transparent 60%), var(--bg-card)",
          }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
              Log last night
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: 8 }}>
              <div>
                <div style={{
                  fontSize: 72, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 0.9,
                  background: "linear-gradient(100deg, #64FFDA 0%, #7C4DFF 100%)",
                  WebkitBackgroundClip: "text", color: "transparent",
                  filter: "drop-shadow(0 0 18px rgba(100,255,218,0.15))",
                }}>
                  {Math.floor(todayHours)}<span style={{ fontSize: 34 }}>h</span>
                  {todayHours % 1 !== 0 && <span style={{ fontSize: 34 }}>{" "}{Math.round((todayHours % 1) * 60)}m</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 8, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
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
                <div key={label} className="sleep-time-input" style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)", transition: "border-color 0.15s var(--easeOut)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--f-mono)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: accent, display: "inline-block" }} />
                    {label}
                  </div>
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => { set(e.target.value); setSaved(false); }}
                    style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 8, fontFamily: "var(--f-mono)", background: "transparent", border: 0, color: "var(--ink)", outline: "none", width: "100%" }}
                  />
                  <div style={{ fontSize: 10.5, color: "var(--ink-5)", marginTop: 6, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>{sub}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>Quality</span>
                <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", fontFamily: "var(--f-mono)" }}>
                  {quality}<span style={{ color: "var(--ink-4)", fontSize: 13 }}> / 10</span>
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

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {saved
                ? <div style={{ fontSize: 10, color: "var(--pos)", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--f-mono)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 4px var(--pos)", display: "inline-block" }} />
                    SAVED
                  </div>
                : <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>Unsaved changes</div>
              }
              <button className="cc-btn cc-btn-primary" onClick={saveEntry} style={{ letterSpacing: "0.04em" }}>Save log</button>
            </div>
          </div>

          {/* Apple Health card */}
          <AppleHealthCard
            entry={entries.find((e) => e.date === today) ?? null}
            yesterdayEntry={(() => {
              const y = new Date(now);
              y.setDate(y.getDate() - 1);
              const yStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(y);
              return entries.find((e) => e.date === yStr) ?? null;
            })()}
          />

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
            ...(weekDebt > 0 ? { borderColor: "rgba(255,193,92,0.15)" } : {}),
          }}>
            <div className="cc-card-head">
              <div className="title">Sleep debt</div>
              <div className="tail">7-day</div>
            </div>
            <div className="cc-card-body">
              <div style={{
                fontSize: 34, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                fontFamily: "var(--f-mono)", color: weekDebt > 0 ? "var(--warn)" : "var(--pos)",
              }}>
                {weekDebt > 0 ? "-" : "+"}{fmtHours(Math.abs(weekDebt))}
                <span style={{ color: "var(--ink-4)", fontSize: 15 }}> hr</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
                vs {TARGET_HOURS * 7}h target this week
              </div>
              {weekDebt > 0 && (
                <div style={{ marginTop: 14, padding: "10px 14px", border: "1px solid rgba(255,193,92,0.15)", borderRadius: 8, background: "rgba(255,193,92,0.03)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--warn)", fontWeight: 600, marginBottom: 4, fontFamily: "var(--f-mono)" }}>Tip</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
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
            <div className="cc-card-body">
              {qualAvg ? (
                <>
                  <div style={{
                    fontSize: 40, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                    background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent",
                  }}>
                    {qualAvg}<span style={{ fontSize: 18, WebkitTextFillColor: "var(--ink-4)" }}> / 10</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>average quality rating</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-5)" }}>Log your first night to see quality stats.</div>
              )}
            </div>
          </div>

          {entries.length > 0 && (
            <div className="cc-card">
              <div className="cc-card-head">
                <div className="title">Recent</div>
                <div className="tail">last 7</div>
              </div>
              <div className="cc-card-body" style={{ paddingTop: 0 }}>
                {entries.slice(0, 7).map((e, i, arr) => (
                  <div key={e.date} className="sleep-history-row" style={{
                    display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 10, alignItems: "center",
                    padding: "9px 4px", margin: "0 -4px", borderRadius: 6,
                    borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
                    transition: "background 0.15s var(--easeOut)",
                  }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
                      {e.date.slice(5).replace("-","/")}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink)", fontFamily: "var(--f-mono)" }}>
                      {fmtHours(e.hours)}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
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
          box-shadow: 0 0 10px rgba(100,255,218,0.40);
          cursor: pointer;
          transition: box-shadow 0.15s var(--easeOut);
        }
        input[type=range]::-webkit-slider-thumb:hover {
          box-shadow: 0 0 16px rgba(100,255,218,0.60);
        }
        .sleep-time-input:focus-within { border-color: var(--line-hi) !important; }
        .sleep-history-row:hover { background: rgba(255,255,255,0.02); }
        @media (max-width: 768px) {
          .sleep-grid { grid-template-columns: 1fr !important; }
          .ah-vitals-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
