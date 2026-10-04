import { spawn } from 'node:child_process';
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
import { insertScheduled, setScheduledState, setScheduledBubbles, pendingScheduled, missedScheduled, markScheduledSeen, followupsOf, pendingFollowups, scheduledById, updateFollowup, markFollowupSeen } from './db.mjs';
import { pushAll } from './push.mjs';
import { db, inbox, getThread as storedThread, threadMessages, saveThread, latestSuggestion, getSuggestion, setSuggestionEdited, latestLesson, wantSuggestion, setMuted, sentTemplates, logSend, addSubscription, removeSubscription, subscriptions, tmFlags, tmFlagSeen, tmFlagVerdict, tmFlagCounts, tmThread, setOffer, getOffer , setHandled, suggestionVisible } from './db.mjs';
import { sendText, sendTemplate, frenchTemplates, getThread as liveThread, getContact } from './wati.mjs';
import { refreshThread, startPolling } from './poll.mjs';
import { requestSuggestion, suggestStatus } from './suggest-engine.mjs';
import { learnFromSend, learnStatus } from './learn-engine.mjs';
import { transcribe, transcribeStatus, startDictation } from './transcribe.mjs';
import { MOVES, DOWNSELL, DOWNSELL_LABELS, ACOMPTE, FORMATS, LEVELS, MONTHS, monthsFor, describeOffer, currencyFor } from './directions.mjs';
import { startTmMonitor, tmStatus, review as tmReview } from './tm-monitor.mjs';
import { tbcState, tbcWatchStatus, SALES_HUB_URL, CLOSED_TEMPLATE } from './tbc-watch.mjs';
import { startConsolidating } from './consolidate-engine.mjs';
import { openTbcAlerts, openTbcAlert, tbcAlertById, setTbcAlertState, tbcAlertCounts, planItems, planItemById, setPlanState, openPlanItems, planCounts, closePlanItems } from './db.mjs';
import { startHubSync, hubNextFor, hubStatus } from './hub-sync.mjs';
import { startPlanning, plan as runPlan, planStatus, today as planToday, ignore as planIgnore, afterAliMessage, citfToday, madridIso } from './plan-engine.mjs';

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
const nextDay = (day) => { const t = new Date(`${day}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((ok, ko) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) ko(new Error('too big')); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { ko(new Error('bad json')); } }); });
const rawBody = (req, max = 30e6) => new Promise((ok, ko) => { const chunks = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > max) { ko(new Error('too big')); req.destroy(); } else chunks.push(c); }); req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', ko); });
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
const scheduled = new Map(); // wa_id → { id, bubbles, meta, at, timer } — mirror of the pending rows of scheduled_sends
// id: the scheduled_sends row (re-arming at startup); without it a new row is written.
function scheduleSend(waId, bubbles, meta, delayMs, { id = null } = {}) {
  cancelScheduled(waId);
  const at = id ? pendingScheduled().find((r) => r.id === id)?.at || new Date(Date.now() + delayMs).toISOString() : new Date(Date.now() + delayMs).toISOString();
  const rowId = id || insertScheduled(waId, bubbles, meta, at);
  const timer = setTimeout(() => fireScheduled(rowId, waId, bubbles, meta), Math.max(0, delayMs));
  scheduled.set(waId, { id: rowId, bubbles, meta, at, timer });
}
async function fireScheduled(rowId, waId, bubbles, meta) {
  scheduled.delete(waId);
  const row = pendingScheduled().find((x) => x.id === rowId);
  if (row && Date.now() - Date.parse(row.at) > 2 * 60_000) { // late (the Mac slept): check Wati first, a lead who wrote since stops it
    try { await refreshThread(waId, storedThread(waId)?.name, { notify: true }); } catch {}
    const f = storedThread(waId);
    if (f?.last_inbound_at && f.last_inbound_at > row.created_at) { setScheduledState(rowId, 'missed', `not sent: ${f.name || 'the lead'} wrote at ${fmtHMm(f.last_inbound_at)}, after it was scheduled`); pushAll({ title: `Part 2 NOT sent · ${f.name || waId}`, body: 'The lead wrote while the Mac was asleep. Open the thread.', tag: `missed-${waId}`, url: `/t/${waId}` }).catch(() => {}); return; }
  }
  const t = storedThread(waId);
  if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) { logSend(waId, 'text', { text: bubbles[0], ...meta }, false, 'window closed at the time of the delayed send'); setScheduledState(rowId, 'skipped', 'window closed at the time of the delayed send'); return; }
  try { await sendText(waId, bubbles[0]); logSend(waId, 'text', { text: bubbles[0], ...meta }, true); setScheduledState(rowId, 'sent'); }
  catch (e) { logSend(waId, 'text', { text: bubbles[0], ...meta }, false, e.message); setScheduledState(rowId, 'failed', e.message); sending.set(waId, { sent: 0, total: bubbles.length, error: `Delayed send failed: ${e.message}` }); setTimeout(() => sending.delete(waId), 90_000); return; }
  saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[0].slice(0, 200) });
  if (bubbles.length === 1) { refreshThread(waId, t.name, { notify: false }).catch(() => {}); learnFromSend(waId, bubbles, meta); }
  else sendRest(waId, t, bubbles, meta);
}
function cancelScheduled(waId) { const p = scheduled.get(waId); if (p) { clearTimeout(p.timer); scheduled.delete(waId); setScheduledState(p.id, 'cancelled'); return true; } return false; }
// At startup: re-arm what was pending. Due while the app was down: sent at once if less than 30 min late, otherwise
// marked « missed », a push to Ali and a red card in the thread — never a silent loss (Boris, 2026-10-03).
async function restoreScheduled() {
  const rows = pendingScheduled();
  if (!rows.length) { console.log('scheduled: nothing pending'); return; }
  for (const r of rows) {
    const bubbles = JSON.parse(r.bubbles), meta = JSON.parse(r.meta || '{}'), late = Date.now() - Date.parse(r.at);
    if (r.kind === 'followup') continue; // sent by the follow-up ticker, which reads the table itself
    if (r.kind === 'rest') { // bubbles cut by the restart, mid-send
      const t = storedThread(r.wa_id);
      if (!bubbles.length) { setScheduledState(r.id, 'sent'); continue; }
      if (late > 30 * 60_000 || !t) {
        setScheduledState(r.id, 'missed', 'the app restarted while these bubbles were going out');
        console.log(`scheduled: MISSED rest #${r.id} for ${t?.name || r.wa_id} (${bubbles.length} bubble(s))`);
        if (t) pushAll({ title: `${bubbles.length} bubble(s) NOT sent · ${t.name || r.wa_id}`, body: `« ${bubbles[0].slice(0, 80)} » — send by hand`, tag: `missed-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {});
        continue;
      }
      console.log(`scheduled: resuming ${bubbles.length} bubble(s) cut by the restart for ${t.name || r.wa_id}`);
      sendRest(r.wa_id, t, ['', ...bubbles], meta, { first: 1, rowId: r.id });
      continue;
    }
    if (late > 30 * 60_000) {
      setScheduledState(r.id, 'missed', `the app was not running at ${r.at.slice(11, 16)}Z`);
      const t = storedThread(r.wa_id);
      console.log(`scheduled: MISSED #${r.id} for ${t?.name || r.wa_id}, due ${r.at}`);
      if (t) pushAll({ title: `Part 2 NOT sent · ${t.name || r.wa_id}`, body: 'The app was down when it was due. Open the thread and send it by hand.', tag: `missed-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {});
      continue;
    }
    console.log(`scheduled: re-armed #${r.id} for ${r.wa_id}${late > 0 ? `, ${Math.round(late / 1000)} s late, sending now` : `, due ${r.at}`}`);
    scheduleSend(r.wa_id, bubbles, meta, Math.max(0, Date.parse(r.at) - Date.now()), { id: r.id });
  }
}
const typingGap = (text) => 10000 + Math.min(5000, text.length * 25); // 10-15 s between bubbles (Ali, 2026-10-04), like someone typing
// The bubbles still to go are kept on disk (scheduled_sends, kind 'rest') until they are all out, so a restart of the app
// resumes them instead of dropping them (Joanna, 2026-10-04). first = index of the first bubble still to send.
function sendRest(waId, t, bubbles, meta, { first = 1, rowId = null } = {}) {
  const state = { sent: first, total: bubbles.length, error: null };
  sending.set(waId, state);
  const row = rowId || insertScheduled(waId, bubbles.slice(first), meta, new Date().toISOString(), 'rest');
  (async () => {
    for (let i = first; i < bubbles.length; i++) {
      await sleep(typingGap(bubbles[i]));
      try { await sendText(waId, bubbles[i]); logSend(waId, 'text', { text: bubbles[i], ...meta }, true); state.sent = i + 1; setScheduledBubbles(row, bubbles.slice(i + 1)); }
      catch (e) { logSend(waId, 'text', { text: bubbles[i] }, false, e.message); state.error = `Bulle ${i + 1}/${bubbles.length} non envoyée : ${e.message}`; console.error('send', waId, e.message); setScheduledState(row, 'failed', e.message); break; }
      saveThread({ ...storedThread(waId), pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[i].slice(0, 200) });
      refreshThread(waId, t.name, { notify: false }).catch(() => {});
    }
    await refreshThread(waId, t.name, { notify: false }).catch(() => {});
    if (state.error) setTimeout(() => sending.delete(waId), 90_000); // keep the failure on screen for a while
    else { setScheduledState(row, 'sent'); sending.delete(waId); if (!rowId) learnFromSend(waId, bubbles, meta); } // every bubble out: learn from what Ali sent (not after a resume: part of it went before the restart)
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
    if (String(b.password || '') !== PASSWORD) return json(res, 401, { error: 'Wrong password' });
    setCookie(res);
    return json(res, 200, { ok: true });
  }
  if (!authed(req)) return json(res, 401, { error: 'login' });

  // Dictation (Ali, 2026-10-01): the browser posts a 16 kHz mono WAV, the Mac transcribes it (Whisper, local, free).
  if (path === '/api/transcribe' && req.method === 'POST') {
    const wav = await rawBody(req);
    if (wav.length < 1000) return json(res, 400, { error: 'No audio' });
    const q = new URL(req.url, 'https://x').searchParams;
    try { return json(res, 200, await transcribe(wav, { language: q.get('lang') || null, prompt: (q.get('prompt') || '').slice(0, 300) || null, fast: q.get('fast') === '1' })); }
    catch (e) { console.error('transcribe:', e.message); return json(res, 503, { error: e.message }); }
  }
  if (path === '/api/transcribe') return json(res, 200, transcribeStatus());

  if (path === '/api/inbox') {
    const freshSuggestion = (t) => { const s = latestSuggestion(t.wa_id); return suggestionVisible(t, s, { laterScheduled: scheduled.has(t.wa_id) }) ? (s.kind === 'needs' ? 'needs' : s.kind === 'skip' ? false : true) : false; };
    // Only conversations whose 24h window is open (2026-09-29): a closed one can still be opened by number.
    const threads = inbox().filter((t) => !!t.last_inbound_at && hoursSince(t.last_inbound_at) < 24)
      .map((t) => ({ ...t, windowOpen: true, hoursSinceLead: hoursSince(t.last_inbound_at), suggested: freshSuggestion(t), suggesting: suggestStatus(t.wa_id)?.state || null }));
    return json(res, 200, { threads, tm: tmFlagCounts(), tbc: openTbcAlerts().map((a) => ({ ...a, bubbles: a.bubbles ? JSON.parse(a.bubbles) : [] })), salesHub: SALES_HUB_URL, plan: planStatus().ready ? { ...planCounts(planToday()), next: openPlanItems().filter((i) => i.kind !== 'ok' && i.kind !== 'wait').slice(0, 3).map((i) => ({ id: i.id, wa_id: i.wa_id, name: i.name, kind: i.kind, title: i.title, when_at: i.when_at })) } : null });
  }
  if (path === '/api/directions') return json(res, 200, { months: MONTHS, moves: MOVES.map(({ id, label, sub, input }) => ({ id, label, sub: sub || null, input: input || null })), downsell: DOWNSELL.map((id) => ({ id, label: DOWNSELL_LABELS[id] })), acompte: ACOMPTE, formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label })), levels: LEVELS });
  // France TM: what Claude flagged on the booking bot (tm-monitor.mjs).
  if (path === '/api/tm') return json(res, 200, { flags: tmFlags(120), status: tmStatus() });
  if (path === '/api/tm/review' && req.method === 'POST') { tmReview('ali').catch(() => {}); return json(res, 200, { ok: true }); }
  const tmf = /^\/api\/tm\/flag\/(\d+)$/.exec(path);
  if (tmf && req.method === 'POST') {
    const b = await body(req);
    // « Pas une erreur » : Ali says the bot behaved as intended; the next reviews read these cases and stop flagging them.
    if ('notIssue' in b) tmFlagVerdict(Number(tmf[1]), b.notIssue ? 'not_issue' : null);
    else tmFlagSeen(Number(tmf[1]), b.seen !== false);
    return json(res, 200, { ok: true });
  }
  const tmt = /^\/api\/tm\/thread\/(\d{8,15})$/.exec(path);
  if (tmt) return json(res, 200, { messages: tmThread(tmt[1], 60) });
  // The day plan (plan-engine.mjs): the cards, their state, and Ali's verdicts.
  const planItem = (i) => { const h = hubNextFor(i.wa_id); const skip = i.skip_templates ? JSON.parse(i.skip_templates) : [], keep = i.keep_templates ? JSON.parse(i.keep_templates) : []; const stepsOf = (list) => list.map((t) => { const u = (h?.upcoming || []).find((x) => x.template === t); return u ? { step: u.step, template: t, at: u.at } : { step: null, template: t, at: null }; }); return { ...i, bubbles: i.bubbles ? JSON.parse(i.bubbles) : [], skip_templates: skip, keep_templates: keep,
    skip_steps: stepsOf(skip), keep_steps: stepsOf(keep),
    meeting_date: h?.meetingDate || null, recent: !!h?.meetingDate && h.meetingDate >= new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), hub_paused_now: !!h?.paused, real_next: h?.realNext || null }; };
  if (path === '/api/plan') return json(res, 200, { scheduled: pendingFollowups().map((r) => ({ ...followupView(r), wa_id: r.wa_id, name: storedThread(r.wa_id)?.name || r.wa_id })), day: planToday(), items: planItems(planToday()).map(planItem), ahead: openPlanItems().filter((i) => i.day > planToday()).map(planItem), counts: planCounts(planToday()), status: planStatus(), hub: hubStatus(), salesHub: SALES_HUB_URL, citf: planStatus().ready ? citfToday() : [] });
  const ms = /^\/api\/thread\/(\d{8,15})\/missed-seen$/.exec(path);
  if (ms && req.method === 'POST') { markScheduledSeen(ms[1]); return json(res, 200, { ok: true }); }
  if (path === '/api/plan/ignore' && req.method === 'POST') { const b = await body(req); const wa = String(b.waId || '').replace(/\D/g, ''); if (!wa) return json(res, 400, { error: 'Missing number' }); return json(res, 200, { ok: true, ignored: planIgnore(wa, b.on !== false) }); }
  if (path === '/api/plan/run' && req.method === 'POST') { runPlan({ scope: 'all', reason: 'ali' }).catch(() => {}); return json(res, 200, { ok: true }); }
  const pli = /^\/api\/plan\/(\d+)$/.exec(path);
  if (pli && req.method === 'POST') {
    const b = await body(req); const i = planItemById(Number(pli[1]));
    if (!i) return json(res, 404, { error: 'Unknown card' });
    const state = ['done', 'dismissed', 'open'].includes(b.state) ? b.state : null;
    if (!state) return json(res, 400, { error: 'Unknown state' });
    setPlanState(i.id, state, b.note ? String(b.note).slice(0, 3000) : null);
    return json(res, 200, { ok: true, item: planItem(planItemById(i.id)) });
  }
  if (path === '/api/push') {
    if (req.method === 'GET') return json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY || null, endpoints: subscriptions().map((s) => s.endpoint) });
    if (req.method === 'POST') { const b = await body(req); const s = b.subscription || b; if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json(res, 400, { error: 'bad subscription' }); addSubscription(s, (req.headers['user-agent'] || '').slice(0, 200)); return json(res, 200, { ok: true }); }
    if (req.method === 'DELETE') { const b = await body(req); if (b.endpoint) removeSubscription(b.endpoint); return json(res, 200, { ok: true }); }
  }
  if (path === '/api/templates') return json(res, 200, { templates: await frenchTemplates() });

  const fu = /^\/api\/thread\/(\d{8,15})\/followups(?:\/(\d+))?(?:\/(seen))?$/.exec(path);
  if (fu) {
    const waId = fu[1], id = fu[2] ? Number(fu[2]) : null;
    if (!id && req.method === 'GET') return json(res, 200, { followups: followupsOf(waId).map(followupView) });
    const b = req.method === 'POST' || req.method === 'PATCH' ? await body(req) : {};
    const bubbles = Array.isArray(b.bubbles) ? b.bubbles.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : null;
    if (!id && req.method === 'POST') {
      let tplBubbles = null, meta = b.suggestionId ? { suggestionId: Number(b.suggestionId), option: 0, part: 'now', fromSuggestion: true } : {};
      if (b.template) { // a scheduled template: shown as its text with the parameters filled in
        const tpl = (await frenchTemplates()).find((x) => x.name === b.template);
        if (!tpl) return json(res, 400, { error: 'Unknown or unapproved template' });
        const params = Object.fromEntries(tpl.params.map((p) => [p, String(b.params?.[p] ?? '')]));
        let i = 0; tplBubbles = [tpl.body.replace(/\{\{[^}]*\}\}/g, () => params[tpl.params[i++]] || '…')];
        meta = { template: tpl.name, params };
      }
      if (!tplBubbles && !bubbles?.length) return json(res, 400, { error: 'Write the follow-up first' });
      const at = followupAt(b), why = followupCheck(waId, at, { template: !!tplBubbles }); if (why) return json(res, 400, { error: why });
      const rid = insertScheduled(waId, tplBubbles || bubbles, meta, at, 'followup');
      if (b.planId) setPlanState(Number(b.planId), 'done', `scheduled for ${fmtHMm(at)}`);
      return json(res, 200, { ok: true, followup: followupView(scheduledById(rid)) });
    }
    const row = id ? scheduledById(id) : null;
    if (!row || row.wa_id !== waId || row.kind !== 'followup') return json(res, 404, { error: 'Follow-up not found' });
    if (fu[3] === 'seen' && req.method === 'POST') { markFollowupSeen(id); return json(res, 200, { ok: true }); }
    if (req.method === 'PATCH') {
      if (row.state !== 'pending') return json(res, 409, { error: 'Already sent or cancelled' });
      const isTpl = !!JSON.parse(row.meta || '{}').template;
      const at = b.at ? followupAt(b) : row.at, why = followupCheck(waId, at, { template: isTpl }); if (why) return json(res, 400, { error: why });
      updateFollowup(id, bubbles?.length && !isTpl ? bubbles : JSON.parse(row.bubbles), at); // a template's text cannot change
      return json(res, 200, { ok: true, followup: followupView(scheduledById(id)) });
    }
    if (req.method === 'DELETE') { if (row.state === 'pending') setScheduledState(id, 'cancelled', 'cancelled by Ali'); markFollowupSeen(id); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: 'method' });
  }
  const m = /^\/api\/thread\/(\d{8,15})(?:\/(send|template|handled|refresh|suggest|mute|offer|cancel|tbc|edit))?$/.exec(path);
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
      suggestion: suggestionVisible(t, sugg, { laterScheduled: scheduled.has(waId) }) ? { id: sugg.id, created_at: sugg.created_at, options: JSON.parse(sugg.options), edited: sugg.edited ? JSON.parse(sugg.edited) : null, note: sugg.note || '', source: sugg.source || '', instruction: sugg.instruction || '', kind: sugg.kind || 'draft', needs: sugg.needs || '', moves: sugg.moves ? JSON.parse(sugg.moves) : [] } : null,
      suggesting: suggestStatus(waId),
      learning: learnStatus(waId),
      lastLesson: latestLesson(waId) || null,
      offer: getOffer(waId),
      offerText: describeOffer(getOffer(waId), currencyFor(t.country)),
      currency: currencyFor(t.country),
      scheduled: scheduled.has(waId) ? { at: scheduled.get(waId).at, bubbles: scheduled.get(waId).bubbles } : null,
      followups: followupsOf(waId).map(followupView),
      scheduledMissed: (() => { const m = missedScheduled(waId); return m ? { id: m.id, at: m.at, bubbles: JSON.parse(m.bubbles) } : null; })(),
      tbc: tbcInfo(waId),
      hub: hubNextFor(waId),
      plan: openPlanItems(waId).map(planItem)[0] || null,
      plans: openPlanItems(waId).map(planItem).sort((a, b) => String(a.when_at || '9').localeCompare(String(b.when_at || '9'))),
      stale,
      sending: sending.get(waId) || null,
    });
  }
  if (action === 'refresh') { await refreshThread(waId, storedThread(waId)?.name, { notify: false }); return json(res, 200, { ok: true }); }
  if (action === 'suggest') {
    if (!storedThread(waId)) return json(res, 404, { error: 'Unknown conversation' });
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
  // Ali saves his edit of a draft (Ali, 2026-10-01): the saved bubbles are what the card shows and sends, on every device;
  // Claude's original stays in `options` for the learning. Empty `bubbles`/`later` = back to the original for that part.
  if (action === 'edit' && req.method === 'POST') {
    const b = await body(req);
    const s = getSuggestion(Number(b.suggestionId));
    if (!s || s.wa_id !== waId) return json(res, 404, { error: 'Unknown draft' });
    const clean = (arr) => Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : null;
    const prev = s.edited ? JSON.parse(s.edited) : {};
    const edited = { ...prev };
    if ('bubbles' in b) { const v = clean(b.bubbles); if (v?.length) edited.bubbles = v; else delete edited.bubbles; }
    if ('later' in b) { const v = clean(b.later); if (v?.length) edited.later = v; else delete edited.later; }
    setSuggestionEdited(s.id, Object.keys(edited).length ? edited : null);
    return json(res, 200, { ok: true, edited: Object.keys(edited).length ? edited : null });
  }
  // Sales Hub alert: Ali says he paused the step there (we only record his word), or tells us to let it go.
  if (action === 'tbc' && req.method === 'POST') {
    const b = await body(req);
    const a = tbcAlertById(Number(b.id));
    if (!a || a.wa_id !== waId) return json(res, 404, { error: 'Unknown alert' });
    if (b.action === 'paused' && a.state === 'open') setTbcAlertState(a.id, 'paused');
    else if (b.action === 'ignore' && (a.state === 'open' || a.state === 'paused')) setTbcAlertState(a.id, 'ignored');
    else return json(res, 400, { error: 'Action not possible in this state' });
    return json(res, 200, { ok: true, tbc: tbcInfo(waId) });
  }
  if (action === 'mute') { const b = await body(req); setMuted(waId, !!b.muted); return json(res, 200, { ok: true }); }
  if (action === 'handled') { const t = storedThread(waId); if (t) setHandled(waId, t.last_inbound_at || new Date().toISOString()); return json(res, 200, { ok: true }); }
  if (action === 'send' && req.method === 'POST') {
    const b = await body(req);
    const bubbles = (b.bubbles || []).map((s) => String(s).trim()).filter(Boolean);
    if (!bubbles.length) return json(res, 400, { error: 'Empty message' });
    const t = storedThread(waId);
    if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) return json(res, 409, { error: '24h window closed. Use a template' });
    if (sending.has(waId) && !sending.get(waId).error) return json(res, 409, { error: 'Sending in progress for this lead. Wait until the bubbles are out' });
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
    if (alert && alert.wa_id === waId) { if (alert.state !== 'paused') return json(res, 409, { error: 'Confirm the pause in the Sales Hub first' }); meta.alertId = alert.id; }
    const delayMs = Math.min(20 * 60_000, Math.max(0, Number(b.delayMs) || 0));
    if (delayMs) { scheduleSend(waId, bubbles, meta, delayMs); return json(res, 200, { ok: true, scheduled: new Date(Date.now() + delayMs).toISOString() }); }
    // First bubble right away, so a refusal (window closed, Wati down) comes back to the screen.
    try { await sendText(waId, bubbles[0]); logSend(waId, 'text', { text: bubbles[0], ...meta }, true); }
    catch (e) { logSend(waId, 'text', { text: bubbles[0] }, false, e.message); return json(res, 502, { error: e.message, sent: [] }); }
    saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[0].slice(0, 200) });
    closePlanItems(waId, 'done', ['followup']); // the day plan's follow-up left
    afterAliMessage(waId); // and a few minutes later: what the Hub needs now for this lead
    if (meta.alertId) setTbcAlertState(meta.alertId, 'sent');
    if (bubbles.length === 1) { refreshThread(waId, t.name, { notify: false }).catch(() => {}); learnFromSend(waId, bubbles, meta); }
    else sendRest(waId, t, bubbles, meta); // the others follow in the background, one every 5–10 s; learning runs when the last one is out
    return json(res, 200, { ok: true, sent: 1, total: bubbles.length });
  }
  if (action === 'template' && req.method === 'POST') {
    const b = await body(req);
    const tpl = (await frenchTemplates()).find((x) => x.name === b.template);
    if (!tpl) return json(res, 400, { error: 'Unknown or unapproved template' });
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
    if (failed) return json(res, 502, { error: `Meta refused the template ${tpl.name}. See the detail in the conversation` });
    const alert = b.alertId ? tbcAlertById(Number(b.alertId)) : null; // follow-up sent as a template from a Sales Hub card
    if (alert && alert.wa_id === waId && alert.state === 'paused') setTbcAlertState(alert.id, 'sent');
    saveThread({ ...(t || { wa_id: waId, name: null, last_inbound_at: null }), pending: 0, last_outbound_at: new Date().toISOString(), last_text: `[${tpl.name}]` });
    closePlanItems(waId, 'done', ['followup']);
    afterAliMessage(waId);
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

// ── Follow-ups scheduled by Ali (2026-10-04) ──────────────────────────────────
// Hard rule: a follow-up never leaves if the lead wrote after it was scheduled; it is cancelled at once (not at its
// time) and Ali gets a push to adapt. The window is checked when it is scheduled and again when it leaves.
const fmtHMm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
function followupAt(b) { // « 14:00 » (today, Madrid), « 2026-10-05 14:00 » or an ISO instant
  const v = String(b.at || '').trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString() : madridIso(v);
}
function followupCheck(waId, at, { template = false } = {}) { // null when fine, else the reason it cannot be scheduled
  if (!at || Number.isNaN(Date.parse(at))) return 'Pick a time';
  if (Date.parse(at) < Date.now() + 60_000) return 'That time has already passed';
  if (template) return null; // a template goes whatever the window
  const t = storedThread(waId);
  const closes = t?.last_inbound_at ? Date.parse(t.last_inbound_at) + 24 * 3600e3 : 0;
  if (Date.parse(at) >= closes) return `The 24h window closes at ${closes ? fmtHMm(new Date(closes).toISOString()) : '?'}, before this follow-up: only a template could go then`;
  return null;
}
const followupView = (r) => { const m = JSON.parse(r.meta || '{}'); return { id: r.id, at: r.at, bubbles: JSON.parse(r.bubbles), state: r.state, error: r.error, created_at: r.created_at, suggestionId: m.suggestionId || null, template: m.template || null }; };
let followupBusy = false;
async function followupTick() {
  if (followupBusy) return; followupBusy = true;
  try {
    for (const r of pendingFollowups()) {
      const t = storedThread(r.wa_id), bubbles = JSON.parse(r.bubbles);
      if (t?.last_inbound_at && t.last_inbound_at > r.created_at) { // the lead wrote after it was scheduled
        setScheduledState(r.id, 'replied', `${t.name || 'the lead'} replied at ${fmtHMm(t.last_inbound_at)}`);
        console.log(`followup #${r.id} for ${t.name || r.wa_id}: not sent, the lead replied`);
        pushAll({ title: `${t.name || r.wa_id} replied · ${fmtHMm(r.at)} follow-up NOT sent`, body: 'Open the thread to adapt.', tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {});
        continue;
      }
      if (Date.parse(r.at) > Date.now()) continue;
      if (Date.now() - Date.parse(r.at) > 30 * 60_000) { setScheduledState(r.id, 'failed', 'the app was not running at that time'); pushAll({ title: `${fmtHMm(r.at)} follow-up NOT sent · ${t?.name || r.wa_id}`, body: 'The app was down at that time. Send it by hand.', tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {}); continue; }
      const fm = JSON.parse(r.meta || '{}');
      if (fm.template) { // a scheduled template (Ali, 2026-10-04): no window needed; same reply rule, checked against Wati first
        try { await refreshThread(r.wa_id, t?.name, { notify: true }); } catch (e) { console.log(`followup #${r.id}: could not check the conversation (${e.message}), retry next tick`); continue; }
        const fr = storedThread(r.wa_id);
        if (fr?.last_inbound_at && fr.last_inbound_at > r.created_at) { setScheduledState(r.id, 'replied', `${fr.name || 'the lead'} replied at ${fmtHMm(fr.last_inbound_at)}`); pushAll({ title: `${fr.name || r.wa_id} replied · ${fmtHMm(r.at)} template NOT sent`, body: 'Open the thread to adapt.', tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {}); continue; }
        try { await sendTemplate(r.wa_id, fm.template, fm.params || {}); logSend(r.wa_id, 'template', { template: fm.template, params: fm.params, scheduled: r.id }, true); setScheduledState(r.id, 'sent'); console.log(`followup #${r.id}: template ${fm.template} sent to ${fr?.name || r.wa_id}`); }
        catch (e) { logSend(r.wa_id, 'template', { template: fm.template, params: fm.params }, false, e.message); setScheduledState(r.id, 'failed', e.message); pushAll({ title: `Template failed · ${fr?.name || r.wa_id}`, body: e.message.slice(0, 120), tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {}); continue; }
        saveThread({ ...(fr || { wa_id: r.wa_id, name: null, last_inbound_at: null }), pending: 0, last_outbound_at: new Date().toISOString(), last_text: `[${fm.template}]` });
        closePlanItems(r.wa_id, 'done', ['followup']);
        setTimeout(() => refreshThread(r.wa_id, fr?.name, { notify: false }).catch(() => {}), 6000);
        afterAliMessage(r.wa_id);
        continue;
      }
      if (!t?.last_inbound_at || hoursSince(t.last_inbound_at) >= 24) { setScheduledState(r.id, 'skipped', 'the 24h window had closed'); pushAll({ title: `${fmtHMm(r.at)} follow-up NOT sent · ${t?.name || r.wa_id}`, body: 'The 24h window had closed: only a template can go.', tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {}); continue; }
      if (sending.has(r.wa_id) && !sending.get(r.wa_id).error) continue; // another send in progress: next tick
      // Right before it leaves: read the conversation from Wati itself, not the copy on disk (Ali, 2026-10-04: after the Mac
      // slept, the copy is old; a lead who wrote meanwhile must stop the follow-up). Wati unreachable (just woken up, no
      // network yet): nothing leaves, next tick tries again.
      try { await refreshThread(r.wa_id, t.name, { notify: true }); } catch (e) { console.log(`followup #${r.id}: could not check the conversation (${e.message}), retry next tick`); continue; }
      const fresh = storedThread(r.wa_id);
      if (fresh?.last_inbound_at && fresh.last_inbound_at > r.created_at) {
        setScheduledState(r.id, 'replied', `${fresh.name || 'the lead'} replied at ${fmtHMm(fresh.last_inbound_at)}`);
        console.log(`followup #${r.id} for ${fresh.name || r.wa_id}: not sent, the lead replied (seen at the last check)`);
        pushAll({ title: `${fresh.name || r.wa_id} replied · ${fmtHMm(r.at)} follow-up NOT sent`, body: 'Open the thread to adapt.', tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {});
        continue;
      }
      const meta = { ...JSON.parse(r.meta || '{}'), batch: String(Date.now()) };
      try { await sendText(r.wa_id, bubbles[0]); logSend(r.wa_id, 'text', { text: bubbles[0], ...meta }, true); setScheduledState(r.id, 'sent'); console.log(`followup #${r.id} sent to ${t.name || r.wa_id}`); }
      catch (e) { logSend(r.wa_id, 'text', { text: bubbles[0], ...meta }, false, e.message); setScheduledState(r.id, 'failed', e.message); pushAll({ title: `Follow-up failed · ${t.name || r.wa_id}`, body: e.message.slice(0, 120), tag: `fu-${r.wa_id}`, url: `/t/${r.wa_id}` }).catch(() => {}); continue; }
      saveThread({ ...t, pending: 0, last_outbound_at: new Date().toISOString(), last_text: bubbles[0].slice(0, 200) });
      if (bubbles.length > 1) sendRest(r.wa_id, t, bubbles, meta); else refreshThread(r.wa_id, t.name, { notify: false }).catch(() => {});
      afterAliMessage(r.wa_id);
    }
  } finally { followupBusy = false; }
}

// A restart (launchctl kickstart, update) waits up to 15 s for bubbles still going out before the app stops; whatever is
// left after that is resumed at the next start from scheduled_sends (Joanna, 2026-10-04).
process.on('SIGTERM', async () => {
  const until = Date.now() + 15_000;
  while ([...sending.values()].some((x) => !x.error) && Date.now() < until) await sleep(500);
  console.log(`stopping${[...sending.values()].some((x) => !x.error) ? ' with bubbles still to send (they resume at the next start)' : ''}`);
  process.exit(0);
});
server.listen(PORT, () => {
  console.log(`Wati Inbox on https://localhost:${PORT}  ·  https://${TS_HOST}:${PORT}`);
  // The Mac must not fall asleep when the screen locks on battery (pmset: sleep 1 min on battery, Ali 2026-10-04). caffeinate -i
  // blocks idle sleep only, for as long as this process lives; closing the lid still puts the Mac to sleep.
  try { const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }); c.unref(); console.log('caffeinate: idle sleep blocked while the app runs'); } catch (e) { console.log('caffeinate failed:', e.message); }
  restoreScheduled().catch((e) => console.log('scheduled: restore error', e.message));
  setInterval(() => followupTick().catch((e) => console.log('followup tick error', e.message)), 15_000);
  startPolling();
  startTmMonitor();
  startConsolidating();
  startHubSync();
  startPlanning();
  startDictation();
});
