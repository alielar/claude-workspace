// French leads who confirmed interest, were offered times, and never answered.
//
// The rule, strictly:
//   1. our LAST message to them proposes or asks for a time
//   2. they have not written a word since
//   3. before that, they said yes (a bare "oui" counts — in answer to
//      "shall I book you a call?" that IS the confirmation)
//   4. that last message is not a booking confirmation (then it went fine)
//
//   npm run slots-no-answer

import { readFileSync, writeFileSync } from 'node:fs';
import { wati } from './wati.mjs';

// ── What the messages have to look like ──────────────────────────────────────

// Us offering or asking for a time.
const ASKED_FOR_TIME = /(\d{1,2}\s?h\b|\d{1,2}\s?:\s?\d{2}|cr[eé]neau|disponibilit|quel (jour|moment|horaire)|quelle heure|je (suis|serais) (disponible|dispo)|je vous propose|[çc]a vous (va|convient|irait|arrange)|conviendrait|arrangerait|vous irais|vous arrangeraient|(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche))/i;

// Us confirming it was booked — the conversation ended well, leave it alone.
const BOOKED = /(je viens de vous envoyer (une )?invitation|invitation par (mail|e-?mail)|je vous ai envoy[eé] l'invitation|c'est (r[eé]serv[eé]|not[eé]|confirm[eé])|je vous ai r[eé]serv[eé]|rendez-vous est confirm|je vous attends|[àa] (demain|tout [àa] l'heure|mardi|mercredi|jeudi|vendredi|lundi|samedi|dimanche)\s*!*\s*$)/i;

// Them saying yes. Deliberately generous: a bare "oui" or "ok" counts.
const YES = /\b(oui|ouais|yes|d'accord|daccord|ok(ay)?|[çc]a marche|int[eé]ress[eé]e?|volontiers|pourquoi pas|je veux bien|avec plaisir|parfait|[çc]a me (va|convient|irait)|je suis (libre|dispo|disponible|partant|chaud)|dispo|disponible|allez-y|appelez|rappelez|j'aimerais|jaimerais|je serais|je compte|carr[eé]ment|super|tr[eè]s bien)\b/i;

// Them saying no, including the typos people actually make.
const NO = /\b(non merci|pas (du tout |vraiment )?int[eé]ress|(p?l?us|pu?s) int[eé]ress|plus besoin|pas (pour le moment|maintenant|dispo)|arr[eê]tez|stop|supprim|d[eé]sabonn|d[eé]sinscri|ne (me|plus) contact|j'ai (d[eé]j[aà] )?trouv|je ne souhaite|ne suis plus|aucun int[eé]r[eê]t|c'est mort|j'ai abandonn|trop cher|pas les moyens|je passe|me d[eé]sister|dossier est clos|pas donner suite|je me retire|harc[eè]l)\b/i;

// ── Read the cached conversations ────────────────────────────────────────────

const convos = [];
for (const line of readFileSync('data/french/conversations.jsonl', 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); if (e.french && e.rows?.length) convos.push(e); } catch {}
}

// ── Everyone we must never contact ───────────────────────────────────────────

const blocked = new Map();
for (const line of readFileSync('data/do-not-contact-full.csv', 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue;
  const c = line.split(',');
  if (/false positive/i.test(c[3] || '')) continue;
  blocked.set(c[2].replace(/[^\d]/g, ''), 'asked not to be contacted');
}
for (const line of readFileSync('data/french/must-remove.csv', 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue;
  const phone = (line.match(/^"([^"]*)"/) || [])[1];
  if (phone) blocked.set(phone.replace(/[^\d]/g, ''), 'asked to be removed');
}

// ── Find them ────────────────────────────────────────────────────────────────

const days = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;
const found = [];

for (const c of convos) {
  if (blocked.has(c.phone)) continue;

  const rows = c.rows;
  const lastOut = [...rows].reverse().find((r) => r.dir === 'out');
  if (!lastOut) continue;

  // 2. nothing from them since our last message
  const lastIn = [...rows].reverse().find((r) => r.dir === 'in');
  if (!lastIn) continue;
  if (new Date(lastIn.when) > new Date(lastOut.when)) continue;

  // 1. our last message offered a time — and 4. it was not a confirmation
  if (!ASKED_FOR_TIME.test(lastOut.text)) continue;
  if (BOOKED.test(lastOut.text)) continue;

  // 3. they had said yes, and their last word was not a no
  if (NO.test(lastIn.text)) continue;
  if (!YES.test(lastIn.text)) continue;

  found.push({
    phone: c.phone,
    name: c.name,
    stage: c.stage,
    owner: c.owner,
    silent: days(lastOut.when),      // since we asked
    theirYes: lastIn.text,
    ourOffer: lastOut.text,
    offeredAt: lastOut.when,
  });
}

// ── Get the fullest name Wati holds ──────────────────────────────────────────

// The cache only kept one name field; contact records have first and last
// separately, and some are mojibaked ("AndrÃ©" for "André").
const fixText = (s) => {
  const t = String(s || '').trim();
  return /[ÃÂ][\x80-\xBF]/.test(t) ? Buffer.from(t, 'latin1').toString('utf8') : t;
};

const wanted = new Set(found.map((f) => f.phone));
const names = new Map();

// The phone-to-name map is cached, so a re-run costs nothing.
const NAME_CACHE = 'data/french/contact-names.json';
try {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(NAME_CACHE, 'utf8')))) names.set(k, v);
  console.log(`\n  ${names.size} names already cached.`);
} catch { /* first run */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One dropped connection must not throw away the whole walk.
async function contactPage(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await wati(`/api/v1/getContacts?pageSize=100&pageNumber=${page}`); }
    catch (err) {
      if (attempt === 4) { console.log(`   page ${page} unreadable — carrying on without it`); return null; }
      await sleep(1000 * 2 ** attempt);
    }
  }
}

if ([...wanted].some((p) => !names.has(p))) {
  console.log(`\n  Looking up full names for ${wanted.size} contacts…`);
  for (let page = 1; page <= 400; page++) {
    const r = await contactPage(page);
    if (r === null) continue;                 // hiccup — skip this page, keep going
    const list = r.contact_list || [];
    if (!list.length) break;
    for (const c of list) {
      if (!wanted.has(c.phone)) continue;
      const first = fixText(c.firstName), last = fixText(c.lastName), full = fixText(c.fullName);
      const joined = [first, last].filter(Boolean).join(' ').trim();
      names.set(c.phone, (joined.length >= full.length ? joined : full) || full || joined);
    }
    if ([...wanted].every((p) => names.has(p))) break;
  }
  writeFileSync(NAME_CACHE, JSON.stringify(Object.fromEntries(names), null, 0));
}

// Wati often holds only a surname. The original lead exports have first and
// last name in separate columns, so they fill the gaps.
const fromCsv = new Map();
for (const file of ['data/leads_no_meeting_yet.csv', 'data/leads_had_meeting.csv']) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  const head = lines[0].split(',').map((h) => h.trim());
  const iF = head.indexOf('first_name'), iL = head.indexOf('last_name'), iP = head.indexOf('phone');
  if (iP === -1) continue;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    const phone = (cells[iP] || '').replace(/[^\d]/g, '');
    if (!phone) continue;
    const name = [fixText(cells[iF]), fixText(cells[iL])].filter(Boolean).join(' ').trim();
    if (name && (fromCsv.get(phone) || '').length < name.length) fromCsv.set(phone, name);
  }
}

// Keep whichever source gives the fuller name.
for (const f of found) {
  const options = [names.get(f.phone), fromCsv.get(f.phone), fixText(f.name)]
    .map((n) => String(n || '').trim()).filter(Boolean);
  const words = (n) => n.split(/\s+/).length;
  options.sort((a, b) => words(b) - words(a) || b.length - a.length);
  // Some records repeat the same word in both columns ("Jessica Jessica").
  const seen = new Set();
  f.fullName = (options[0] || '').split(/\s+/)
    .filter((w) => { const k = w.toLowerCase(); return seen.has(k) ? false : seen.add(k); })
    .join(' ');
}
found.sort((a, b) => a.silent - b.silent);

// ── Write it out ─────────────────────────────────────────────────────────────

const clean = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
writeFileSync('data/french/slots-no-answer.csv',
  'phone,full_name,days_since_we_offered,lead_stage,closer,their_yes,the_slots_we_offered,offered_at\n' +
  found.map((f) => [`+${f.phone}`, f.fullName, f.silent.toFixed(1), f.stage, f.owner,
    f.theirYes.slice(0, 300), f.ourOffer.slice(0, 400), f.offeredAt]
    .map((v) => `"${clean(v)}"`).join(',')).join('\n') + '\n');

const BANDS = [[0, 8, 'Last week'], [8, 31, '1–4 weeks ago'], [31, 121, '1–4 months ago'], [121, 1e9, 'Over 4 months ago']];
console.log(`\n  ${found.length} people were offered times and never answered.\n`);
for (const [lo, hi, label] of BANDS) {
  const list = found.filter((f) => f.silent >= lo && f.silent < hi);
  if (!list.length) continue;
  console.log(`\n  ══ ${label} — ${list.length} ══\n`);
  for (const f of list)
    console.log(`   +${f.phone.padEnd(13)} ${(f.fullName || '(no name in Wati)').padEnd(28)} ${f.silent.toFixed(0).padStart(4)}d   "${f.theirYes.replace(/\n/g, ' ').slice(0, 42)}"`);
}
console.log(`\n  → data/french/slots-no-answer.csv\n`);
