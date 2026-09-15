// Everything you need to answer one lead, in one command.
//
//   node --env-file=.env lead.mjs 33612345678
//   node --env-file=.env lead.mjs "+33 6 12 34 56 78"
//   node --env-file=.env lead.mjs Rahma            (search by name)
//
// Prints: who they are, their CRM stage, the meeting, every template we sent
// them, the full conversation with Madrid times, and how long the ball has
// been in our court. Only the France Sales number is readable by the API;
// replies on the telemarketing number come from the webhook instead.

import { readFileSync, existsSync } from 'node:fs';

const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}` };
const BASE = process.env.WATI_ENDPOINT;

const raw = process.argv.slice(2).join(' ').trim();
if (!raw) { console.log('Usage: node --env-file=.env lead.mjs <phone or name>'); process.exit(1); }

const fmt = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600e3;
const human = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} days`);

// ── resolve the phone ────────────────────────────────────────────────────────
let phone = raw.replace(/[^\d]/g, '');
if (!/^\d{8,15}$/.test(phone)) {
  const idx = 'data/contacts-index.json';
  if (!existsSync(idx)) { console.log('Name search needs data/contacts-index.json — run scripts-contacts-index.mjs first.'); process.exit(1); }
  const hits = JSON.parse(readFileSync(idx, 'utf8'))
    .filter((c) => (c.name || '').toLowerCase().includes(raw.toLowerCase()))
    .sort((a, b) => String(b.last).localeCompare(String(a.last)));
  if (!hits.length) { console.log(`No contact matching "${raw}".`); process.exit(1); }
  if (hits.length > 1) {
    console.log(`${hits.length} matches for "${raw}" — pick one:`);
    hits.slice(0, 12).forEach((c) => console.log(`  ${c.phone}  ${c.name}  (${c.stage || 'no stage'}, last active ${String(c.last).slice(0, 10)})`));
    process.exit(0);
  }
  phone = hits[0].phone;
}

// ── contact record ───────────────────────────────────────────────────────────
let contact = null;
try {
  const r = await fetch(`https://eu-api.wati.io/api/ext/v3/contacts/${phone}`, { headers: H });
  if (r.ok) contact = await r.json();
} catch {}
const param = (n) => (contact?.custom_params || []).find((x) => x.name === n)?.value || '';

// ── conversation (France Sales number only) ──────────────────────────────────
const msgs = [];
for (let page = 1; page <= 6; page++) {
  let items = [];
  try {
    const r = await fetch(`${BASE}/api/v1/getMessages/${phone}?pageSize=100&pageNumber=${page}`, { headers: H });
    if (r.ok) items = (await r.json()).messages?.items || [];
  } catch {}
  msgs.push(...items.filter((m) => m.eventType === 'message' || m.eventType === 'broadcastMessage').map((m) => ({
    at: m.created || m.timestamp,
    who: m.owner ? 'US' : 'LEAD',
    text: m.text || (m.type && m.type !== 'text' ? `(${m.type})` : ''),
    op: m.operatorName || '',
    tpl: !!m.templateId,
  })));
  if (items.length < 100) break;
}
// Empty entries are delivery/read receipts, not real messages.
const real = msgs.filter((m) => String(m.text).trim());
msgs.length = 0;
msgs.push(...real);
msgs.sort((a, b) => String(a.at).localeCompare(String(b.at)));

// ── what we sent them from our own campaigns ─────────────────────────────────
const sent = [];
if (existsSync('logs/sent.jsonl')) {
  for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
    if (!line.includes(phone)) continue;
    try { const e = JSON.parse(line); if (e.phone === phone && e.ok) sent.push(e); } catch {}
  }
}

// ── replies captured by the webhook (covers the telemarketing number) ────────
let hookReplies = [];
if (existsSync('.wati-webhook-secret')) {
  try {
    const key = readFileSync('.wati-webhook-secret', 'utf8').trim();
    const d = await (await fetch(`https://life-control-center-eta.vercel.app/api/wati?key=${key}&limit=5000`)).json();
    hookReplies = (d.events || []).map((e) => e.event).filter((b) => b && b.eventType === 'message' && b.owner === false && String(b.waId) === phone);
  } catch {}
}

// ── print ────────────────────────────────────────────────────────────────────
const name = contact?.name || param('name') || '(unknown)';
console.log(`\n${'='.repeat(70)}`);
console.log(`  ${name}  ·  +${phone}`);
console.log(`${'='.repeat(70)}`);
console.log(`  CRM stage   : ${param('lead_stage') || '(none)'}`);
if (param('meeting_date')) console.log(`  Meeting     : ${param('meeting_date')}`);
console.log(`  Country/lang: ${param('country') || '?'} / ${param('language') || param('lang') || '?'}`);
if (param('email')) console.log(`  Email       : ${param('email')}`);
if (contact?.last_updated) console.log(`  Record moved: ${fmt(contact.last_updated)} (${human(hoursSince(contact.last_updated))} ago)`);
console.log(`  On TM number: ${param('whatsapp_33671283778') ? 'yes' : 'no'}`);

if (sent.length) {
  console.log(`\n  Campaign messages we sent (${sent.length}):`);
  for (const e of sent) console.log(`    ${fmt(e.ts)}  ${e.template}${e.channel ? '  [telemarketing]' : '  [sales]'}`);
}

if (hookReplies.length) {
  console.log(`\n  Replies seen by the webhook (${hookReplies.length}) — these may be on the telemarketing number:`);
  for (const b of hookReplies.slice(-8)) console.log(`    ${fmt(b.created || b.timestamp)}  ${JSON.stringify(String(b.text || '').slice(0, 90))}`);
}

if (!msgs.length) {
  console.log('\n  No readable conversation on the France Sales number.');
  console.log('  (If they are a telemarketing-number lead, only the webhook replies above are visible.)\n');
} else {
  console.log(`\n  Conversation — ${msgs.length} messages, ${fmt(msgs[0].at)} → ${fmt(msgs[msgs.length - 1].at)} (Madrid time)\n`);
  for (const m of msgs) {
    const who = m.who === 'LEAD' ? 'LEAD' : m.tpl ? 'US (auto)' : m.op === 'Admin Account' ? 'ALI ' : `${(m.op || 'US').slice(0, 14)}`;
    console.log(`  [${fmt(m.at)}] ${who}: ${String(m.text).replace(/\n/g, '\n' + ' '.repeat(28))}`);
  }

  const last = msgs[msgs.length - 1];
  const lastLead = [...msgs].reverse().find((m) => m.who === 'LEAD');
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`  Ball is with : ${last.who === 'LEAD' ? 'US — they wrote last' : 'THEM — we wrote last'}`);
  if (lastLead) {
    const h = hoursSince(lastLead.at);
    console.log(`  Lead's last msg: ${human(h)} ago`);
    console.log(`  24h window   : ${h < 24 ? 'OPEN — free text allowed' : 'CLOSED — template only'}`);
  }
  console.log(`  Silence      : ${human(hoursSince(last.at))} since the last message on the thread\n`);
}
