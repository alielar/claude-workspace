// Walks every contact in the account, pulls the conversation, and keeps the
// ones that are actually in German. Resumable: progress is cached, so stopping
// and restarting never re-fetches what it already has. Read-only.
//
//   npm run german-export              scan everyone (complete, slow)
//   npm run german-export -- --dach    scan +49/+43/+41 only (fast first pass)
//
// Writes into data/german/export/:
//   transcripts/<outcome>.md   conversations grouped by where the deal ended up
//   messages.csv               every message, one per row
//   summary.md                 index

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { wati } from './wati.mjs';

const OUT = 'data/german/export';
const CACHE = 'data/german/conversations.jsonl';
const DACH_ONLY = process.argv.includes('--dach');

mkdirSync(`${OUT}/transcripts`, { recursive: true });
mkdirSync('data/german', { recursive: true });

// ── What counts as a German conversation ─────────────────────────────────────

const GERMAN_TEMPLATE = /_de(_|$)|_deu(_|$)|_german/i;
const GERMAN_WORDS = /\b(ich|nicht|und|dich|dir|wir|ist|eine|kannst|hast|dein|deine|gerne|Termin|Uhr|Englisch|Kurs|hallo|danke|bitte|freue|melde|schön|würde|könnte|gespräch|woche)\b/gi;

function isGerman(rows) {
  if (rows.some((r) => GERMAN_TEMPLATE.test(r.template))) return true;
  const text = rows.map((r) => r.text).join(' ');
  const hits = (text.match(GERMAN_WORDS) || []).length;
  return hits >= 4;
}

// ── Resume from cache ────────────────────────────────────────────────────────

const cached = new Map();
if (existsSync(CACHE)) {
  for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); cached.set(e.phone, e); } catch { /* half-written line */ }
  }
  console.log(`\n  Resuming — ${cached.size} contacts already checked.`);
}

// ── Collect the contact list ─────────────────────────────────────────────────

const DACH = (p) => p.startsWith('49') || p.startsWith('43') || p.startsWith('41');
const contacts = [];
console.log('\n  Reading contacts…');
for (let page = 1; page <= 400; page++) {
  const r = await wati(`/api/v1/getContacts?pageSize=100&pageNumber=${page}`);
  const list = r.contact_list || [];
  if (!list.length) break;
  for (const c of list) {
    if (DACH_ONLY && !DACH(c.phone)) continue;
    const attrs = Object.fromEntries((c.customParams || []).map((p) => [p.name, p.value]));
    contacts.push({
      phone: c.phone,
      name: c.fullName || c.firstName || '',
      stage: attrs.lead_stage || 'No stage',
      owner: attrs.owned_by_name || attrs.contact_owner || attrs.owner || '',
      product: attrs.product || '',
      meeting: attrs.meeting_date || '',
      email: attrs.email || '',
    });
  }
}
console.log(`  ${contacts.length} contacts to check${DACH_ONLY ? ' (+49/+43/+41 only)' : ''}.\n`);

// ── Pull each conversation ───────────────────────────────────────────────────

let checked = 0, german = 0, totalMessages = 0, lost = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries rather than giving up, so a hiccup never silently drops a contact.
async function getPage(phone, page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const d = await wati(`/api/v1/getMessages/${phone}?pageSize=100&pageNumber=${page}`);
      return d.messages?.items || [];
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(500 * 2 ** attempt);
    }
  }
}

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
      who: outbound ? (template ? 'easypeasy (template)' : 'easypeasy') : 'lead',
      text: (m.text || m.finalText || '').trim(),
      status: m.statusString || m.status || '',
      template,
    };
  }).filter((r) => r.text).sort((a, b) => new Date(a.when) - new Date(b.when));

  const de = rows.length > 0 && isGerman(rows);
  if (de) { german++; totalMessages += rows.length; }
  appendFileSync(CACHE, JSON.stringify({ ...c, german: de, rows: de ? rows : [] }) + '\n');
}

// Several contacts at a time — the read endpoint handles it comfortably, and
// this turns hours into minutes.
const CONCURRENCY = 8;
const todo = contacts.filter((c) => {
  if (!cached.has(c.phone)) return true;
  if (cached.get(c.phone).german) german++;
  return false;
});
console.log(`  ${todo.length} still to fetch, ${CONCURRENCY} at a time.\n`);

for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const slice = todo.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(slice.map((c) => fetchOne(c)));
  for (const r of results) if (r.status === 'rejected') lost++;
  checked += slice.length;

  if (checked % 800 < CONCURRENCY) {
    const pct = Math.round((checked / todo.length) * 100);
    console.log(`  …${checked}/${todo.length} (${pct}%) · ${german} German conversations${lost ? ` · ${lost} unreadable` : ''}`);
  }
}
if (lost) console.log(`\n  ${lost} contacts could not be read after retries.`);

// ── Write the export ─────────────────────────────────────────────────────────

console.log('\n  Writing files…');
const all = [];
for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); if (e.german && e.rows?.length) all.push(e); } catch { /* skip */ }
}

const slug = (s) => (s || 'no-stage').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();

const byStage = new Map();
const csvRows = [];
let messageCount = 0;

for (const c of all) {
  messageCount += c.rows.length;
  const head = [
    `## ${c.name || '(no name)'} — +${c.phone}`,
    `**Outcome:** ${c.stage}${c.owner ? ` · **Closer:** ${c.owner}` : ''}${c.product ? ` · **Product:** ${c.product}` : ''}`,
    c.meeting ? `**Meeting:** ${c.meeting}` : '',
    '',
  ].filter(Boolean).join('\n');

  const body = c.rows.map((r) =>
    `**${r.who}** · ${r.when.slice(0, 16).replace('T', ' ')}${r.template ? ` · _${r.template}_` : ''}\n> ${r.text.replace(/\n/g, '\n> ')}`,
  ).join('\n\n');

  if (!byStage.has(c.stage)) byStage.set(c.stage, []);
  byStage.get(c.stage).push(`${head}\n${body}\n\n---\n`);

  for (const r of c.rows) {
    csvRows.push([c.phone, c.name, c.stage, c.owner, r.when, r.who, r.template, r.status, r.text]
      .map((v) => `"${clean(v)}"`).join(','));
  }
}

for (const [stage, entries] of byStage) {
  writeFileSync(`${OUT}/transcripts/${slug(stage)}.md`,
    `# ${stage}\n\n${entries.length} German conversations that ended at "${stage}".\n\n---\n\n` + entries.join('\n'));
}

writeFileSync(`${OUT}/messages.csv`,
  'phone,contact_name,lead_stage,closer,timestamp,sender,template,delivery_status,message\n' + csvRows.join('\n') + '\n');

const stageLines = [...byStage.entries()].sort((a, b) => b[1].length - a[1].length)
  .map(([s, e]) => `| ${s} | ${e.length} | \`transcripts/${slug(s)}.md\` |`).join('\n');

writeFileSync(`${OUT}/summary.md`, `# German sales conversations

Exported from Wati on ${new Date().toISOString().slice(0, 10)}.

- **${all.length}** German conversations
- **${messageCount}** messages
- Sender is \`lead\`, \`easypeasy\` (typed by a closer), or \`easypeasy (template)\`

## By outcome

| Outcome | Conversations | File |
|---|---|---|
${stageLines}
`);

console.log(`\n  Done. ${all.length} German conversations · ${messageCount} messages · ${byStage.size} outcome files`);
console.log(`   → ${OUT}/\n`);
