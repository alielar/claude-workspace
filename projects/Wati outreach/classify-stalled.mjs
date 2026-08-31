// Reads the cached French conversations and works out who genuinely went
// silent after showing interest — and who only looks that way.
// No API calls: re-runs in seconds.
//
//   npm run classify-stalled

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'data/french';
const CACHE = `${OUT}/conversations.jsonl`;

const all = [];
for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); if (e.french && e.rows?.length) all.push(e); } catch {}
}

const blocked = new Map();
for (const line of readFileSync('data/do-not-contact-full.csv', 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue;
  const c = line.split(',');
  if (/false positive/i.test(c[3] || '')) continue;
  blocked.set(c[2].replace(/[^\d]/g, ''), c[3] || 'excluded');
}

// ── Reading their last message ───────────────────────────────────────────────

// A real yes. Deliberately narrow: it must be about wanting to go ahead.
const INTEREST = /\b(oui|ouais|yes|si|d'accord|daccord|ok(ay)?|int[eé]ress[eé]|volontiers|pourquoi pas|je veux bien|avec plaisir|parfait|[cç]a me (va|convient)|convient|je suis (libre|dispo|disponible)|dispo|disponible|appelez|rappelez|allez-y|j'aimerais|jaimerais|je serais|je compte|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s?h)\b/i;

// A no, including the typos people actually make ("plus"→"lus", "pus").
const REFUSAL = /\b(non merci|pas (du tout )?int[eé]ress|(p?l?us|pu?s) int[eé]ress|plus besoin|pas pour le moment|pas maintenant|pas int|arr[eê]tez|stop|supprim|d[eé]sabonn|ne (me|plus) contact|j'ai (d[eé]j[aà] )?trouv|je ne souhaite|ne suis plus|aucun int[eé]r[eê]t|laissez-moi|c'est mort|j'ai abandonn|trop cher|pas les moyens|je passe)\b/i;

// Politeness that ends a conversation rather than opening one.
const COURTESY_ONLY = /^(\W*(merci( beaucoup| bien)?|ok(ay)?|d'accord|daccord|super|parfait|tr[eè]s bien|bonne (soir[eé]e|journ[eé]e|nuit)|bonjour|bonsoir|salut|[àa] (demain|bient[oô]t|mardi|mercredi|jeudi|vendredi|lundi)|oui( oui)?|👍|🙏|😊|reçu|bien reçu|noté|c'est noté|de rien)\W*)+$/i;

// A machine, not a person.
const AUTOREPLY = /(r[eé]pondeur automatique|message automatique|absent du bureau|out of office|je suis actuellement absent|automatic reply|ceci est un message auto)/i;

// Someone with a problem. Never sell to these.
const COMPLAINT = /\b(rembours|arnaque|escroc|plainte|avocat|litige|scandaleux|inadmissible|mauvaise exp[eé]rience|coup[eé] mes acc[eè]s|j'ai perdu|ne fonctionne pas|aucun retour|personne ne me r[eé]pond|honteux|d[eé][çc]u)\b/i;

// ── Reading our last message ─────────────────────────────────────────────────

// We actually locked a time. The conversation ended well — leave it alone.
const BOOKED = /(je viens de vous envoyer (une )?invitation|invitation par (mail|e-?mail)|je vous ai envoy[eé] l'invitation|c'est (r[eé]serv[eé]|not[eé]|bon|bookè|book[eé])|je vous ai r[eé]serv[eé]|[àa] (demain|tout [àa] l'heure|mardi|mercredi|jeudi|vendredi|lundi|samedi|dimanche)\s*!?\s*$|rendez-vous est confirm|c'est confirm[eé]|je vous attends)/i;

// We asked them for a time and they never gave one.
const ASKED_FOR_TIME = /(\d{1,2}\s?h\b|\d{1,2}:\d{2}|cr[eé]neau|disponibilit|quel (jour|moment)|quelle heure|je (suis|serais) disponible|je vous propose|[çc]a vous (va|convient|irait)|conviendrait|arrangerait|vous irais)/i;

const HOURS = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;
const band = (d) => d < 2 ? 'live (under 2 days)'
  : d < 30 ? 'recent (2-30 days)'
  : d < 120 ? 'old (1-4 months)'
  : 'ancient (4+ months)';

const keep = [], dropped = new Map();
const drop = (why) => dropped.set(why, (dropped.get(why) || 0) + 1);

for (const c of all) {
  if (blocked.has(c.phone)) { drop('on the do-not-contact list'); continue; }

  const rows = c.rows;
  const lastIn = [...rows].reverse().find((r) => r.dir === 'in');
  if (!lastIn) { drop('never wrote to us at all'); continue; }

  const t = lastIn.text;
  if (AUTOREPLY.test(t)) { drop('their last message was an auto-reply'); continue; }
  if (COMPLAINT.test(t)) { drop('COMPLAINT — needs a human, never a sales message'); continue; }
  if (REFUSAL.test(t)) { drop('their last message was a no'); continue; }
  if (COURTESY_ONLY.test(t.trim())) { drop('their last message was just politeness'); continue; }
  if (!INTEREST.test(t)) { drop('their last message shows no interest either way'); continue; }

  const after = rows.filter((r) => new Date(r.when) > new Date(lastIn.when));
  const ourLast = after.filter((r) => r.dir === 'out').pop() || null;

  if (ourLast && BOOKED.test(ourLast.text)) { drop('the meeting was actually booked'); continue; }

  const days = HOURS(lastIn.when) / 24;
  keep.push({
    ...c,
    situation: !ourLast ? 'they wrote, we never replied'
      : ASKED_FOR_TIME.test(ourLast.text) ? 'we asked for a time, no answer'
      : 'we replied, never offered a time',
    band: band(days),
    days, lastIn, ourLast,
    windowOpen: days < 1,
  });
}

keep.sort((a, b) => a.days - b.days);

const clean = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
writeFileSync(`${OUT}/stalled.csv`,
  'phone,name,lead_stage,closer,situation,band,window,days_silent,their_last_message,their_last_at,our_last_message,our_last_at\n' +
  keep.map((f) => [f.phone, f.name, f.stage, f.owner, f.situation, f.band,
    f.windowOpen ? 'OPEN' : 'expired', f.days.toFixed(1),
    f.lastIn.text.slice(0, 300), f.lastIn.when,
    f.ourLast ? f.ourLast.text.slice(0, 300) : '', f.ourLast ? f.ourLast.when : '',
  ].map((v) => `"${clean(v)}"`).join(',')).join('\n') + '\n');

const group = (key) => {
  const m = new Map();
  for (const f of keep) { const k = f[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  return m;
};

const BANDS = ['live (under 2 days)', 'recent (2-30 days)', 'old (1-4 months)', 'ancient (4+ months)'];
const byBand = group('band'), bySit = group('situation');

let md = `# French leads who said yes and then went quiet\n\nFrom ${all.length} French conversations, read on ${new Date().toISOString().slice(0, 10)}.\n\n## How long they have been silent\n\n| How long | People | Window still open |\n|---|---|---|\n`;
for (const b of BANDS) { const l = byBand.get(b) || []; md += `| ${b} | ${l.length} | ${l.filter((f) => f.windowOpen).length} |\n`; }
md += `\n## What happened\n\n| Situation | People |\n|---|---|\n`;
for (const [k, l] of [...bySit].sort((a, b) => b[1].length - a[1].length)) md += `| ${k} | ${l.length} |\n`;
md += `\n**Total ${keep.length}.**\n\n## Set aside, and why\n\n| Reason | People |\n|---|---|\n`;
for (const [k, n] of [...dropped].sort((a, b) => b[1] - a[1])) md += `| ${k} | ${n} |\n`;

for (const b of BANDS) {
  const list = byBand.get(b) || [];
  if (!list.length) continue;
  md += `\n---\n\n# ${b} — ${list.length} people\n`;
  for (const f of list) {
    md += `\n### ${f.name || '(no name)'} — +${f.phone}\n`;
    md += `${f.situation} · silent ${f.days.toFixed(1)} days${f.windowOpen ? ' · **window OPEN — reply by hand**' : ''}\n\n`;
    md += `> **them:** ${f.lastIn.text.slice(0, 400)}\n\n`;
    if (f.ourLast) md += `> **us:** ${f.ourLast.text.slice(0, 400)}\n\n`;
  }
}
writeFileSync(`${OUT}/stalled.md`, md);

console.log(`\n  ${all.length} French conversations read.\n`);
console.log('  Worth contacting:');
for (const b of BANDS) { const l = byBand.get(b) || []; if (l.length) console.log(`   ${String(l.length).padStart(4)}  ${b}${l.filter((f) => f.windowOpen).length ? ` (${l.filter((f) => f.windowOpen).length} window open)` : ''}`); }
console.log(`   ${String(keep.length).padStart(4)}  total\n`);
console.log('  By situation:');
for (const [k, l] of [...bySit].sort((a, b) => b[1].length - a[1].length)) console.log(`   ${String(l.length).padStart(4)}  ${k}`);
console.log('\n  Set aside:');
for (const [k, n] of [...dropped].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);
console.log(`\n   → ${OUT}/stalled.csv and stalled.md\n`);
