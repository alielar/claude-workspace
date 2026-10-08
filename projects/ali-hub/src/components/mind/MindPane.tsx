"use client";

/**
 * Train → Mind · Mental Training (rebuilt 2026-10-03, Ali: "keep the scope and the logic, improve
 * every step"). Top to bottom:
 *   PROGRESS   · topics learned, the average of the last five talks against the first five, and a
 *                graph of every graded talk (accuracy · structure · clarity) · then ANALYTICS: the
 *                delivery numbers (fillers a minute, pauses, pace) across the same talks.
 *   TODAY      · the three steps (Callback › New topic › Done), then the cards:
 *     1 Callback   · a past topic due today: PREP, record 2 min, graded · "Not today" moves it to
 *                    tomorrow and the new topic alone makes the session.
 *     2 New topic  · READ the brief full screen against the timer (its length at READ_WPM, 3-8 min,
 *                    "+15 s" three times at most, closes itself at zero) · then SPEAK: a full-screen
 *                    recorder with the ring, the four PREP cues and a live level meter · graded.
 *   FEEDBACK   · scores · what landed and what was missed · speaking tips and retention tips
 *                (fixed rules from the numbers, types.ts) · the grader's notes · the transcript.
 *   TOPICS     · every learned topic with its next callback day.
 * Recording = MediaRecorder (audio/mp4 on iOS) → gradeStore.ts (background upload to /api/mind/grade,
 * the recorder screen closes on Stop · Ali 2026-10-05: "let me leave and come back when the grading
 * is ready") · the card says "grading", a push says when it landed; the file is never kept. Both
 * parts done → the "Mental training" routine row ticks itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Reveal } from "@/components/health/checkup";
import { useMind } from "@/lib/mind/useMind";
import { dropGrade, enqueueGrade, retryGrade, useGradeJobs, type GradeJob } from "@/lib/mind/gradeStore";
import { MAX_SPEAK_SEC, PREP, READ_EXTRA_MAX, READ_EXTRA_SEC, fmtSec, readSeconds, retentionTips, speakingTips, type MindPart, type MindPoint, type MindSession, type MindTopic } from "@/lib/mind/types";
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

// ─── Reading ─────────────────────────────────────────────────────────────────

/** The brief's markdown as reading matter: "## " sections (Remember highlighted), bullets, bold, paragraphs. */
function Brief({ md }: { md: string }) {
  // Blocks = blank-line paragraphs · a heading glued to the lines under it is cut off on its own.
  const blocks = md.replace(/\r/g, "").split(/\n{2,}/).flatMap((b) => { const m = b.match(/^(#{1,3} [^\n]*)\n([\s\S]+)$/); return m ? [m[1], m[2]] : [b]; });
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  // Each block knows whether it sits under the "Remember" heading (a plain loop · no closure writes).
  const typed: { t: string; remember: boolean }[] = [];
  let under = false;
  for (const b of blocks) {
    const t = b.trim();
    if (!t) continue;
    if (/^#{1,3} /.test(t)) under = /^remember/i.test(t.replace(/^#+ /, ""));
    typed.push({ t, remember: under });
  }
  return (
    <div style={{ display: "grid", gap: 14, fontSize: 18, lineHeight: 1.62, maxWidth: 620 }}>
      {typed.map(({ t, remember }, i) => {
        if (/^#{1,3} /.test(t)) {
          const title = t.replace(/^#+ /, "");
          return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: remember ? "var(--violet)" : "var(--ink-3)", margin: "14px 0 0", fontFamily: "var(--f-mono)" }}>{title}</h3>;
        }
        if (t.split("\n").every((l) => /^[-*] /.test(l) || /^\d+[.)] /.test(l))) {
          const items = t.split("\n").map((l) => l.replace(/^[-*] /, "").replace(/^\d+[.)] /, ""));
          return remember
            ? <ol key={i} style={{ margin: 0, padding: "12px 14px 12px 34px", display: "grid", gap: 8, borderRadius: 12, background: "var(--accent-soft)", fontSize: 17 }}>{items.map((l, j) => <li key={j} style={{ fontWeight: 500 }}>{inline(l)}</li>)}</ol>
            : <ul key={i} style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>{items.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>;
        }
        return <p key={i} style={{ margin: 0 }}>{inline(t.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

/**
 * The brief full screen under a reading timer (Ali: "the best layout for reading and learning"):
 * a thin bar at the top with the time left and "+15 s" (three times at most), the text at 18 px on a
 * reading measure, the Remember facts in a highlighted box; at zero it closes itself.
 */
function Reading({ topic, onClose }: { topic: MindTopic; onClose: () => void }) {
  const base = readSeconds(topic.brief);
  const [extra, setExtra] = useState(0);
  const [left, setLeft] = useState(base);
  const t0 = useRef(0);
  const done = useRef(false);
  const total = base + extra * READ_EXTRA_SEC;
  useEffect(() => {
    if (!t0.current) t0.current = Date.now(); // the clock starts when the brief opens
    const id = window.setInterval(() => {
      const l = total - Math.floor((Date.now() - t0.current) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0 && !done.current) { done.current = true; window.clearInterval(id); onClose(); }
    }, 500);
    return () => window.clearInterval(id);
  }, [total, onClose]);
  useEffect(() => { const prev = document.body.style.overflow; return () => { document.body.style.overflow = prev; }; }, []);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  // Portalled to <body>: the cards above animate with a transform, which would pin a fixed overlay inside them.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-chrome)", borderBottom: "1px solid var(--line)", padding: "calc(env(safe-area-inset-top) + 10px) 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 620, margin: "0 auto" }}>
          <span style={{ flex: 1, fontSize: 13.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Reading · closes at zero</span>
          <button type="button" onClick={() => setExtra((e) => Math.min(READ_EXTRA_MAX, e + 1))} disabled={extra >= READ_EXTRA_MAX} className="cc-btn cc-btn-ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 14, borderRadius: 10, opacity: extra >= READ_EXTRA_MAX ? 0.45 : 1 }}>
            +{READ_EXTRA_SEC} s{extra ? ` · ${READ_EXTRA_MAX - extra} left` : ""}
          </button>
          <span className="tabular-nums" style={{ fontFamily: "var(--f-mono)", fontSize: 20, fontWeight: 600, color: left <= 30 ? "var(--warn)" : "var(--ink)", minWidth: 52, textAlign: "right" }}>{fmtSec(left)}</span>
        </div>
        <span className="cc-progress-track" style={{ height: 3, display: "block", marginTop: 8 }}><span className="cc-progress-fill" style={{ display: "block", height: "100%", width: `${pct}%`, transition: "width 0.5s linear" }} /></span>
      </div>
      <div style={{ padding: "22px 20px calc(env(safe-area-inset-bottom) + 40px)", maxWidth: 660, margin: "0 auto", display: "grid", gap: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--ink-4)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--f-mono)" }}>{topic.domain}</div>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, marginTop: 4 }}>{topic.title}</h2>
          {topic.hook && <div style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>{topic.hook}</div>}
        </div>
        <Brief md={topic.brief} />
        <button className="cc-btn cc-btn-primary" onClick={onClose} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>Close and speak</button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Speaking ────────────────────────────────────────────────────────────────

const MIME = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];

/**
 * The recorder full screen (Ali: "the best layout for recording"): the ring draining over two
 * minutes with the time inside, the four PREP cues as cards (the one whose time it is, lit by the
 * clock · 0:00-0:25 Point, to 1:05 Reason, to 1:45 Example, then Point), and a live level meter so
 * the phone is visibly listening. Stop early or let it run out.
 */
function Speaking({ part, topic, onDone, onCancel }: { part: MindPart; topic: MindTopic; onDone: () => void; onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "sending" | "error">("idle");
  const [left, setLeft] = useState(MAX_SPEAK_SEC);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const meter = useRef<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stopAll = () => {
    if (timer.current) clearInterval(timer.current); timer.current = null;
    if (meter.current) cancelAnimationFrame(meter.current); meter.current = null;
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    void ctx.current?.close().catch(() => {}); ctx.current = null;
  };
  useEffect(() => () => stopAll(), []);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MIME.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stopAll();
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/mp4" });
        if (blob.size < 2000) { setErr("Nothing was recorded · try again"); setState("error"); return; }
        // Grading runs in the background (gradeStore) · the screen closes now, the card says "grading", a push says when it is done.
        enqueueGrade(part, topic.id, topic.title, blob);
        setState("idle");
        onDone();
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
      // Level meter · the phone is visibly listening.
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const c = new Ctx(); ctx.current = c;
        const an = c.createAnalyser(); an.fftSize = 512;
        c.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => { an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; } setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4)); meter.current = requestAnimationFrame(tick); };
        meter.current = requestAnimationFrame(tick);
      } catch { /* no meter · the ring still runs */ }
    } catch (e) {
      setErr(/denied|permission/i.test(String(e)) ? "Microphone blocked · allow it for this site in iPhone Settings → Safari" : "The microphone did not start");
      setState("error");
    }
  };
  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };

  const elapsed = MAX_SPEAK_SEC - left;
  const cue = state !== "recording" ? -1 : elapsed < 25 ? 0 : elapsed < 65 ? 1 : elapsed < 100 ? 2 : 3;
  const R = 46, C = 2 * Math.PI * R;
  const frac = left / MAX_SPEAK_SEC;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 20px)", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, color: "var(--ink-4)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--f-mono)" }}>{part === "callback" ? "Callback · from memory" : "New topic · from memory"}</span>
          <span style={{ display: "block", fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.title}</span>
        </span>
        {state !== "sending" && <button type="button" onClick={() => { stopAll(); onCancel(); }} className="cc-btn cc-btn-ghost" aria-label="Back" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>}
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "16px 0" }}>
        <div style={{ width: "min(62vw, 36vh, 260px)", aspectRatio: "1", position: "relative", display: "grid", placeItems: "center" }}>
          <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }} aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
            {state === "recording" && <circle cx="50" cy="50" r={R - 6} fill="color-mix(in srgb, var(--neg) 22%, transparent)" style={{ transform: `scale(${0.85 + level * 0.15})`, transformOrigin: "50% 50%", transition: "transform 80ms linear" }} />}
            <circle cx="50" cy="50" r={R} fill="none" stroke={state === "recording" ? "var(--neg)" : "var(--violet)"} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
          </svg>
          <div style={{ display: "grid", gap: 2, textAlign: "center", position: "relative" }}>
            <span className="tabular-nums" style={{ fontSize: "clamp(44px, 14vw, 64px)", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)" }}>{fmtSec(left)}</span>
            <span style={{ fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: state === "recording" ? "var(--neg)" : "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{state === "recording" ? "recording" : state === "sending" ? "grading" : "ready"}</span>
          </div>
        </div>
      </div>

      {/* PREP cues · the one whose time it is lights up */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {PREP.map((l, i) => {
          const on = cue === i, [head, rest] = l.split(" · ");
          return (
            <div key={l} style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${on ? "var(--violet)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", transition: "background 0.3s, border-color 0.3s" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-2)" }}>{head}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{rest}</div>
            </div>
          );
        })}
      </div>

      {state === "sending" ? (
        <div className="cc-btn" style={{ minHeight: 60, fontSize: 17, borderRadius: 14, opacity: 0.8 }}>Listening back and grading…</div>
      ) : state === "recording" ? (
        <button onClick={stop} className="cc-btn" style={{ minHeight: 64, fontSize: 19, borderRadius: 14, background: "var(--neg)", color: "#fff", border: "none" }}>Stop</button>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <button onClick={start} className="cc-btn cc-btn-primary" style={{ minHeight: 64, fontSize: 19, borderRadius: 14 }}>● Record · 2 min</button>
          {err && <span style={{ fontSize: 14, color: "var(--warn)" }}>{err}</span>}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ─── Feedback ────────────────────────────────────────────────────────────────

function Score({ label, v }: { label: string; v: number }) {
  return (
    <div style={{ display: "grid", gap: 2, justifyItems: "center", padding: "10px 0", borderRadius: 12, background: "var(--fill-1)" }}>
      <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 600, fontFamily: "var(--f-mono)", color: v >= 4 ? "var(--pos)" : v >= 3 ? "var(--warn)" : "var(--neg)", lineHeight: 1 }}>{v.toFixed(1)}</span>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

function Tips({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase", color, fontFamily: "var(--f-mono)" }}>{title}</span>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{items.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </div>
  );
}

/** Scores · what landed and what was missed · speaking tips · retention tips · the grader's notes · transcript. */
function Result({ s }: { s: MindSession }) {
  const [open, setOpen] = useState(false);
  const m = s.metrics;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Score label="accuracy" v={s.scores.accuracy} /><Score label="structure" v={s.scores.structure} /><Score label="clarity" v={s.scores.clarity} />
      </div>
      <div className="tabular-nums" style={{ fontSize: 13.5, color: "var(--ink-3)", display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
        <span>{fmtSec(m.durationSec)}</span><span>{m.wpm} wpm</span><span>{m.fillers} fillers · {m.fillersPerMin}/min</span><span>{m.pauses} pause{m.pauses === 1 ? "" : "s"} over 1.5 s</span><span>{m.falseStarts} false start{m.falseStarts === 1 ? "" : "s"}</span>
      </div>
      {(s.recalled.length > 0 || s.missed.length > 0) && (
        <div style={{ display: "grid", gap: 4, fontSize: 14.5 }}>
          <span style={{ fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>Recall · {s.recalled.length} of {s.recalled.length + s.missed.length}</span>
          {s.recalled.map((f, i) => <span key={"r" + i} style={{ color: "var(--ink-2)" }}><span style={{ color: "var(--pos)" }}>✓</span> {f}</span>)}
          {s.missed.map((f, i) => <span key={"m" + i} style={{ color: "var(--ink-2)" }}><span style={{ color: "var(--neg)" }}>✕</span> {f}</span>)}
        </div>
      )}
      <Tips title="Speak better next time" items={speakingTips(m)} color="var(--violet)" />
      <Tips title="Keep more of it" items={retentionTips(s.recalled, s.missed, s.part)} color="var(--pos)" />
      <Tips title="The grader's notes" items={s.notes} color="var(--ink-4)" />
      <button className="cc-btn cc-btn-ghost" onClick={() => setOpen((v) => !v)} style={{ minHeight: 40, justifySelf: "start" }}>{open ? "Hide transcript" : "Transcript"}</button>
      {open && <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ink-2)", whiteSpace: "pre-wrap", userSelect: "text" }}>{s.transcript}</div>}
    </div>
  );
}

// ─── Progress · the graph and the analytics ──────────────────────────────────

const LINES: { key: "accuracy" | "structure" | "clarity"; label: string; color: string }[] = [
  { key: "accuracy", label: "accuracy", color: "var(--violet)" },
  { key: "structure", label: "structure", color: "var(--pos)" },
  { key: "clarity", label: "clarity", color: "var(--warn)" },
];

/** Scores over every talk, three lines, 1 to 5. */
function ScoreGraph({ points }: { points: MindPoint[] }) {
  const W = 320, H = 120, px = 6, py = 8;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : px + (i / (n - 1)) * (W - 2 * px));
  const y = (v: number) => py + (1 - (v - 1) / 4) * (H - 2 * py);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-label="Scores over time">
        {[1, 2, 3, 4, 5].map((g) => <line key={g} x1={px} x2={W - px} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />)}
        {[1, 3, 5].map((g) => <text key={g} x={W - px} y={y(g) - 2} fontSize="9" fill="var(--ink-4)" textAnchor="end">{g}</text>)}
        {LINES.map((l) => {
          const pts = points.map((p, i) => ({ x: x(i), y: y(p[l.key]) }));
          return (
            <g key={l.key}>
              <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={l.color} />)}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--ink-3)", justifyContent: "center" }}>
        {LINES.map((l) => <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden style={{ width: 10, height: 3, borderRadius: 2, background: l.color }} />{l.label}</span>)}
      </div>
    </div>
  );
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));

function Progress({ points, topics }: { points: MindPoint[]; topics: number }) {
  const first = points.slice(0, 5), last = points.slice(-5);
  const overall = (ps: MindPoint[]) => mean(ps.map((p) => (p.accuracy + p.structure + p.clarity) / 3));
  const a = overall(first), b = overall(last);
  const delta = a !== null && b !== null && points.length >= 6 ? b - a : null;
  const stat = (label: string, v: string, sub?: string, tone?: string) => (
    <div style={{ display: "grid", gap: 2, padding: "10px 12px", borderRadius: 12, background: "var(--fill-1)", minWidth: 0 }}>
      <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.1, color: tone }}>{v}</span>
      {sub && <span className="tabular-nums" style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</span>}
    </div>
  );
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Progress</span><span className="tail">{points.length} talk{points.length === 1 ? "" : "s"}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {stat("topics", String(topics))}
          {stat("last 5 talks", fmt1(b), b !== null ? "of 5" : undefined, b === null ? undefined : b >= 4 ? "var(--pos)" : b >= 3 ? "var(--warn)" : "var(--neg)")}
          {stat("since the start", delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`, delta === null ? "needs 6 talks" : `first 5 · ${fmt1(a)}`, delta === null ? undefined : delta > 0.05 ? "var(--pos)" : delta < -0.05 ? "var(--neg)" : undefined)}
        </div>
        {points.length >= 2 ? <ScoreGraph points={points} /> : <div style={{ fontSize: 14, color: "var(--ink-3)" }}>The graph starts after the second talk.</div>}
      </div>
    </section>
  );
}

/** Delivery numbers across the same talks · lower fillers and pauses, a pace around 150. */
function Analytics({ points }: { points: MindPoint[] }) {
  const first = points.slice(0, 5), last = points.slice(-5);
  const row = (label: string, pick: (p: MindPoint) => number, unit: string, better: "lower" | "higher" | "mid") => {
    const a = mean(first.map(pick)), b = mean(last.map(pick));
    const d = a !== null && b !== null && points.length >= 6 ? b - a : null;
    const good = d === null ? null : better === "lower" ? d < 0 : better === "higher" ? d > 0 : Math.abs((b ?? 0) - 150) < Math.abs((a ?? 0) - 150);
    const series = points.map(pick);
    const max = Math.max(1, ...series);
    return (
      <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 80px", gap: 10, alignItems: "center", minHeight: 48, borderBottom: "1px solid var(--line)" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>{label}</span>
          <span className="tabular-nums" style={{ display: "block", fontSize: 12.5, color: good === null ? "var(--ink-4)" : good ? "var(--pos)" : "var(--neg)" }}>
            {d === null ? "trend after 6 talks" : `${d > 0 ? "↑" : d < 0 ? "↓" : "="} ${Math.abs(d).toFixed(1)} vs the first 5`}
          </span>
        </span>
        <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 600 }}>{fmt1(b)}{unit}</span>
        <svg viewBox="0 0 80 28" width="80" height="28" aria-hidden>
          {series.map((v, i) => <rect key={i} x={(i / Math.max(1, series.length)) * 80} y={28 - (v / max) * 26} width={Math.max(2, 80 / series.length - 1.5)} height={(v / max) * 26} rx="1" fill="var(--violet)" opacity={0.35 + 0.65 * (i / Math.max(1, series.length - 1))} />)}
        </svg>
      </div>
    );
  };
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Delivery</span><span className="tail">last 5 · every talk as bars</span></div>
      <div style={{ padding: "0 14px" }}>
        {row("Fillers a minute", (p) => p.fillersPerMin, "", "lower")}
        {row("Pauses over 1.5 s", (p) => p.pauses, "", "lower")}
        {row("Pace", (p) => p.wpm, " wpm", "mid")}
      </div>
    </section>
  );
}

// ─── Today ───────────────────────────────────────────────────────────────────

const daysAgo = (ms: number | null, today: string) => { if (!ms) return ""; const d = Math.round((Date.parse(today + "T12:00:00") - ms) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const dueWord = (d: string | null, today: string) => (!d ? "done" : d <= today ? "due" : d === today.slice(0, 8) + String(Number(today.slice(8)) + 1).padStart(2, "0") ? "tomorrow" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00")));

/** Where today's session stands, one line of three steps · the flow at a glance. */
function Steps({ cbState, newState }: { cbState: "none" | "todo" | "done"; newState: "todo" | "done" }) {
  const all = newState === "done" && cbState !== "todo";
  const step = (label: string, st: "todo" | "done" | "none", now: boolean) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: st === "done" ? "var(--pos)" : now ? "var(--ink)" : "var(--ink-3)", fontWeight: now ? 600 : 400, textDecoration: st === "none" ? "line-through" : "none", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 12, border: `1.5px solid ${st === "done" ? "var(--pos)" : now ? "var(--violet)" : "var(--line)"}`, background: st === "done" ? "var(--pos)" : "transparent", color: st === "done" ? "var(--bg)" : "inherit" }}>{st === "done" ? "✓" : ""}</span>
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

function Prep() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {PREP.map((l) => { const [head, rest] = l.split(" · "); return <div key={l} style={{ padding: "8px 10px", borderRadius: 10, background: "var(--fill-1)" }}><div style={{ fontSize: 14, fontWeight: 600 }}>{head}</div><div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{rest}</div></div>; })}
    </div>
  );
}

/** A recording being graded in the background (gradeStore) · shown on its card; "Send again" keeps the same audio. */
function Grading({ job }: { job: GradeJob }) {
  return job.state === "sending" ? (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="cc-skeleton" style={{ height: 44 }} />
      <div style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.45 }}>Listening back and grading your talk on <b style={{ fontWeight: 600 }}>{job.topicTitle}</b> · about half a minute. You can leave this screen; a push says when it is done.</div>
    </div>
  ) : (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14.5, color: "var(--warn)", lineHeight: 1.45 }}>{job.error ?? "Grading did not finish"} · the recording is still here.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="cc-btn cc-btn-primary" onClick={() => retryGrade(job.part)} style={{ minHeight: 44 }}>Send again</button>
        <button className="cc-btn cc-btn-ghost" onClick={() => dropGrade(job.part)} style={{ minHeight: 44, color: "var(--ink-3)" }}>Discard</button>
      </div>
    </div>
  );
}

/** `cols` (the laptop, 2026-10-08): the session left, Progress · Delivery · Topics right. */
export function MindPane({ cols = false }: { cols?: boolean } = {}) {
  const { data, loading, writing, writeBrief, retire, skip } = useMind();
  const [reading, setReading] = useState(false);
  const [speaking, setSpeaking] = useState<MindPart | null>(null);
  const [closed, setClosed] = useState(false);
  const [openTopic, setOpenTopic] = useState<number | null>(null);
  const newRef = useRef<HTMLElement | null>(null);
  const today = data?.today ?? checklistToday();
  const sessionDone = !!data?.done.new && (!!data?.done.callback || !data?.callback);
  useEffect(() => { if (sessionDone) void tickMindRow(); }, [sessionDone]);
  const closeBrief = useCallback(() => { setReading(false); setClosed(true); setSpeaking("new"); }, []);
  const points = useMemo(() => data?.points ?? [], [data?.points]);
  // Recordings being graded in the background (gradeStore) · one per part at most.
  const jobs = useGradeJobs();
  const jobFor = (part: MindPart) => jobs.find((j) => j.part === part) ?? null;
  const done = data?.done;
  // The server stored the session but the answer never came back (the app was put away): the refresh shows it · drop the job.
  useEffect(() => { if (done) for (const j of jobs) if (done[j.part]) dropGrade(j.part); }, [jobs, done]);

  if (!data && loading) return <div className="cc-skeleton" style={{ height: 160 }} />;
  if (!data) return <div style={{ fontSize: 15, color: "var(--ink-3)" }}>Could not load today&apos;s session.</div>;
  const cb = data.callback, nt = data.newTopic;
  const cbState = data.done.callback ? "done" : cb ? "todo" : "none";
  const progress = points.length > 0 && <Reveal i={0}><Progress points={points} topics={data.topics.length} /></Reveal>;
  const session = (
    <>
      <Reveal i={1}><Steps cbState={cbState} newState={data.done.new ? "done" : "todo"} /></Reveal>

      {/* 1 · Callback */}
      {cbState === "none" ? null : (
      <Reveal i={2}><section className="cc-card">
        <div className="cc-card-head"><span className="title">1 · Callback</span><span className="tail">{data.done.callback ? "done" : cb ? `learned ${daysAgo(cb.learnedAt, today)}` : ""}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
          {data.done.callback ? (
            <><div style={{ fontSize: 17, fontWeight: 600 }}>{data.done.callback.topicTitle}</div><Result s={data.done.callback} /></>
          ) : jobFor("callback") ? (
            <Grading job={jobFor("callback")!} />
          ) : cb ? (
            <>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{cb.title}</div>
                <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{cb.domain} · callback {cb.recalls + 1} · from memory, no re-reading</div>
              </div>
              <Prep />
              <button className="cc-btn cc-btn-primary" onClick={() => setSpeaking("callback")} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>● Speak · 2 min</button>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="cc-btn cc-btn-ghost" onClick={() => void skip(cb.id)} style={{ minHeight: 40, color: "var(--ink-3)" }}>Not today</button>
                <button className="cc-btn cc-btn-ghost" onClick={() => void retire(cb.id)} style={{ minHeight: 40, color: "var(--ink-3)" }}>Stop callbacks</button>
              </div>
            </>
          ) : null}
        </div>
      </section></Reveal>
      )}

      {/* 2 · New topic */}
      <Reveal i={3}><section className="cc-card" ref={newRef} style={{ scrollMarginTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <div className="cc-card-head"><span className="title">{cbState === "none" ? "New topic" : "2 · New topic"}</span><span className="tail">{data.done.new ? "done" : nt ? nt.domain : ""}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
          {data.done.new ? (
            <><div style={{ fontSize: 17, fontWeight: 600 }}>{data.done.new.topicTitle}</div><Result s={data.done.new} /></>
          ) : jobFor("new") ? (
            <Grading job={jobFor("new")!} />
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
              {!closed ? (
                <>
                  <button className="cc-btn cc-btn-primary" onClick={() => setReading(true)} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>Read the brief · {Math.round(readSeconds(nt.brief) / 60)} min</button>
                  {writing
                    ? <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Writing another brief · about 20 seconds</div>
                    : <button className="cc-btn cc-btn-ghost" onClick={() => writeBrief(true)} style={{ minHeight: 40, justifySelf: "start" }}>Another topic</button>}
                </>
              ) : (
                <>
                  <Prep />
                  <button className="cc-btn cc-btn-primary" onClick={() => setSpeaking("new")} style={{ minHeight: 56, fontSize: 18, borderRadius: 14 }}>● Speak · 2 min</button>
                  <button className="cc-btn cc-btn-ghost" onClick={() => { setClosed(false); setReading(true); }} style={{ minHeight: 40, justifySelf: "start" }}>Back to the brief</button>
                </>
              )}
            </>
          )}
        </div>
      </section></Reveal>

    </>
  );
  const side = (
    <>
      {/* Delivery analytics */}
      {points.length >= 2 && <Reveal i={4}><Analytics points={points} /></Reveal>}

      {/* Topics */}
      {data.topics.length > 0 && (
        <Reveal i={5}><section className="cc-card">
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

    </>
  );
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {!data.sttReady && <div style={{ fontSize: 14, color: "var(--warn)", padding: "0 2px" }}>Speech-to-text not connected · add DEEPGRAM_API_KEY on Vercel, then redeploy.</div>}
      {cols ? (
        <div className="cc-cols">
          <div className="cc-stack">{session}</div>
          <div className="cc-stack">{progress}{side}</div>
        </div>
      ) : (
        <>{progress}{session}{side}</>
      )}

      {reading && nt && <Reading topic={nt} onClose={closeBrief} />}
      {speaking === "callback" && cb && <Speaking part="callback" topic={cb} onDone={() => setSpeaking(null)} onCancel={() => setSpeaking(null)} />}
      {speaking === "new" && nt && <Speaking part="new" topic={nt} onDone={() => { setSpeaking(null); setClosed(false); window.setTimeout(() => newRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} onCancel={() => setSpeaking(null)} />}
    </div>
  );
}
