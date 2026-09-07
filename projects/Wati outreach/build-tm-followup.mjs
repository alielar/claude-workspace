// Who on the telemarketing batch may receive follow-up 1?
// Everyone we sent the opener to, MINUS: booked a meeting, contact record
// moved since our send (probably replied), wrote to us (webhook), blocked.
//
//   node --env-file=.env build-tm-followup.mjs

import { readFileSync, writeFileSync } from 'node:fs';
const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}` };
const HOOK = 'https://life-control-center-eta.vercel.app/api/wati?key=' +
  readFileSync('.wati-webhook-secret', 'utf8').trim();

// 1. everyone who got the opener on the TM number, with when
const sentAt = new Map();
for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
  if (!line.trim() || !line.includes('"channel":"33671283778"')) continue;
  try {
    const e = JSON.parse(line);
    if (!e.ok || e.phone === '34695064884' || !e.template.startsWith('no_meating')) continue;
    const prev = sentAt.get(e.phone);
    if (!prev || e.ts > prev.ts) sentAt.set(e.phone, { ts: e.ts, name: e.name });
  } catch {}
}
console.log(`  got the opener            : ${sentAt.size}`);

// 2. inbound messages seen by the webhook
const inbound = new Set();
const listed = await (await fetch(HOOK)).json();
for (const ev of listed.events || []) {
  try {
    const body = await (await fetch(ev.url)).json();
    if (body.eventType === 'message' && body.owner === false && body.waId) inbound.add(String(body.waId));
  } catch {}
}
console.log(`  replied (seen by webhook) : ${[...inbound].filter((p) => sentAt.has(p)).length}`);

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
    if (/meeting scheduled/i.test(c.stage)) { booked++; return; }
    if (inbound.has(p)) return;                             // counted above
    if (c.last && c.last > sentAt.get(p).ts) { moved++; return; }
    eligible.push({ phone: p, name: sentAt.get(p).name });
  });
  if (i % 160 === 0 && i) console.log(`   …${i}/${phones.length}`);
}
console.log(`  booked a meeting          : ${booked}`);
console.log(`  contact moved since send  : ${moved}`);
console.log(`  unreadable (left out)     : ${unreadable}`);
console.log(`\n  ELIGIBLE FOR FOLLOW-UP 1  : ${eligible.length}`);

writeFileSync('data/tm-followup-eligible.csv',
  'phone,name\n' + eligible.map((e) => `${e.phone},"${e.name.replace(/"/g, '""')}"`).join('\n') + '\n');
console.log('  → data/tm-followup-eligible.csv\n');
