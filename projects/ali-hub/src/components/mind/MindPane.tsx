"use client";

/**
 * Train → Mind · one session on one screen, in order:
 *   1 Callback · a past topic due today (spaced repetition): PREP reminder, record 2 min, graded.
 *   2 New topic · today's brief: read it against a timer (its length at READ_WPM, 3–8 min · closes
 *     itself at zero), PREP reminder, record 2 min, graded with one-decimal scores.
 *   then the week-by-week progress and the topics with their next callback day.
 * Recording uses the phone's microphone (MediaRecorder, audio/mp4 on iOS); the file
 * goes to /api/mind/grade and is not kept. Both parts done → the "Mental training"
 * routine row ticks itself (here and on the server), with no callback due the new topic alone is the session.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/health/checkup";
import { useMind } from "@/lib/mind/useMind";
import { MAX_SPEAK_SEC, PREP, fmtSec, readSeconds, type MindPart, type MindSession, type MindTopic } from "@/lib/mind/types";
import { readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { checklistToday } from "@/lib/checklist/day";
import type { ChecklistData } from "@/lib/checklist/types";

async function tickMindRow() {
  const today = checklistToday();
  const cached = readCache<ChecklistData>("checklist");
  const item = cached?.data.items.find((i) => i.routineKey === "mind");
  if (!item || item.completedToday) return;
  writeCache("checklist", { ...cached!.data, items: cached!.data.items.map((i) => (i.id === item.id ? { ...i, completedToday: true } : i)) });
  try { await sendOrQueue({ url: "/api/checklist/toggle", method: "POST", body: { itemId: item.id, completed: true, date: today }, dedupeKey: `toggle:${item.id}:${today}` }); } catch { /* next refresh */ }
}

/** The brief's markdown, rendered small: "## " headings, "- " bullets, **bold**, paragraphs. */
function Brief({ md }: { md: string }) {
  const blocks = md.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  return (
    <div style={{ display: "grid", gap: 12, fontSize: 17, lineHeight: 1.55 }}>
      {blocks.map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        if (/^#{1,3} /.test(t)) return <h3 key={i} style={{ fontSize: 17, fontWeight: 600, margin: "6px 0 0" }}>{t.replace(/^#+ /, "")}</h3>;
        if (t.split("\n").every((l) => /^[-*] /.test(l))) return <ul key={i} style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>{t.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^[-*] /, ""))}</li>)}</ul>;
        return <p key={i} style={{ margin: 0 }}>{inline(t.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

/**
 * The brief under a reading timer (Ali 2026-09-29: "enforce a reading pace on me"): a thin bar that
 * stays at the top while he scrolls, counting down the minutes the brief's length allows; at zero
 * the brief closes by itself and the recorder takes over. The close button sits in the flow at the
 * end (a sticky one used to cover the last lines while reading).
 */
function Reading({ md, onClose }: { md: string; onClose: () => void }) {
  const total = readSeconds(md);
  const [left, setLeft] = useState(total);
  const done = useRef(false);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const l = total - Math.floor((Date.now() - t0) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0 && !done.current) { done.current = true; window.clearInterval(id); onClose(); }
    }, 500);
    return () => window.clearInterval(id);
  }, [total, onClose]);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ position: "sticky", top: "calc(env(safe-area-inset-top) + 6px)", zIndex: 2, background: "var(--bg-card)", borderRadius: 10, padding: "8px 10px", display: "grid", gap: 6, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: "var(--ink-3)" }}>
          <span>Reading · {Math.round(total / 60)} min · then it closes</span>
          <span className="tabular-nums" style={{ fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 600, color: left <= 30 ? "var(--warn)" : "var(--ink)" }}>{fmtSec(left)}</span>
        </div>
        <span className="cc-progress-track" style={{ height: 4, display: "block" }}><span className="cc-progress-fill" style={{ display: "block", height: "100%", width: `${pct}%`, transition: "width 0.5s linear" }} /></span>
      </div>
      <Brief md={md} />
      <button className="cc-btn cc-btn-primary" onClick={onClose} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>Close the brief and speak</button>
    </div>
  );
}

function Prep() {
  return (
    <div style={{ display: "grid", gap: 4, padding: "10px 12px", borderRadius: 12, background: "var(--fill-1)", fontSize: 14, color: "var(--ink-2)" }}>
      <span style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.04em" }}>PREP</span>
      {PREP.map((l) => <span key={l}>{l}</span>)}
    </div>
  );
}

const MIME = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];

/** Big record button with a 2:00 countdown · stop early or let it run out. */
function Recorder({ part, topic, onDone }: { part: MindPart; topic: MindTopic; onDone: (s: MindSession) => void }) {
  const { grade } = useMind();
  const [state, setState] = useState<"idle" | "recording" | "sending" | "error">("idle");
  const [left, setLeft] = useState(MAX_SPEAK_SEC);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const stopAll = () => { if (timer.current) clearInterval(timer.current); timer.current = null; rec.current?.stream.getTracks().forEach((t) => t.stop()); };
  useEffect(() => () => stopAll(), []);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MIME.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stopAll();
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/mp4" });
        setState("sending");
        const out = await grade(part, topic.id, blob);
        if ("error" in out) { setErr(out.error); setState("error"); return; }
        setState("idle");
        onDone(out);
      };
      rec.current = r;
      r.start(1000);
      setLeft(MAX_SPEAK_SEC);
      setState("recording");
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const l = MAX_SPEAK_SEC - Math.floor((Date.now() - t0) / 1000);
        setLeft(Math.max(0, l));
        if (l <= 0 && rec.current?.state === "recording") rec.current.stop();
      }, 250);
    } catch (e) {
      setErr(/denied|permission/i.test(String(e)) ? "Microphone blocked · allow it for this site in iPhone Settings → Safari" : "The microphone did not start");
      setState("error");
    }
  };
  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };

  if (state === "sending") return <div className="cc-btn" style={{ minHeight: 60, fontSize: 17, borderRadius: 14, opacity: 0.8 }}>Listening back and grading…</div>;
  if (state === "recording") return (
    <button onClick={stop} className="cc-btn" style={{ minHeight: 64, fontSize: 19, borderRadius: 14, background: "var(--neg)", color: "#fff", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px" }}>
      <span>Stop</span><span className="tabular-nums" style={{ fontFamily: "var(--f-mono)", fontSize: 24 }}>{fmtSec(left)}</span>
    </button>
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button onClick={start} className="cc-btn cc-btn-primary" style={{ minHeight: 64, fontSize: 19, borderRadius: 14 }}>● Record · 2 min</button>
      {err && <span style={{ fontSize: 14, color: "var(--warn)" }}>{err}</span>}
    </div>
  );
}

function Score({ label, v }: { label: string; v: number }) {
  return (
    <div style={{ display: "grid", gap: 2, justifyItems: "center" }}>
      <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 600, fontFamily: "var(--f-mono)", color: v >= 4 ? "var(--pos)" : v >= 3 ? "var(--warn)" : "var(--neg)", lineHeight: 1 }}>{v.toFixed(1)}</span>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

function Result({ s }: { s: MindSession }) {
  const [open, setOpen] = useState(false);
  const m = s.metrics;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Score label="accuracy" v={s.scores.accuracy} /><Score label="structure" v={s.scores.structure} /><Score label="clarity" v={s.scores.clarity} />
      </div>
      <div className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-3)", display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
        <span>{fmtSec(m.durationSec)}</span><span>{m.wpm} wpm</span><span>{m.fillers} fillers · {m.fillersPerMin}/min</span><span>{m.pauses} pause{m.pauses === 1 ? "" : "s"} over 1.5 s</span><span>{m.falseStarts} false start{m.falseStarts === 1 ? "" : "s"}</span>
      </div>
      {s.notes.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 15, color: "var(--ink-2)" }}>{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {(s.recalled.length > 0 || s.missed.length > 0) && (
        <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
          {s.recalled.map((f, i) => <span key={"r" + i} style={{ color: "var(--ink-3)" }}><span style={{ color: "var(--pos)" }}>✓</span> {f}</span>)}
          {s.missed.map((f, i) => <span key={"m" + i} style={{ color: "var(--ink-3)" }}><span style={{ color: "var(--neg)" }}>✕</span> {f}</span>)}
        </div>
      )}
      <button className="cc-btn cc-btn-ghost" onClick={() => setOpen((v) => !v)} style={{ minHeight: 40, justifySelf: "start" }}>{open ? "Hide transcript" : "Transcript"}</button>
      {open && <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ink-2)", whiteSpace: "pre-wrap", userSelect: "text" }}>{s.transcript}</div>}
    </div>
  );
}

const daysAgo = (ms: number | null, today: string) => { if (!ms) return ""; const d = Math.round((Date.parse(today + "T12:00:00") - ms) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const dueWord = (d: string | null, today: string) => (!d ? "done" : d <= today ? "due" : d === today.slice(0, 8) + String(Number(today.slice(8)) + 1).padStart(2, "0") ? "tomorrow" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00")));

/** Where today's session stands, one line of three steps · the flow at a glance. */
function Steps({ cbState, newState }: { cbState: "none" | "todo" | "done"; newState: "todo" | "done" }) {
  const all = newState === "done" && cbState !== "todo";
  const step = (label: string, st: "todo" | "done" | "none", now: boolean) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: st === "done" ? "var(--pos)" : now ? "var(--ink)" : "var(--ink-3)", fontWeight: now ? 600 : 400, textDecoration: st === "none" ? "line-through" : "none", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 12, border: `1.5px solid ${st === "done" ? "var(--pos)" : now ? "var(--violet)" : "var(--line-2, var(--line))"}`, background: st === "done" ? "var(--pos)" : "transparent", color: st === "done" ? "var(--bg)" : "inherit" }}>{st === "done" ? "✓" : ""}</span>
      {label}
    </span>
  );
  return (
    <div className="cc-card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {step("Callback", cbState, cbState === "todo")}
        <span aria-hidden style={{ color: "var(--ink-4)" }}>›</span>
        {step("New topic", newState, cbState !== "todo" && newState === "todo")}
        <span aria-hidden style={{ color: "var(--ink-4)" }}>›</span>
        {step("Done", all ? "done" : "todo", false)}
      </div>
      {all && <a href="/today" style={{ fontSize: 14, color: "var(--pos)", textDecoration: "none" }}>Session done · ticked on Today</a>}
    </div>
  );
}

export function MindPane() {
  const { data, loading, writing, writeBrief, retire } = useMind();
  const [reading, setReading] = useState(false);
  const [closed, setClosed] = useState(false);
  const [openTopic, setOpenTopic] = useState<number | null>(null);
  const newRef = useRef<HTMLElement | null>(null);
  const today = data?.today ?? checklistToday();
  const sessionDone = !!data?.done.new && (!!data?.done.callback || !data?.callback);
  useEffect(() => { if (sessionDone) void tickMindRow(); }, [sessionDone]);
  const closeBrief = useCallback(() => { setReading(false); setClosed(true); window.setTimeout(() => newRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }, []);

  if (!data && loading) return <div className="cc-skeleton" style={{ height: 160 }} />;
  if (!data) return <div style={{ fontSize: 15, color: "var(--ink-3)" }}>Could not load today&apos;s session.</div>;
  const cb = data.callback, nt = data.newTopic;
  const cbState = data.done.callback ? "done" : cb ? "todo" : "none";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {!data.sttReady && <div style={{ fontSize: 14, color: "var(--warn)", padding: "0 2px" }}>Speech-to-text not connected · add DEEPGRAM_API_KEY on Vercel, then redeploy.</div>}

      <Reveal i={0}><Steps cbState={cbState} newState={data.done.new ? "done" : "todo"} /></Reveal>

      {/* 1 · Callback · a full card only when there is one to do or one done today */}
      {cbState === "none" ? null : (
      <Reveal i={1}><section className="cc-card">
        <div className="cc-card-head"><span className="title">1 · Callback</span><span className="tail">{data.done.callback ? "done" : cb ? `learned ${daysAgo(cb.learnedAt, today)}` : ""}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
          {data.done.callback ? (
            <><div style={{ fontSize: 17, fontWeight: 600 }}>{data.done.callback.topicTitle}</div><Result s={data.done.callback} /></>
          ) : cb ? (
            <>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{cb.title}</div>
                <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{cb.domain} · callback {cb.recalls + 1} · from memory, no re-reading</div>
              </div>
              <Prep />
              <Recorder part="callback" topic={cb} onDone={() => window.setTimeout(() => newRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)} />
              <button className="cc-btn cc-btn-ghost" onClick={() => void retire(cb.id)} style={{ minHeight: 44, justifySelf: "start", color: "var(--ink-3)" }}>Stop callbacks for this topic</button>
            </>
          ) : null}
        </div>
      </section></Reveal>
      )}

      {/* 2 · New topic */}
      <Reveal i={2}><section className="cc-card" ref={newRef} style={{ scrollMarginTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <div className="cc-card-head"><span className="title">{cbState === "none" ? "New topic" : "2 · New topic"}</span><span className="tail">{data.done.new ? "done" : nt ? nt.domain : ""}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
          {data.done.new ? (
            <><div style={{ fontSize: 17, fontWeight: 600 }}>{data.done.new.topicTitle}</div><Result s={data.done.new} /></>
          ) : !nt ? (
            <>
              <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{writing ? "Writing today's brief · about 20 seconds" : data.aiReady ? "Today's brief is not written yet." : "AI not connected · ANTHROPIC_API_KEY missing"}</div>
              {!writing && data.aiReady && <button className="cc-btn cc-btn-primary" onClick={() => writeBrief()} style={{ minHeight: 52, fontSize: 17, borderRadius: 14 }}>Write today&apos;s brief</button>}
              {writing && <div className="cc-skeleton" style={{ height: 52 }} />}
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{nt.title}</div>
                {nt.hook && <div style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 4 }}>{nt.hook}</div>}
                <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{Math.round(readSeconds(nt.brief) / 60)} min to read, timed · then 2 min spoken from memory</div>
              </div>
              {!reading && !closed && (
                <>
                  <button className="cc-btn cc-btn-primary" onClick={() => setReading(true)} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>Read the brief · {Math.round(readSeconds(nt.brief) / 60)} min</button>
                  {writing
                    ? <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Writing another brief · about 20 seconds</div>
                    : <button className="cc-btn cc-btn-ghost" onClick={() => writeBrief(true)} style={{ minHeight: 40, justifySelf: "start" }}>Another topic</button>}
                </>
              )}
              {reading && <Reading md={nt.brief} onClose={closeBrief} />}
              {closed && (
                <>
                  <Prep />
                  <Recorder part="new" topic={nt} onDone={() => { setClosed(false); window.setTimeout(() => newRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
                  <button className="cc-btn cc-btn-ghost" onClick={() => { setClosed(false); setReading(true); }} style={{ minHeight: 40, justifySelf: "start" }}>Back to the brief</button>
                </>
              )}
            </>
          )}
        </div>
      </section></Reveal>

      {/* Progress */}
      {data.weeks.length > 0 && (
        <Reveal i={3}><section className="cc-card">
          <div className="cc-card-head"><span className="title">Week by week</span><span className="tail">lower fillers and pauses · higher scores</span></div>
          <div style={{ padding: "4px 14px 8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 52px 52px 52px 52px", gap: 6, fontSize: 12, color: "var(--ink-4)", padding: "6px 0", borderBottom: "1px solid var(--line)", textAlign: "right" }}>
              <span style={{ textAlign: "left" }}>week of</span><span>talks</span><span>um/min</span><span>pauses</span><span>recall</span><span>PREP</span>
            </div>
            {data.weeks.map((w) => (
              <div key={w.week} className="tabular-nums" style={{ display: "grid", gridTemplateColumns: "1fr 44px 52px 52px 52px 52px", gap: 6, fontSize: 15, minHeight: 40, alignItems: "center", borderBottom: "1px solid var(--line)", textAlign: "right" }}>
                <span style={{ textAlign: "left", color: "var(--ink-2)" }}>{w.label}</span><span style={{ color: "var(--ink-3)" }}>{w.sessions}</span>
                <span>{w.fillersPerMin ?? "—"}</span><span>{w.pauses ?? "—"}</span><span>{w.accuracy ?? "—"}</span><span>{w.structure ?? "—"}</span>
              </div>
            ))}
          </div>
        </section></Reveal>
      )}

      {/* Topics */}
      {data.topics.length > 0 && (
        <Reveal i={4}><section className="cc-card">
          <div className="cc-card-head"><span className="title">Topics</span><span className="tail">{data.topics.length} learned</span></div>
          <div style={{ padding: "0 14px" }}>
            {data.topics.map((t) => (
              <div key={t.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <button onClick={() => setOpenTopic((o) => (o === t.id ? null : t.id))} aria-expanded={openTopic === t.id} style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, minHeight: 50, alignItems: "center", padding: "6px 0" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{t.domain} · learned {daysAgo(t.learnedAt, today)}{t.recalls ? ` · ${t.recalls} callback${t.recalls === 1 ? "" : "s"}` : ""}</span>
                  </span>
                  <span className="tabular-nums" style={{ fontSize: 14, color: t.nextDue && t.nextDue <= today ? "var(--violet)" : "var(--ink-3)", textAlign: "right" }}>
                    {t.lastAccuracy !== null ? `${t.lastAccuracy}/5 · ` : ""}{dueWord(t.nextDue, today)}
                  </span>
                </button>
                {openTopic === t.id && t.nextDue && (
                  <button className="cc-btn cc-btn-ghost" onClick={() => { void retire(t.id); setOpenTopic(null); }} style={{ minHeight: 44, margin: "0 0 10px", color: "var(--ink-3)" }}>Stop callbacks for this topic</button>
                )}
              </div>
            ))}
          </div>
        </section></Reveal>
      )}
    </div>
  );
}
