// Watches the booking bot on the France telemarketing number (+33671283778), 2026-09-29.
//
// The Wati API cannot read that channel, but the webhook receiver (ali-hub /api/wati) gets both
// sides: the lead's messages (`message`, owner=false, waId) and the bot's (`sentMessage*`, phone
// encoded in the WhatsApp message id). Every TM_REVIEW_EVERY_MS (default 2 h) this module:
//   1. pulls the events since the last cursor and stores them in tm_messages (one row per message);
//   2. builds a transcript per conversation that moved, and asks Claude (Sonnet, headless, one run
//      for the whole batch) to flag what the bot got wrong ("erreur") or could do better
//      ("amelioration");
//   3. stores the flags in tm_flags — the app shows them on the "France TM" screen.
// Nothing is sent, nothing is written outside the database. Cost: ~12 short Sonnet runs a day.
//
//   node --env-file=.env tm-monitor.mjs          one review now, from the terminal

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getState, setState, upsertTmMessages, tmThread, tmThreadsSince, insertTmFlag } from './db.mjs';
import { runClaude, OUTREACH, madrid } from './suggest-engine.mjs';

const HOOK = process.env.WATI_HOOK_URL || 'https://ali-hub.vercel.app/api/wati';
const TM = '33671283778';
const EVERY_MS = Number(process.env.TM_REVIEW_EVERY_MS || 2 * 3600e3);
const MAX_THREADS = Number(process.env.TM_REVIEW_MAX_THREADS || 25);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'tm:', ...a);
const status = { state: 'idle', at: null, error: null, last: null };
export const tmStatus = () => status;

const hookKey = () => {
  if (process.env.WATI_HOOK_KEY) return process.env.WATI_HOOK_KEY;
  const f = join(OUTREACH, '.wati-webhook-secret');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
};
const phoneFromWamid = (id) => { try { const m = /\d{8,15}/.exec(Buffer.from(String(id).replace(/^wamid\./, ''), 'base64').toString('latin1')); return m?.[0] || null; } catch { return null; } };
const iso = (e) => e.timestamp ? new Date(Number(e.timestamp) * 1000).toISOString() : e.created ? new Date(e.created).toISOString() : null;

// Pulls the webhook since the cursor; returns how many new rows landed.
export async function pullEvents() {
  const key = hookKey();
  if (!key) throw new Error('clé webhook introuvable (.wati-webhook-secret)');
  const since = getState('tm_cursor') || new Date(Date.now() - 2 * 864e5).toISOString();
  const r = await fetch(`${HOOK}?key=${encodeURIComponent(key)}&limit=5000&since=${encodeURIComponent(since)}`);
  if (!r.ok) throw new Error(`webhook ${r.status}`);
  const d = await r.json();
  const events = (d.events || []).filter((x) => x?.event && String(x.event.channelPhoneNumber || TM) === TM);
  const conv = new Map(); // conversationId → waId (from inbound events)
  for (const x of events) { const e = x.event; if (e.eventType === 'message' && e.waId && e.conversationId) conv.set(e.conversationId, String(e.waId)); }
  const rows = [];
  let newest = since;
  for (const x of events) {
    const e = x.event;
    if (x.at > newest) newest = x.at;
    const at = iso(e); if (!at) continue;
    if (e.eventType === 'message' && e.owner === false) {
      rows.push({ id: `in:${e.whatsappMessageId || e.id}`, wa_id: String(e.waId), at, who: 'LEAD', text: e.text || (e.type !== 'text' ? `[${e.type}]` : ''), type: e.type || 'text', name: e.senderName || null });
    } else if (/^sentMessage/.test(e.eventType || '') && e.whatsappMessageId) {
      const wa = phoneFromWamid(e.whatsappMessageId) || conv.get(e.conversationId);
      if (!wa) continue;
      rows.push({ id: `out:${e.whatsappMessageId}`, wa_id: wa, at, who: 'BOT', text: e.text || '', type: e.type || 'text', name: null });
    }
  }
  const n = upsertTmMessages(rows);
  setState('tm_cursor', newest);
  return { n, events: events.length };
}

const SCHEMA = {
  type: 'object',
  properties: {
    flags: { type: 'array', items: { type: 'object', properties: {
      waId: { type: 'string' }, kind: { type: 'string', enum: ['erreur', 'amelioration'] }, title: { type: 'string' }, detail: { type: 'string' }, quote: { type: 'string' } }, required: ['waId', 'kind', 'title', 'detail', 'quote'] } },
    summary: { type: 'string' },
  },
  required: ['flags', 'summary'],
};

export async function review() {
  if (status.state === 'running') return null;
  status.state = 'running'; status.at = new Date().toISOString(); status.error = null;
  try {
    const pulled = await pullEvents();
    const since = getState('tm_reviewed_until') || new Date(Date.now() - 864e5).toISOString();
    const threads = tmThreadsSince(since).slice(0, MAX_THREADS);
    log(`${pulled.n} new message(s) from ${pulled.events} event(s); ${threads.length} conversation(s) moved since ${since.slice(0, 16)}`);
    if (!threads.length) { status.state = 'idle'; status.last = { at: new Date().toISOString(), threads: 0, flags: 0 }; setState('tm_reviewed_until', new Date().toISOString()); return { threads: 0, flags: 0 }; }
    const transcripts = threads.map((t) => {
      const msgs = tmThread(t.wa_id, 40);
      const name = msgs.find((m) => m.name)?.name || t.name || '';
      return `### +${t.wa_id}${name ? ` · ${name}` : ''}\n` + msgs.map((m) => `[${madrid(new Date(m.at)).slice(5, 16)}] ${m.who === 'BOT' ? 'BOT ' : 'LEAD'} : ${String(m.text || '').replace(/\s+/g, ' ')}${m.at > since ? '' : '  (avant)'}`).join('\n');
    }).join('\n\n');
    const prompt = readFileSync(new URL('./tm-review-prompt.md', import.meta.url), 'utf8').replaceAll('{{now}}', madrid()).replaceAll('{{since}}', madrid(new Date(since))).replaceAll('{{transcripts}}', transcripts);
    const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 4, tag: 'tm', timeoutMs: 5 * 60_000, tools: ['Read', 'Grep', 'Glob'] });
    const known = new Set(threads.map((t) => t.wa_id));
    let n = 0;
    for (const f of Array.isArray(out.flags) ? out.flags : []) {
      const wa = String(f.waId || '').replace(/\D/g, '');
      if (!known.has(wa) || !f.title) continue;
      const name = tmThread(wa, 40).find((m) => m.name)?.name || null;
      insertTmFlag({ wa_id: wa, kind: f.kind === 'erreur' ? 'erreur' : 'amelioration', title: String(f.title).trim(), detail: String(f.detail || '').trim(), quote: String(f.quote || '').trim(), name });
      n++;
    }
    setState('tm_reviewed_until', new Date().toISOString());
    status.state = 'idle'; status.last = { at: new Date().toISOString(), threads: threads.length, flags: n, summary: String(out.summary || '').slice(0, 300) };
    log(`review done — ${threads.length} conversation(s), ${n} flag(s), ${Math.round(out.ms / 1000)} s`);
    return status.last;
  } catch (e) {
    status.state = 'idle'; status.error = e.message; log('error:', e.message);
    throw e;
  }
}

export function startTmMonitor() {
  const tick = () => review().catch(() => {});
  setTimeout(tick, 60_000);           // first pass a minute after start
  setInterval(tick, EVERY_MS);
  log(`monitor ready — every ${Math.round(EVERY_MS / 60000)} min, up to ${MAX_THREADS} conversations per review`);
}

if (process.argv[1] && process.argv[1].endsWith('tm-monitor.mjs')) {
  mkdirSync('logs', { recursive: true });
  review().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
