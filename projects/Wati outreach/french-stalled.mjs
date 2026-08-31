// Finds French conversations where the lead showed interest, we answered
// (often with time slots), and then they went silent. Read-only.
//
//   npm run french-stalled
//
// Cache: data/french/conversations.jsonl (resumable)
// Out:   data/french/stalled.csv + stalled.md

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { wati } from './wati.mjs';

const OUT = 'data/french';
const CACHE = `${OUT}/conversations.jsonl`;
mkdirSync(OUT, { recursive: true });

const FRENCH_TEMPLATE = /_fr(a)?(_|$)|_france(_|$)|_french/i;
const FRENCH_WORDS = /\b(je|nous|vous|pas|oui|non|bonjour|bonsoir|merci|cours|anglais|entretien|rendez|disponible|semaine|heure|niveau|voudrais|serais|suis|c'est|d'accord|prix|tarif)\b/gi;

function isFrench(rows) {
  if (rows.some((r) => FRENCH_TEMPLATE.test(r.template))) return true;
  const hits = (rows.map((r) => r.text).join(' ').match(FRENCH_WORDS) || []).length;
  return hits >= 4;
}

const cached = new Map();
if (existsSync(CACHE)) {
  for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); cached.set(e.phone, e); } catch {}
  }
  console.log(`\n  Resuming — ${cached.size} contacts already checked.`);
}

// French-speaking country codes. Scanning all 30k contacts takes hours and
// almost all of them are Italian or Spanish; this keeps it to ~20 minutes.
const FR_CODES = ['33','32','41','352','212','213','216','221','225','226','227','228','229','223','235','236','237','241','242','243','261','262','269','508','509','590','594','596','687','689'];
const ALL = process.argv.includes('--all');
const frenchNumber = (p) => ALL || FR_CODES.some((c) => p.startsWith(c));

const contacts = [];
console.log('\n  Reading contacts…');
for (let page = 1; page <= 400; page++) {
  const r = await wati(`/api/v1/getContacts?pageSize=100&pageNumber=${page}`);
  const list = r.contact_list || [];
  if (!list.length) break;
  for (const c of list) {
    if (!frenchNumber(c.phone)) continue;
    const attrs = Object.fromEntries((c.customParams || []).map((p) => [p.name, p.value]));
    contacts.push({
      phone: c.phone,
      name: c.fullName || c.firstName || '',
      stage: attrs.lead_stage || 'No stage',
      owner: attrs.owned_by_name || attrs.contact_owner || '',
      allowBroadcast: c.allowBroadcast !== false,
    });
  }
}
console.log(`  ${contacts.length} contacts on French-speaking numbers${ALL ? ' (--all: everyone)' : ''}.\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getPage(phone, page) {
  for (let a = 0; a < 4; a++) {
    try {
      const d = await wati(`/api/v1/getMessages/${phone}?pageSize=100&pageNumber=${page}`);
      return d.messages?.items || [];
    } catch (e) { if (a === 3) throw e; await sleep(500 * 2 ** a); }
  }
}

let french = 0, lost = 0, checked = 0;

async function fetchOne(c) {
  const messages = [];
  for (let page = 1; page <= 10; page++) {
    const items = await getPage(c.phone, page);
    if (!items.length) break;
    messages.push(...items);
    if (items.length < 100) break;
  }
  const rows = messages.map((m) => {
    const outbound = m.owner === true || (m.eventDescription || '').includes('Broadcast message');
    const template = (m.eventDescription || '').match(/"([^"]+)"/)?.[1] || '';
    return {
      when: m.created || '',
      dir: outbound ? 'out' : 'in',
      typed: outbound && !template,
      text: (m.text || m.finalText || '').trim(),
      template,
    };
  }).filter((r) => r.text).sort((a, b) => new Date(a.when) - new Date(b.when));

  const fr = rows.length > 0 && isFrench(rows);
  if (fr) french++;
  appendFileSync(CACHE, JSON.stringify({ ...c, french: fr, rows: fr ? rows : [] }) + '\n');
}

const CONCURRENCY = 8;
const todo = contacts.filter((c) => { if (cached.has(c.phone)) { if (cached.get(c.phone).french) french++; return false; } return true; });
console.log(`  ${todo.length} still to fetch, ${CONCURRENCY} at a time.\n`);
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const slice = todo.slice(i, i + CONCURRENCY);
  const res = await Promise.allSettled(slice.map(fetchOne));
  for (const r of res) if (r.status === 'rejected') lost++;
  checked += slice.length;
  if (checked % 800 < CONCURRENCY) console.log(`  …${checked}/${todo.length} · ${french} French${lost ? ` · ${lost} unreadable` : ''}`);
}
if (lost) console.log(`\n  ${lost} contacts unreadable after retries.`);

console.log('\n  Classifying…');

const all = [];
for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); if (e.french && e.rows?.length) all.push(e); } catch {}
}

// Never touch anyone on the exclusion lists.
const blocked = new Map();
for (const f of ['data/do-not-contact-full.csv']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(',');
    if (/false positive/i.test(c[3] || '')) continue;
    blocked.set(c[2].replace(/[^\d]/g, ''), c[3] || 'excluded');
  }
}

const INTEREST = /\b(oui|ouais|yes|ok|okay|d'accord|daccord|interess|intéress|volontiers|ça m'int|ca m'int|pourquoi pas|je veux bien|je suis (libre|dispo|disponible|intéress)|dispo|disponible|appelez|rappelez|vous pouvez (m')?appeler|c'est bon|parfait|avec plaisir|bien sur|bien sûr|je serais|j'aimerais|jaimerais|allez-y)\b/i;
const REFUSAL = /\b(non merci|pas int[eé]ress|plus int[eé]ress|arr[eê]tez|stop|supprim|d[eé]sabonn|ne me contactez|pas besoin|j'ai trouv|je ne souhaite)\b/i;
const SLOTS = /(\d{1,2}\s?h\b|\d{1,2}:\d{2}|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|cr[eé]neau|disponibilit|quelle heure|je vous propose|ça vous (va|convient)|conviendrait|demain|matin|après-midi|apres-midi)/i;

const HOURS = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;
const found = [];

for (const c of all) {
  if (blocked.has(c.phone)) continue;
  const rows = c.rows;
  const lastIn = [...rows].reverse().find((r) => r.dir === 'in');
  if (!lastIn) continue;                       // never said anything at all
  if (REFUSAL.test(lastIn.text)) continue;     // ended on a no

  // Did they ever show interest?
  const inbound = rows.filter((r) => r.dir === 'in');
  const interested = inbound.some((r) => INTEREST.test(r.text));
  if (!interested) continue;

  // Are we the last to speak? If they answered last, it is not a ghost.
  const after = rows.filter((r) => new Date(r.when) > new Date(lastIn.when));
  if (!after.length) {
    found.push({ ...c, bucket: 'never answered by us', lastIn, ourLast: null, hours: HOURS(lastIn.when) });
    continue;
  }
  const ourLast = after[after.length - 1];
  const weProposed = after.some((r) => r.dir === 'out' && SLOTS.test(r.text));
  const weTyped = after.some((r) => r.dir === 'out' && r.typed);
  found.push({
    ...c,
    bucket: weProposed ? (weTyped ? 'slots proposed by hand — no answer' : 'slots proposed by template — no answer')
                       : 'we answered, no slots — no answer',
    lastIn, ourLast, hours: HOURS(lastIn.when),
  });
}

found.sort((a, b) => a.hours - b.hours);

const clean = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
writeFileSync(`${OUT}/stalled.csv`,
  'phone,name,lead_stage,closer,bucket,window,days_silent,their_last_message,their_last_at,our_last_message,our_last_at\n' +
  found.map((f) => [
    f.phone, f.name, f.stage, f.owner, f.bucket,
    f.hours < 24 ? 'OPEN' : 'expired',
    (f.hours / 24).toFixed(1),
    f.lastIn.text.slice(0, 300), f.lastIn.when,
    f.ourLast ? f.ourLast.text.slice(0, 300) : '', f.ourLast ? f.ourLast.when : '',
  ].map((v) => `"${clean(v)}"`).join(',')).join('\n') + '\n');

const byBucket = new Map();
for (const f of found) { if (!byBucket.has(f.bucket)) byBucket.set(f.bucket, []); byBucket.get(f.bucket).push(f); }

let md = `# French leads who showed interest and then went silent\n\nScanned ${all.length} French conversations on ${new Date().toISOString().slice(0, 10)}.\n\n| Situation | People | Window still open |\n|---|---|---|\n`;
for (const [b, list] of [...byBucket].sort((a, b2) => b2[1].length - a[1].length))
  md += `| ${b} | ${list.length} | ${list.filter((f) => f.hours < 24).length} |\n`;
md += `\n**Total: ${found.length}** · window open now: ${found.filter((f) => f.hours < 24).length}\n`;
for (const [b, list] of byBucket) {
  md += `\n---\n\n## ${b} (${list.length})\n\n`;
  for (const f of list.slice(0, 400)) {
    md += `### ${f.name || '(no name)'} — +${f.phone}\n`;
    md += `${f.stage} · silent ${(f.hours / 24).toFixed(1)} days · ${f.hours < 24 ? '**window OPEN**' : 'window expired'}\n\n`;
    md += `> **them:** ${f.lastIn.text.slice(0, 400)}\n\n`;
    if (f.ourLast) md += `> **us:** ${f.ourLast.text.slice(0, 400)}\n\n`;
  }
}
writeFileSync(`${OUT}/stalled.md`, md);

console.log(`\n  ${found.length} stalled French leads · ${found.filter((f) => f.hours < 24).length} still inside the 24h window`);
for (const [b, list] of byBucket) console.log(`   • ${b}: ${list.length}`);
console.log(`   → ${OUT}/stalled.csv and stalled.md\n`);
