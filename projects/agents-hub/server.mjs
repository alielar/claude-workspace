// Agents Hub: one page to see, chat with and steer every Claude session on this Mac.
// HTTPS on PORT (local certificate for localhost, the Tailscale one for the phone, both
// borrowed from ../wati-inbox/certs where they are renewed). Password on every request that
// does not come from the Mac itself. Every 3 s the session list is refreshed; a session that
// starts waiting for Ali, or finishes a long turn, pushes the phone.
//
// Chatting: a message to a session the hub holds goes straight in (live.mjs). A message to a
// Cursor, terminal or background session takes it over: its process is ended and the hub
// resumes the same conversation, so Ali chats from here. "Open in Cursor" hands it back.

import { createServer } from 'node:https';
import { request as httpsRequest } from 'node:https';
import { createSecureContext } from 'node:tls';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import webpush from 'web-push';
import * as S from './sessions.mjs';
import * as L from './live.mjs';

const PORT = Number(process.env.PORT || 8450);
const PASSWORD = process.env.APP_PASSWORD || '';
const CERTS = process.env.CERTS_DIR || '../wati-inbox/certs';
if (!PASSWORD) { console.error('APP_PASSWORD is missing in .env'); process.exit(1); }
mkdirSync('data', { recursive: true });

// ── small persistent state ───────────────────────────────────────────────────
const load = (f, d) => { try { return JSON.parse(readFileSync(`data/${f}`, 'utf8')); } catch { return d; } };
const save = (f, v) => writeFileSync(`data/${f}`, JSON.stringify(v, null, 1));
const seen = load('seen.json', {});          // sessionId → last time Ali opened it (ms)
let subs = load('subscriptions.json', []);   // web-push subscriptions
const queue = load('queue.json', {});        // sessionId → message waiting for another window's turn to end
const prefs = load('prefs.json', { lastCwd: null, lastModel: 'default' });

// ── auth ─────────────────────────────────────────────────────────────────────
const token = createHmac('sha256', PASSWORD).update('agents-hub-session').digest('hex');
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const authed = (req) => {
  if (isLocal(req)) return true;
  const m = /(?:^|;\s*)ah=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return !!m && timingSafeEqual(Buffer.from(m[1]), Buffer.from(token));
};

// ── helpers ──────────────────────────────────────────────────────────────────
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((ok, ko) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) ko(new Error('too big')); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { ko(new Error('bad json')); } }); });
const rawBody = (req, max = 30e6) => new Promise((ok, ko) => { const chunks = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > max) { ko(new Error('too big')); req.destroy(); } else chunks.push(c); }); req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', ko); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const serveStatic = (res, file) => { res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': /\.(png|svg)$/.test(file) ? 'max-age=86400' : 'no-cache' }); res.end(readFileSync(file)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the live list ────────────────────────────────────────────────────────────
let sessions = [], listedAt = 0, refreshing = null;
const busy = new Set(); // sessionIds with an action running (the page shows them as "…")
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const prev = new Map(sessions.map((s) => [s.id, s]));
    let next = await S.list({ seen, hub: L });
    sessions = next; listedAt = Date.now();
    if (!prev.size && !Object.keys(seen).length && next.length) { // first run ever: what is already there counts as read
      for (const s of next) seen[s.id] = Date.now(); save('seen.json', seen);
      sessions = next = await S.list({ seen, hub: L });
    }
    if (prev.size) for (const s of next) onChange(prev.get(s.id), s);
    for (const id of Object.keys(queue)) if (!next.some((s) => s.id === id)) { delete queue[id]; save('queue.json', queue); }
  })().finally(() => { refreshing = null; });
  return refreshing;
}
const find = (id) => sessions.find((s) => s.id === id);
// Live sessions change faster than the 3 s list: refresh at once when one asks, finishes or ends.
L.onLiveEvent((l, what) => { if (['ask', 'done', 'ended', 'answered'].includes(what)) setTimeout(refresh, 150); });

// Transitions worth a push; a message queued for another window's session leaves when its turn ends.
const TURN_PUSH_MS = 45_000;
function onChange(before, s) {
  if (!before) return;
  if (s.phase === 'needs' && before.phase !== 'needs') {
    const ask = L.live(s.id)?.view().asks[0];
    push({ title: `${s.name} needs you`, body: ask ? ask.title : s.waitingFor ? s.waitingFor : (s.lastText || 'Waiting for your answer').slice(0, 160), tag: s.id, url: `/s/${s.id}` });
  }
  const ended = before.phase === 'working' && s.phase !== 'working' && s.phase !== 'needs';
  if (ended && queue[s.id]) { const text = queue[s.id]; delete queue[s.id]; save('queue.json', queue); act(s.id, () => chat(s, text)).catch((e) => console.error('queued message:', e.message)); return; }
  if (ended && (s.where === 'hub' || s.where === 'background' || (s.turnStart && Date.now() - s.turnStart > TURN_PUSH_MS))) push({ title: `${s.name} is done`, body: (s.lastText || '').replace(/\s+/g, ' ').slice(0, 180), tag: s.id, url: `/s/${s.id}` });
}

async function act(id, fn) {
  busy.add(id);
  try { return await fn(); } finally { busy.delete(id); setTimeout(refresh, 300); setTimeout(refresh, 2500); }
}

// ── chatting ─────────────────────────────────────────────────────────────────
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Bring a session into the hub (ending it where it ran) and send it a message.
async function chat(s, text) {
  if (s.where === 'hub') return L.open({ cwd: s.cwd, resume: s.id, text });
  if (s.where === 'background' && s.alive) await S.pause(s).catch(() => {});
  else if (s.pid && alive(s.pid)) {
    await S.close(s);
    for (let i = 0; i < 40 && alive(s.pid); i++) await sleep(250);
    if (alive(s.pid)) throw new Error(`Could not take it over from ${s.where === 'cursor' ? 'Cursor' : 'its window'}`);
  }
  console.log(`took over ${s.id} from ${s.where}`);
  return L.open({ cwd: s.cwd, resume: s.id, text });
}

// ── push ─────────────────────────────────────────────────────────────────────
const pushReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ali@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const clean = (x) => String(x || '').replace(/\s*—\s*/g, '. ').replace(/\s+–\s+/g, ', ');
async function push(payload) {
  if (!pushReady || !subs.length) return;
  payload = { ...payload, title: clean(payload.title), body: clean(payload.body) };
  await Promise.all(subs.map(async (sub) => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high', timeout: 10_000 }); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { subs = subs.filter((x) => x.endpoint !== sub.endpoint); save('subscriptions.json', subs); }
      else console.error('push failed:', e.statusCode || '', e.message);
    }
  }));
}

// ── dictation: handed to Wati Inbox's local Whisper (one model in memory for both apps) ──
const watiCookie = `wi=${createHmac('sha256', PASSWORD).update('wati-inbox-session').digest('hex')}`;
function transcribe(wav, search) {
  return new Promise((ok, ko) => {
    const r = httpsRequest({ host: 'localhost', port: 8443, path: `/api/transcribe${search}`, method: 'POST', rejectUnauthorized: false,
      headers: { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, Cookie: watiCookie }, timeout: 95_000 }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { try { ok({ status: res.statusCode, data: JSON.parse(s) }); } catch { ko(new Error('Dictation answered badly')); } });
    });
    r.on('error', () => ko(new Error('Dictation is off (Wati Inbox is not running)'))); r.on('timeout', () => r.destroy(new Error('Dictation timed out')));
    r.end(wav);
  });
}

// ── API ──────────────────────────────────────────────────────────────────────
const view = (s) => ({ ...s, busy: busy.has(s.id), queued: queue[s.id] || null });
async function api(req, res, path) {
  if (path === '/api/login' && req.method === 'POST') {
    const { password } = await body(req);
    if (typeof password !== 'string' || password.length !== PASSWORD.length || !timingSafeEqual(Buffer.from(password), Buffer.from(PASSWORD))) return json(res, 401, { error: 'Wrong password' });
    res.setHeader('Set-Cookie', `ah=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
    return json(res, 200, { ok: true });
  }
  if (!authed(req)) return json(res, 401, { error: 'login' });

  if (path === '/api/sessions' && req.method === 'GET') {
    if (Date.now() - listedAt > 1500) await refresh();
    return json(res, 200, { sessions: sessions.map(view), projects: S.projects(), prefs, local: isLocal(req), push: pushReady ? process.env.VAPID_PUBLIC_KEY : null });
  }
  if (path === '/api/sessions' && req.method === 'POST') {
    const b = await body(req);
    const cwd = S.projects().find((p) => p.cwd === b.cwd)?.cwd;
    const prompt = String(b.prompt || '').trim();
    if (!cwd) return json(res, 400, { error: 'Pick a project' });
    if (!prompt) return json(res, 400, { error: 'Say what Claude should do' });
    Object.assign(prefs, { lastCwd: cwd, lastModel: b.model || 'default' }); save('prefs.json', prefs);
    if (b.where === 'cursor') { await S.newInCursor({ cwd, prompt }); return json(res, 200, { ok: true, where: 'cursor' }); }
    const l = await L.open({ cwd, model: b.model, text: prompt });
    await refresh();
    return json(res, 200, { ok: true, id: l.id });
  }
  if (path === '/api/close-old' && req.method === 'POST') {
    const old = sessions.filter((s) => s.phase === 'old');
    const results = await Promise.allSettled(old.map((s) => act(s.id, () => closeSession(s))));
    return json(res, 200, { closed: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length });
  }
  if (path === '/api/subscribe' && req.method === 'POST') {
    const sub = await body(req);
    if (!sub?.endpoint) return json(res, 400, { error: 'bad subscription' });
    subs = [...subs.filter((x) => x.endpoint !== sub.endpoint), sub]; save('subscriptions.json', subs);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/transcribe' && req.method === 'POST') {
    try { const r = await transcribe(await rawBody(req), new URL(req.url, 'https://x').search); return json(res, r.status, r.data); }
    catch (e) { return json(res, 503, { error: e.message }); }
  }

  const m = /^\/api\/sessions\/([0-9a-f-]{36})(?:\/([a-z-]+))?$/.exec(path);
  if (!m) return json(res, 404, { error: 'not found' });
  if (Date.now() - listedAt > 1500) await refresh();
  const s = find(m[1]);
  if (!s) return json(res, 404, { error: 'That session has ended' });
  const action = m[2];
  const l = L.live(s.id);

  if (!action && req.method === 'GET') {
    const file = S.transcriptFor(s);
    return json(res, 200, { session: view(s), messages: file ? S.conversation(file) : [], live: l ? l.view() : null });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  switch (action) {
    case 'seen': seen[s.id] = Date.now(); save('seen.json', seen); if (s.phase === 'done') s.phase = 'idle'; return json(res, 200, { ok: true });
    case 'message': {
      const text = String((await body(req)).text || '').trim();
      if (!text) return json(res, 400, { error: 'Empty message' });
      // Another window is mid-turn: taking it over now would cut Claude off, so the message waits for the turn to end.
      if (s.where !== 'hub' && (s.phase === 'working' || s.phase === 'needs')) { queue[s.id] = text; save('queue.json', queue); return json(res, 200, { ok: true, queued: true }); }
      const tookOver = s.where !== 'hub';
      await act(s.id, () => chat(s, text));
      return json(res, 200, { ok: true, tookOver });
    }
    case 'answer': {
      if (!l) return json(res, 400, { error: 'That session is not running here' });
      const b = await body(req);
      l.answer(String(b.id || ''), b); setTimeout(refresh, 100);
      return json(res, 200, { ok: true });
    }
    case 'interrupt': if (!l) break; await l.interrupt(); return json(res, 200, { ok: true });
    case 'unqueue': delete queue[s.id]; save('queue.json', queue); return json(res, 200, { ok: true });
    case 'pause':
      if (s.where === 'hub') { L.release(s.id); setTimeout(refresh, 200); return json(res, 200, { ok: true }); }
      if (s.where !== 'background') break;
      await act(s.id, () => S.pause(s)); return json(res, 200, { ok: true });
    case 'resume': if (s.where !== 'background') break; await act(s.id, () => S.resume(s)); return json(res, 200, { ok: true });
    case 'close': await act(s.id, () => closeSession(s)); return json(res, 200, { ok: true });
    case 'open-cursor': // hand it back: the hub lets go first, so only one window writes the conversation
      if (s.where === 'hub') { L.release(s.id, { forgetIt: true }); await sleep(800); }
      await S.openInCursor(s); setTimeout(refresh, 1500); return json(res, 200, { ok: true });
    case 'open-terminal': if (s.where !== 'background') break; await S.openInTerminal(s); return json(res, 200, { ok: true });
  }
  return json(res, 400, { error: 'Not possible for this session' });
}
async function closeSession(s) {
  if (s.where === 'hub') { L.release(s.id, { forgetIt: true }); return; }
  return S.close(s);
}

// ── server ───────────────────────────────────────────────────────────────────
const ctxCache = new Map();
function contextFor(cert, key) {
  if (!existsSync(cert) || !existsSync(key)) return null;
  const mtime = statSync(cert).mtimeMs, hit = ctxCache.get(cert);
  if (hit && hit.mtime === mtime) return hit.ctx;
  const ctx = createSecureContext({ cert: readFileSync(cert), key: readFileSync(key) });
  ctxCache.set(cert, { mtime, ctx }); return ctx;
}
const localCtx = () => contextFor(join(CERTS, 'server.pem'), join(CERTS, 'server.key'));
const tsCtx = () => contextFor(join(CERTS, 'ts.pem'), join(CERTS, 'ts.key'));

createServer({
  key: readFileSync(join(CERTS, 'server.key')), cert: readFileSync(join(CERTS, 'server.pem')),
  SNICallback: (name, cb) => cb(null, (name.endsWith('.ts.net') ? tsCtx() : null) || localCtx()),
}, async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'https://x').pathname);
  try {
    if (path.startsWith('/api/')) return await api(req, res, path);
    const file = join('public', normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (path !== '/' && !path.startsWith('/s/') && existsSync(file) && extname(file)) return serveStatic(res, file);
    return serveStatic(res, 'public/index.html');
  } catch (e) {
    console.error(req.method, path, e.message);
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`${new Date().toISOString()} agents-hub on https://localhost:${PORT}`));

// On restart, live sessions are let go cleanly (they stay listed and wake with the next message).
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { L.releaseAll(); setTimeout(() => process.exit(0), 400); });

refresh();
setInterval(() => refresh().catch((e) => console.error('refresh:', e.message)), 3000);
