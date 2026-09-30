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
import { db, inbox, getThread as storedThread, threadMessages, saveThread, latestSuggestion, latestLesson, wantSuggestion, setMuted, sentTemplates, logSend, addSubscription, removeSubscription, subscriptions, tmFlags, tmFlagSeen, tmFlagCounts, tmThread, setOffer, getOffer , setHandled, suggestionVisible } from './db.mjs';
import { sendText, sendTemplate, frenchTemplates, getThread as liveThread, getContact } from './wati.mjs';
import { refreshThread, startPolling } from './poll.mjs';
import { requestSuggestion, suggestStatus } from './suggest-engine.mjs';
import { learnFromSend, learnStatus } from './learn-engine.mjs';
import { MOVES, DOWNSELL, DOWNSELL_LABELS, ACOMPTE, FORMATS, LEVELS, monthsFor, describeOffer, currencyFor } from './directions.mjs';
import { startTmMonitor, tmStatus, review as tmReview } from './tm-monitor.mjs';
import { tbcState, tbcWatchStatus, SALES_HUB_URL, CLOSED_TEMPLATE } from './tbc-watch.mjs';
import { startConsolidating } from './consolidate-engine.mjs';
import { openTbcAlerts, openTbcAlert, tbcAlertById, setTbcAlertState, tbcAlertCounts } from './db.mjs';

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
  const fresh = /\.(html|js|css|webmanifest)$/.test(file); // the app itself: always revalidate, so an update reaches the phone on the next open
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': fresh ? 'no-cache' : 'max-age=86400' });
  res.end(readFileSync(file));
}

const refreshing = new Set(); // wa_id → a background Wati read is running
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── bubble queue ─────────────────────────────────────────────────────────────
// A reply is 2–3 bubbles. WhatsApp shows them as three separate messages, so they must not
// land in the same second: the first goes out at once, each following one waits 5–10 s
// (5 s + 20 ms per character, capped) — about the time it takes to type it. The queue lives
// here so the phone can lock or lose the network and the bubbles still go out.
const sending = new Map(); // wa_id → { sent, total, error }
// The "dans 5-10 min" block of an administration two-step: the Mac sends it later, the phone can lock.
const scheduled = new Map(); // wa_id → { bubbles, meta, at, timer }
function scheduleSend(waId, bubbles, meta, delayMs) {
  cancelScheduled(waId);
  const at = new Date(Date.now() + delayMs).toISOString();
  const timer = setTimeout(async () => {
    scheduled.delete(waId);
    const t = storedThread(waId);
    if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) { logSend(waId, 'text', { text: bubbles[0], ...meta }, false, 'fenêtre fermée au moment de l’envoi différé'); return; }
    try { await sendText(waId, bubbles[0]); logSend(waId, 'text', { text: bubbles[0], ...meta }, true); }
    catch (e) { logSend(waId, 'text', { text: bubbles[0], ...meta }, false, e.message); sending.set(waId, { sent: 0, total: bubbles.length, error: `Envoi différé raté : ${e.message}` }); setTimeout(() => sending.delete(waId), 90_000); return; }
    saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[0].slice(0, 200) });
    if (bubbles.length === 1) { refreshThread(waId, t.name, { notify: false }).catch(() => {}); learnFromSend(waId, bubbles, meta); }
    else sendRest(waId, t, bubbles, meta);
  }, delayMs);
  scheduled.set(waId, { bubbles, meta, at, timer });
}
function cancelScheduled(waId) { const p = scheduled.get(waId); if (p) { clearTimeout(p.timer); scheduled.delete(waId); return true; } return false; }
const typingGap = (text) => 5000 + Math.min(5000, text.length * 20);
function sendRest(waId, t, bubbles, meta) {
  const state = { sent: 1, total: bubbles.length, error: null };
  sending.set(waId, state);
  (async () => {
    for (let i = 1; i < bubbles.length; i++) {
      await sleep(typingGap(bubbles[i]));
      try { await sendText(waId, bubbles[i]); logSend(waId, 'text', { text: bubbles[i], ...meta }, true); state.sent = i + 1; }
      catch (e) { logSend(waId, 'text', { text: bubbles[i] }, false, e.message); state.error = `Bulle ${i + 1}/${bubbles.length} non envoyée : ${e.message}`; console.error('send', waId, e.message); break; }
      saveThread({ ...storedThread(waId), pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[i].slice(0, 200) });
      refreshThread(waId, t.name, { notify: false }).catch(() => {});
    }
    await refreshThread(waId, t.name, { notify: false }).catch(() => {});
    if (state.error) setTimeout(() => sending.delete(waId), 90_000); // keep the failure on screen for a while
    else { sending.delete(waId); learnFromSend(waId, bubbles, meta); } // every bubble out: learn from what Ali sent
  })();
}

// Where the lead stands in the Sales Hub sequence, plus the open alert if any.
function tbcInfo(waId) {
  let st = null; try { st = tbcState(waId); } catch {}
  const a = openTbcAlert(waId);
  return {
    day0: st?.day0 || null,
    next: st?.next ? { n: st.next.n, tpl: st.next.tpl, firesAt: st.next.firesAt, text: st.next.text, skipped: false } : null,
    leadWaiting: !!st?.leadWaiting,
    alert: a ? { ...a, bubbles: a.bubbles ? JSON.parse(a.bubbles) : [] } : null,
    closedTemplate: CLOSED_TEMPLATE,
    salesHub: SALES_HUB_URL,
  };
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
    const freshSuggestion = (t) => { const s = latestSuggestion(t.wa_id); return suggestionVisible(t, s, { laterScheduled: scheduled.has(t.wa_id) }) ? (s.kind === 'needs' ? 'needs' : s.kind === 'skip' ? false : true) : false; };
    // Only conversations whose 24h window is open (2026-09-29): a closed one can still be opened by number.
    const threads = inbox().filter((t) => !!t.last_inbound_at && hoursSince(t.last_inbound_at) < 24)
      .map((t) => ({ ...t, windowOpen: true, hoursSinceLead: hoursSince(t.last_inbound_at), suggested: freshSuggestion(t), suggesting: suggestStatus(t.wa_id)?.state || null }));
    return json(res, 200, { threads, tm: tmFlagCounts(), tbc: openTbcAlerts().map((a) => ({ ...a, bubbles: a.bubbles ? JSON.parse(a.bubbles) : [] })), salesHub: SALES_HUB_URL });
  }
  if (path === '/api/directions') return json(res, 200, { moves: MOVES.map(({ id, label, sub, input }) => ({ id, label, sub: sub || null, input: input || null })), downsell: DOWNSELL.map((id) => ({ id, label: DOWNSELL_LABELS[id] })), acompte: ACOMPTE, formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label })), levels: LEVELS });
  // France TM: what Claude flagged on the booking bot (tm-monitor.mjs).
  if (path === '/api/tm') return json(res, 200, { flags: tmFlags(120), status: tmStatus() });
  if (path === '/api/tm/review' && req.method === 'POST') { tmReview('ali').catch(() => {}); return json(res, 200, { ok: true }); }
  const tmf = /^\/api\/tm\/flag\/(\d+)$/.exec(path);
  if (tmf && req.method === 'POST') { const b = await body(req); tmFlagSeen(Number(tmf[1]), b.seen !== false); return json(res, 200, { ok: true }); }
  const tmt = /^\/api\/tm\/thread\/(\d{8,15})$/.exec(path);
  if (tmt) return json(res, 200, { messages: tmThread(tmt[1], 60) });
  if (path === '/api/push') {
    if (req.method === 'GET') return json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY || null, endpoints: subscriptions().map((s) => s.endpoint) });
    if (req.method === 'POST') { const b = await body(req); const s = b.subscription || b; if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json(res, 400, { error: 'bad subscription' }); addSubscription(s, (req.headers['user-agent'] || '').slice(0, 200)); return json(res, 200, { ok: true }); }
    if (req.method === 'DELETE') { const b = await body(req); if (b.endpoint) removeSubscription(b.endpoint); return json(res, 200, { ok: true }); }
  }
  if (path === '/api/templates') return json(res, 200, { templates: await frenchTemplates() });

  const m = /^\/api\/thread\/(\d{8,15})(?:\/(send|template|handled|refresh|suggest|mute|offer|cancel|tbc))?$/.exec(path);
  if (!m) return json(res, 404, { error: 'not found' });
  const waId = m[1], action = m[2];

  if (!action && req.method === 'GET') {
    let t = storedThread(waId);
    let stale = false;
    if (!t) { try { await refreshThread(waId, null, { notify: false }); } catch (e) { console.error('refresh', waId, e.message); } t = storedThread(waId); }
    else if (hoursSince(t.updated_at || 0) > 1 / 120 && !refreshing.has(waId)) {
      // Known thread, last read more than 30 s ago: answer now from the store (the screen opens
      // instantly) and read Wati in the background; the app re-reads the thread a few seconds later.
      stale = true; refreshing.add(waId);
      refreshThread(waId, t.name, { notify: false }).catch((e) => console.error('refresh', waId, e.message)).finally(() => refreshing.delete(waId));
    }
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
      suggestion: suggestionVisible(t, sugg, { laterScheduled: scheduled.has(waId) }) ? { id: sugg.id, created_at: sugg.created_at, options: JSON.parse(sugg.options), note: sugg.note || '', source: sugg.source || '', instruction: sugg.instruction || '', kind: sugg.kind || 'draft', needs: sugg.needs || '', moves: sugg.moves ? JSON.parse(sugg.moves) : [] } : null,
      suggesting: suggestStatus(waId),
      learning: learnStatus(waId),
      lastLesson: latestLesson(waId) || null,
      offer: getOffer(waId),
      offerText: describeOffer(getOffer(waId), currencyFor(t.country)),
      currency: currencyFor(t.country),
      scheduled: scheduled.has(waId) ? { at: scheduled.get(waId).at, bubbles: scheduled.get(waId).bubbles } : null,
      tbc: tbcInfo(waId),
      stale,
      sending: sending.get(waId) || null,
    });
  }
  if (action === 'refresh') { await refreshThread(waId, storedThread(waId)?.name, { notify: false }); return json(res, 200, { ok: true }); }
  if (action === 'suggest') {
    if (!storedThread(waId)) return json(res, 404, { error: 'Conversation inconnue' });
    const b = req.method === 'POST' ? await body(req) : {};
    const direction = { moves: Array.isArray(b.moves) ? b.moves.map(String) : [], level: String(b.level || ''), level2: String(b.level2 || ''), until: String(b.until || '').trim(), instruction: String(b.instruction || '').trim() };
    if (!direction.moves.length && !direction.instruction) direction.auto = true; // nothing chosen: Claude picks the moves
    wantSuggestion(waId); requestSuggestion(waId, direction);
    return json(res, 200, { ok: true });
  }
  if (action === 'offer' && req.method === 'POST') {
    const b = await body(req);
    const offer = b.format && FORMATS[b.format] ? { format: b.format, level: LEVELS.includes(b.level) ? b.level : '', hpw: Math.min(7, Math.max(0, Number(b.hpw) || 0)) || null, months: Number(b.months) || null } : null;
    if (offer && !offer.months) offer.months = monthsFor(FORMATS[offer.format].hours, offer.hpw);
    setOffer(waId, offer);
    return json(res, 200, { ok: true, offer, offerText: describeOffer(offer, currencyFor(storedThread(waId)?.country)) });
  }
  if (action === 'cancel' && req.method === 'POST') return json(res, 200, { ok: true, cancelled: cancelScheduled(waId) });
  // Sales Hub alert: Ali says he paused the step there (we only record his word), or tells us to let it go.
  if (action === 'tbc' && req.method === 'POST') {
    const b = await body(req);
    const a = tbcAlertById(Number(b.id));
    if (!a || a.wa_id !== waId) return json(res, 404, { error: 'Alerte inconnue' });
    if (b.action === 'paused' && a.state === 'open') setTbcAlertState(a.id, 'paused');
    else if (b.action === 'ignore' && (a.state === 'open' || a.state === 'paused')) setTbcAlertState(a.id, 'ignored');
    else return json(res, 400, { error: 'Action impossible dans cet état' });
    return json(res, 200, { ok: true, tbc: tbcInfo(waId) });
  }
  if (action === 'mute') { const b = await body(req); setMuted(waId, !!b.muted); return json(res, 200, { ok: true }); }
  if (action === 'handled') { const t = storedThread(waId); if (t) setHandled(waId, t.last_inbound_at || new Date().toISOString()); return json(res, 200, { ok: true }); }
  if (action === 'send' && req.method === 'POST') {
    const b = await body(req);
    const bubbles = (b.bubbles || []).map((s) => String(s).trim()).filter(Boolean);
    if (!bubbles.length) return json(res, 400, { error: 'Message vide' });
    const t = storedThread(waId);
    if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) return json(res, 409, { error: 'Fenêtre de 24h fermée — utilisez un template' });
    if (sending.has(waId) && !sending.get(waId).error) return json(res, 409, { error: 'Envoi en cours pour ce lead — attendez que les bulles soient parties' });
    // What was on screen when Ali sent: the fresh suggestion (even if he typed his own text), so the
    // learning step can compare. edited is recomputed here from the real bubbles.
    const shown = latestSuggestion(waId);
    const freshShown = shown && (!t.last_inbound_at || shown.created_at >= t.last_inbound_at) ? shown : null;
    const ref = b.suggestionId && (!freshShown || freshShown.id === b.suggestionId) ? b.suggestionId : freshShown?.id ?? null;
    const part = b.part === 'later' ? 'later' : 'now';
    const opt0 = ref ? (JSON.parse((ref === freshShown?.id ? freshShown : latestSuggestion(waId)).options)[b.option ?? 0] || null) : null;
    const opt = opt0 && part === 'later' ? { bubbles: opt0.later || [] } : opt0;
    const same = !!opt && opt.bubbles.length === bubbles.length && opt.bubbles.every((x, i) => x.trim() === bubbles[i]);
    const meta = ref ? { suggestionId: ref, option: b.option ?? 0, part, edited: !same, fromSuggestion: !!b.suggestionId, batch: String(Date.now()) } : { batch: String(Date.now()) };
    // A follow-up from a Sales Hub alert card only leaves once Ali confirmed the pause there.
    const alert = b.alertId ? tbcAlertById(Number(b.alertId)) : null;
    if (alert && alert.wa_id === waId) { if (alert.state !== 'paused') return json(res, 409, { error: 'Confirmez d’abord la pause dans le Sales Hub' }); meta.alertId = alert.id; }
    const delayMs = Math.min(20 * 60_000, Math.max(0, Number(b.delayMs) || 0));
    if (delayMs) { scheduleSend(waId, bubbles, meta, delayMs); return json(res, 200, { ok: true, scheduled: new Date(Date.now() + delayMs).toISOString() }); }
    // First bubble right away, so a refusal (window closed, Wati down) comes back to the screen.
    try { await sendText(waId, bubbles[0]); logSend(waId, 'text', { text: bubbles[0], ...meta }, true); }
    catch (e) { logSend(waId, 'text', { text: bubbles[0] }, false, e.message); return json(res, 502, { error: e.message, sent: [] }); }
    saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[0].slice(0, 200) });
    if (meta.alertId) setTbcAlertState(meta.alertId, 'sent');
    if (bubbles.length === 1) { refreshThread(waId, t.name, { notify: false }).catch(() => {}); learnFromSend(waId, bubbles, meta); }
    else sendRest(waId, t, bubbles, meta); // the others follow in the background, one every 5–10 s; learning runs when the last one is out
    return json(res, 200, { ok: true, sent: 1, total: bubbles.length });
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
    const alert = b.alertId ? tbcAlertById(Number(b.alertId)) : null; // follow-up sent as a template from a Sales Hub card
    if (alert && alert.wa_id === waId && alert.state === 'paused') setTbcAlertState(alert.id, 'sent');
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
  startTmMonitor();
  startConsolidating();
});
