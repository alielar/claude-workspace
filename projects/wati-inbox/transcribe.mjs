// Dictation for the app (Ali, 2026-10-01): the phone or the laptop records a 16 kHz mono WAV in the browser and
// POSTs it to /api/transcribe; this module hands it to one long-lived Python worker (transcribe-worker.py,
// Whisper large-v3-turbo on Apple MLX, free and local) and returns the text. The worker starts on the first
// request, stays up (the model stays in memory, ~1 s per sentence after that) and is restarted if it dies.
//
//   PYTHON   path to the venv's python (default .venv/bin/python)
//   WHISPER_MODEL  Hugging Face repo of the MLX model (default mlx-community/whisper-large-v3-turbo)

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PYTHON = process.env.PYTHON || '.venv/bin/python';
const TMP = 'data/tmp';
const TIMEOUT_MS = 90_000;
const IDLE_MS = Number(process.env.DICTATION_IDLE_MIN || 20) * 60e3; // the model (~1.6 GB in memory) is let go after this much silence
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'dictation:', ...a);

let child = null, ready = false, starting = null, seq = 0, idleTimer = null;
const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (child && !pending.size) { log('idle, worker stopped (restarts on the next dictation)'); child.kill(); } }, IDLE_MS); };
const pending = new Map(); // id → { ok, ko, timer }
const status = { state: 'off', model: null, last: null, error: null, count: 0 };
export const transcribeStatus = () => ({ ...status, available: existsSync(PYTHON) });

function start() {
  if (starting) return starting;
  starting = new Promise((ok, ko) => {
    if (!existsSync(PYTHON)) { starting = null; status.error = 'python venv missing (.venv)'; return ko(new Error('Dictation is not installed on the Mac (.venv missing)')); }
    status.state = 'starting'; status.error = null;
    child = spawn(PYTHON, ['transcribe-worker.py'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    const rl = createInterface({ input: child.stdout });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-2000); });
    rl.on('line', (line) => {
      let m; try { m = JSON.parse(line); } catch { return; }
      if (m.ready) { ready = true; status.state = 'ready'; status.model = m.model; starting = null; touch(); log('worker ready', m.model); return ok(); }
      const p = m.id != null ? pending.get(m.id) : null;
      if (!p) { if (m.error) { status.error = m.error; log('worker error:', m.error); } return; }
      clearTimeout(p.timer); pending.delete(m.id);
      if (m.error) p.ko(new Error(m.error)); else p.ok(m);
    });
    child.on('exit', (code) => {
      log(`worker exited (${code})${stderr ? ': ' + stderr.trim().split('\n').pop() : ''}`);
      const err = new Error(`Dictation worker stopped${stderr ? ': ' + stderr.trim().split('\n').pop().slice(0, 200) : ''}`);
      for (const p of pending.values()) { clearTimeout(p.timer); p.ko(err); }
      pending.clear(); child = null; ready = false; status.state = 'off'; clearTimeout(idleTimer);
      if (starting) { status.error = err.message; starting = null; ko(err); }
    });
  });
  return starting;
}

// At startup: say whether dictation can work; the worker itself starts on the first dictation (a few seconds to
// load the model, the very first time it downloads it) and is let go after IDLE_MS without a request.
export function startDictation() {
  if (!existsSync(PYTHON)) { log('off (no .venv: python3 -m venv .venv && .venv/bin/pip install mlx-whisper)'); return; }
  log(`ready — worker starts on the first dictation, model ${process.env.WHISPER_MODEL || 'mlx-community/whisper-large-v3-turbo'}, idle stop after ${IDLE_MS / 60e3} min`);
}

export async function transcribe(wav, { language = null, prompt = null } = {}) {
  if (!ready) await start();
  touch();
  mkdirSync(TMP, { recursive: true });
  const id = `${Date.now()}-${++seq}`;
  const path = join(process.cwd(), TMP, `dict-${id}.wav`);
  writeFileSync(path, wav);
  try {
    const res = await new Promise((ok, ko) => {
      const timer = setTimeout(() => { pending.delete(id); ko(new Error('Dictation timed out')); }, TIMEOUT_MS);
      pending.set(id, { ok, ko, timer });
      child.stdin.write(JSON.stringify({ id, path, language, prompt }) + '\n');
    });
    status.count++; status.last = { at: new Date().toISOString(), ms: res.ms, chars: res.text.length, language: res.language };
    log(`${res.text.length} chars in ${res.ms} ms (${res.language || '?'})`);
    return { text: res.text, language: res.language, ms: res.ms };
  } finally { try { unlinkSync(path); } catch {} }
}
