"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChannelPicker, Switch, TopicsPicker, ALL_TOPIC_CATEGORIES, parseTopics } from "@/components/news/GuestNews";
import { enablePush, pushState, type PushState } from "@/lib/push/client";
import { writeCache } from "@/lib/local/store";
import { ME_KEY } from "@/lib/profile/useProfile";
import type { Me } from "@/lib/profile/types";
import type { GuestChannel } from "@/lib/news/videos";
import { parseQuickAdd, newTodoId } from "@/lib/todo/types";
import { checklistToday } from "@/lib/checklist/day";
import type { TimeOfDay } from "@/lib/checklist/types";
import { Mark } from "@/components/layout/Sidebar";

type Step = "hello" | "day" | "todo" | "knowledge" | "news" | "done";
const STEPS: Step[] = ["hello", "day", "todo", "knowledge", "news", "done"];
const TITLES: Record<Step, string> = { hello: "Welcome", day: "Your day", todo: "To-do", knowledge: "Knowledge", news: "News", done: "Ready" };

type Suggestion = { label: string; part: TimeOfDay };
const SUGGESTIONS: Suggestion[] = [
  { label: "Morning walk", part: "morning" },
  { label: "Medication · morning", part: "morning" },
  { label: "Stretch 10 minutes", part: "morning" },
  { label: "Blood pressure", part: "morning" },
  { label: "Call the family", part: "afternoon" },
  { label: "Drink water", part: "anytime" },
  { label: "Evening walk", part: "evening" },
  { label: "Medication · evening", part: "evening" },
  { label: "Read before sleep", part: "evening" },
];
const PART_LABEL: Record<TimeOfDay, string> = { morning: "morning", afternoon: "afternoon", evening: "evening", anytime: "any time" };

const card: React.CSSProperties = { display: "grid", gap: 14 };
const line: React.CSSProperties = { fontSize: 16, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 };
const label: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)" };
const input: React.CSSProperties = { fontSize: 16, minHeight: 46, width: "100%", boxSizing: "border-box" };
const chip = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: "0 14px", borderRadius: 12, border: `1px solid ${on ? "var(--violet)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "transparent", color: "var(--ink)", font: "inherit", fontSize: 15, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 });

async function j<T>(url: string, init?: RequestInit): Promise<T | null> {
  try { const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const again = params.get("again") === "1";
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [wake, setWake] = useState("07:00");
  const [steps, setSteps] = useState<Suggestion[]>([]);
  const [custom, setCustom] = useState("");
  const [customPart, setCustomPart] = useState<TimeOfDay>("morning");
  const [firstTodo, setFirstTodo] = useState("");
  const [topics, setTopics] = useState<string[]>(ALL_TOPIC_CATEGORIES);
  const [football, setFootball] = useState(true);
  const [channels, setChannels] = useState<GuestChannel[]>([]);
  const [push, setPush] = useState<PushState | "…">("…");
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const today = checklistToday();

  useEffect(() => {
    (async () => {
      const m = await j<Me>("/api/profile");
      if (m) { setMe(m); setName(m.profile.name || m.name || ""); setAbout(m.profile.about); setFootball(m.profile.football); if (m.primary && !again) router.replace("/today"); }
      const s = await j<{ newsTopics?: string | null; newsCustomChannels?: string | null; morningPlan?: string | null }>("/api/settings");
      if (s) {
        setTopics(parseTopics(s.newsTopics));
        try { const v = JSON.parse(s.newsCustomChannels ?? "null"); if (Array.isArray(v)) setChannels(v); } catch { /* none yet */ }
        try { const p = JSON.parse(s.morningPlan ?? "null"); if (p && /^\d{2}:\d{2}$/.test(p.restWake)) setWake(p.restWake); } catch { /* default */ }
      }
      setPush(await pushState().catch(() => "unsupported" as PushState));
    })();
  }, [again, router]);

  const todoPreview = useMemo(() => (firstTodo.trim() ? parseQuickAdd(firstTodo, today) : null), [firstTodo, today]);
  const toggleStep = (s: Suggestion) => setSteps((cur) => (cur.some((x) => x.label === s.label) ? cur.filter((x) => x.label !== s.label) : [...cur, s]));
  const addCustom = () => { const t = custom.trim(); if (!t) return; setSteps((cur) => (cur.some((x) => x.label === t) ? cur : [...cur, { label: t, part: customPart }])); setCustom(""); };

  const finish = async () => {
    setErr(null);
    try {
      setSaving("Your name");
      const first = name.trim() || me?.name || "";
      await j("/api/profile", { method: "PATCH", body: JSON.stringify({ name: first, about: about.trim(), football }) });
      setSaving("Your day");
      const plan = { trainWake: wake, restWake: wake, callsAt: wake, saturdayShiftMin: 0, steps: [{ id: "wake", label: "Wake up", minutes: 15 }] };
      await j("/api/settings", { method: "PATCH", body: JSON.stringify({ morningPlan: JSON.stringify(plan), newsTopics: JSON.stringify(topics), newsCustomChannels: JSON.stringify(channels) }) });
      for (const s of steps) await j("/api/checklist", { method: "POST", body: JSON.stringify({ title: s.label, timeOfDay: s.part, kind: "routine" }) });
      if (todoPreview && todoPreview.title) {
        setSaving("Your first to-do");
        const now = Date.now();
        await j("/api/todos", { method: "PUT", body: JSON.stringify({
          clientId: newTodoId(), title: todoPreview.title, area: "personal", notes: null, project: null, dueDate: todoPreview.dueDate, dueTime: todoPreview.dueTime,
          evening: todoPreview.evening, someday: todoPreview.someday, priority: todoPreview.priority, sortOrder: 0, doneAt: null, createdAt: now, updatedAt: now, deleted: false,
        }) });
      }
      setSaving("Done");
      const m = await j<Me>("/api/profile", { method: "PATCH", body: JSON.stringify({ onboarded: true }) });
      if (m) writeCache(ME_KEY, m);
      try { for (const k of ["cc:v1:settings", "cc:v1:checklist", "cc:v1:checklist-all", "cc:v1:todos", "cc:v1:news-videos-v2", "cc:v1:highlights", "cc:v1:news-weekly"]) localStorage.removeItem(k); } catch { /* ignore */ }
      router.replace("/today");
    } catch {
      setErr("Something did not save. Check the connection and try again.");
      setSaving(null);
    }
  };

  const turnOnReminders = async () => {
    setPush("…");
    try { setPush(await enablePush()); } catch { setPush("off"); }
  };

  const next = () => setI((n) => Math.min(STEPS.length - 1, n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--ink)", padding: "max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))" }}>
      <div style={{ width: "min(560px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={30} />
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Step {i + 1} of {STEPS.length}</span>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>{TITLES[step]}</h1>
          </div>
        </header>
        <div aria-hidden style={{ display: "flex", gap: 6 }}>
          {STEPS.map((s, n) => <span key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: n <= i ? "var(--violet)" : "var(--fill-3)" }} />)}
        </div>

        <section className="cc-card"><div className="cc-card-body" style={card}>
          {step === "hello" && (
            <>
              <p style={line}>A L I is a small private hub for your day: a routine you tick, your to-dos, the things you want to keep, and the news and videos you choose. Nothing in it is shared with anyone.</p>
              <p style={line}>A few steps to make it yours. Each one can be changed later in Settings.</p>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>Your first name</span>
                <input className="cc-input" style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>A few words about you · optional</span>
                <input className="cc-input" style={input} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="what you do, what you follow, where you live" />
                <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>The weekly news brief uses this to say why a story matters to you.</span></label>
            </>
          )}

          {step === "day" && (
            <>
              <p style={line}>Today shows your day in three parts, morning, afternoon and evening, with your routine steps and the to-dos due. Tick a step when it is done; a step left open turns red.</p>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>When do you usually wake up?</span>
                <input type="time" className="cc-input" style={{ ...input, width: 140, WebkitAppearance: "none", appearance: "none" }} value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} /></label>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={label}>Steps you want to see every day</span>
                <div style={{ display: "grid", gap: 8 }}>
                  {SUGGESTIONS.map((s) => { const on = steps.some((x) => x.label === s.label); return (
                    <button key={s.label} type="button" onClick={() => toggleStep(s)} aria-pressed={on} style={chip(on)}>
                      <span>{s.label}</span><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{PART_LABEL[s.part]}</span>
                    </button>
                  ); })}
                  {steps.filter((s) => !SUGGESTIONS.some((x) => x.label === s.label)).map((s) => (
                    <button key={s.label} type="button" onClick={() => toggleStep(s)} aria-pressed style={chip(true)}>
                      <span>{s.label}</span><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{PART_LABEL[s.part]} · tap to remove</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginTop: 4 }}>
                  <input className="cc-input" style={input} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Your own step" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
                  <select className="cc-input" style={{ ...input, width: "auto" }} value={customPart} onChange={(e) => setCustomPart(e.target.value as TimeOfDay)} aria-label="Part of the day">
                    {(["morning", "afternoon", "evening", "anytime"] as TimeOfDay[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
                  </select>
                  <button type="button" className="cc-btn cc-btn-secondary" onClick={addCustom} style={{ minHeight: 46 }}>Add</button>
                </div>
              </div>
            </>
          )}

          {step === "todo" && (
            <>
              <p style={line}>Write a to-do the way you would say it: <b>Call the bank tomorrow at 10</b>. The day and the hour are understood and the words disappear from the title.</p>
              <p style={line}>Two lists, Personal and Work. A to-do with a day shows on Today; one with an hour reminds you on the phone until you tick it. Someday keeps ideas out of the way.</p>
              <p style={line}>Open a to-do to add notes or subtasks, change its day, or send it to tomorrow with one tap.</p>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>Try one · optional</span>
                <input className="cc-input" style={input} value={firstTodo} onChange={(e) => setFirstTodo(e.target.value)} placeholder="Call the bank tomorrow at 10" />
                {todoPreview && todoPreview.title && <span style={{ fontSize: 14, color: "var(--ink-3)" }}>{todoPreview.title}{todoPreview.dueDate ? ` · ${todoPreview.dueDate}` : ""}{todoPreview.dueTime ? ` · ${todoPreview.dueTime}` : ""}{todoPreview.someday ? " · someday" : ""}</span>}
              </label>
            </>
          )}

          {step === "knowledge" && (
            <>
              <p style={line}><b>Knowledge</b> keeps what you want to find again: notes, lists, checklists and links. Search finds them by any word.</p>
              <p style={line}><b>Passwords</b> is a vault locked with a phrase only you know. It is encrypted on your phone before it is stored; nobody can open it without the phrase, so keep it somewhere safe. There is no reset.</p>
              <p style={line}><b>Birthdays</b> remembers the people and the dates, and reminds you a few days before.</p>
            </>
          )}

          {step === "news" && (
            <>
              <p style={line}>Every Sunday a written brief and a podcast sum up the week on the topics you pick. Videos come from the channels you choose, newest first; tick one when you have watched it.</p>
              <div style={{ display: "grid", gap: 8 }}><span style={label}>Weekly brief · topics</span><TopicsPicker topics={topics} onChange={setTopics} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
                <span style={{ display: "grid" }}><span style={{ fontSize: 16 }}>Football highlights</span><span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>European clubs, the Botola, the national teams · never a score</span></span>
                <Switch on={football} onChange={setFootball} label="Football on or off" />
              </div>
              <div style={{ display: "grid", gap: 8 }}><span style={label}>YouTube channels you watch</span><ChannelPicker channels={channels} onChange={setChannels} /></div>
            </>
          )}

          {step === "done" && (
            <>
              <p style={line}><b>On your phone</b> · open this address in Chrome, tap the menu (⋮), then <b>Add to Home screen</b> or <b>Install app</b>. It opens like any app and works without a connection.</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 44 }}>
                <span style={{ display: "grid" }}><span style={{ fontSize: 16 }}>Reminders</span><span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                  {push === "on" ? "on, on this device" : push === "blocked" ? "blocked in the browser settings" : push === "unsupported" ? "install the app first, then turn them on in Settings" : push === "needs-install" ? "install the app first, then turn them on in Settings" : "a to-do with an hour reminds you until you tick it"}
                </span></span>
                {(push === "off" || push === "…") && <button type="button" className="cc-btn cc-btn-secondary" onClick={turnOnReminders} disabled={push === "…"} style={{ minHeight: 44 }}>Turn on</button>}
              </div>
              <p style={line}>Prefer your to-dos on <b>WhatsApp</b>? Settings → WhatsApp sets it up in two steps, free.</p>
              <p style={line}>Everything here can be changed in <b>Settings</b>: your routine under Routine, the topics and channels under News, and this tour under Welcome tour.</p>
              {err && <p style={{ ...line, color: "var(--neg)" }}>{err}</p>}
            </>
          )}
        </div></section>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          {i > 0 ? <button type="button" className="cc-btn cc-btn-ghost" onClick={back} disabled={!!saving} style={{ minHeight: 48 }}>Back</button> : <span />}
          {step !== "done"
            ? <button type="button" className="cc-btn cc-btn-primary" onClick={next} style={{ minHeight: 48, padding: "0 22px" }}>Next</button>
            : <button type="button" className="cc-btn cc-btn-primary" onClick={finish} disabled={!!saving} style={{ minHeight: 48, padding: "0 22px" }}>{saving ? `${saving}…` : "Open A L I"}</button>}
        </div>
      </div>
    </main>
  );
}
