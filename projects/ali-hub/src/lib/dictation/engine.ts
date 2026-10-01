/**
 * ALAI dictation · the microphone → live text (2026-10-01).
 *
 * Main path = Deepgram live (nova-3, the key Mental Training already uses): the phone streams
 * 16 kHz audio over a WebSocket opened with a 60 s token from POST /api/fix/dictate (the key itself
 * never reaches the phone) and gets words back while Ali speaks, a phrase being spoken (`interim`)
 * replaced until it is final. Fallback = the browser's own speech recognition when the token
 * route answers no (key missing) · Chrome / Safari on the laptop, Safari on the phone.
 *
 * Runs outside React (module singleton, state in `store.ts`), so it keeps listening while Ali
 * moves to another tab. A dropped socket reconnects with a fresh token; audio said meanwhile is
 * held (up to ~8 s) and sent first. iOS stops the microphone when the app leaves the screen:
 * the track ends, the text so far is kept as the draft.
 */

import { getDict, joinText, registerStopper, setDict } from "./store";

const RATE = 16000;
const DG_URL = `wss://api.deepgram.com/v1/listen?${new URLSearchParams({
  model: "nova-3", language: "en", smart_format: "true", punctuate: "true", interim_results: "true",
  encoding: "linear16", sample_rate: String(RATE), channels: "1", endpointing: "300",
})}`;

type Session = {
  stream: MediaStream; ctx: AudioContext; proc: ScriptProcessorNode; src: MediaStreamAudioSourceNode;
  ws: WebSocket | null; pending: ArrayBuffer[]; retries: number; closing: boolean;
};
let cur: Session | null = null;
let browser: { rec: BrowserRecognition; on: boolean } | null = null;

/** End the session: what was said (final + the phrase in progress) joins the draft. */
function commit(error: string | null = null) {
  const s = getDict();
  setDict({ status: error ? "error" : "idle", draft: joinText(s.draft, s.final, s.interim), final: "", interim: "", startedAt: null, error });
  registerStopper(null);
}

function downsample(input: Float32Array, from: number): ArrayBuffer {
  const ratio = from / RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out.buffer;
}

async function token(): Promise<string | null> {
  try {
    const res = await fetch("/api/fix/dictate", { method: "POST", cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { token?: string }).token ?? null;
  } catch { return null; }
}

async function openSocket(s: Session): Promise<boolean> {
  const t = await token();
  if (!t || s !== cur || s.closing) return false;
  return new Promise((resolve) => {
    const ws = new WebSocket(DG_URL, ["bearer", t]);
    ws.binaryType = "arraybuffer";
    let opened = false;
    ws.onopen = () => {
      opened = true; s.ws = ws; s.retries = 0;
      for (const b of s.pending.splice(0)) ws.send(b);
      if (getDict().status === "connecting") setDict({ status: "live" });
      resolve(true);
    };
    ws.onmessage = (e) => {
      let m: { type?: string; is_final?: boolean; channel?: { alternatives?: { transcript?: string }[] } };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type !== "Results") return;
      const text = m.channel?.alternatives?.[0]?.transcript ?? "";
      const d = getDict();
      if (m.is_final) setDict({ final: joinText(d.final, text), interim: "" });
      else setDict({ interim: text });
    };
    ws.onclose = () => {
      if (s.ws === ws) s.ws = null;
      if (!opened) { resolve(false); return; }
      if (s.closing) { finish(s); return; }
      // Dropped mid-sentence (network, iOS) · keep the phrase in progress, open a new socket.
      const d = getDict();
      if (d.interim) setDict({ final: joinText(d.final, d.interim), interim: "" });
      const lost = () => { if (s === cur && !s.closing) { teardown(s); commit("Dictation lost the connection · the text so far is kept"); } };
      if (s === cur && s.retries++ < 5) window.setTimeout(() => { void openSocket(s).then((ok) => { if (!ok) lost(); }); }, 400 * s.retries);
      else lost();
    };
    ws.onerror = () => { /* onclose follows */ };
  });
}

function teardown(s: Session) {
  s.proc.onaudioprocess = null;
  try { s.src.disconnect(); s.proc.disconnect(); } catch { /* already */ }
  s.stream.getTracks().forEach((t) => t.stop());
  void s.ctx.close().catch(() => {});
  if (cur === s) cur = null;
}

function finish(s: Session) {
  teardown(s);
  commit();
}

/** Start listening · call it from a tap (iOS only lets audio start from one). */
export async function startDictation(): Promise<void> {
  if (cur || browser) return;
  setDict({ status: "connecting", final: "", interim: "", error: null, startedAt: Date.now() });
  registerStopper(stopListening);
  // Created inside the tap, before any await: iOS refuses an AudioContext started later.
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) {
    void ctx.close().catch(() => {});
    commit(/denied|permission|NotAllowed/i.test(String(e)) ? "Microphone blocked · allow it in iPhone Settings → Safari → Microphone" : "The microphone did not start");
    return;
  }
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const s: Session = { stream, ctx, proc, src, ws: null, pending: [], retries: 0, closing: false };
  cur = s;
  proc.onaudioprocess = (e) => {
    const buf = downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    e.outputBuffer.getChannelData(0).fill(0);
    if (s.ws && s.ws.readyState === WebSocket.OPEN) s.ws.send(buf);
    else { s.pending.push(buf); if (s.pending.length > 32) s.pending.shift(); }
  };
  src.connect(proc); proc.connect(ctx.destination);
  stream.getAudioTracks()[0]?.addEventListener("ended", () => { if (cur === s) stopListening(); });

  if (await openSocket(s)) return;
  // No live service (key missing or refused) · the browser's own recogniser, when there is one.
  teardown(s);
  if (!startBrowser()) commit("Dictation is not available · the speech service did not answer");
}

/** Stop: the last phrase is flushed (Deepgram "Finalize"), then the socket closes and the text joins the draft. */
export function stopListening() {
  if (browser) { browser.on = false; try { browser.rec.stop(); } catch { /* ended */ } return; }
  const s = cur;
  if (!s) { commit(); return; }
  setDict({ status: "stopping" });
  s.closing = true;
  s.proc.onaudioprocess = null;
  s.stream.getTracks().forEach((t) => t.stop());
  const ws = s.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) { finish(s); return; }
  try { ws.send(JSON.stringify({ type: "Finalize" })); } catch { /* closing */ }
  window.setTimeout(() => { try { ws.send(JSON.stringify({ type: "CloseStream" })); } catch { /* closed */ } }, 700);
  window.setTimeout(() => { if (cur === s) { try { ws.close(); } catch { /* closed */ } finish(s); } }, 2500);
}

// ── Fallback · the browser's own recogniser ──────────────────────────────────

type BrowserRecognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};

function startBrowser(): boolean {
  const W = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return false;
  const rec = new R();
  rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
  const b = { rec, on: true };
  browser = b;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) setDict({ final: joinText(getDict().final, r[0].transcript) });
      else interim += r[0].transcript;
    }
    setDict({ interim, status: "live" });
  };
  rec.onerror = (e) => { if (e.error === "not-allowed") b.on = false; };
  // Safari and Chrome end a "continuous" session after a silence · start again while still on.
  rec.onend = () => {
    if (b.on) { try { rec.start(); return; } catch { /* fall through */ } }
    browser = null;
    commit();
  };
  try { rec.start(); setDict({ status: "live" }); return true; } catch { browser = null; return false; }
}
