// The telemarketing channel's messages can't be read through the API, so this
// watches the next best thing: the contact records of everyone we messaged.
// A reply, a bot action or a stage change moves last_updated or lead_stage.
//
//   node --env-file=.env tm-watch.mjs snapshot   record the current state
//   node --env-file=.env tm-watch.mjs check      report what has changed

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}` };
const SNAP = 'data/tm-watch.json';
const mode = process.argv[2] || 'check';

// everyone we sent to on the telemarketing number
const people = new Map();
for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
  if (!line.trim() || !line.includes('"channel":"33671283778"')) continue;
  try {
    const e = JSON.parse(line);
    if (e.ok && e.phone !== '34695064884') people.set(e.phone, e.name);
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function contact(phone) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://eu-api.wati.io/api/ext/v3/contacts/${phone}`, { headers: H });
      if (!r.ok) return null;
      const c = await r.json();
      const stage = (c.custom_params || []).find((x) => x.name === 'lead_stage');
      return { last_updated: c.last_updated, stage: stage?.value || '', status: c.contact_status, teams: (c.teams || []).join('|') };
    } catch { if (a === 2) return null; await sleep(600 * 2 ** a); }
  }
}

const now = {};
const phones = [...people.keys()];
for (let i = 0; i < phones.length; i += 6) {
  const slice = phones.slice(i, i + 6);
  const got = await Promise.all(slice.map(contact));
  slice.forEach((p, j) => { if (got[j]) now[p] = got[j]; });
}

if (mode === 'snapshot' || !existsSync(SNAP)) {
  writeFileSync(SNAP, JSON.stringify({ taken: new Date().toISOString(), people: Object.fromEntries(people), state: now }, null, 1));
  console.log(`\n  snapshot taken: ${Object.keys(now).length} of ${people.size} contacts read\n`);
  process.exit(0);
}

const prev = JSON.parse(readFileSync(SNAP, 'utf8'));
const changed = [];
for (const [p, cur] of Object.entries(now)) {
  const old = prev.state[p];
  if (!old) continue;
  const diffs = [];
  if (old.last_updated !== cur.last_updated) diffs.push('activity');
  if (old.stage !== cur.stage) diffs.push(`stage ${old.stage || '(none)'} → ${cur.stage || '(none)'}`);
  if (old.teams !== cur.teams) diffs.push(`teams → ${cur.teams}`);
  if (diffs.length) changed.push({ phone: p, name: people.get(p), diffs, when: cur.last_updated });
}
changed.sort((a, b) => new Date(b.when) - new Date(a.when));

console.log(`\n  watching ${people.size} people messaged on +33671283778`);
console.log(`  snapshot from ${prev.taken.slice(0, 16).replace('T', ' ')}\n`);
if (!changed.length) console.log('  no contact has changed yet — no sign of any reply or bot action.\n');
else {
  console.log(`  ${changed.length} contact(s) moved:\n`);
  for (const c of changed) console.log(`   ${c.phone.padEnd(13)} ${String(c.name).slice(0, 16).padEnd(17)} ${c.diffs.join(' · ')}`);
  console.log();
}
