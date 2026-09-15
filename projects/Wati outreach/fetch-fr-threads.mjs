// Full French conversation dump from the France Sales number.
// → data/french/threads-full.jsonl  {phone,name,stage,msgs:[{at,who,text,kind,op,tpl}]}
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
const H = { Authorization: `Bearer ${process.env.WATI_TOKEN}` };
const BASE = process.env.WATI_ENDPOINT;
const OUT = 'data/french/threads-full.jsonl';
const FR = /^(33|32|41|212|213|216|221|225|229|237|241|242|243|261|509|590|594|596|262|687|689)/;

const idx = JSON.parse(readFileSync('data/contacts-index.json', 'utf8')).filter((c) => FR.test(c.phone));
const done = new Set();
if (existsSync(OUT)) for (const l of readFileSync(OUT, 'utf8').split('\n')) { try { done.add(JSON.parse(l).phone); } catch {} }
const todo = idx.filter((c) => !done.has(c.phone));
console.log(`French contacts: ${idx.length} · already fetched: ${done.size} · to fetch: ${todo.length}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(phone, n) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${BASE}/api/v1/getMessages/${phone}?pageSize=100&pageNumber=${n}`, { headers: H });
      if (r.ok) return (await r.json()).messages?.items || [];
      if (r.status === 429) { await sleep(1500 * (a + 1)); continue; }
      return [];
    } catch { await sleep(600 * 2 ** a); }
  }
  return null;
}
function clean(m) {
  let text = m.text || '';
  if (!text && m.type === 'audio') {
    const t = (m.audioTranscriptionResultList || []).map((x) => x.text || x.transcription || '').filter(Boolean).join(' ');
    text = t ? `(vocal) ${t}` : '(message vocal)';
  }
  if (!text && m.type && m.type !== 'text') text = `(${m.type})`;
  return { at: m.created || m.timestamp, who: m.owner ? 'US' : 'LEAD', text,
           kind: m.type || 'text', op: m.operatorName || '', tpl: m.templateId ? 1 : 0 };
}
let n = 0;
for (let i = 0; i < todo.length; i += 8) {
  const slice = todo.slice(i, i + 8);
  const got = await Promise.all(slice.map(async (c) => {
    const msgs = [];
    for (let p = 1; p <= 6; p++) {
      const items = await page(c.phone, p);
      if (items === null) return null;
      const real = items.filter((m) => m.eventType === 'message' || m.eventType === 'broadcastMessage');
      msgs.push(...real.map(clean));
      if (items.length < 100) break;
    }
    msgs.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return { phone: c.phone, name: c.name, stage: c.stage, msgs };
  }));
  const lines = got.filter(Boolean).map((g) => JSON.stringify(g)).join('\n');
  if (lines) appendFileSync(OUT, lines + '\n');
  n += slice.length;
  if (i % 400 === 0) console.log(`  …${n}/${todo.length}`);
}
console.log('done');
