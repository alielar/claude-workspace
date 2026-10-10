// Dictation, the same engine as Wati Inbox: the browser cuts the speech at pauses and sends each
// piece as 16 kHz mono WAV to the Mac (Whisper large-v3-turbo, local and free, through Wati
// Inbox's worker). The text grows in the box while Ali speaks; the piece being spoken is shown
// provisionally (fast model) and replaced by the final text at the pause. Tap again to stop.
// It stops by itself after 90 s without a voice or 10 min in all.

const SEG_SILENCE_MS = 550, SEG_MIN_MS = 600, SEG_MAX_MS = 15000, INTERIM_MS = 900, VOICE_RMS = 0.012;
const IDLE_STOP_MS = 90_000, MAX_MS = 10 * 60_000;

let rec = null;
export const recording = () => rec;

// target(): the textarea to write into (looked up each time, the page re-renders), onChange(): repaint the mic buttons.
export async function toggle({ target, onChange, toast }) {
  if (rec) return stop();
  if (!navigator.mediaDevices?.getUserMedia) { toast('No microphone access in this browser', true); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const ta = target();
    rec = { target, onChange, toast, ctx, stream, src, node, rate: ctx.sampleRate, startedAt: Date.now(), base: (ta?.value || '').trim(),
      segs: [], seg: [], segMs: 0, segVoice: false, lastVoiceAt: 0, lastInterimAt: 0, interimBusy: false, nextId: 1, inflight: 0 };
    rec.timer = setInterval(() => onChange(), 1000);
    node.onaudioprocess = (e) => { if (rec) frame(e.inputBuffer.getChannelData(0)); };
    src.connect(node); node.connect(ctx.destination);
    onChange();
  } catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone refused. Allow it in the browser settings' : `Microphone: ${e.message}`, true); }
}

export const elapsedLabel = () => { if (!rec) return ''; const s = Math.floor((Date.now() - rec.startedAt) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function frame(samples) {
  const r = rec, now = Date.now();
  if (now - r.startedAt >= MAX_MS) { r.toast('Dictation stopped after 10 min'); stop(); return; }
  if (now - (r.lastVoiceAt || r.startedAt) >= IDLE_STOP_MS) { r.toast('Dictation stopped: no voice for 90 s'); stop(); return; }
  let s = 0; for (let i = 0; i < samples.length; i += 4) s += samples[i] * samples[i];
  const rms = Math.sqrt(s / (samples.length / 4));
  r.seg.push(new Float32Array(samples)); r.segMs += (samples.length / r.rate) * 1000;
  if (rms > VOICE_RMS) { r.segVoice = true; r.lastVoiceAt = now; }
  if (!r.segVoice) { if (r.segMs > 4000) { r.seg = []; r.segMs = 0; } return; }
  const pause = now - r.lastVoiceAt >= SEG_SILENCE_MS;
  if ((pause && r.segMs >= SEG_MIN_MS) || r.segMs >= SEG_MAX_MS) cut(true);
  else if (now - r.lastInterimAt >= INTERIM_MS && !r.interimBusy && r.segMs >= SEG_MIN_MS) cut(false);
}

function cut(final) {
  const r = rec;
  const wav = toWav16k(r.seg, r.rate);
  let seg = r.segs.find((x) => x.id === r.curId && !x.final);
  if (!seg) { seg = { id: r.nextId++, text: '', final: false }; r.segs.push(seg); r.curId = seg.id; }
  if (final) { seg.final = true; r.seg = []; r.segMs = 0; r.segVoice = false; r.curId = null; } else { r.lastInterimAt = Date.now(); r.interimBusy = true; }
  const prev = r.segs.filter((x) => x.final && x.id < seg.id && x.text).map((x) => x.text).join(' ').slice(-200);
  const run = (seg.run = (seg.run || 0) + 1);
  r.inflight++;
  fetch(`/api/transcribe?prompt=${encodeURIComponent(prev)}${final ? '' : '&fast=1'}${r.lang ? `&lang=${r.lang}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
    .then(async (res) => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || `Error ${res.status}`); return d; })
    .then((d) => { if (!r.lang && d.language) r.lang = d.language; if (run === seg.run || final) seg.text = (d.text || '').trim(); paint(r); })
    .catch((e) => { if (final) r.toast(e.message, true); })
    .finally(() => { r.inflight--; if (!final) r.interimBusy = false; if (!rec && r.inflight === 0 && r.done) r.done(); });
}

function paint(r) {
  const text = [r.base, ...r.segs.map((x) => x.text).filter(Boolean)].filter(Boolean).join(' ');
  const ta = r.target();
  if (ta && ta.value !== text) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.scrollTop = ta.scrollHeight; }
}

export async function stop() {
  const r = rec; if (!r) return; rec = null; clearInterval(r.timer);
  try { r.src.disconnect(); r.node.disconnect(); r.stream.getTracks().forEach((t) => t.stop()); await r.ctx.close(); } catch {}
  r.onChange();
  if (r.segVoice && r.segMs >= 300) { rec = r; cut(true); rec = null; }
  if (r.inflight) await new Promise((ok) => { r.done = ok; setTimeout(ok, 20000); });
  paint(r);
  const ta = r.target(); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  if (!r.segs.some((x) => x.text)) r.toast('Nothing heard');
}

function toWav16k(chunks, rate) {
  let n = 0; for (const c of chunks) n += c.length;
  const all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = rate / 16000, len = Math.floor(all.length / ratio), out = new Int16Array(len);
  for (let i = 0; i < len; i++) { const a = Math.floor(i * ratio), b = Math.min(all.length, Math.max(a + 1, Math.floor((i + 1) * ratio))); let s = 0; for (let j = a; j < b; j++) s += all[j]; const v = Math.max(-1, Math.min(1, s / (b - a))); out[i] = v < 0 ? v * 32768 : v * 32767; }
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
  const str = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, out.length * 2, true);
  new Int16Array(buf, 44).set(out);
  return buf;
}
