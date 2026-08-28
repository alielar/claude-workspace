// Reads every reply received AFTER we messaged each lead, and sorts them into
// buckets so the follow-up sequence never contacts the wrong person.
// Read-only — sends nothing.
//
//   npm run triage
//
// Writes to data/:
//   do-not-contact.csv   never message again — refusals and deletion requests
//   hot.csv              asked about price, payment or availability
//   later.csv            interested but not now
//   no-reply.csv         silent — these are the follow-up audience
//   replied-other.csv    replied but unclear, needs a human read

import { readFileSync, writeFileSync } from 'node:fs';
import { wati } from './wati.mjs';

// Anything here means never contact again. Deletion requests are a legal
// obligation, not a preference, so they are checked first and separately.
const DELETION = [
  /supprim\w*\s+(mes|mon|les)\s+(donn|coordonn|num)/i,
  /effac\w*\s+(mes|mon)\s+(donn|coordonn)/i,
  /\brgpd\b/i, /\bgdpr\b/i,
  /droit\s+(a|à)\s+l.oubli/i,
  /retir\w*\s+mes\s+donn/i,
];

const REFUSAL = [
  /ne\s+me\s+(contact|recontact|rappel|écriv|ecriv|téléphon|telephon)\w*\s+(plus|jamais)/i,
  /arr[êe]tez\s+de\s+m\w*\s*(contact|écrir|ecrir|envoy|harcel)/i,
  /\bstop\b/i,
  /me\s+d[ée]sinscrire/i, /d[ée]sabonn/i,
  /plus\s+(du\s+tout\s+)?int[ée]ress/i,
  /pas\s+int[ée]ress[ée]?/i,
  /je\s+ne\s+(suis|serai)\s+pas\s+int[ée]ress/i,
  /non\s*,?\s*merci/i,
  /aucun\s+int[ée]r[êe]t/i,
  /laissez[- ]moi\s+tranquille/i,
  /harc[èe]l/i,
  /\bspam\b/i,
];

const HOT = [
  /\bprix\b/i, /\btarif/i, /combien\s+(ça|ca|cela)\s+co[ûu]te/i, /co[ûu]t\b/i,
  /\bpay(er|ement|ment)\b/i, /mensualit/i, /\bfacture\b/i, /\bdevis\b/i,
  /\bdisponib/i, /\bcr[ée]neau/i, /quand\s+(est|serait|puis)/i,
  /\bint[ée]ress[ée]?\b(?!.*pas)/i, /\boui\b/i, /je\s+veux\s+bien/i,
  /\bd.accord\b/i, /volontiers/i, /\brappel(ez|er)[- ]moi/i,
  /combien\s+de\s+temps/i, /\bcpf\b/i, /\bfinanc/i, /\binscri/i,
];

const LATER = [
  /plus\s+tard/i, /pas\s+(pour\s+le\s+)?maintenant/i, /pas\s+en\s+ce\s+moment/i,
  /(en|vers|apr[èe]s)\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)/i,
  /l.ann[ée]e\s+prochaine/i, /le\s+mois\s+prochain/i,
  /\bcong[ée]s?\b/i, /\bvacances\b/i, /\bexamens?\b/i,
  /je\s+reviendrai\s+vers\s+vous/i, /je\s+vous\s+recontact/i,
  /pas\s+dans\s+l.imm[ée]diat/i, /d[ée]j[àa]\s+(une\s+)?formation/i,
  /trouv[ée]\s+(une\s+)?(solution|prof)/i, /financi[èe]r/i,
];

const match = (text, rules) => rules.some((r) => r.test(text));

// ── Load who we messaged and when ────────────────────────────────────────────

const sentAt = new Map();
for (const line of readFileSync('logs/sent.jsonl', 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const e = JSON.parse(line);
  if (!e.ok || e.phone === '34695064884') continue;
  const t = new Date(e.ts).getTime();
  const prev = sentAt.get(e.phone);
  if (!prev || t < prev.ts) sentAt.set(e.phone, { ts: t, name: e.name, leadId: e.leadId });
}

const buckets = { deletion: [], refusal: [], hot: [], later: [], other: [], silent: [] };
let checked = 0;

for (const [phone, info] of sentAt) {
  checked++;
  let replies = [];
  try {
    const d = await wati(`/api/v1/getMessages/${phone}?pageSize=20&pageNumber=1`);
    for (const m of d.messages?.items || []) {
      const when = new Date(m.created || 0).getTime();
      const outbound = m.owner === true || (m.eventDescription || '').includes('Broadcast message');
      const text = (m.text || '').trim();
      if (!outbound && when > info.ts && text) replies.push(text);
    }
  } catch { /* leave replies empty; the lead lands in silent */ }

  const row = { ...info, phone, reply: replies.join(' | ').replace(/[,\n\r]/g, ' ').slice(0, 220) };

  if (!replies.length) { buckets.silent.push(row); continue; }
  const blob = replies.join(' ');
  if (match(blob, DELETION)) buckets.deletion.push(row);
  else if (match(blob, REFUSAL)) buckets.refusal.push(row);
  else if (match(blob, HOT)) buckets.hot.push(row);
  else if (match(blob, LATER)) buckets.later.push(row);
  else buckets.other.push(row);

  if (checked % 250 === 0) console.log(`  …checked ${checked}/${sentAt.size}`);
}

// ── Write the lists ──────────────────────────────────────────────────────────

const csv = (rows, withReply = true) =>
  'lead_id,name,phone' + (withReply ? ',reply' : '') + '\n' +
  rows.map((r) => [r.leadId, r.name, '+' + r.phone, ...(withReply ? [r.reply] : [])].join(',')).join('\n') + '\n';

const dnc = [...buckets.deletion.map((r) => ({ ...r, why: 'data deletion request' })),
             ...buckets.refusal.map((r) => ({ ...r, why: 'explicit refusal' }))];

writeFileSync('data/do-not-contact.csv',
  'lead_id,name,phone,reason,reply\n' +
  dnc.map((r) => [r.leadId, r.name, '+' + r.phone, r.why, r.reply].join(',')).join('\n') + '\n');
writeFileSync('data/hot.csv', csv(buckets.hot));
writeFileSync('data/later.csv', csv(buckets.later));
writeFileSync('data/replied-other.csv', csv(buckets.other));
writeFileSync('data/no-reply.csv', csv(buckets.silent, false));

console.log(`\n  Checked ${checked} people messaged in this campaign.\n`);
console.log(`   ${String(buckets.deletion.length).padStart(5)}  data deletion requests   → data/do-not-contact.csv`);
console.log(`   ${String(buckets.refusal.length).padStart(5)}  explicit refusals        → data/do-not-contact.csv`);
console.log(`   ${String(buckets.hot.length).padStart(5)}  hot — price/availability  → data/hot.csv`);
console.log(`   ${String(buckets.later.length).padStart(5)}  interested but not now    → data/later.csv`);
console.log(`   ${String(buckets.other.length).padStart(5)}  replied, needs a human    → data/replied-other.csv`);
console.log(`   ${String(buckets.silent.length).padStart(5)}  silent — follow-up pool   → data/no-reply.csv\n`);
