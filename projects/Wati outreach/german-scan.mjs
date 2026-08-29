// Counts contacts per WhatsApp number in the account, so we know which German
// number is which and how much history there is. Read-only.
//
//   npm run german-scan

import { writeFileSync, mkdirSync } from 'node:fs';
import { wati } from './wati.mjs';

const numbers = {};   // whatsapp_<num> → { count, earliest, latest }
let total = 0;
const germanContacts = [];

for (let page = 1; page <= 400; page++) {
  const r = await wati(`/api/v1/getContacts?pageSize=100&pageNumber=${page}`);
  const list = r.contact_list || [];
  if (!list.length) break;

  for (const c of list) {
    total++;
    const tags = (c.customParams || []).filter((p) => p.name.startsWith('whatsapp_'));
    const created = c.created || '';
    for (const t of tags) {
      const num = t.name.replace('whatsapp_', '');
      const n = (numbers[num] ||= { count: 0, earliest: null, latest: null });
      n.count++;
      const d = created ? new Date(created) : null;
      if (d && !isNaN(d)) {
        if (!n.earliest || d < n.earliest) n.earliest = d;
        if (!n.latest || d > n.latest) n.latest = d;
      }
      if (num.startsWith('49')) {
        germanContacts.push({
          number: num,
          phone: c.phone,
          name: c.fullName || c.firstName || '',
          created,
          status: c.contactStatus,
          attrs: Object.fromEntries((c.customParams || [])
            .filter((p) => ['lead_stage', 'country', 'language', 'contact_owner', 'owner',
                            'owned_by_name', 'product', 'level', 'meeting_date', 'email'].includes(p.name))
            .map((p) => [p.name, p.value])),
        });
      }
    }
  }
  if (page % 50 === 0) console.log(`  …read ${total} contacts`);
}

mkdirSync('data/german', { recursive: true });
writeFileSync('data/german/contacts.json', JSON.stringify(germanContacts, null, 1));

const fmt = (d) => (d ? d.toISOString().slice(0, 10) : '—');
console.log(`\n  ${total} contacts in the account.\n`);
console.log('  WhatsApp number         contacts   first contact   last contact');
for (const [num, n] of Object.entries(numbers).sort((a, b) => b[1].count - a[1].count)) {
  const flag = num.startsWith('49') ? ' ← GERMAN' : '';
  console.log(`  +${num.padEnd(16)} ${String(n.count).padStart(8)}   ${fmt(n.earliest)}      ${fmt(n.latest)}${flag}`);
}
console.log(`\n  German contacts saved: ${germanContacts.length} → data/german/contacts.json\n`);
