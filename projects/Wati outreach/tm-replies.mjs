// Did anything happen on a contact AFTER we messaged them? The telemarketing
// channel's messages can't be read, but a reply or a bot action moves the
// contact record — so last_updated later than our send is the signal.
import { readFileSync } from 'node:fs';
const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}` };

const sentAt = new Map();
for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
  if (!line.trim() || !line.includes('"channel":"33671283778"')) continue;
  try {
    const e = JSON.parse(line);
    if (!e.ok || e.phone === '34695064884') continue;
    const prev = sentAt.get(e.phone);
    if (!prev || e.ts > prev.ts) sentAt.set(e.phone, { ts: e.ts, name: e.name });
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(phone) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://eu-api.wati.io/api/ext/v3/contacts/${phone}`, { headers: H });
      if (!r.ok) return null;
      const c = await r.json();
      return { last: c.last_updated, stage: (c.custom_params || []).find((x) => x.name === 'lead_stage')?.value || '', teams: (c.teams || []).join('|') };
    } catch { if (a === 2) return null; await sleep(500 * 2 ** a); }
  }
}

const phones = [...sentAt.keys()];
const moved = [];
let read = 0;
for (let i = 0; i < phones.length; i += 8) {
  const slice = phones.slice(i, i + 8);
  const got = await Promise.all(slice.map(get));
  slice.forEach((p, j) => {
    const c = got[j];
    if (!c) return;
    read++;
    if (c.last && c.last > sentAt.get(p).ts) moved.push({ phone: p, name: sentAt.get(p).name, sent: sentAt.get(p).ts, last: c.last, stage: c.stage, teams: c.teams });
  });
}
moved.sort((a, b) => b.last.localeCompare(a.last));
console.log(`\n  ${read} of ${phones.length} contacts read`);
console.log(`  ${moved.length} show activity AFTER we messaged them\n`);
for (const m of moved) {
  console.log(`   ${m.phone.padEnd(13)} ${String(m.name).slice(0, 16).padEnd(17)} sent ${m.sent.slice(5, 16).replace('T', ' ')}  →  activity ${m.last.slice(5, 16).replace('T', ' ')}`);
  console.log(`      stage: ${m.stage || '(none)'}   teams: ${m.teams || '(none)'}`);
}
if (!moved.length) console.log('   nothing — no replies or bot actions detectable yet.\n');
