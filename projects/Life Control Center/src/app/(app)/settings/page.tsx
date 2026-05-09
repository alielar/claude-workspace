"use client";

/**
 * /settings — App-wide configuration.
 *
 * Sections:
 * 1. Timezone (selector, defaults to Africa/Casablanca)
 * 2. News Brief settings (email enabled toggle, delivery time)
 * 3. News topic preferences (checkboxes)
 * 4. Account info (signed-in user)
 */

import { useEffect, useState } from "react";
import { Settings, Clock, Mail, Globe, RefreshCw } from "lucide-react";
import { signOut } from "next-auth/react";

type UserSettings = {
  timezone: string;
  newsTopics: string;
  newsEmailEnabled: boolean;
  newsEmailTime: string;
};

const TIMEZONES = [
  "Africa/Casablanca",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Riyadh",
];

const NEWS_TOPICS = [
  { key: "football", label: "Football (KACM + Morocco)" },
  { key: "geopolitics", label: "Geopolitics" },
  { key: "tech", label: "Technology" },
  { key: "ai", label: "Artificial Intelligence" },
  { key: "business", label: "Business & Markets" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserSettings) => {
        setSettings(data);
        try {
          setTopics(JSON.parse(data.newsTopics));
        } catch {
          setTopics(["football", "geopolitics", "tech", "ai", "business"]);
        }
      });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        newsTopics: JSON.stringify(topics),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleTopic = (key: string) => {
    setTopics((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  };

  if (!settings) {
    return (
      <div className="page-enter p-5 md:p-10 max-w-xl mx-auto">
        <div className="glass rounded-2xl h-60 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="page-enter p-5 md:p-10 max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>App preferences</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: saved ? "rgba(74,222,128,0.2)" : "var(--accent-dim)",
            color: saved ? "var(--green)" : "var(--accent-bright)",
          }}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Settings size={14} />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>

      {/* ── Timezone ── */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe size={15} style={{ color: "var(--accent-bright)" }} />
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Timezone</p>
        </div>
        <select
          value={settings.timezone}
          onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--glass-border)",
          }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Used for news brief delivery time and date calculations.
        </p>
      </div>

      {/* ── News email settings ── */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={15} style={{ color: "var(--news-color)" }} />
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>News Brief Email</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Send daily email</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Delivered to al.elaraki@elaraki.ac.ma
            </p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, newsEmailEnabled: !settings.newsEmailEnabled })}
            className="w-12 h-6 rounded-full transition-all relative"
            style={{
              background: settings.newsEmailEnabled ? "var(--news-color)" : "var(--bg-elevated)",
            }}
          >
            <div
              className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
              style={{
                background: "#fff",
                left: settings.newsEmailEnabled ? "26px" : "2px",
              }}
            />
          </button>
        </div>

        {/* Delivery time */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Delivery time</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Local time (based on timezone above)</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={13} style={{ color: "var(--text-muted)" }} />
            <input
              type="time"
              value={settings.newsEmailTime}
              onChange={(e) => setSettings({ ...settings, newsEmailTime: e.target.value })}
              className="rounded-xl px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                border: "1px solid var(--glass-border)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── News topics ── */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>News Topics</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Choose which topics to include in your daily brief.
        </p>
        <div className="space-y-2">
          {NEWS_TOPICS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleTopic(key)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: topics.includes(key) ? "rgba(34,211,238,0.1)" : "var(--bg-elevated)",
                color: topics.includes(key) ? "var(--news-color)" : "var(--text-secondary)",
                border: `1px solid ${topics.includes(key) ? "rgba(34,211,238,0.3)" : "var(--glass-border)"}`,
              }}
            >
              <span>{label}</span>
              <div
                className="w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: topics.includes(key) ? "var(--news-color)" : "transparent",
                  border: `1.5px solid ${topics.includes(key) ? "var(--news-color)" : "var(--glass-border)"}`,
                }}
              >
                {topics.includes(key) && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Account ── */}
      <div className="glass rounded-2xl p-5">
        <p className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>Account</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
