// Who on the telemarketing batch may receive the next follow-up?
// Everyone we sent the previous step to, MINUS: booked a meeting, contact
// record moved since our send (probably replied), wrote to us (webhook),
// the previous step failed to deliver to them, blocked.
//
//   node --env-file=.env build-tm-followup.mjs            → follow-up 1 list
//   node --env-file=.env build-tm-followup.mjs --stage 2  → follow-up 2 list

import { readFileSync, writeFileSync } from 'node:fs';
const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}` };
const HOOK = 'https://life-control-center-eta.vercel.app/api/wati?key=' +
  readFileSync('.wati-webhook-secret', 'utf8').trim() + '&limit=5000';

const STAGE_N = process.argv.includes('--stage') ? Number(process.argv[process.argv.indexOf('--stage') + 1]) : 1;
// Which earlier template defines the base audience, and where the result goes.
const CONF = {
  1: { base: (t) => t.startsWith('no_meating'), out: 'data/tm-followup-eligible.csv', label: 'the opener' },
  2: { base: (t) => t === 'followup_text_1_fra_v2', out: 'data/tm-followup2-eligible.csv', label: 'follow-up 1' },
}[STAGE_N];
if (!CONF) { console.log(`  Unknown stage ${STAGE_N}. Use 1 or 2.`); process.exit(1); }

// 1. everyone who got the previous step on the TM number, with when
const sentAt = new Map();
for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
  if (!line.trim() || !line.includes('"channel":"33671283778"')) continue;
  try {
    const e = JSON.parse(line);
    if (!e.ok || e.phone === '34695064884' || !CONF.base(e.template)) continue;
    const prev = sentAt.get(e.phone);
    if (!prev || e.ts > prev.ts) sentAt.set(e.phone, { ts: e.ts, name: e.name });
  } catch {}
}
console.log(`  got ${CONF.label.padEnd(22)}: ${sentAt.size}`);

// 2. webhook: inbound messages, and failed deliveries of the previous step.
// The recipient's number is encoded in the WhatsApp message id.
const phoneFromWamid = (w) => {
  if (!w) return null;
  try { return (Buffer.from(w.replace('wamid.', ''), 'base64').toString('latin1').match(/\d{10,15}/) || [])[0] || null; }
  catch { return null; }
};
const inbound = new Set();
const failedTo = new Set();
// Live events (content comes inline) plus the archived day the old blob
// store still holds hostage.
const listed = await (await fetch(HOOK)).json();
const bodies = (listed.events || []).map((e) => e.event).filter(Boolean);
try {
  bodies.push(...JSON.parse(readFileSync('data/webhook-archive-2026-09-07.json', 'utf8')));
} catch {}
for (const body of bodies) {
  if (body.eventType === 'message' && body.owner === false && body.waId) inbound.add(String(body.waId));
  if (body.eventType === 'templateMessageFailed') {
    const p = phoneFromWamid(body.whatsappMessageId);
    if (p) failedTo.add(p);
  }
}
console.log(`  replied (seen by webhook) : ${[...inbound].filter((p) => sentAt.has(p)).length}`);
console.log(`  previous step undelivered : ${[...failedTo].filter((p) => sentAt.has(p)).length}`);

// 3. contact records: booked, or moved since our send
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function contact(p) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://eu-api.wati.io/api/ext/v3/contacts/${p}`, { headers: H });
      if (!r.ok) return null;
      const c = await r.json();
      return { last: c.last_updated || '', stage: (c.custom_params || []).find((x) => x.name === 'lead_stage')?.value || '' };
    } catch { if (a === 2) return null; await sleep(500 * 2 ** a); }
  }
}
const phones = [...sentAt.keys()];
let booked = 0, moved = 0, unreadable = 0;
const eligible = [];
for (let i = 0; i < phones.length; i += 8) {
  const slice = phones.slice(i, i + 8);
  const got = await Promise.all(slice.map(contact));
  slice.forEach((p, j) => {
    const c = got[j];
    if (!c) { unreadable++; return; }                       // can't verify -> leave out
    if (/meeting scheduled|meeting done|no show|reschedule/i.test(c.stage)) { booked++; return; }
    if (inbound.has(p) || failedTo.has(p)) return;          // counted above
    if (c.last && c.last > sentAt.get(p).ts) { moved++; return; }
    eligible.push({ phone: p, name: sentAt.get(p).name });
  });
  if (i % 160 === 0 && i) console.log(`   …${i}/${phones.length}`);
}
console.log(`  booked / in meeting flow  : ${booked}`);
console.log(`  contact moved since send  : ${moved}`);
console.log(`  unreadable (left out)     : ${unreadable}`);
console.log(`\n  ELIGIBLE FOR FOLLOW-UP ${STAGE_N}  : ${eligible.length}`);

writeFileSync(CONF.out,
  'phone,name\n' + eligible.map((e) => `${e.phone},"${e.name.replace(/"/g, '""')}"`).join('\n') + '\n');
console.log(`  → ${CONF.out}\n`);
