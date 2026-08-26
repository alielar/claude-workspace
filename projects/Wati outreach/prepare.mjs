// Reads the two lead spreadsheets, cleans them up, and writes a send plan.
// Sends nothing. Run with:  npm run prepare
//
// Produces:
//   data/plan.json      — the cleaned, de-duplicated list we will actually send to
//   data/skipped.csv    — every row we left out, with the reason why

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SOURCES = [
  { file: 'data/leads_had_meeting.csv', track: 'had_meeting' },
  { file: 'data/leads_no_meeting_yet.csv', track: 'no_meeting' },
];

// had_meeting is listed first on purpose: if the same person appears in both
// files, the warmer relationship wins.
export const TRACKS = {
  no_meeting: ['no_meating_fr_1_1', 'no_meating_fr_1_2'],
  had_meeting: ['hadmeating_fr_1_1', 'hadmeating_fr_1_2'],
};

// ── Names ────────────────────────────────────────────────────────────────────

// The spreadsheets were saved with the accents mangled ("AndrÃ©" instead of
// "André"). This puts them back.
function fixAccents(s) {
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const repaired = Buffer.from(s, 'latin1').toString('utf8');
    return repaired.includes('�') ? s : repaired;
  } catch {
    return s;
  }
}

// SHOUTED names and all-lowercase names both become "Andre".
function titleCase(s) {
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s)) {
    return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  return s;
}

// Bits of a surname that are never a first name on their own.
const PARTICLES = new Set([
  'el', 'al', 'de', 'da', 'du', 'di', 'le', 'la', 'ben', 'bin', 'ait', 'aït',
  'van', 'von', 'der', 'den', 'dos', 'des', 'ould', 'abd', 'ba', 'mc', 'mac',
]);

// Picks the best greeting name out of the two name columns. The spreadsheet has
// them the wrong way round on plenty of rows, so we try every word in both and
// take the first one that actually reads like a name.
function cleanName(first, last) {
  const words = [];
  for (const raw of [first, last]) {
    let n = fixAccents(String(raw || '')).trim().replace(/\s+/g, ' ');
    if (n.includes('@')) continue;              // an email landed in the name column
    for (const w of n.split(' ')) {
      const word = w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '');
      if (word) words.push(word);
    }
  }
  for (const w of words) {
    if (/[0-9]/.test(w)) continue;              // "Yg1", "Coolman08"
    if (w.length < 3) continue;                 // initials, "Ms", "Bs"
    if (PARTICLES.has(w.toLowerCase())) continue;
    if (/^(test|tbc|eeee+|xxx+|abc|moi|nuovo)$/i.test(w)) continue;
    return titleCase(w);
  }
  return null;
}

// ── Phone numbers ────────────────────────────────────────────────────────────

// How many digits should follow the country code, for the countries in this list.
// Anything whose country code is not on this list is set aside for review
// rather than guessed at.
const EXPECTED = {
  '33': [9], '32': [8, 9], '41': [9], '34': [9], '49': [10, 11],
  '44': [10], '39': [9, 10, 11], '351': [9], '352': [9], '31': [9],
  '212': [9], '213': [9], '216': [8], '221': [9], '225': [8, 10],
  '227': [8], '237': [9], '242': [9], '243': [9], '971': [9],
  '1': [10], '55': [10, 11], '61': [9], '36': [9], '40': [9], '48': [9],
};
// Countries where people write a leading 0 out of habit and it must come off.
const DROP_TRUNK_ZERO = new Set(['33', '32', '41', '34', '44', '49', '212', '351']);

function cleanPhone(raw) {
  let p = String(raw || '').replace(/[\s\-().]/g, '');
  if (!p.startsWith('+')) {
    if (/^00\d+$/.test(p)) p = '+' + p.slice(2);
    else if (/^0\d{9}$/.test(p)) p = '+33' + p.slice(1);   // a bare French mobile
    else return { error: 'no country code' };
  }
  let digits = p.slice(1).replace(/\D/g, '');
  if (!digits) return { error: 'no digits' };

  // Find the country code, longest match first.
  let cc = null;
  for (const len of [3, 2, 1]) {
    const head = digits.slice(0, len);
    if (EXPECTED[head]) { cc = head; break; }
  }
  if (!cc) return { error: `unrecognised country code (+${digits.slice(0, 3)}…)` };

  let rest = digits.slice(cc.length);
  if (DROP_TRUNK_ZERO.has(cc)) rest = rest.replace(/^0+/, '');
  // Some rows repeat the country code ("+3333744276684").
  while (rest.startsWith(cc) && !EXPECTED[cc].includes(rest.length)) {
    rest = rest.slice(cc.length).replace(/^0+/, '');
  }
  if (!EXPECTED[cc].includes(rest.length)) {
    return { error: `wrong length for +${cc} (${rest.length} digits after the code)` };
  }
  digits = cc + rest;

  // Obvious placeholders.
  const body = cc ? digits.slice(cc.length) : digits;
  if (/^(\d)\1+$/.test(body)) return { error: 'placeholder number' };
  if (/^(\d{2})\1{2,}$/.test(body)) return { error: 'placeholder number' };
  if (/^0*1?23456/.test(body)) return { error: 'placeholder number' };

  return { phone: digits };   // Wati wants digits only, no "+"
}

// ── Build the plan ───────────────────────────────────────────────────────────

const byPhone = new Map();
const skipped = [];
let totalRows = 0;

for (const { file, track } of SOURCES) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  const iId = col('lead_id'), iFirst = col('first_name'), iLast = col('last_name');
  const iPhone = col('phone'), iStatus = col('status');

  for (const line of lines.slice(1)) {
    totalRows++;
    const f = line.split(',');
    const leadId = f[iId];
    const rawPhone = f[iPhone];
    const source = file.split('/').pop();

    const { phone, error } = cleanPhone(rawPhone);
    if (error) {
      skipped.push({ leadId, source, name: f[iFirst], phone: rawPhone, reason: error });
      continue;
    }

    const name = cleanName(f[iFirst], f[iLast]);
    if (!name) {
      skipped.push({ leadId, source, name: f[iFirst], phone: rawPhone, reason: 'no usable first name' });
      continue;
    }

    const existing = byPhone.get(phone);
    if (existing) {
      skipped.push({
        leadId, source, name, phone: rawPhone,
        reason: `duplicate of lead ${existing.leadId} (${existing.track})`,
      });
      continue;
    }

    byPhone.set(phone, { leadId, name, phone, track, status: f[iStatus], source });
  }
}

const plan = [...byPhone.values()];
mkdirSync('data', { recursive: true });
writeFileSync('data/plan.json', JSON.stringify({ tracks: TRACKS, leads: plan }, null, 2));
writeFileSync(
  'data/skipped.csv',
  'lead_id,source,name,phone,reason\n' +
    skipped.map((s) => [s.leadId, s.source, s.name, s.phone, s.reason].join(',')).join('\n') + '\n',
);

// ── Report ───────────────────────────────────────────────────────────────────

const count = (t) => plan.filter((l) => l.track === t).length;
const reasons = {};
for (const s of skipped) {
  const key = s.reason.startsWith('duplicate') ? 'duplicate phone number' : s.reason;
  reasons[key] = (reasons[key] || 0) + 1;
}

console.log(`\n  Read ${totalRows} rows from ${SOURCES.length} spreadsheets.\n`);
console.log(`  Will message ${plan.length} people — ${plan.length * 2} messages in total:`);
console.log(`   • already had a meeting: ${count('had_meeting')}`);
console.log(`   • no meeting yet:        ${count('no_meeting')}\n`);
console.log(`  Left out ${skipped.length} rows:`);
for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(5)}  ${reason}`);
}
console.log(`\n  Full list of what was left out: data/skipped.csv\n`);
