// Wati Inbox — one HTTPS server for the app, its API and the Wati poller.
//
//   node --env-file=.env server.mjs
//
// Laptop: https://localhost:8443 · Phone (home Wi-Fi): https://<mac>.local:8443

import { createServer } from 'node:https';
import { createSecureContext } from 'node:tls';
import { statSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { db, inbox, getThread as storedThread, threadMessages, saveThread, latestSuggestion, wantSuggestion, setMuted, sentTemplates, logSend, addSubscription, removeSubscription, subscriptions } from './db.mjs';
import { sendText, sendTemplate, frenchTemplates, getThread as liveThread, getContact } from './wati.mjs';
import { refreshThread, startPolling } from './poll.mjs';

const PORT = Number(process.env.PORT || 8443);
const PASSWORD = process.env.APP_PASSWORD || '';
if (!PASSWORD || !process.env.WATI_TOKEN) { console.error('Run "node setup-keys.mjs" first (.env is incomplete).'); process.exit(1); }

// ── auth: one password, one long-lived cookie ────────────────────────────────
const token = createHmac('sha256', PASSWORD).update('wati-inbox-session').digest('hex');
const authed = (req) => {
  const m = /(?:^|;\s*)wi=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return !!m && timingSafeEqual(Buffer.from(m[1]), Buffer.from(token));
};
const setCookie = (res) => res.setHeader('Set-Cookie', `wi=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);

// ── helpers ──────────────────────────────────────────────────────────────────
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((ok, ko) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) ko(new Error('too big')); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { ko(new Error('bad json')); } }); });
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600e3;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.pem': 'application/x-pem-file' };

function serveStatic(res, file, mime) {
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': file.endsWith('sw.js') ? 'no-store' : 'max-age=300' });
  res.end(readFileSync(file));
}

// ── API ──────────────────────────────────────────────────────────────────────
async function api(req, res, path) {
  if (path === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    if (String(b.password || '') !== PASSWORD) return json(res, 401, { error: 'Mot de passe incorrect' });
    setCookie(res);
    return json(res, 200, { ok: true });
  }
  if (!authed(req)) return json(res, 401, { error: 'login' });

  if (path === '/api/inbox') {
    return json(res, 200, { threads: inbox().map((t) => ({ ...t, windowOpen: !!t.last_inbound_at && hoursSince(t.last_inbound_at) < 24, hoursSinceLead: t.last_inbound_at ? hoursSince(t.last_inbound_at) : null })) });
  }
  if (path === '/api/push') {
    if (req.method === 'GET') return json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY || null, endpoints: subscriptions().map((s) => s.endpoint) });
    if (req.method === 'POST') { const b = await body(req); const s = b.subscription || b; if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json(res, 400, { error: 'bad subscription' }); addSubscription(s, (req.headers['user-agent'] || '').slice(0, 200)); return json(res, 200, { ok: true }); }
    if (req.method === 'DELETE') { const b = await body(req); if (b.endpoint) removeSubscription(b.endpoint); return json(res, 200, { ok: true }); }
  }
  if (path === '/api/templates') return json(res, 200, { templates: await frenchTemplates() });

  const m = /^\/api\/thread\/(\d{8,15})(?:\/(send|template|handled|refresh|suggest|mute))?$/.exec(path);
  if (!m) return json(res, 404, { error: 'not found' });
  const waId = m[1], action = m[2];

  if (!action && req.method === 'GET') {
    let t = storedThread(waId);
    if (!t || hoursSince(t.updated_at || 0) > 1 / 120) { try { await refreshThread(waId, t?.name, { notify: false }); } catch (e) { console.error('refresh', waId, e.message); } t = storedThread(waId); }
    if (!t) {
      // Number never seen on the Sales number (TM lead, or a fresh contact): keep a row so a
      // template can be sent and the reply tracked, with the CRM name when Wati has one.
      let c = null; try { c = await getContact(waId); } catch {}
      saveThread({ wa_id: waId, name: c?.name || null, last_inbound_at: null, last_outbound_at: null, last_text: '', pending: 0 });
      if (c) db.prepare('UPDATE threads SET stage = ?, meeting = ?, country = ?, email = ?, contact_at = ? WHERE wa_id = ?').run(c.stage, c.meeting, c.country, c.email, new Date().toISOString(), waId);
      t = storedThread(waId);
    }
    const sugg = latestSuggestion(waId);
    return json(res, 200, {
      thread: t,
      wanted: !!t.wanted,
      messages: threadMessages(waId),
      windowOpen: !!t.last_inbound_at && hoursSince(t.last_inbound_at) < 24,
      hoursSinceLead: t.last_inbound_at ? hoursSince(t.last_inbound_at) : null,
      templatesSent: sentTemplates(waId).map((s) => ({ at: s.at, name: JSON.parse(s.payload).template })),
      suggestion: sugg && (!t.last_inbound_at || sugg.created_at >= t.last_inbound_at) ? { id: sugg.id, created_at: sugg.created_at, options: JSON.parse(sugg.options) } : null,
    });
  }
  if (action === 'refresh') { await refreshThread(waId, storedThread(waId)?.name, { notify: false }); return json(res, 200, { ok: true }); }
  if (action === 'suggest') { if (!storedThread(waId)) return json(res, 404, { error: 'Conversation inconnue' }); wantSuggestion(waId); return json(res, 200, { ok: true }); }
  if (action === 'mute') { const b = await body(req); setMuted(waId, !!b.muted); return json(res, 200, { ok: true }); }
  if (action === 'handled') { const t = storedThread(waId); if (t) saveThread({ ...t, pending: 0 }); return json(res, 200, { ok: true }); }
  if (action === 'send' && req.method === 'POST') {
    const b = await body(req);
    const bubbles = (b.bubbles || []).map((s) => String(s).trim()).filter(Boolean);
    if (!bubbles.length) return json(res, 400, { error: 'Message vide' });
    const t = storedThread(waId);
    if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) return json(res, 409, { error: 'Fenêtre de 24h fermée — utilisez un template' });
    const sent = [];
    const meta = b.suggestionId ? { suggestionId: b.suggestionId, option: b.option ?? null, edited: !!b.edited } : {};
    for (const text of bubbles) {
      try { await sendText(waId, text); sent.push(text); logSend(waId, 'text', { text, ...meta }, true); }
      catch (e) { logSend(waId, 'text', { text }, false, e.message); return json(res, 502, { error: e.message, sent }); }
    }
    saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: sent[sent.length - 1].slice(0, 200) });
    refreshThread(waId, t.name, { notify: false }).catch(() => {});
    return json(res, 200, { ok: true, sent });
  }
  if (action === 'template' && req.method === 'POST') {
    const b = await body(req);
    const tpl = (await frenchTemplates()).find((x) => x.name === b.template);
    if (!tpl) return json(res, 400, { error: 'Template inconnu ou non approuvé' });
    const params = Object.fromEntries(tpl.params.map((p) => [p, String(b.params?.[p] ?? '')]));
    const t = storedThread(waId);
    const sentAt = Date.now();
    try { await sendTemplate(waId, tpl.name, params); }
    catch (e) { logSend(waId, 'template', { template: tpl.name, params }, false, e.message); return json(res, 502, { error: e.message }); }
    // Wati says "ok" before Meta has looked at it — wait for the real status.
    await new Promise((r) => setTimeout(r, 5000));
    let status = 'SENT';
    try {
      const fresh = (await liveThread(waId, 1)).filter((m) => m.tpl && new Date(m.at).getTime() > sentAt - 10_000);
      if (fresh.length) status = fresh[fresh.length - 1].status || status;
    } catch {}
    const failed = status === 'FAILED';
    logSend(waId, 'template', { template: tpl.name, params, status }, !failed, failed ? status : null);
    refreshThread(waId, t?.name, { notify: false }).catch(() => {});
    if (failed) return json(res, 502, { error: `Meta a refusé le template ${tpl.name} — voir le détail dans la conversation` });
    saveThread({ ...(t || { wa_id: waId, name: null, last_inbound_at: null }), pending: 0, last_outbound_at: new Date().toISOString(), last_text: `[${tpl.name}]` });
    return json(res, 200, { ok: true, status });
  }
  return json(res, 405, { error: 'method' });
}

// ── server ───────────────────────────────────────────────────────────────────
// ── certificates ─────────────────────────────────────────────────────────────
// Local CA certificate for localhost / <mac>.local; a real Tailscale certificate
// for <mac>.<tailnet>.ts.net when present (certs/ts.pem + ts.key), renewed daily.
const TS_HOST = process.env.TS_HOST || 'alis-macbook-pro.tail91cc5.ts.net';
const ctxCache = new Map(); // file → { mtime, ctx }
function contextFor(certFile, keyFile) {
  if (!existsSync(certFile) || !existsSync(keyFile)) return null;
  const mtime = statSync(certFile).mtimeMs;
  const hit = ctxCache.get(certFile);
  if (hit && hit.mtime === mtime) return hit.ctx;
  const ctx = createSecureContext({ cert: readFileSync(certFile), key: readFileSync(keyFile) });
  ctxCache.set(certFile, { mtime, ctx });
  return ctx;
}
const localCtx = () => contextFor('certs/server.pem', 'certs/server.key');
const tsCtx = () => contextFor('certs/ts.pem', 'certs/ts.key');
// The Tailscale certificate (certs/ts.pem + ts.key) is written by renew-ts-cert.mjs,
// run from a terminal session (the daily veille launcher does it). Reading Tailscale's
// folder from this background process would block on a macOS privacy prompt.

const server = createServer({
  key: readFileSync('certs/server.key'), cert: readFileSync('certs/server.pem'),
  SNICallback: (name, cb) => cb(null, (name.endsWith('.ts.net') ? tsCtx() : null) || localCtx()),
}, async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'https://x').pathname);
  try {
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (path === '/ca.pem') return serveStatic(res, 'certs/ca.pem', MIME['.pem']);           // the phone downloads the certificate from here
    const file = join('public', normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (path !== '/' && !path.startsWith('/t/') && existsSync(file) && extname(file)) return serveStatic(res, file, MIME[extname(file)] || 'application/octet-stream');
    return serveStatic(res, 'public/index.html', MIME['.html']);                             // app shell: / and /t/<waId>
  } catch (e) {
    console.error(req.method, path, e.message);
    json(res, 500, { error: e.message });
  }
});

// Plain-HTTP helper on PORT+1: serves the certificate (a phone cannot download it
// over HTTPS before trusting it) and sends everything else to the HTTPS address.
createHttp((req, res) => {
  if (new URL(req.url, 'http://x').pathname === '/ca.pem') {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="wati-inbox-ca.crt"' });
    return res.end(readFileSync('certs/ca.pem'));
  }
  res.writeHead(302, { Location: `https://${(req.headers.host || 'localhost').replace(/:\d+$/, '')}:${PORT}${req.url}` });
  res.end();
}).listen(PORT + 1);

server.listen(PORT, () => {
  console.log(`Wati Inbox on https://localhost:${PORT}  ·  https://${TS_HOST}:${PORT}`);
  startPolling();
});
