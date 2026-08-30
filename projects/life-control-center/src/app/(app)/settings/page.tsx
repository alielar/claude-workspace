"use client";

/**
 * /settings — the few things worth a setting.
 *
 *  1. Appearance: follow phone / light / dark
 *  2. News topics
 *  3. Install on iPhone (hint, only when not installed)
 *  4. Archive (old modules, out of the navigation, one tap away)
 *  5. App: version, force-update
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useClientValue } from "@/lib/useClientValue";
import { useCached, fetchJson, readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { YT_CHANNELS } from "@/lib/news/youtube";
import { useWorkouts } from "@/lib/train/useTrain";
import { DAY_CODES, DAY_LABELS, type DayCode, type WorkoutKey } from "@/lib/train/types";
import { pushState, enablePush, disablePush, type PushState } from "@/lib/push/client";

type UserSettings = {
  timezone: string;
  newsTopics: string;
  newsEmailEnabled: boolean;
  newsEmailTime: string;
  newsChannels?: string | null;
  kettlebellKg?: number;
};

const CHANNEL_GROUPS: { category: string; label: string }[] = [
  { category: "football",    label: "Football" },
  { category: "geopolitics", label: "Geopolitics" },
  { category: "tech",        label: "Tech & AI" },
  { category: "business",    label: "Business" },
];

const KETTLEBELLS = [
  { key: "12", label: "12 kg" },
  { key: "16", label: "16 kg" },
  { key: "20", label: "20 kg" },
  { key: "24", label: "24 kg" },
];

const NEWS_TOPICS = [
  { key: "football",    label: "Football" },
  { key: "geopolitics", label: "Geopolitics" },
  { key: "tech",        label: "Technology" },
  { key: "ai",          label: "Artificial Intelligence" },
  { key: "business",    label: "Business & Markets" },
];

const THEMES: { key: ThemeChoice; label: string; hint: string }[] = [
  { key: "system", label: "Automatic", hint: "Follows the phone" },
  { key: "light",  label: "Light",     hint: "" },
  { key: "dark",   label: "Dark",      hint: "For night use" },
];

function parseTopics(s: string | undefined): string[] {
  try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; }
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" style={{
      display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: 4, padding: 4, borderRadius: 12, background: "var(--fill-1)", border: "1px solid var(--line)",
    }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            style={{
              minHeight: 40, borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 15, fontWeight: on ? 600 : 500, font: "inherit",
              background: on ? "var(--bg-card-2)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-3)",
              boxShadow: on ? "var(--shadow-card)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useTheme();
  const standalone = useClientValue(
    () => window.matchMedia("(display-mode: standalone)").matches
       || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true),
    true
  );
  const isIOS = useClientValue(() => /iPhone|iPad|iPod/.test(navigator.userAgent), false);

  const { data: settings, setData } = useCached<UserSettings>("settings", () => fetchJson<UserSettings>("/api/settings"));
  const topics = parseTopics(settings?.newsTopics);

  const toggleTopic = async (key: string) => {
    if (!settings) return;
    const next = topics.includes(key) ? topics.filter((t) => t !== key) : [...topics, key];
    setData({ ...settings, newsTopics: JSON.stringify(next) });
    try {
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { newsTopics: JSON.stringify(next) }, dedupeKey: "settings:newsTopics" });
    } catch { /* keep optimistic state; next refresh corrects it */ }
  };

  // Fixed training days (optional). A day belongs to one workout; tapping it on the other moves it.
  const { workouts, saveWorkout } = useWorkouts();
  const dayOwner = (d: DayCode): WorkoutKey | null => workouts.find((w) => w.assignedDays?.includes(d))?.key ?? null;
  const toggleDay = (key: WorkoutKey, d: DayCode) => {
    const owner = dayOwner(d);
    for (const w of workouts) {
      const has = w.assignedDays?.includes(d) ?? false;
      if (w.key === key) {
        if (owner === key) saveWorkout({ ...w, assignedDays: (w.assignedDays ?? []).filter((x) => x !== d) });
        else saveWorkout({ ...w, assignedDays: [...(w.assignedDays ?? []), d] });
      } else if (has) {
        saveWorkout({ ...w, assignedDays: (w.assignedDays ?? []).filter((x) => x !== d) });
      }
    }
    // Today and Train read the schedule from the server; drop their cached copies so the next open is fresh.
    try { localStorage.removeItem("cc:v1:train-overview"); } catch { /* ignore */ }
  };
  const plannedCount = workouts.reduce((n, w) => n + (w.assignedDays?.length ?? 0), 0);

  // Reminders (push) on this device
  const [push, setPush] = useState<PushState | "loading">("loading");
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  useEffect(() => { pushState().then(setPush).catch(() => setPush("unsupported")); }, []);
  const togglePush = async () => {
    setPushMsg(null);
    try { setPush(push === "on" ? await disablePush() : await enablePush()); }
    catch { setPushMsg("Couldn't turn reminders on — try again in a moment."); }
  };
  const testPush = async () => {
    setPushMsg("Sending…");
    const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => null) as { sent?: number } | null;
    setPushMsg(r?.sent ? "Sent — it should appear in a few seconds." : "Nothing sent — is this device subscribed?");
  };
  const { data: me } = useCached<{ required: boolean; email: string | null }>("auth-me", () => fetchJson("/api/auth/me"));

  const kettlebell = String(settings?.kettlebellKg ?? 12);
  const setKettlebell = async (key: string) => {
    if (!settings) return;
    const kg = Number(key);
    setData({ ...settings, kettlebellKg: kg });
    try {
      // Also refresh the Train tab's cached copy of the weight right away.
      const ov = readCache<{ kettlebellKg: number }>("train-overview");
      if (ov) writeCache("train-overview", { ...ov.data, kettlebellKg: kg });
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { kettlebellKg: kg }, dedupeKey: "settings:kettlebellKg" });
    } catch { /* keep optimistic state */ }
  };

  // YouTube channels for the brief: null = all on.
  const channels: string[] = (() => {
    try { return settings?.newsChannels ? (JSON.parse(settings.newsChannels) as string[]) : YT_CHANNELS.map((c) => c.id); }
    catch { return YT_CHANNELS.map((c) => c.id); }
  })();
  const [showChannels, setShowChannels] = useState(false);
  const toggleChannel = async (id: string) => {
    if (!settings) return;
    const next = channels.includes(id) ? channels.filter((c) => c !== id) : [...channels, id];
    const json = JSON.stringify(next);
    setData({ ...settings, newsChannels: json });
    try {
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { newsChannels: json }, dedupeKey: "settings:newsChannels" });
    } catch { /* keep optimistic state */ }
  };

  const hardRefresh = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.update()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
    location.reload();
  };

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Settings</h1>
          <div className="sub">Appearance, kettlebell, training days, news, books</div>
        </div>
      </div>

      {/* Appearance */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Appearance</span><span className="tail">{THEMES.find((t) => t.key === theme)?.hint}</span></div>
        <div className="cc-card-body">
          <Segmented value={theme} options={THEMES} onChange={setTheme} />
        </div>
      </section>

      {/* Kettlebell */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Kettlebell</span><span className="tail">16 once every move is mastered</span></div>
        <div className="cc-card-body">
          <Segmented value={kettlebell} options={KETTLEBELLS} onChange={setKettlebell} />
        </div>
      </section>

      {/* Reminders */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Reminders</span><span className="tail">{push === "on" ? "on for this device" : push === "loading" ? "—" : "off"}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>A to-do that’s due and not ticked gets a notification every 30 minutes until you tick it. Quiet from 23:00 to 08:00. Personal and Work nag separately.</p>
          {push === "needs-install" && <p style={{ margin: 0, color: "var(--warn)" }}>On iPhone this only works from the installed app — add A L I to the home screen first, then come back here.</p>}
          {push === "blocked" && <p style={{ margin: 0, color: "var(--warn)" }}>Notifications are blocked for this app in iOS Settings → Notifications → A L I.</p>}
          {push === "unsupported" && <p style={{ margin: 0, color: "var(--ink-3)" }}>This browser can’t receive notifications.</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={push === "on" ? "cc-btn cc-btn-secondary" : "cc-btn cc-btn-primary"} disabled={push === "loading" || push === "unsupported" || push === "needs-install" || push === "blocked"} onClick={togglePush}>
              {push === "on" ? "Turn off on this device" : "Turn on reminders"}
            </button>
            {push === "on" && <button className="cc-btn cc-btn-ghost" onClick={testPush}>Send a test</button>}
          </div>
          {pushMsg && <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>{pushMsg}</p>}
        </div>
      </section>

      {/* Training days */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Training days</span><span className="tail">{plannedCount ? `${plannedCount} a week` : "any days"}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
          {workouts.map((w) => (
            <div key={w.key} style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{w.name}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
                {DAY_CODES.map((d) => {
                  const owner = dayOwner(d);
                  const on = owner === w.key;
                  const other = owner !== null && !on;
                  return (
                    <button key={d} onClick={() => toggleDay(w.key, d)} aria-pressed={on}
                      style={{ minHeight: 44, borderRadius: 10, fontSize: 14, font: "inherit", cursor: "pointer", padding: 0,
                        border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`,
                        background: on ? "var(--violet)" : "var(--fill-1)",
                        color: on ? "var(--on-accent)" : other ? "var(--ink-4)" : "var(--ink-2)",
                        textDecoration: other ? "line-through" : "none" }}>
                      {DAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5 }}>
            {plannedCount
              ? "Today shows the planned workout, or a quiet rest day. You can always train anyway."
              : "Leave everything off to keep “4 a week, any days, alternating”."}
          </p>
        </div>
      </section>

      {/* News topics */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">News topics</span><span className="tail">{settings ? `${topics.length} on` : "—"}</span></div>
        <div style={{ padding: "4px 14px" }}>
          {NEWS_TOPICS.map((t, i) => {
            const on = topics.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTopic(t.key)}
                disabled={!settings}
                role="switch"
                aria-checked={on}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                  minHeight: 52, padding: "0 2px", background: "transparent", border: "none",
                  borderBottom: i < NEWS_TOPICS.length - 1 ? "1px solid var(--line)" : "none",
                  color: "var(--ink)", font: "inherit", fontSize: 16, cursor: "pointer", textAlign: "left",
                }}
              >
                <span>{t.label}</span>
                <span aria-hidden style={{
                  width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0,
                  background: on ? "var(--violet)" : "var(--fill-3)", transition: "background 0.15s",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99,
                    background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* YouTube channels */}
      <section className="cc-card">
        <button onClick={() => setShowChannels((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showChannels ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
          <span className="title">YouTube channels in the brief</span>
          <span className="tail">{settings ? `${channels.filter((id) => YT_CHANNELS.some((c) => c.id === id)).length} of ${YT_CHANNELS.length} on` : "—"} {showChannels ? "▴" : "▾"}</span>
        </button>
        {showChannels && (
          <div style={{ padding: "4px 14px 10px" }}>
            {CHANNEL_GROUPS.map((g) => (
              <div key={g.category}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 2px 4px" }}>{g.label}</div>
                {YT_CHANNELS.filter((c) => c.category === g.category).map((c) => {
                  const on = channels.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleChannel(c.id)} disabled={!settings} role="switch" aria-checked={on}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 52, padding: "6px 2px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", color: "var(--ink)", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 16 }}>{c.name}</span>
                        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 1 }}>{c.why}</span>
                      </span>
                      <span aria-hidden style={{ width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0, background: on ? "var(--violet)" : "var(--fill-3)", transition: "background 0.15s" }}>
                        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div style={{ fontSize: 14, color: "var(--ink-4)", padding: "10px 2px 0", lineHeight: 1.5 }}>Changes apply to the next morning&rsquo;s brief (or tap Refresh on News).</div>
          </div>
        )}
      </section>

      {/* Stretching player — a second door, so it is reachable even when the Today row is ticked */}
      <Link href="/stretch" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>🤸 Stretching</span>
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>16 moves · 30 s on, 10 s off</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </div>
      </Link>

      {/* Books */}
      <Link href="/books" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>📚 Books</span>
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>The waiting list of physical books</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </div>
      </Link>

      {/* Home-screen widget (via Scriptable — iOS gives widgets to native apps only) */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Home-screen widget</span></div>
        <div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 10px" }}>iOS only lets native apps draw widgets, so this goes through the free <b>Scriptable</b> app. Once: install Scriptable, paste the script, add a Scriptable widget and point it at the script named <b>ALI</b>.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-secondary" style={{ textDecoration: "none" }}>Get Scriptable</a>
            <a href="/api/widget/script" target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-secondary" style={{ textDecoration: "none" }}>Open the script</a>
          </div>
        </div>
      </section>

      {/* Install hint */}
      {!standalone && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Install on your phone</span></div>
          <div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {isIOS
              ? <>In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. The app then opens full-screen and works offline.</>
              : <>Use your browser&rsquo;s <strong>Install app</strong> / <strong>Add to Home Screen</strong> option. The app then opens full-screen and works offline.</>}
          </div>
        </section>
      )}

      {/* Account */}
      {me?.required && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Account</span><span className="tail">{me.email ?? ""}</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 15, color: "var(--ink-2)" }}>
            <p style={{ margin: 0 }}>Signed in with Google. This stays signed in on this device; only your account can get in.</p>
            <form method="post" action="/api/auth/logout"><button type="submit" className="cc-btn cc-btn-ghost">Sign out</button></form>
          </div>
        </section>
      )}

      {/* App */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">App</span><span className="tail">2026-08-30</span></div>
        <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, color: "var(--ink-2)" }}>Not seeing the latest version?</span>
          <button className="cc-btn cc-btn-ghost" onClick={hardRefresh}>Update app</button>
        </div>
      </section>
    </div>
  );
}
