// Did the 601 never-contacted leads ever have a meeting? Reads their full
// history straight from Wati rather than trusting the CSV track label.
//
//   npm run check-601

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { wati } from './wati.mjs';

const phones = JSON.parse(readFileSync('data/never-contacted-phones.json', 'utf8'));
const CACHE = 'data/601-history.jsonl';

const cached = new Map();
if (existsSync(CACHE)) {
  for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); cached.set(e.phone, e); } catch {}
  }
  console.log(`\n  Resuming — ${cached.size} already read.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getPage(phone, page) {
  for (let a = 0; a < 4; a++) {
    try {
      const d = await wati(`/api/v1/getMessages/${phone}?pageSize=100&pageNumber=${page}`);
      return d.messages?.items || [];
    } catch (e) { if (a === 3) throw e; await sleep(600 * 2 ** a); }
  }
}

async function fetchOne(phone) {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const got = await getPage(phone, page);
    if (!got.length) break;
    items.push(...got);
    if (got.length < 100) break;
  }
  const rows = items.map((m) => {
    const outbound = m.owner === true || (m.eventDescription || '').includes('Broadcast message');
    return {
      when: m.created || '',
      dir: outbound ? 'out' : 'in',
      template: (m.eventDescription || '').match(/"([^"]+)"/)?.[1] || '',
      text: (m.text || m.finalText || '').trim(),
    };
  }).filter((r) => r.text).sort((a, b) => new Date(a.when) - new Date(b.when));
  appendFileSync(CACHE, JSON.stringify({ phone, rows }) + '\n');
}

const todo = phones.filter((p) => !cached.has(p));
console.log(`\n  Reading history for ${todo.length} of ${phones.length} leads…`);
const C = 8;
let n = 0, lost = 0;
for (let i = 0; i < todo.length; i += C) {
  const res = await Promise.allSettled(todo.slice(i, i + C).map(fetchOne));
  for (const r of res) if (r.status === 'rejected') lost++;
  n += C;
  if (n % 160 < C) console.log(`   …${Math.min(n, todo.length)}/${todo.length}`);
}
if (lost) console.log(`\n  ${lost} could not be read.`);

// ── Classify ────────────────────────────────────────────────────────────────

const all = [];
for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { all.push(JSON.parse(line)); } catch {}
}

// Templates that only go out once a meeting is in the calendar.
const BOOKED = /^(booking_text_|reminder_text_|duplicate_scheduled|duplicate_booking)/i;
// Templates that only go out after a meeting was missed.
const MISSED = /^(noshow_|reschedule_)/i;
// Templates that only go out after a meeting actually took place.
const AFTER = /^(tbc_preadmission|admission_message|tbc_iitf|upsell_|prepayment_|course_payment|tbc_reject|tbc_recovery|tbc_reminder|tbc_value)/i;
// Either side referring to the meeting as done.
const HELD = /(on a fait l'entretien|apr[eè]s (notre|l')entretien|lors de (notre|l')entretien|pendant l'entretien|vos r[eé]sultats|votre dipl[oô]me|suite [àa] (notre|l')(entretien|appel|[eé]change)|comme (convenu|discut[eé]) (lors|pendant))/i;

const buckets = { held: [], booked: [], contactedNoMeeting: [], silent: [] };
for (const c of all) {
  if (!c.rows.length) { buckets.silent.push(c); continue; }
  const ts = c.rows.map((r) => r.template).filter(Boolean);
  const text = c.rows.map((r) => r.text).join(' ');
  if (ts.some((t) => AFTER.test(t)) || HELD.test(text)) buckets.held.push(c);
  else if (ts.some((t) => BOOKED.test(t) || MISSED.test(t))) buckets.booked.push(c);
  else buckets.contactedNoMeeting.push(c);
}

const label = {
  held: 'A MEETING ACTUALLY HAPPENED — wrong track',
  booked: 'a meeting was booked, then missed (no-show)',
  contactedNoMeeting: 'messaged before, but no meeting ever booked',
  silent: 'no message history at all — genuinely untouched',
};
console.log(`\n  Of ${all.length} never-contacted leads:\n`);
for (const k of ['silent', 'booked', 'contactedNoMeeting', 'held'])
  console.log(`   ${String(buckets[k].length).padStart(4)}  ${label[k]}`);

writeFileSync('data/601-audit.csv',
  'phone,verdict,messages,inbound,templates_seen\n' +
  Object.entries(buckets).flatMap(([k, list]) => list.map((c) => [
    c.phone, label[k], c.rows.length, c.rows.filter((r) => r.dir === 'in').length,
    [...new Set(c.rows.map((r) => r.template).filter(Boolean))].join(' | '),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n') + '\n');
console.log('\n   → data/601-audit.csv\n');
