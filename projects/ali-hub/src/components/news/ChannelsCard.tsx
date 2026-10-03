"use client";

/**
 * Settings → YouTube channels (2026-10-03) · the FIXED list behind News: the two daily picks
 * (always on) and the ten watch-later channels in Ali's priority order, each with an on/off
 * switch (`user_settings.news_channels` = enabled ids, null = all on). No topics, no search:
 * the list is Ali's and changes by asking.
 */

import { useState } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { DAILY_PICKS, WATCH_LATER } from "@/lib/news/channels";

type UserSettings = { newsChannels?: string | null };

export function ChannelsCard() {
  const { data: settings, setData } = useCached<UserSettings>("settings", () => fetchJson<UserSettings>("/api/settings"));
  const [open, setOpen] = useState(false);
  const enabled: string[] = (() => {
    try { const v = settings?.newsChannels ? JSON.parse(settings.newsChannels) : null; return Array.isArray(v) ? v : WATCH_LATER.map((c) => c.id); } catch { return WATCH_LATER.map((c) => c.id); }
  })();
  const toggle = async (id: string) => {
    if (!settings) return;
    const next = enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id];
    setData({ ...settings, newsChannels: JSON.stringify(next) });
    try { await sendOrQueue({ url: "/api/settings", method: "PATCH", body: { newsChannels: JSON.stringify(next) }, dedupeKey: "settings:channels" }); } catch { /* replayed later */ }
    try { localStorage.removeItem("cc:v1:news-videos-v2"); } catch { /* the next open refetches */ }
  };
  const onCount = WATCH_LATER.filter((c) => enabled.includes(c.id)).length;
  const row = (name: string, hint: string, right: React.ReactNode, last: boolean) => (
    <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 52, padding: "6px 2px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16 }}>{name}</span>
        <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)", marginTop: 1 }}>{hint}</span>
      </span>
      {right}
    </div>
  );
  return (
    <section className="cc-card">
      <button onClick={() => setOpen((v) => !v)} className="cc-card-head" aria-expanded={open} style={{ width: "100%", background: "transparent", border: "none", borderBottom: open ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
        <span className="title">YouTube channels</span>
        <span className="tail">2 daily · {onCount} of {WATCH_LATER.length} later {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 14px 10px" }}>
          <div style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", padding: "10px 2px 4px" }}>Daily picks</div>
          {DAILY_PICKS.map((c, i) => row(c.name, c.hint, <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>always</span>, i === DAILY_PICKS.length - 1))}
          <div style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", padding: "14px 2px 4px" }}>Watch later · in priority order</div>
          {WATCH_LATER.map((c, i) => {
            const on = enabled.includes(c.id);
            return row(`${c.priority}. ${c.name}`, c.hint, (
              <button onClick={() => toggle(c.id)} disabled={!settings} role="switch" aria-checked={on} aria-label={`${c.name} on or off`}
                style={{ width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0, border: "none", padding: 0, cursor: "pointer", background: on ? "var(--violet)" : "var(--fill-3)", transition: "background 0.15s" }}>
                <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </button>
            ), i === WATCH_LATER.length - 1);
          })}
        </div>
      )}
    </section>
  );
}
