"use client";

/**
 * /settings · the few things worth a setting. No explanations (Ali 2026-09-24: "remove every
 * filler sentence · Settings is the worst offender") · a card is its control and its state.
 *
 * Cleaned up 2026-10-03 (Ali): Appearance is Auto · Light · Dark · Night (Split gone) · the
 * training-day picker, News topics and the Morning routine card are gone (the routine and the
 * morning clock live on /checklist, "Routine") · Widgets is one compact card · Apple Watch is
 * condensed to its status with the setup folded · Reminders is two buttons · one Update button
 * runs the database update and reloads the app.
 * REDESIGN 2026-10-07 (the prototype's cut list): Books and Mobility rows are gone (Books from Today's
 * read row, Mobility from Today and the m key), Widgets is one line inside App · NEW: Sounds (the tick
 * chime, on by default, `cc-sounds`) and the keyboard shortcuts list (laptop only, `src/lib/shortcuts.ts`).
 */

import { useEffect, useState } from "react";
import { SHORTCUTS } from "@/lib/shortcuts";
import { ACTIONS, useBindings, setBinding, isDefault, takenBy, chordOf, showKeys } from "@/lib/keymap";
import Link from "next/link";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useClientValue, useNow } from "@/lib/useClientValue";
import { useCached, fetchJson } from "@/lib/local/store";
import { pushState, enablePush, disablePush, type PushState } from "@/lib/push/client";
import { metricWords, pipeNote, type PipeStatus } from "@/lib/health/client";
import { ChannelsCard } from "@/components/news/ChannelsCard";
import { GuestNewsCard } from "@/components/news/GuestNews";
import { useProfile, wipeSavedCopies } from "@/lib/profile/useProfile";
import { soundsOn, setSoundsOn } from "@/lib/sounds";

const THEMES: { key: ThemeChoice; label: string; hint: string }[] = [
  { key: "system", label: "Auto",  hint: "Phone by day · Night 20:00–07:00" },
  { key: "light",  label: "Light", hint: "" },
  { key: "dark",   label: "Dark",  hint: "" },
  { key: "night",  label: "Night", hint: "Warm · less blue light" },
];

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" style={{
      display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
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
              minHeight: 40, borderRadius: 10, border: "none", cursor: "pointer", padding: "0 4px",
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

/** A plain row that opens another screen. */
function DoorRow({ href, label, tail = "Open ›" }: { href: string; label: string; tail?: string }) {
  return (
    <Link href={href} className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{label}</span>
        <span style={{ color: "var(--ink-3)", fontSize: 15 }}>{tail}</span>
      </div>
    </Link>
  );
}

type HealthStatus = {
  pipe?: PipeStatus;
  lastSleep: { date: string; totalMin: number | null; score: number | null; receivedAt: number } | null;
  lastWorkout: { date: string; type: string; receivedAt: number } | null;
  lastPost: { receivedAt: number; automation: string | null; summary: string } | null;
  nights: number;
  workouts: number;
  setup: { url: string; header: string; key: string };
};

const HAE_STEPS = [
  "Health Auto Export (JSON+CSV) · Premium · allow Health access.",
  "Automations → REST API “ALI sleep” · URL and header below · Data Type Health Metrics · Select all · JSON · Date Range Default · every hour.",
  "Automations → REST API “ALI workouts” · same URL and header · Data Type Workouts · Include Route Data · every hour.",
  "iPhone Settings → Health Auto Export → Background App Refresh on.",
];

/** Apple Watch · the pipe's status in three lines, the setup folded away (condensed 2026-10-03). */
function AppleWatchCard() {
  const { data } = useCached<HealthStatus>("health-status", () => fetchJson<HealthStatus>("/api/health/ingest"));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"url" | "key" | null>(null);
  const now = useNow();
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
  const staleH = data?.lastPost && now ? (now - data.lastPost.receivedAt) / 3600000 : null;
  const tail = !data ? "…" : !data.lastPost ? "not connected" : staleH !== null && staleH > 20 ? "quiet · tap the widget" : "connected";
  const note = data?.pipe && now > 0 ? (pipeNote(data.pipe, "sleep", now) ?? pipeNote(data.pipe, "workouts", now)) : null;
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Apple Watch</span><span className="tail" style={tail.startsWith("quiet") ? { color: "var(--warn)" } : tail === "connected" ? { color: "var(--pos)" } : undefined}>{tail}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 8, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span>Sleep · {data ? (data.lastSleep ? `night of ${data.lastSleep.date}${fmtMin(data.lastSleep.totalMin)}` : "nothing yet") : "—"}</span>
          <span>Workouts · {data ? (data.lastWorkout ? `${data.lastWorkout.type} on ${data.lastWorkout.date}` : "nothing yet") : "—"}</span>
          <span>Last post · {data ? (data.lastPost ? `${stamp(data.lastPost.receivedAt)}${data.lastPost.automation ? ` · ${data.lastPost.automation}` : ""}` : "nothing yet") : "—"}</span>
        </div>
        {note && <div style={{ color: "var(--warn)" }}>{note}</div>}
        <button className="cc-btn cc-btn-ghost" onClick={() => setOpen((v) => !v)} style={{ minHeight: 40, justifySelf: "start", fontSize: 14 }}>{open ? "Hide setup" : "Setup"}</button>
        {open && data?.setup && (
          <div style={{ display: "grid", gap: 6 }}>
            {data.pipe && data.pipe.posts > 0 && (
              <span>Carrying · {[...data.pipe.carried.map(metricWords), ...(data.pipe.workoutsSeen ? ["workouts"] : [])].join(", ") || "nothing"}{!data.pipe.sleepSeen ? " · no sleep" : ""}{!data.pipe.workoutsSeen ? " · no workouts" : ""}</span>
            )}
            {(["url", "key"] as const).map((what) => {
              const val = what === "url" ? data.setup.url : data.setup.key;
              return (
                <div key={what} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <span style={{ minWidth: 0, fontSize: 13, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--ink-4)" }}>{what === "url" ? "URL " : `${data.setup.header} `}</span>{what === "key" ? "••••••••" : val}
                  </span>
                  <button className="cc-btn cc-btn-ghost" onClick={() => copy(what, val)} disabled={!val} style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }}>{copied === what ? "Copied" : "Copy"}</button>
                </div>
              );
            })}
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              {HAE_STEPS.map((t) => <li key={t}>{t}</li>)}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

/** Reminders · on/off for this device and a test · the device list folded (compact 2026-10-03). */
function RemindersCard() {
  const [push, setPush] = useState<PushState | "loading">("loading");
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  type PushDevice = { endpoint: string; userAgent: string; lastUsedAt: number | null };
  const [pushInfo, setPushInfo] = useState<{ count: number; lastTickAt: number | null; devices: PushDevice[] } | null>(null);
  const [myEndpoint, setMyEndpoint] = useState<string | null>(null);
  const [showDevices, setShowDevices] = useState(false);
  const now = useNow();
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
  const deviceName = (ua: string) => {
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh|Mac OS/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : "Device";
    const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
    return br ? `${os} · ${br}` : os;
  };
  const togglePush = async () => {
    setPushMsg(null);
    try { setPush(push === "on" ? await disablePush() : await enablePush()); loadPushInfo(); }
    catch { setPushMsg("Could not turn reminders on · try again in a moment."); }
  };
  const testPush = async () => {
    setPushMsg("Sending…");
    const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => null) as { sent?: number } | null;
    setPushMsg(r?.sent ? "Sent · it should appear in a few seconds." : "Nothing sent · is this device subscribed?");
  };
  const mins = pushInfo?.lastTickAt && now ? Math.round((now - pushInfo.lastTickAt) / 60000) : null;
  const tickStale = pushInfo !== null && now > 0 && (mins === null || mins > 30);
  const tail = push === "on" ? "on" : push === "loading" ? "…" : "off";
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Reminders</span><span className="tail" style={push === "on" ? { color: "var(--pos)" } : undefined}>{tail}{pushInfo && pushInfo.devices.length > 0 ? ` · ${pushInfo.devices.length} device${pushInfo.devices.length === 1 ? "" : "s"}` : ""}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {push === "needs-install" && <p style={{ margin: 0, color: "var(--warn)" }}>Works from the installed app only.</p>}
        {push === "blocked" && <p style={{ margin: 0, color: "var(--warn)" }}>Blocked in iOS Settings → Notifications → A L I.</p>}
        {push === "unsupported" && <p style={{ margin: 0 }}>Not supported in this browser.</p>}
        {tickStale && <p style={{ margin: 0, color: "var(--warn)" }}>Nag service {mins === null ? "has not run yet" : `last ran ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago`} · the every-5-min pinger looks down</p>}
        {push === "on" && pushInfo?.count === 0 && <p style={{ margin: 0, color: "var(--warn)" }}>No device registered on the server · turn reminders off and on again.</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={push === "on" ? "cc-btn cc-btn-secondary" : "cc-btn cc-btn-primary"} disabled={push === "loading" || push === "unsupported" || push === "needs-install" || push === "blocked"} onClick={togglePush}>
            {push === "on" ? "Turn off here" : "Turn on"}
          </button>
          {push === "on" && <button className="cc-btn cc-btn-ghost" onClick={testPush}>Send a test</button>}
          {pushInfo && pushInfo.devices.length > 0 && <button className="cc-btn cc-btn-ghost" onClick={() => setShowDevices((v) => !v)} style={{ fontSize: 14 }}>{showDevices ? "Hide devices" : "Devices"}</button>}
        </div>
        {showDevices && pushInfo && (
          <div style={{ display: "grid", gap: 2 }}>
            {pushInfo.devices.map((d) => (
              <div key={d.endpoint} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, minHeight: 44 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deviceName(d.userAgent)}
                  {d.endpoint === myEndpoint && <span style={{ color: "var(--violet)" }}> · this device</span>}
                  {d.lastUsedAt && <span style={{ color: "var(--ink-4)" }}> · added {new Date(d.lastUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                </span>
                <button onClick={() => removeDevice(d.endpoint)} className="cc-btn cc-btn-ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13, color: "var(--neg)" }}>Remove</button>
              </div>
            ))}
          </div>
        )}
        {pushMsg && <p style={{ margin: 0 }}>{pushMsg}</p>}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useTheme();
  const [sounds, setSoundsState] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    setSoundsState(soundsOn());
  }, []);
  const setSounds = (v: "on" | "off") => { setSoundsOn(v === "on"); setSoundsState(v === "on"); };
  // The shortcuts list folds (2026-10-08: it was 60 % of the page) · the ? key arrives with #shortcuts and opens it.
  const [keysOpen, setKeysOpen] = useState(false);
  useEffect(() => {
    const check = () => { if (window.location.hash === "#shortcuts") { setKeysOpen(true); setTimeout(() => document.getElementById("shortcuts")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); } };
    check(); window.addEventListener("hashchange", check); return () => window.removeEventListener("hashchange", check);
  }, []);
  const standalone = useClientValue(
    () => window.matchMedia("(display-mode: standalone)").matches
       || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true),
    true
  );
  const isIOS = useClientValue(() => /iPhone|iPad|iPod/.test(navigator.userAgent), false);
  const { data: me } = useCached<{ required: boolean; email: string | null }>("auth-me", () => fetchJson("/api/auth/me"));
  // A guest (2026-10-09): their own News card, no Apple Watch, no widgets, a door back to the welcome tour.
  const { primary } = useProfile();

  // One Update: the database first (idempotent, a second), then the app's caches, then a reload.
  // "Update app" and "Update database" were two buttons until 2026-10-03; the database step is
  // cheap and only ever adds, so there was no reason to keep them apart.
  const [updating, setUpdating] = useState<string | null>(null);
  const update = async () => {
    setUpdating("Database…");
    await fetch("/api/admin/migrate", { method: "POST" }).catch(() => null);
    setUpdating("App…");
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
        </div>
      </div>

      {/* Appearance · Auto turns to Night 20:00–07:00 (refreshThemeAttr, checked every minute) */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Appearance</span><span className="tail">{THEMES.find((t) => t.key === theme)?.hint}</span></div>
        <div className="cc-card-body">
          <Segmented value={theme} options={THEMES} onChange={setTheme} />
        </div>
      </section>

      {/* Sounds · the chime on a ticked to-do or routine step (Ali 2026-10-07: "sounds as a setting") */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Sounds</span><span className="tail">the tick chime</span></div>
        <div className="cc-card-body">
          <Segmented value={sounds ? "on" : "off"} options={[{ key: "on", label: "On" }, { key: "off", label: "Off" }]} onChange={setSounds} />
        </div>
      </section>

      {/* Routine · the weekly planner, the item details and the morning clock (was "Edit list" + "Morning routine") */}
      <DoorRow href="/checklist" label="Routine" />

      {/* YouTube channels · Ali's fixed list behind News (daily picks + watch later) · a guest's own choices */}
      {primary ? <ChannelsCard /> : <GuestNewsCard />}
      {!primary && <DoorRow href="/welcome?again=1" label="Welcome tour" />}


      {!standalone && (
        <section className="cc-card cc-phone-only">
          <div className="cc-card-head"><span className="title">Install on your phone</span></div>
          <div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {isIOS
              ? <>Safari · <strong>Share</strong> → <strong>Add to Home Screen</strong></>
              : <>Browser menu · <strong>Install app</strong></>}
          </div>
        </section>
      )}

      {/* Keyboard shortcuts · the one list (src/lib/shortcuts.ts), laptop only (Ali 2026-10-07: nothing on the pages themselves) */}
      <section className="cc-card cc-laptop-only" id="shortcuts">
        <button type="button" onClick={() => setKeysOpen((v) => !v)} aria-expanded={keysOpen} className="cc-card-head" style={{ width: "100%", background: "none", color: "inherit", cursor: "pointer", font: "inherit", borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: keysOpen ? undefined : "none", borderRadius: keysOpen ? undefined : "inherit" }}>
          <span className="title">Keyboard shortcuts</span>
          <span className="tail">{ACTIONS.length + SHORTCUTS.reduce((n, g) => n + g.items.length, 0)} keys <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: keysOpen ? "rotate(90deg)" : "none", marginLeft: 6 }}>›</span></span>
        </button>
        {keysOpen && <div className="cc-card-body" style={{ display: "grid", gap: 16 }}>
          <KeysEditor />
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>{g.title} · <span style={{ fontWeight: 500 }}>{g.where}</span></div>
              <div className="cc-keys">
                {g.items.map((it) => (
                  <div key={it.label} className="cc-keys-row">
                    <span>{it.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
                    <span><span className="l">{it.label}</span>{it.goal && <span className="g" style={{ display: "block" }}>{it.goal}</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>}
      </section>

      {primary && <AppleWatchCard />}

      <RemindersCard />

      {me?.required && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Account</span><span className="tail">{me.email ?? ""}</span></div>
          <div className="cc-card-body">
            <form method="post" action="/api/auth/logout" onSubmit={() => wipeSavedCopies()}><button type="submit" className="cc-btn cc-btn-ghost">Sign out</button></form>
          </div>
        </section>
      )}

      <section className="cc-card">
        <div className="cc-card-head"><span className="title">App</span><span className="tail">{process.env.NEXT_PUBLIC_BUILD_DATE ?? ""}</span></div>
        <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>{updating ?? "database, then the app"}</span>
          <button className="cc-btn cc-btn-secondary" onClick={update} disabled={!!updating}>Update</button>
        </div>
        {primary && <div className="cc-card-body" style={{ paddingTop: 0, display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "var(--ink-3)" }}>
          <span>Widgets · home screen · lock screen · Scriptable</span><span style={{ color: "var(--pos)" }}>set up</span>
        </div>}
      </section>
    </div>
  );
}


/**
 * The keys Ali can change (2026-10-08 · `src/lib/keymap.ts`): one row per action, Change records the
 * next key or combo pressed (Esc cancels), Reset returns the default, a key another action holds is refused.
 */
function KeysEditor() {
  const b = useBindings();
  const [rec, setRec] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) { delete document.body.dataset.recordingKeys; return; }
    document.body.dataset.recordingKeys = "1";
    let first: string | null = null; let timer = 0;
    const commit = (keys: string) => {
      const other = takenBy(keys, rec);
      if (other) { setNote(`${showKeys(keys).join(" ")} is ${other.label}'s · pick another`); }
      else { setBinding(rec, keys); setNote(null); }
      setRec(null);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { window.clearTimeout(timer); setRec(null); return; }
      const chord = chordOf(e); if (!chord) return;
      if (first) { window.clearTimeout(timer); commit(`${first} ${chord}`); return; }
      first = chord;
      // A plain letter may be the start of a sequence ("g" then "t") · wait a moment for the second key.
      if (chord.length === 1) timer = window.setTimeout(() => commit(chord), 700); else commit(chord);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.clearTimeout(timer); delete document.body.dataset.recordingKeys; };
  }, [rec]);
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>Anywhere · <span style={{ fontWeight: 500 }}>every screen · yours to change</span></div>
      {note && <div style={{ fontSize: 13.5, color: "var(--warn)", padding: "4px 0" }}>{note}</div>}
      <div className="cc-keys">
        {ACTIONS.map((a) => {
          const keys = b[a.id], on = rec === a.id;
          return (
            <div key={a.id} className="cc-keys-row cc-keys-edit">
              <span>{on ? <span className="cc-keys-rec">press keys…</span> : showKeys(keys).map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
              <span><span className="l">{a.label}</span>{a.goal && <span className="g" style={{ display: "block" }}>{a.goal}</span>}</span>
              <span className="cc-keys-act">
                <button type="button" className="cc-btn cc-btn-ghost" onClick={() => { setNote(null); setRec(on ? null : a.id); }} style={{ minHeight: 32, fontSize: 13, padding: "0 10px" }}>{on ? "Cancel" : "Change"}</button>
                {!isDefault(a.id, b) && !on && <button type="button" className="cc-btn cc-btn-ghost" onClick={() => setBinding(a.id, null)} style={{ minHeight: 32, fontSize: 13, padding: "0 10px", color: "var(--ink-3)" }}>Reset</button>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
