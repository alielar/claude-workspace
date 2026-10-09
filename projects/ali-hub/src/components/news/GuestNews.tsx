"use client";

/**
 * A GUEST's news choices (2026-10-09 · the people Ali invited): the topics of the weekly brief, football
 * on or off, and their own YouTube channels found by live search. The three pickers are plain
 * controlled pieces, used by /welcome (local state, saved at the end of the step) and by Settings
 * (`GuestNewsCard`, saved on every change). Ali keeps his fixed list (`ChannelsCard`).
 */

import { useEffect, useRef, useState } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { useProfile } from "@/lib/profile/useProfile";
import type { GuestChannel } from "@/lib/news/videos";
import type { ChannelHit } from "@/lib/news/youtubeSearch";

export const TOPIC_CHOICES: { key: string; label: string; categories: string[]; hint: string }[] = [
  { key: "tech", label: "Tech & AI", categories: ["tech", "ai"], hint: "what is being built" },
  { key: "business", label: "Business", categories: ["business"], hint: "companies, money, markets" },
  { key: "geopolitics", label: "Geopolitics", categories: ["geopolitics"], hint: "the world, Morocco, Africa" },
];
export const ALL_TOPIC_CATEGORIES = TOPIC_CHOICES.flatMap((t) => t.categories);

export function parseTopics(json: string | null | undefined): string[] {
  try { const v = JSON.parse(json ?? "null"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : ALL_TOPIC_CATEGORIES; } catch { return ALL_TOPIC_CATEGORIES; }
}

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 44, padding: "0 14px", borderRadius: 12, border: `1px solid ${on ? "var(--violet)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "transparent",
  color: "var(--ink)", font: "inherit", fontSize: 15, cursor: "pointer", textAlign: "left", display: "grid", gap: 1,
});

/** The weekly brief's topics · `topics` holds categories ("tech","ai","business","geopolitics"). */
export function TopicsPicker({ topics, onChange }: { topics: string[]; onChange: (next: string[]) => void }) {
  const on = (t: typeof TOPIC_CHOICES[number]) => t.categories.every((c) => topics.includes(c));
  const toggle = (t: typeof TOPIC_CHOICES[number]) => onChange(on(t) ? topics.filter((c) => !t.categories.includes(c)) : [...topics, ...t.categories.filter((c) => !topics.includes(c))]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {TOPIC_CHOICES.map((t) => (
        <button key={t.key} type="button" onClick={() => toggle(t)} aria-pressed={on(t)} style={chip(on(t))}>
          <span style={{ fontWeight: 600 }}>{t.label}</span>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={label}
      style={{ width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0, border: "none", padding: 0, cursor: "pointer", background: on ? "var(--violet)" : "var(--fill-3)", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
    </button>
  );
}

/** Live YouTube channel search + the chosen list, in order (first = most important). */
export function ChannelPicker({ channels, onChange }: { channels: GuestChannel[]; onChange: (next: GuestChannel[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ChannelHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The search runs from the keystroke, not from an effect: a short query clears the list, a longer one asks after a pause.
  const onQ = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    const query = value.trim();
    if (query.length < 2) { setHits(null); setErr(null); return; }
    timer.current = window.setTimeout(async () => {
      setBusy(true); setErr(null);
      try {
        const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
        const j = (await r.json()) as { hits?: ChannelHit[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "search failed");
        setHits(j.hits ?? []);
      } catch { setErr("YouTube did not answer · try again"); setHits([]); }
      finally { setBusy(false); }
    }, 350);
  };
  const add = (h: ChannelHit) => { if (!channels.some((c) => c.id === h.id)) onChange([...channels, { id: h.id, name: h.name, handle: h.handle, subs: h.subs }]); onQ(""); };
  const remove = (id: string) => onChange(channels.filter((c) => c.id !== id));
  const up = (i: number) => { if (i === 0) return; const n = [...channels]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); };
  const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", minHeight: 52, padding: "6px 2px", borderBottom: "1px solid var(--line)" };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input className="cc-input" value={q} onChange={(e) => onQ(e.target.value)} placeholder="Channel name, @handle or address" inputMode="search" autoCapitalize="none" autoCorrect="off"
        style={{ fontSize: 16, minHeight: 46, width: "100%", boxSizing: "border-box" }} aria-label="Search YouTube channels" />
      {(busy || err || (hits && q.trim().length >= 2)) && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "0 10px", background: "var(--bg-chrome)" }}>
          {busy && !hits?.length && <div style={{ padding: "12px 2px", fontSize: 14, color: "var(--ink-3)" }}>Searching…</div>}
          {err && <div style={{ padding: "12px 2px", fontSize: 14, color: "var(--warn)" }}>{err}</div>}
          {!busy && hits && hits.length === 0 && !err && <div style={{ padding: "12px 2px", fontSize: 14, color: "var(--ink-3)" }}>Nothing found.</div>}
          {(hits ?? []).slice(0, 8).map((h, i) => {
            const have = channels.some((c) => c.id === h.id);
            return (
              <div key={h.id} style={{ ...row, borderBottom: i === Math.min(8, hits!.length) - 1 ? "none" : row.borderBottom }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)" }}>{[h.handle, h.subs].filter(Boolean).join(" · ")}</span>
                </span>
                <button type="button" className="cc-btn cc-btn-secondary" disabled={have} onClick={() => add(h)} style={{ minHeight: 36, fontSize: 14, padding: "0 12px" }}>{have ? "Added" : "Add"}</button>
              </div>
            );
          })}
        </div>
      )}
      <div>
        {channels.length === 0 && <div style={{ fontSize: 14, color: "var(--ink-4)", padding: "6px 2px" }}>No channels yet.</div>}
        {channels.map((c, i) => (
          <div key={c.id} style={{ ...row, borderBottom: i === channels.length - 1 ? "none" : row.borderBottom }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {c.name}</span>
              <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)" }}>{[c.handle, c.subs].filter(Boolean).join(" · ")}</span>
            </span>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {i > 0 && <button type="button" className="cc-btn cc-btn-ghost" onClick={() => up(i)} aria-label={`Move ${c.name} up`} style={{ minHeight: 36, minWidth: 36, padding: 0 }}>↑</button>}
              <button type="button" className="cc-btn cc-btn-ghost" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`} style={{ minHeight: 36, minWidth: 36, padding: 0, color: "var(--ink-3)" }}>✕</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type UserSettings = { newsTopics?: string | null; newsCustomChannels?: string | null };

/** Settings → News, for a guest: topics, football, channels · saved as they change. */
export function GuestNewsCard() {
  const { data: settings, setData } = useCached<UserSettings>("settings", () => fetchJson<UserSettings>("/api/settings"));
  const { me, setMe } = useProfile();
  const [open, setOpen] = useState(false);
  const topics = parseTopics(settings?.newsTopics);
  const channels: GuestChannel[] = (() => { try { const v = JSON.parse(settings?.newsCustomChannels ?? "null"); return Array.isArray(v) ? v : []; } catch { return []; } })();
  const patch = async (p: UserSettings, key: string) => {
    if (settings) setData({ ...settings, ...p });
    try { await sendOrQueue({ url: "/api/settings", method: "PATCH", body: p, dedupeKey: `settings:${key}` }); } catch { /* replayed later */ }
    try { localStorage.removeItem("cc:v1:news-videos-v2"); localStorage.removeItem("cc:v1:news-weekly"); } catch { /* the next open refetches */ }
  };
  const setFootball = async (on: boolean) => {
    if (me) setMe({ ...me, profile: { ...me.profile, football: on } });
    try { await sendOrQueue({ url: "/api/profile", method: "PATCH", body: { football: on }, dedupeKey: "profile:football" }); } catch { /* replayed later */ }
    try { localStorage.removeItem("cc:v1:highlights"); } catch { /* ignore */ }
  };
  const tail = `${TOPIC_CHOICES.filter((t) => t.categories.every((c) => topics.includes(c))).length} topics · ${channels.length} channel${channels.length === 1 ? "" : "s"}`;
  return (
    <section className="cc-card">
      <button onClick={() => setOpen((v) => !v)} className="cc-card-head" aria-expanded={open} style={{ width: "100%", background: "transparent", border: "none", borderBottom: open ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
        <span className="title">News</span>
        <span className="tail">{tail} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="cc-card-body" style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)" }}>Weekly brief</div>
            <TopicsPicker topics={topics} onChange={(next) => patch({ newsTopics: JSON.stringify(next) }, "topics")} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
            <span style={{ fontSize: 16 }}>Football highlights</span>
            <Switch on={me?.profile.football ?? true} onChange={setFootball} label="Football on or off" />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)" }}>YouTube channels · in your order</div>
            <ChannelPicker channels={channels} onChange={(next) => patch({ newsCustomChannels: JSON.stringify(next) }, "channels")} />
          </div>
        </div>
      )}
    </section>
  );
}
