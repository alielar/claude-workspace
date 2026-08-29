// Scans the ENTIRE WhatsApp history of every lead in the plan — not just
// replies to our campaign — for anything that means "never contact me again".
// Earlier campaigns (Léa, Juliette) collected refusals we must still honour.
//
//   npm run scan-history
//
// Writes data/do-not-contact-full.csv — the master exclusion list.
// Read-only. Sends nothing.

import { readFileSync, writeFileSync } from 'node:fs';
import { wati } from './wati.mjs';

// A deletion request is a legal obligation. Kept separate and checked first.
const DELETION = [
  /supprim\w*[^.]{0,30}(donn[ée]es?|coordonn[ée]es?|num[ée]ro|compte|contact|fiche)/i,
  /effac\w*[^.]{0,30}(donn[ée]es?|coordonn[ée]es?|num[ée]ro)/i,
  /(donn[ée]es?|coordonn[ée]es?|num[ée]ro)[^.]{0,30}(supprim|effac|retir)/i,
  /\brgpd\b/i, /\bgdpr\b/i,
  /droit\s+[àa]\s+l.oubli/i,
  /d[ée]sinscri\w*[^.]{0,20}(fichier|base|liste)/i,
  /retirez[- ]moi\s+de\s+(votre|la)\s+(liste|base|fichier)/i,
];

const REFUSAL = [
  /ne\s+(me|nous)\s+(contact|recontact|rappel|[ée]criv|t[ée]l[ée]phon|sollicit|envoy)\w*\s*(plus|jamais)/i,
  /(plus|jamais)\s+de\s+(message|sms|appel|contact)/i,
  /arr[êe]tez\s+(de\s+)?m\w*\s*(contact|[ée]crir|envoy|harcel|appel|sollicit)/i,
  /^\s*stop\s*$/im,
  /me\s+d[ée]sinscrire/i, /d[ée]sabonn\w*/i,
  /laissez[- ]moi\s+tranquille/i,
  /harc[èe]l\w*/i,
  /\bspam\b/i, /\bplainte\b/i,
  /plus\s+(du\s+tout\s+)?int[ée]ress/i,
  /jamais\s+(demand|sollicit)/i,
  /porter\s+plainte/i,
  /je\s+vous\s+(interdis|somme)/i,
  /aucun\s+int[ée]r[êe]t/i,
];

// "pas intéressé pour le moment" is a soft no. But the softener only counts if
// it sits right next to the refusal — a "plus tard" elsewhere in a long thread
// must not downgrade a flat "je ne suis plus intéressé".
const SOFTENERS = [
  /pour\s+(le\s+)?moment/i, /pour\s+l.instant/i, /actuellement/i,
  /plus\s+tard/i, /l.ann[ée]e\s+prochaine/i, /le\s+mois\s+prochain/i,
  /je\s+(vous\s+)?recontact/i, /je\s+reviendrai/i,
];
const SOFTENER_WINDOW = 60;

// A refusal phrase inside a hypothetical or a question is usually someone
// asking about cancellation terms, not asking to be removed.
const HYPOTHETICAL = [
  /au\s+cas\s+o[ùu]/i, /\bsi\s+je\s+dev\w+/i, /\bsi\s+jamais\b/i,
  /quelles?\s+(sont|serait)/i, /cons[ée]quences?/i,
];

const hit = (text, rules) => rules.find((r) => r.test(text));

const { leads } = JSON.parse(readFileSync('data/plan.json', 'utf8'));
const rows = [];
let checked = 0, withHistory = 0;

for (const lead of leads) {
  checked++;
  let inbound = [];
  try {
    // Walk back through the whole thread, not just the newest page.
    for (let page = 1; page <= 3; page++) {
      const d = await wati(`/api/v1/getMessages/${lead.phone}?pageSize=50&pageNumber=${page}`);
      const items = d.messages?.items || [];
      if (!items.length) break;
      for (const m of items) {
        const outbound = m.owner === true || (m.eventDescription || '').includes('Broadcast message');
        const text = (m.text || '').trim();
        if (!outbound && text) inbound.push(text);
      }
      if (items.length < 50) break;
    }
  } catch { continue; }

  if (!inbound.length) continue;
  withHistory++;
  const blob = inbound.join('  ');

  const del = hit(blob, DELETION);
  const ref = hit(blob, REFUSAL);
  if (!del && !ref) continue;

  // Look only at the text immediately around the refusal, so a "plus tard"
  // elsewhere in a long thread cannot downgrade a flat no.
  let soft = null, hypo = null;
  if (!del && ref) {
    const at = blob.search(ref);
    const near = blob.slice(Math.max(0, at - SOFTENER_WINDOW), at + SOFTENER_WINDOW);
    soft = hit(near, SOFTENERS);
    hypo = hit(near, HYPOTHETICAL);
  }

  rows.push({
    leadId: lead.leadId,
    name: lead.name,
    phone: lead.phone,
    reason: del ? 'DATA DELETION REQUEST'
      : hypo ? 'probably a false positive — asking about cancelling, not refusing'
      : soft ? 'soft no (timing) — your call'
      : 'explicit refusal',
    matched: String(del || ref).slice(0, 60),
    quote: blob.match(del || ref) ? blob.slice(Math.max(0, blob.search(del || ref) - 40), blob.search(del || ref) + 130).replace(/[,\n\r]/g, ' ') : '',
  });

  if (checked % 300 === 0) console.log(`  …scanned ${checked}/${leads.length}`);
}

const order = { 'DATA DELETION REQUEST': 0, 'explicit refusal': 1, 'soft no (timing) — your call': 2, 'probably a false positive — asking about cancelling, not refusing': 3 };
rows.sort((a, b) => order[a.reason] - order[b.reason]);

writeFileSync('data/do-not-contact-full.csv',
  'lead_id,name,phone,reason,matched_phrase,context\n' +
  rows.map((r) => [r.leadId, r.name, '+' + r.phone, r.reason, r.matched, r.quote].join(',')).join('\n') + '\n');

const count = (r) => rows.filter((x) => x.reason === r).length;
console.log(`\n  Scanned all ${checked} leads · ${withHistory} have replied to you at some point.\n`);
console.log(`   ${String(count('DATA DELETION REQUEST')).padStart(4)}  DATA DELETION REQUESTS — must be erased, not just excluded`);
console.log(`   ${String(count('explicit refusal')).padStart(4)}  explicit refusals — never contact again`);
console.log(`   ${String(count('soft no (timing) — your call')).padStart(4)}  soft "not now" — your call`);
console.log(`   ${String(count('probably a false positive — asking about cancelling, not refusing')).padStart(4)}  likely false positives — asking about cancelling, not refusing`);
console.log(`\n  → data/do-not-contact-full.csv\n`);
