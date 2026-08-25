// Connection test. Confirms the keys work and reports on your templates.
// Sends nothing to anyone.
//
//   npm run check              → the four France templates we care about
//   npm run check -- all       → every template, grouped by status
//   npm run check -- pending   → only templates still awaiting approval

import { checkKeys, endpoint, wati } from './wati.mjs';

// The templates this campaign uses, in send order per track.
export const CAMPAIGN = {
  no_meeting: ['no_meating_fr_1_1', 'no_meating_fr_1_2'],
  had_meeting: ['hadmeating_fr_1_1', 'hadmeating_fr_1_2'],
};

const mode = (process.argv[2] || 'campaign').toLowerCase();

const problems = checkKeys();
if (problems.length) {
  console.log('\n  Not ready yet:\n');
  for (const p of problems) console.log(`   • ${p}`);
  console.log('\n  Open the .env file in this folder and fill in the two values.\n');
  process.exit(1);
}

// Walks every page so nothing is missed.
export async function getAllTemplates() {
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= 50) {
    const d = await wati(`/api/v1/getMessageTemplates?pageSize=200&pageNumber=${page}`);
    const batch = d.messageTemplates || [];
    if (!batch.length) break;
    all.push(...batch);
    total = d.link?.total ?? all.length;
    page++;
  }
  return { all, total };
}

const describe = (t) => ({
  name: t.elementName || '(no name)',
  status: String(t.status || 'UNKNOWN').toUpperCase(),
  language: t.language?.value || '',
  fields: (t.customParams || []).map((p) => p.paramName).filter(Boolean),
  body: t.body || t.bodyOriginal || '',
});

console.log(`\n  Talking to Wati at ${endpoint} ...\n`);

let all, total;
try {
  ({ all, total } = await getAllTemplates());
} catch (err) {
  console.log(`  Failed.\n\n   ${err.message}\n`);
  process.exit(1);
}

console.log(`  Connected. Read ${all.length} of ${total} templates in your account.\n`);

const rows = all.map(describe);
const byName = new Map(rows.map((r) => [r.name, r]));

if (mode === 'campaign') {
  let allReady = true;
  for (const [track, names] of Object.entries(CAMPAIGN)) {
    console.log(`  ${track.replace('_', ' ')}:`);
    for (const [i, name] of names.entries()) {
      const r = byName.get(name);
      if (!r) {
        console.log(`   ${i + 1}. ${name}  — NOT FOUND in your account`);
        allReady = false;
        continue;
      }
      const ok = r.status === 'APPROVED';
      if (!ok) allReady = false;
      const fields = r.fields.length ? `needs: ${r.fields.join(', ')}` : 'no personalised fields';
      console.log(`   ${i + 1}. ${name.padEnd(20)} ${r.status.padEnd(9)} ${fields}`);
    }
    console.log();
  }
  console.log(allReady
    ? '  All four are approved — ready to send.\n'
    : '  Not all four are approved yet. Nothing can be sent until they are.\n');
} else {
  const show = mode === 'pending'
    ? rows.filter((r) => r.status !== 'APPROVED' && r.status !== 'DELETED')
    : rows.filter((r) => r.status !== 'DELETED');
  const groups = {};
  for (const r of show) (groups[r.status] ||= []).push(r);
  for (const [status, list] of Object.entries(groups)) {
    console.log(`  ${status} (${list.length}):`);
    for (const r of list) {
      const fields = r.fields.length ? `  needs: ${r.fields.join(', ')}` : '';
      console.log(`   ${r.name}  [${r.language}]${fields}`);
    }
    console.log();
  }
}
