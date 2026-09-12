"use client";

/**
 * /settings · the few things worth a setting.
 *
 *  1. Appearance: follow phone / light / dark
 *  2. News topics
 *  3. Install on iPhone (hint, only when not installed)
 *  4. Archive (old modules, out of the navigation, one tap away)
 *  5. App: version, force-update
 */

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useClientValue } from "@/lib/useClientValue";
import { useCached, fetchJson, readCache, writeCache, isOnline } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { VIDEO_CATEGORIES, allChannels, isBuiltIn, parseCustomChannels, type CustomChannel, type VideoCategory } from "@/lib/news/youtube";
import type { ChannelHit } from "@/lib/news/youtubeSearch";
import { useWorkouts } from "@/lib/train/useTrain";
import { DAY_CODES, DAY_LABELS, type DayCode, type WorkoutKey } from "@/lib/train/types";
import { pushState, enablePush, disablePush, type PushState } from "@/lib/push/client";
import { parseMorningPlan, computeMorning, type MorningPlan } from "@/lib/morning/plan";
import { STRETCH_MOVES, STRETCH_TOTAL_SECONDS } from "@/lib/routine/stretching";

type UserSettings = {
  timezone: string;
  newsTopics: string;
  newsEmailEnabled: boolean;
  newsEmailTime: string;
  newsChannels?: string | null;
  newsCustomChannels?: string | null;
  kettlebellKg?: number;
  calendarFeeds?: string | null;
  morningPlan?: string | null;
};

/** Browser online/offline as an external store (search box disables itself offline). */
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb); window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
}

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
  { key: "dark",   label: "Dark",      hint: "" },
  { key: "night",  label: "Night",     hint: "Warm · less blue light" },
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


type HealthStatus = {
  lastSleep: { date: string; totalMin: number | null; score: number | null; receivedAt: number } | null;
  lastWorkout: { date: string; type: string; receivedAt: number } | null;
  lastPost: { receivedAt: number; automation: string | null; summary: string } | null;
  nights: number;
  workouts: number;
  setup: { url: string; header: string; key: string };
};

const HAE_STEPS = [
  "App Store → Health Auto Export (JSON+CSV) → install, allow Health access (Sleep, Workouts, Heart Rate, Resting Heart Rate, HRV, Respiratory Rate, Blood Oxygen).",
  "Inside the app: Premium → yearly plan (7-day trial). Only Premium runs automations in the background.",
  "Automations → + → REST API · name “ALI sleep” · URL below · Add header: key x-app-key, value = the key below · JSON · Summarize on · group by day · date range Default · metrics: Sleep Analysis, Resting Heart Rate, Heart Rate Variability, Heart Rate, Respiratory Rate, Blood Oxygen · every 1 hour · Save.",
  "Automations → + → REST API · name “ALI workouts” · same URL and header · metrics none, Workouts on · date range Previous 7 days · every 1 hour · Save.",
  "Tap Run on each automation once, then come back here: the two lines above should show today’s stamp.",
  "iPhone Settings → Apps → Health Auto Export → Background App Refresh on. Add its “Automations” widget to a home screen: one tap = sync now.",
];

function AppleWatchCard() {
  const { data } = useCached<HealthStatus>("health-status", () => fetchJson<HealthStatus>("/api/health/ingest"));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"url" | "key" | null>(null);
  const now = useClientValue(() => Date.now(), 0);
  const copy = async (what: "url" | "key", text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* show it, user copies by hand */ }
  };
  const stamp = (ms: number | null | undefined) => {
    if (!ms) return "nothing yet";
    const d = new Date(ms), today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return `${sameDay ? "today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const fmtMin = (m: number | null) => (m === null ? "" : ` · ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
  const staleDays = data?.lastPost && now ? (now - data.lastPost.receivedAt) / 86400000 : null;
  const tail = !data ? "…" : !data.lastPost ? "not connected" : staleDays !== null && staleDays > 2 ? "quiet for days" : "connected";
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Apple Watch</span><span className="tail" style={tail === "quiet for days" ? { color: "var(--warn)" } : undefined}>{tail}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 8, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>Sleep, workouts and heart data arrive from the Health Auto Export app whenever the phone is unlocked · not at a fixed time.</p>
        <div style={{ display: "grid", gap: 2, fontSize: 14, color: "var(--ink-3)" }}>
          <span>Sleep · {data ? (data.lastSleep ? `night of ${data.lastSleep.date}${fmtMin(data.lastSleep.totalMin)} · received ${stamp(data.lastSleep.receivedAt)}` : "nothing yet") : "—"}</span>
          <span>Workouts · {data ? (data.lastWorkout ? `${data.lastWorkout.type} on ${data.lastWorkout.date} · received ${stamp(data.lastWorkout.receivedAt)}` : "nothing yet") : "—"}</span>
          <span>Last post · {data ? (data.lastPost ? `${stamp(data.lastPost.receivedAt)}${data.lastPost.automation ? ` · ${data.lastPost.automation}` : ""} · ${data.lastPost.summary}` : "nothing yet") : "—"}</span>
        </div>
        {data?.setup && (
          <div style={{ display: "grid", gap: 6 }}>
            {(["url", "key"] as const).map((what) => {
              const val = what === "url" ? data.setup.url : data.setup.key;
              return (
                <div key={what} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <span style={{ minWidth: 0, fontSize: 13, fontFamily: "ui-monospace, monospace", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--ink-4)" }}>{what === "url" ? "URL " : `${data.setup.header} `}</span>{what === "key" && !open ? "••••••••" : val}
                  </span>
                  <button className="cc-btn cc-btn-ghost" onClick={() => copy(what, val)} disabled={!val} style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }}>{copied === what ? "Copied" : "Copy"}</button>
                </div>
              );
            })}
          </div>
        )}
        <button className="cc-btn cc-btn-ghost" onClick={() => setOpen((v) => !v)} style={{ minHeight: 44, justifySelf: "start" }}>{open ? "Hide the setup steps" : "Setup steps"}</button>
        {open && (
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>
            {HAE_STEPS.map((t) => <li key={t}>{t}</li>)}
          </ol>
        )}
      </div>
    </section>
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
  type PushDevice = { endpoint: string; userAgent: string; lastUsedAt: number | null };
  const [pushInfo, setPushInfo] = useState<{ count: number; lastTickAt: number | null; devices: PushDevice[] } | null>(null);
  const [myEndpoint, setMyEndpoint] = useState<string | null>(null);
  useEffect(() => { pushState().then(setPush).catch(() => setPush("unsupported")); }, []);
  useEffect(() => {
    (async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setMyEndpoint(sub?.endpoint ?? null);
      } catch { /* not available */ }
    })();
  }, [push]);
  const loadPushInfo = () => {
    fetch("/api/push").then((r) => r.json())
      .then((d) => setPushInfo({ count: d.count ?? 0, lastTickAt: d.lastTickAt ?? null, devices: d.devices ?? [] }))
      .catch(() => {});
  };
  useEffect(loadPushInfo, []);
  const removeDevice = async (endpoint: string) => {
    if (!confirm("Remove this device from reminders?")) return;
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) }).catch(() => {});
    loadPushInfo();
  };
  // "iPhone · A L I app" from a user-agent string · enough to tell devices apart.
  const deviceName = (ua: string) => {
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh|Mac OS/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : "Device";
    const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
    return br ? `${os} · ${br}` : os;
  };
  const togglePush = async () => {
    setPushMsg(null);
    try { setPush(push === "on" ? await disablePush() : await enablePush()); loadPushInfo(); }
    catch { setPushMsg("Couldn't turn reminders on · try again in a moment."); }
  };
  const testPush = async () => {
    setPushMsg("Sending…");
    const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => null) as { sent?: number } | null;
    setPushMsg(r?.sent ? "Sent · it should appear in a few seconds." : "Nothing sent · is this device subscribed?");
  };
  const { data: me } = useCached<{ required: boolean; email: string | null }>("auth-me", () => fetchJson("/api/auth/me"));

  // Calendars · two secret iCal URLs (Work / Personal), saved on blur.
  const [calWork, setCalWork] = useState("");
  const [calPersonal, setCalPersonal] = useState("");
  const [showCal, setShowCal] = useState(false);
  const [calCheck, setCalCheck] = useState<string | null>(null);
  const checkCalendars = async () => {
    setCalCheck("Checking…");
    try {
      const r = await fetchJson<{ blocks: { source: string }[]; errors?: string[] }>("/api/calendar/today?fresh=1");
      if (!r) { setCalCheck("Could not reach the server."); return; }
      const work = r.blocks.filter((b) => b.source === "work").length;
      const personal = r.blocks.filter((b) => b.source === "personal").length;
      const parts = [`Work: ${work} block${work === 1 ? "" : "s"} today`, `Personal: ${personal} event${personal === 1 ? "" : "s"} today`];
      if (r.errors?.length) parts.push(`⚠ ${r.errors.join(" · ")}`);
      setCalCheck(parts.join(" · "));
    } catch { setCalCheck("Could not reach the server."); }
  };
  const calLoaded = useRef(false);
  useEffect(() => {
    if (calLoaded.current || !settings) return;
    calLoaded.current = true;
    try {
      const feeds = JSON.parse(settings.calendarFeeds ?? "null") as { name: string; url: string }[] | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating inputs once from the server copy
      setCalWork(feeds?.find((f) => f.name === "Work")?.url ?? "");
      setCalPersonal(feeds?.find((f) => f.name === "Personal")?.url ?? "");
    } catch { /* ignore */ }
  }, [settings]);
  const saveCalendars = async (work: string, personal: string) => {
    const feeds = [
      work.trim() ? { name: "Work", url: work.trim() } : null,
      personal.trim() ? { name: "Personal", url: personal.trim() } : null,
    ].filter(Boolean);
    const json = feeds.length ? JSON.stringify(feeds) : null;
    if (settings) setData({ ...settings, calendarFeeds: json });
    try {
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { calendarFeeds: json }, dedupeKey: "settings:calendarFeeds" });
    } catch { /* replayed later */ }
  };

  // Morning routine · wake times + minutes per step, all editable and sticky.
  const plan = parseMorningPlan(settings?.morningPlan);
  const savePlan = async (next: MorningPlan) => {
    const json = JSON.stringify(next);
    if (settings) setData({ ...settings, morningPlan: json });
    try {
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { morningPlan: json }, dedupeKey: "settings:morningPlan" });
    } catch { /* replayed later */ }
  };
  const setStepMinutes = (id: string, minutes: number) =>
    savePlan({ ...plan, steps: plan.steps.map((s) => (s.id === id ? { ...s, minutes: Math.max(0, Math.min(180, Math.round(minutes))) } : s)) });
  const trainDay = computeMorning(plan, true);
  const restDay = computeMorning(plan, false);

  // One-tap schema update · the migrate route is idempotent, safe to tap any time.
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);
  const runMigrate = async () => {
    setMigrateMsg("Updating…");
    const r = await fetch("/api/admin/migrate", { method: "POST" }).then((x) => x.json()).catch(() => null);
    setMigrateMsg(r ? "Database is up to date." : "Failed · try again in a moment.");
  };

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

  // YouTube channels for the brief: built-ins + Ali's additions; newsChannels = enabled ids, null = all on.
  const custom = parseCustomChannels(settings?.newsCustomChannels);
  const channelList = allChannels(custom);
  const channels: string[] = (() => {
    try { return settings?.newsChannels ? (JSON.parse(settings.newsChannels) as string[]) : channelList.map((c) => c.id); }
    catch { return channelList.map((c) => c.id); }
  })();
  const [showChannels, setShowChannels] = useState(false);
  const saveChannels = async (enabled: string[] | null, nextCustom: CustomChannel[]) => {
    if (!settings) return;
    const body = { newsChannels: enabled ? JSON.stringify(enabled) : null, newsCustomChannels: JSON.stringify(nextCustom) };
    setData({ ...settings, ...body });
    try {
      await sendOrQueue({ url: "/api/settings", method: "PATCH", body, dedupeKey: "settings:channels" });
    } catch { /* keep optimistic state */ }
  };
  const toggleChannel = (id: string) =>
    saveChannels(channels.includes(id) ? channels.filter((c) => c !== id) : [...channels, id], custom);
  const addChannel = (hit: ChannelHit, category: VideoCategory) => {
    const entry: CustomChannel = { id: hit.id, name: hit.name, category, handle: hit.handle, subs: hit.subs };
    const nextCustom = [...custom.filter((c) => c.id !== hit.id), entry];
    // null = "all on" stays null (the new one is on too); an explicit list gets the new id.
    const enabled = settings?.newsChannels ? Array.from(new Set([...channels, hit.id])) : null;
    void saveChannels(enabled, nextCustom);
  };
  // Remove: a custom channel is dropped; a built-in gets a `removed` marker (restorable).
  const removeChannel = (id: string) => {
    const enabled = settings?.newsChannels ? channels.filter((c) => c !== id) : null;
    const rest = custom.filter((c) => c.id !== id);
    const ch = channelList.find((c) => c.id === id);
    void saveChannels(enabled, isBuiltIn(id) && ch ? [...rest, { id, name: ch.name, category: ch.category, removed: true }] : rest);
    setEditing(null);
  };
  // Edit name / topic: custom rows change in place, built-ins get an override entry with the same id.
  const editChannel = (id: string, name: string, category: VideoCategory) => {
    const clean = name.trim();
    if (!clean) return;
    const prev = custom.find((c) => c.id === id);
    const entry: CustomChannel = { ...(prev ?? {}), id, name: clean, category, removed: false };
    void saveChannels(settings?.newsChannels ? channels : null, [...custom.filter((c) => c.id !== id), entry]);
    setEditing(null);
  };
  // Restore one built-in (or all) to how the app shipped it.
  const restoreChannel = (id: string) => { void saveChannels(settings?.newsChannels ? channels : null, custom.filter((c) => c.id !== id)); setEditing(null); };
  const builtInOverrides = custom.filter((c) => isBuiltIn(c.id));
  const restoreAll = () => { if (confirm("Put every built-in channel back the way it shipped? Channels you added stay.")) void saveChannels(settings?.newsChannels ? channels : null, custom.filter((c) => !isBuiltIn(c.id))); };
  const [editing, setEditing] = useState<{ id: string; name: string; category: VideoCategory } | null>(null);

  // Live channel search (needs a connection · offline the box is disabled, the list above still shows).
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<VideoCategory>("tech");
  const [hits, setHits] = useState<ChannelHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchActive = query.trim().length >= 2 && online;
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !online) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true); setSearchError(null);
      try {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { hits: ChannelHit[] };
        setHits(json.hits);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setHits(null); setSearchError("Could not reach YouTube. Check the connection and try again.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, online]);

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
          <div style={{ fontSize: 13, color: "var(--ink-4)", padding: "8px 2px 2px" }}>From sunset to sunrise (20:00–07:00) the app is always in Night mode; your choice here rules the day.</div>
        </div>
      </section>

      {/* Kettlebell */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Kettlebell</span><span className="tail">16 once every move is mastered</span></div>
        <div className="cc-card-body">
          <Segmented value={kettlebell} options={KETTLEBELLS} onChange={setKettlebell} />
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
        <div className="cc-card-head"><span className="title">News topics</span><span className="tail">{settings ? `${topics.length} on` : "…"}</span></div>
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

      {/* YouTube channels · built-ins per topic + live search to add your own (2026-09-12) */}
      <section className="cc-card">
        <button onClick={() => setShowChannels((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showChannels ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
          <span className="title">YouTube channels in the brief</span>
          <span className="tail">{settings ? `${channels.filter((id) => channelList.some((c) => c.id === id)).length} of ${channelList.length} on` : "…"} {showChannels ? "▴" : "▾"}</span>
        </button>
        {showChannels && (
          <div style={{ padding: "4px 14px 10px" }}>
            {/* Search · add a channel to a topic */}
            <div style={{ display: "grid", gap: 8, padding: "10px 0 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  type="search" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!online || !settings}
                  placeholder={online ? "Search YouTube channels or paste a link" : "Search needs a connection"}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search"
                  style={{ minHeight: 44, fontSize: 16, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "var(--ink)", font: "inherit", minWidth: 0, width: "100%", opacity: online ? 1 : 0.6 }}
                />
                <select value={topic} onChange={(e) => setTopic(e.target.value as VideoCategory)} aria-label="Topic for added channels" disabled={!online || !settings}
                  style={{ minHeight: 44, fontSize: 16, padding: "0 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "var(--ink)", font: "inherit", maxWidth: 150 }}>
                  {VIDEO_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {!online && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Offline. Your channels below still work; search comes back with the connection.</div>}
              {searchActive && searchError && <div style={{ fontSize: 14, color: "var(--warn)" }}>{searchError}</div>}
              {searchActive && searching && !hits && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Searching…</div>}
              {searchActive && hits && hits.length === 0 && !searching && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>No channels found.</div>}
              {searchActive && hits && hits.length > 0 && (
                <div style={{ display: "grid", borderTop: "1px solid var(--line)" }}>
                  {hits.map((h) => {
                    const have = channelList.some((c) => c.id === h.id);
                    return (
                      <div key={h.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 10, alignItems: "center", minHeight: 52, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube avatar, plain <img> keeps the bundle small */}
                        {h.thumb ? <img src={h.thumb} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: 99, background: "var(--fill-2)" }} /> : <span style={{ width: 36, height: 36, borderRadius: 99, background: "var(--fill-2)" }} />}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                          <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[h.handle, h.subs].filter(Boolean).join(" · ") || h.about || "YouTube channel"}</span>
                        </span>
                        {have
                          ? <span style={{ fontSize: 14, color: "var(--ink-4)", padding: "0 6px" }}>Added</span>
                          : <button onClick={() => addChannel(h, topic)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: "var(--accent-soft)", color: "var(--violet)", font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Add</button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current selection, per topic */}
            {VIDEO_CATEGORIES.map((g) => {
              const rows = channelList.filter((c) => c.category === g.key);
              const onCount = rows.filter((c) => channels.includes(c.id)).length;
              return (
                <div key={g.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-3)", padding: "12px 2px 4px" }}>
                    <span>{g.label}</span><span>{onCount} of {rows.length} on</span>
                  </div>
                  {rows.map((c) => {
                    const on = channels.includes(c.id);
                    return (
                      <React.Fragment key={c.id}>
                      <div style={{ display: "flex", alignItems: "stretch", borderBottom: editing?.id === c.id ? "none" : "1px solid var(--line)" }}>
                        <button onClick={() => toggleChannel(c.id)} disabled={!settings} role="switch" aria-checked={on}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flex: 1, minWidth: 0, minHeight: 52, padding: "6px 2px", background: "transparent", border: "none", color: "var(--ink)", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 16 }}>{c.name}</span>
                            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 1 }}>{c.why}</span>
                          </span>
                          <span aria-hidden style={{ width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0, background: on ? "var(--violet)" : "var(--fill-3)", transition: "background 0.15s" }}>
                            <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                          </span>
                        </button>
                        <button onClick={() => setEditing(editing?.id === c.id ? null : { id: c.id, name: c.name, category: c.category })} disabled={!settings} aria-label={`Edit ${c.name}`} aria-expanded={editing?.id === c.id}
                          style={{ minWidth: 44, padding: "0 4px 0 12px", background: "transparent", border: "none", color: editing?.id === c.id ? "var(--violet)" : "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer" }}>{editing?.id === c.id ? "Close" : "Edit"}</button>
                      </div>
                      {editing?.id === c.id && (
                        <div style={{ display: "grid", gap: 8, padding: "10px 0 12px", borderBottom: "1px solid var(--line)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                            <input className="cc-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Channel name" style={{ fontSize: 16, minHeight: 44, minWidth: 0 }} />
                            <select className="cc-input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as VideoCategory })} aria-label="Topic"
                              style={{ minHeight: 44, fontSize: 16, padding: "0 10px", maxWidth: 150, WebkitAppearance: "menulist", appearance: "auto" }}>
                              {VIDEO_CATEGORIES.map((g2) => <option key={g2.key} value={g2.key}>{g2.label}</option>)}
                            </select>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="cc-btn cc-btn-primary" onClick={() => editChannel(c.id, editing.name, editing.category)} disabled={!editing.name.trim()} style={{ minHeight: 44, padding: "0 16px", fontSize: 15 }}>Save</button>
                            {c.edited && <button className="cc-btn cc-btn-ghost" onClick={() => restoreChannel(c.id)} style={{ minHeight: 44, padding: "0 12px", fontSize: 14 }}>Restore default</button>}
                            <span style={{ flex: 1 }} />
                            <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Remove ${c.name} from the brief?`)) removeChannel(c.id); }} style={{ minHeight: 44, padding: "0 12px", fontSize: 14, color: "var(--neg)" }}>Remove</button>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--ink-4)" }}>{c.custom ? "Added by you." : c.edited ? "A built-in channel, edited by you." : "A built-in channel. Edit, move it to another topic or remove it · all reversible."}</div>
                        </div>
                      )}
                    </React.Fragment>
                    );
                  })}
                  {rows.length === 0 && <div style={{ fontSize: 14, color: "var(--ink-4)", padding: "6px 2px" }}>No channels yet. Search above and add one.</div>}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 2px 0" }}>
              <span style={{ flex: 1, fontSize: 14, color: "var(--ink-4)", lineHeight: 1.5, minWidth: 200 }}>Every channel here is yours: switch off, edit, move to another topic or remove · the built-ins too. Videos update on the next News refresh.</span>
              {builtInOverrides.length > 0 && <button className="cc-btn cc-btn-ghost" onClick={restoreAll} style={{ minHeight: 40, padding: "0 12px", fontSize: 14 }}>Restore built-ins ({builtInOverrides.length})</button>}
            </div>
          </div>
        )}
      </section>

      {/* Mobility player (route /stretch) · a second door, so it is reachable even when the Today row is ticked */}
      <Link href="/stretch" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>Mobility</span>
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{STRETCH_MOVES.length} moves · 10 s rests · {Math.floor(STRETCH_TOTAL_SECONDS / 60)}:{String(STRETCH_TOTAL_SECONDS % 60).padStart(2, "0")}</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </div>
      </Link>

      {/* Home-screen widget · the Scriptable script with this app's key already filled in */}
      <a href="/api/widget/script" target="_blank" rel="noopener noreferrer" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>Home-screen widget</span>
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>Open the script, select all, copy, paste over &ldquo;ALI&rdquo; in Scriptable</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </div>
      </a>

      {/* Books */}
      <Link href="/books" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>Books</span>
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>The waiting list of physical books</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </div>
      </Link>

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

      {/* Morning routine · Ali-approved sequence, every number editable */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Morning routine</span><span className="tail">before calls at {plan.callsAt}</span></div>
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
                <input className="cc-input" type="number" inputMode="numeric" min={0} max={180} value={s.minutes}
                  onChange={(e) => setStepMinutes(s.id, Number(e.target.value))}
                  style={{ fontSize: 16, minHeight: 40, width: 64, boxSizing: "border-box", textAlign: "right" }} />
                <span style={{ fontSize: 13, color: "var(--ink-4)" }}>min</span>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: trainDay.bufferMin < 0 || restDay.bufferMin < 0 ? "var(--warn)" : "var(--ink-4)" }}>
            Training day ends {trainDay.rows.at(-1)?.end ?? "—"} · {trainDay.bufferMin} min spare. Rest day ends {restDay.rows.at(-1)?.end ?? "—"} · {restDay.bufferMin} min spare.
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-4)" }}>Which days are training days comes from the Training days card above · the wake time and sequence follow automatically.</p>
        </div>
      </section>

      {/* Calendars · feeds are set once, so the fields stay folded away */}
      <section className="cc-card">
        <button onClick={() => setShowCal((v) => !v)} aria-expanded={showCal}
          style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 16px" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Calendars</span>
          <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{[calWork && "work", calPersonal && "personal"].filter(Boolean).join(" + ") || "off"} {showCal ? "▴" : "▾"}</span>
        </button>
        {showCal && (
          <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
            <p style={{ margin: 0 }}>Paste each calendar&rsquo;s <b>secret iCal address</b> (Google Calendar &rarr; gear &rarr; the calendar &rarr; &ldquo;Secret address in iCal format&rdquo;). Meetings become tickable blocks on Today · back-to-back work meetings merge into one block. Read-only, nothing is written to Google.</p>
            <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Work (ali@easypeasyfluent.com)
              <input className="cc-input" type="url" inputMode="url" autoComplete="off" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                value={calWork} onChange={(e) => setCalWork(e.target.value)} onBlur={() => saveCalendars(calWork, calPersonal)}
                style={{ fontSize: 16, minHeight: 44, width: "100%", boxSizing: "border-box" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Personal (al.elaraki@elaraki.ac.ma)
              <input className="cc-input" type="url" inputMode="url" autoComplete="off" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                value={calPersonal} onChange={(e) => setCalPersonal(e.target.value)} onBlur={() => saveCalendars(calWork, calPersonal)}
                style={{ fontSize: 16, minHeight: 44, width: "100%", boxSizing: "border-box" }} />
            </label>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-4)" }}>Work meetings merge (gaps up to 30 min) · personal events show one by one. Saved when you leave the field.</p>
            <button className="cc-btn" onClick={checkCalendars} style={{ minHeight: 44 }}>Check connection</button>
            {calCheck && <p style={{ margin: 0, fontSize: 13, color: calCheck.includes("⚠") ? "var(--warn)" : "var(--ink-3)" }}>{calCheck}</p>}
          </div>
        )}
      </section>

      {/* Apple Watch · Health Auto Export (spec §7c item 5) */}
      <AppleWatchCard />

      {/* Reminders */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Reminders</span><span className="tail">{push === "on" ? "on for this device" : push === "loading" ? "…" : "off"}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>A to-do that’s due and not ticked gets a notification every 30 minutes until you tick it. Quiet from 23:00 to 08:00. Personal and Work nag separately.</p>
          {push === "needs-install" && <p style={{ margin: 0, color: "var(--warn)" }}>On iPhone this only works from the installed app · add A L I to the home screen first, then come back here.</p>}
          {push === "blocked" && <p style={{ margin: 0, color: "var(--warn)" }}>Notifications are blocked for this app in iOS Settings → Notifications → A L I.</p>}
          {push === "unsupported" && <p style={{ margin: 0, color: "var(--ink-3)" }}>This browser can’t receive notifications.</p>}
          {pushInfo && (() => {
            const mins = pushInfo.lastTickAt ? Math.round((Date.now() - pushInfo.lastTickAt) / 60000) : null;
            const stale = mins === null || mins > 30;
            return (
              <p style={{ margin: 0, fontSize: 14, color: stale ? "var(--warn)" : "var(--ink-3)" }}>
                Nag service {mins === null ? "has not run yet" : `last ran ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago`}
                {stale && " · the every-5-min pinger (cron-job.org) looks down"}
              </p>
            );
          })()}
          {pushInfo && pushInfo.devices.length > 0 && (
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Registered devices · a stale one is removed automatically the first time a send to it fails</div>
              {pushInfo.devices.map((d) => (
                <div key={d.endpoint} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <span style={{ fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {deviceName(d.userAgent)}
                    {d.endpoint === myEndpoint && <span style={{ color: "var(--violet)" }}> · this device</span>}
                    {d.lastUsedAt && <span style={{ color: "var(--ink-4)" }}> · added {new Date(d.lastUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                  </span>
                  <button onClick={() => removeDevice(d.endpoint)} className="cc-btn cc-btn-ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13, color: "var(--neg)" }}>Remove</button>
                </div>
              ))}
            </div>
          )}
          {push === "on" && pushInfo?.count === 0 && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--warn)" }}>This phone thinks reminders are on but the server has no registered device · turn them off and on again below.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={push === "on" ? "cc-btn cc-btn-secondary" : "cc-btn cc-btn-primary"} disabled={push === "loading" || push === "unsupported" || push === "needs-install" || push === "blocked"} onClick={togglePush}>
              {push === "on" ? "Turn off on this device" : "Turn on reminders"}
            </button>
            {push === "on" && <button className="cc-btn cc-btn-ghost" onClick={testPush}>Send a test</button>}
          </div>
          {pushMsg && <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>{pushMsg}</p>}
        </div>
      </section>

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
        <div className="cc-card-head"><span className="title">App</span><span className="tail">2026-09-12</span></div>
        <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, color: "var(--ink-2)" }}>Not seeing the latest version?</span>
          <button className="cc-btn cc-btn-ghost" onClick={hardRefresh}>Update app</button>
        </div>
        <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 15, color: "var(--ink-2)" }}>{migrateMsg ?? "After an update that adds features:"}</span>
          <button className="cc-btn cc-btn-ghost" onClick={runMigrate}>Update database</button>
        </div>
      </section>
    </div>
  );
}
