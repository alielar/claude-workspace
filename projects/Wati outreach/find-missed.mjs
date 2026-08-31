// Two things the stalled scan would otherwise miss:
//   1. people asking to be removed from the database — they must be blocked
//   2. people who were ready to pay or enrol and then went silent
// Read-only, works off the cached conversations.
//
//   npm run find-missed

import { readFileSync, writeFileSync } from 'node:fs';

const all = [];
for (const line of readFileSync('data/french/conversations.jsonl', 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); if (e.french && e.rows?.length) all.push(e); } catch {}
}

// "Take me off your list", however they phrase it — plus anyone who used the
// word harassment, which is a complaint we must never follow up on.
const REMOVE = /(retir(er|ez)?[^.]{0,40}(base de donn|listing|liste|fichier|num[eé]ro)|supprim(er|ez)?[^.]{0,40}(donn[eé]es|num[eé]ro|coordonn|compte|profil)|effacer mes|d[eé]sabonn|d[eé]sinscri|ne (plus |jamais )?me (re)?contacter|arr[eê]tez de m[e']|plus de messages|RGPD|harc[eè]lement|harcel)/i;

// Money or enrolment on the table.
const BUYING = /\b(rib|iban|virement|paiement|payer|paiera|r[eé]gler|facture|devis|acompte|carte bancaire|lien de paiement|m'inscrire|je m'inscris|inscription|contrat|d[eé]marrer|commencer (le cours|la formation)|combien (ça|ca) co[uû]te|prix total|[eé]ch[eé]ancier|plusieurs fois|3 fois|financement|cpf)\b/i;

// Never treat a plain refusal as a buying signal.
const REFUSAL = /\b(non merci|pas int[eé]ress|plus int[eé]ress|je ne souhaite|dossier est clos|pas donner suite|j'ai (d[eé]j[aà] )?trouv|je passe|pas les moyens)\b/i;

const clean = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
const days = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;

const removals = [], buyers = [];

for (const c of all) {
  const inbound = c.rows.filter((r) => r.dir === 'in');
  if (!inbound.length) continue;

  // "if I had to unsubscribe later…" is a question about the terms, not a
  // request to be removed. Leona asked exactly this and must not be blocked.
  const hypothetical = (t) => /\b(au cas o[uù]|si (je|jamais|j'?[eé]tais|mon|ma|cela)|possible de|est-ce que je (peux|pourrais)|pourrais-je|si je devais|advenant|dans le cas)\b/i.test(t);
  const rm = inbound.find((r) => REMOVE.test(r.text) && !hypothetical(r.text));
  if (rm) { removals.push({ c, row: rm }); continue; }

  const lastIn = inbound[inbound.length - 1];
  const buy = inbound.find((r) => BUYING.test(r.text));
  if (!buy) continue;
  if (REFUSAL.test(lastIn.text)) continue;

  const after = c.rows.filter((r) => new Date(r.when) > new Date(lastIn.when));
  buyers.push({ c, row: buy, lastIn, ourLast: after.filter((r) => r.dir === 'out').pop() || null });
}

buyers.sort((a, b) => days(a.lastIn.when) - days(b.lastIn.when));

writeFileSync('data/french/must-remove.csv',
  'phone,name,lead_stage,days_since,what_they_said,said_at\n' +
  removals.map(({ c, row }) => [c.phone, c.name, c.stage, days(row.when).toFixed(0), row.text.slice(0, 400), row.when]
    .map((v) => `"${clean(v)}"`).join(',')).join('\n') + '\n');

writeFileSync('data/french/ready-to-buy.csv',
  'phone,name,lead_stage,closer,days_silent,buying_signal,their_last_message,our_last_message\n' +
  buyers.map(({ c, row, lastIn, ourLast }) => [c.phone, c.name, c.stage, c.owner,
    days(lastIn.when).toFixed(1), row.text.slice(0, 300), lastIn.text.slice(0, 300),
    ourLast ? ourLast.text.slice(0, 300) : ''].map((v) => `"${clean(v)}"`).join(',')).join('\n') + '\n');

console.log(`\n  ${removals.length} people asked to be removed or called it harassment`);
console.log('  → data/french/must-remove.csv  (these must be blocked and erased)\n');
for (const { c, row } of removals.slice(0, 40))
  console.log(`   • ${(c.name || '?').slice(0, 16).padEnd(16)} +${c.phone.padEnd(13)} ${days(row.when).toFixed(0).padStart(4)}d  ${row.text.replace(/\n/g, ' ').slice(0, 90)}`);

console.log(`\n  ${buyers.length} people showed a money or enrolment signal and then went quiet`);
console.log('  → data/french/ready-to-buy.csv\n');
for (const b of buyers.slice(0, 40))
  console.log(`   • ${(b.c.name || '?').slice(0, 16).padEnd(16)} +${b.c.phone.padEnd(13)} ${days(b.lastIn.when).toFixed(0).padStart(4)}d  ${b.row.text.replace(/\n/g, ' ').slice(0, 85)}`);
console.log();
