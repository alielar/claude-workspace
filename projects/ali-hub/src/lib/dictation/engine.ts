/**
 * R2-D2 dictation · the microphone → live text (2026-10-01).
 *
 * Three ways, tried in this order, all on the Deepgram key Mental Training already uses:
 *   1 LIVE · the phone streams 16 kHz audio over a WebSocket opened with a 60 s token from
 *     POST /api/fix/dictate (the key never reaches the phone) and gets words back while Ali speaks
 *     (`interim` = the phrase being spoken, replaced until final). Needs a key allowed to grant
 *     tokens; the current one is refused (403), so today the app runs on 2.
 *   2 PHRASE · the same audio, cut at every short pause (a level detector: ~0.45 s of quiet after
 *     speech, or 12 s at most), each phrase sent as WAV to POST /api/fix/dictate?phrase=1 and its
 *     text appended in order. WHILE a phrase is still being spoken, the part heard so far is sent
 *     every ~1.1 s as a PARTIAL and shown as the live line (`interim`), replaced each time, so the
 *     words appear as Ali speaks (2026-10-03) · the final text of the phrase replaces it. A partial
 *     re-sends audio already sent, so a phrase costs about twice its length in Deepgram minutes.
 *   3 the browser's own recogniser, only where the page cannot record audio at all.
 *
 * Runs outside React (module singleton, state in `store.ts`), so it keeps listening while Ali
 * moves to another tab. A dropped socket reconnects with a fresh token; audio said meanwhile is
 * held (up to ~8 s) and sent first. iOS stops the microphone when the app leaves the screen:
 * the track ends, the text so far is kept as the draft.
 */

import { getDict, joinText, registerStopper, setDict } from "./store";
import { setLevel } from "./level";

const RATE = 16000;
const DG_URL = `wss://api.deepgram.com/v1/listen?${new URLSearchParams({
  model: "nova-3", language: "en", smart_format: "true", punctuate: "true", interim_results: "true",
  encoding: "linear16", sample_rate: String(RATE), channels: "1", endpointing: "300",
})}`;

type Session = {
  stream: MediaStream; ctx: AudioContext; proc: ScriptProcessorNode; src: MediaStreamAudioSourceNode;
  ws: WebSocket | null; pending: ArrayBuffer[]; retries: number; closing: boolean;
  mode: "live" | "phrase";
  // phrase mode
  bufs: ArrayBuffer[]; speechMs: number; quietMs: number; durMs: number; floor: number;
  chain: Promise<void>; inFlight: number;
  /** partials · `seq` names the phrase in progress (a late partial of a flushed phrase is dropped) */
  seq: number; partialBusy: boolean; partialAtMs: number;
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

// ── 2 · phrase by phrase ─────────────────────────────────────────────────────

function wav(bufs: ArrayBuffer[]): Blob {
  const len = bufs.reduce((n, b) => n + b.byteLength, 0);
  const h = new DataView(new ArrayBuffer(44));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); h.setUint32(4, 36 + len, true); str(8, "WAVE"); str(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, RATE, true); h.setUint32(28, RATE * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  str(36, "data"); h.setUint32(40, len, true);
  return new Blob([h.buffer, ...bufs], { type: "audio/wav" });
}

/** Sends the phrase gathered so far · its text is appended once every earlier phrase has landed. */
function flushPhrase(s: Session) {
  const bufs = s.bufs, spoke = s.speechMs >= 250;
  s.bufs = []; s.speechMs = 0; s.quietMs = 0; s.durMs = 0; s.seq++; s.partialAtMs = 0;
  if (!spoke) return;
  s.inFlight++;
  const ask = fetch("/api/fix/dictate?phrase=1", { method: "POST", body: wav(bufs), cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as { text?: string }).text ?? "" : ""))
    .catch(() => "");
  s.chain = s.chain.then(async () => {
    const text = await ask;
    s.inFlight--;
    const d = getDict();
    setDict({ final: joinText(d.final, text), interim: s.inFlight > 0 || s.speechMs > 0 ? "…" : "" });
  });
}

/** One audio frame in phrase mode: a level detector decides where a phrase ends. */
function phraseFrame(s: Session, input: Float32Array, buf: ArrayBuffer, rate: number) {
  const ms = (input.length / rate) * 1000;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / input.length);
  const speaking = rms > Math.max(0.012, s.floor * 2.5);
  if (!speaking) s.floor = s.floor * 0.98 + rms * 0.02;
  s.bufs.push(buf); s.durMs += ms;
  if (speaking) {
    if (s.speechMs === 0 && getDict().interim !== "…") setDict({ interim: "…" });
    s.speechMs += ms; s.quietMs = 0;
  } else s.quietMs += ms;
  // Nothing said yet · keep only a short lead-in, so a phrase never starts with long silence.
  if (s.speechMs === 0) { while (s.bufs.length > 4) s.bufs.shift(); s.durMs = Math.min(s.durMs, 4 * ms); return; }
  if ((s.quietMs >= 450 && s.durMs >= 800) || s.durMs >= 12000) { flushPhrase(s); return; }
  // Still talking · every ~1.1 s send what is heard so far and show it as the live line.
  if (speaking && !s.partialBusy && s.speechMs - s.partialAtMs >= 1100) sendPartial(s);
}

function sendPartial(s: Session) {
  const seq = s.seq;
  s.partialBusy = true; s.partialAtMs = s.speechMs;
  fetch("/api/fix/dictate?phrase=1", { method: "POST", body: wav(s.bufs.slice()), cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as { text?: string }).text ?? "" : ""))
    .catch(() => "")
    .then((text) => {
      s.partialBusy = false;
      // The phrase ended meanwhile (its final text is on its way) · this partial is old news.
      if (s !== cur || s.seq !== seq || !text) return;
      setDict({ interim: text });
    });
}

// ── 1 · live ─────────────────────────────────────────────────────────────────

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
  if (s.mode === "phrase") {
    flushPhrase(s);
    void s.chain.then(() => { setDict({ interim: "" }); commit(); });
    return;
  }
  commit();
}

/** Start listening · call it from a tap (iOS only lets audio start from one). */
export async function startDictation(): Promise<void> {
  if (cur || browser) return;
  setDict({ status: "connecting", final: "", interim: "", error: null, startedAt: Date.now() });
  registerStopper(stopListening);
  // 3 · no way to record audio here (very old browser) · the browser's own recogniser, if any.
  if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") {
    if (!startBrowser()) commit("Dictation is not available in this browser");
    return;
  }
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
  const s: Session = {
    stream, ctx, proc, src, ws: null, pending: [], retries: 0, closing: false, mode: "live",
    bufs: [], speechMs: 0, quietMs: 0, durMs: 0, floor: 0.004, chain: Promise.resolve(), inFlight: 0,
    seq: 0, partialBusy: false, partialAtMs: 0,
  };
  cur = s;
  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    { let sum = 0; for (let i = 0; i < input.length; i += 4) sum += input[i] * input[i]; setLevel(Math.sqrt(sum / (input.length / 4))); } // the waveform on R2-D2
    const buf = downsample(input, ctx.sampleRate);
    e.outputBuffer.getChannelData(0).fill(0);
    if (s.mode === "phrase") { phraseFrame(s, input, buf, ctx.sampleRate); return; }
    if (s.ws && s.ws.readyState === WebSocket.OPEN) s.ws.send(buf);
    else { s.pending.push(buf); if (s.pending.length > 32) s.pending.shift(); }
  };
  src.connect(proc); proc.connect(ctx.destination);
  stream.getAudioTracks()[0]?.addEventListener("ended", () => { if (cur === s) stopListening(); });

  if (await openSocket(s)) return;
  if (s !== cur || s.closing) return;
  // Live tokens refused · the same microphone, phrase by phrase. What was said while asking is kept.
  s.mode = "phrase";
  for (const b of s.pending.splice(0)) { const i16 = new Int16Array(b); phraseFrame(s, Float32Array.from(i16, (v) => v / 0x8000), b, RATE); }
  setDict({ status: "live" });
}

/** Stop: the last phrase is flushed (Deepgram "Finalize"), then the socket closes and the text joins the draft. */
export function stopListening() {
  if (browser) { browser.on = false; try { browser.rec.stop(); } catch { /* ended */ } return; }
  const s = cur;
  if (!s) { commit(); return; }
  if (s.mode === "phrase") { setDict({ status: "stopping" }); s.closing = true; finish(s); return; }
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
