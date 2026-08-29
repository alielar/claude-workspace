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

import Link from "next/link";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useClientValue } from "@/lib/useClientValue";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ARCHIVE } from "@/lib/archive";

type UserSettings = {
  timezone: string;
  newsTopics: string;
  newsEmailEnabled: boolean;
  newsEmailTime: string;
};

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
              fontSize: 14, fontWeight: on ? 600 : 500, font: "inherit",
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
          <div className="sub">Appearance, news, archive</div>
        </div>
      </div>

      {/* Appearance */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Appearance</span><span className="tail">{THEMES.find((t) => t.key === theme)?.hint}</span></div>
        <div className="cc-card-body">
          <Segmented value={theme} options={THEMES} onChange={setTheme} />
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
                  color: "var(--ink)", font: "inherit", fontSize: 15, cursor: "pointer", textAlign: "left",
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

      {/* Install hint */}
      {!standalone && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Install on your phone</span></div>
          <div className="cc-card-body" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {isIOS
              ? <>In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. The app then opens full-screen and works offline.</>
              : <>Use your browser&rsquo;s <strong>Install app</strong> / <strong>Add to Home Screen</strong> option. The app then opens full-screen and works offline.</>}
          </div>
        </section>
      )}

      {/* Archive */}
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">Archive</span>
          <Link href="/archive" className="tail" style={{ textDecoration: "none", color: "var(--ink-3)" }}>Open</Link>
        </div>
        <div className="cc-card-body" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {ARCHIVE.length} old modules are kept out of the way but still work: {ARCHIVE.map((a) => a.label).join(", ")}.
        </div>
      </section>

      {/* App */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">App</span><span className="tail">Phase 1</span></div>
        <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>Not seeing the latest version?</span>
          <button className="cc-btn cc-btn-ghost" onClick={hardRefresh}>Update app</button>
        </div>
      </section>
    </div>
  );
}
