// Full contact index: phone, name, stage, channel. → data/contacts-index.json
import { writeFileSync } from 'node:fs';
const H = { Authorization: `Bearer ${process.env.WATI_TOKEN}` };
const out = [];
for (let page = 1; page <= 400; page++) {
  let d = null;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${process.env.WATI_ENDPOINT}/api/v1/getContacts?pageSize=100&pageNumber=${page}`, { headers: H });
      if (r.ok) { d = await r.json(); break; }
    } catch {} await new Promise((s) => setTimeout(s, 600 * (a + 1)));
  }
  const list = d?.result?.contact_list || d?.contact_list || [];
  if (!list.length) break;
  for (const c of list) {
    const g = (n) => (c.customParams || []).find((x) => x.name === n)?.value || '';
    out.push({ phone: c.wAid || c.phone, name: c.fullName || g('name'), stage: g('lead_stage'),
               chan: c.waChannelPhone || '', last: c.lastUpdated || '', created: c.created || '' });
  }
  if (page % 20 === 0) console.log(`  …page ${page} · ${out.length} contacts`);
}
writeFileSync('data/contacts-index.json', JSON.stringify(out));
const by = {}, byChan = {};
for (const c of out) { by[c.stage || '(none)'] = (by[c.stage || '(none)'] || 0) + 1; byChan[c.chan || '(none)'] = (byChan[c.chan || '(none)'] || 0) + 1; }
console.log('TOTAL contacts:', out.length);
console.log('\nby stage:'); Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ', String(n).padStart(6), k));
console.log('\nby channel:'); Object.entries(byChan).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ', String(n).padStart(6), k));
