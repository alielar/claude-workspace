// Checks that template names actually exist in Wati, are approved, and tells you
// how many variables each one expects.
//
//   node --env-file=.env check-templates.mjs followup_text_5_fra noshow_text_7_fra
//   node --env-file=.env check-templates.mjs --lang French          (list them all)
//
// Read-only. It never sends anything.

import { wati, endpoint, checkKeys } from './wati.mjs';

const problems = checkKeys();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const args = process.argv.slice(2);
const langIdx = args.indexOf('--lang');
const langFilter = langIdx !== -1 ? args[langIdx + 1] : null;
const skip = langIdx === -1 ? new Set() : new Set([langIdx, langIdx + 1]);
const names = args.filter((a, i) => !skip.has(i) && !a.startsWith('--'));

// Pull every template in the account.
const all = [];
for (let page = 1; page <= 30; page++) {
  const res = await wati(`/api/v1/getMessageTemplates?pageSize=100&pageNumber=${page}`);
  const items = res.messageTemplates || res.result || res.data || [];
  if (!items.length) break;
  all.push(...items);
  if (items.length < 100) break;
}

const langOf = (t) => t.language?.key || t.language?.text || t.language || '';
const paramsOf = (t) => (t.customParams || []).map((p) => p.paramName);
const byName = new Map(all.map((t) => [t.elementName, t]));

console.log(`Account: ${endpoint}  —  ${all.length} templates\n`);

if (langFilter) {
  const rows = all
    .filter((t) => String(langOf(t)).toLowerCase().startsWith(langFilter.toLowerCase()))
    .filter((t) => t.status === 'APPROVED')
    .sort((a, b) => a.elementName.localeCompare(b.elementName));
  console.log(`Approved ${langFilter} templates (${rows.length}):\n`);
  for (const t of rows) {
    console.log(`  ${t.elementName.padEnd(36)} variables: ${paramsOf(t).length || 'none'} ${paramsOf(t).join(', ')}`);
  }
  process.exit(0);
}

if (!names.length) {
  console.error('Give me one or more template names to check, or use --lang French.');
  process.exit(1);
}

let bad = 0;

for (const raw of names) {
  const name = raw.trim();
  const t = byName.get(name);

  if (t && t.status === 'APPROVED') {
    const p = paramsOf(t);
    console.log(`OK    ${name}`);
    console.log(`        language: ${langOf(t)}   variables: ${p.length ? `${p.length} (${p.join(', ')})` : 'none'}`);
    continue;
  }

  bad++;

  if (t) {
    console.log(`PROBLEM  ${name} — exists but its status is ${t.status}, not APPROVED. Wati will refuse it.`);
    continue;
  }

  console.log(`PROBLEM  ${name} — no template with this exact name.`);

  // Anything that only differs by case or stray spaces is almost certainly the typo.
  const exactish = all.find((x) => x.elementName.toLowerCase() === name.toLowerCase());
  if (exactish) {
    console.log(`         Did you mean "${exactish.elementName}"? (same name, different capitals)`);
    continue;
  }

  // Otherwise offer the closest family members.
  const stem = name.replace(/_(fr|fra|france|de|es|it|en)(_v\d+)?$/i, '');
  const near = all
    .filter((x) => x.status === 'APPROVED' && x.elementName.startsWith(stem))
    .map((x) => `${x.elementName} (${langOf(x)})`);
  if (near.length) console.log(`         Closest matches: ${near.join(', ')}`);
  else console.log(`         Nothing similar found. Check the spelling on the Wati dashboard.`);
}

console.log('');
console.log(bad === 0
  ? `All ${names.length} name(s) are correct and approved.`
  : `${bad} of ${names.length} name(s) are still wrong.`);
process.exit(bad === 0 ? 0 : 1);
