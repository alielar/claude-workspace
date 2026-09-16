// Builds the HTML for the Google Doc: last two weeks, Ali's own conversations only.
//   node build-doc.mjs 2026-09-02
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const INTERNAL = new Set(['34695064884', '41788550527', '393755858639']);
const ALI = 'Admin Account';
const SINCE = process.argv[2] || '2026-09-02';
const fmt = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Translations from the earlier export, indexed PER PHONE as an ordered queue.
// Indexing globally by timestamp mixed up threads and duplicated repeated lines.
const byPhone = new Map();
for (const f of readdirSync('export/en')) {
  const phone = (f.match(/(\d{8,15})/) || [])[1];
  if (!phone) continue;
  const lines = [];
  let cur = null;
  const flush = () => { if (cur) lines.push(cur); };
  for (const line of readFileSync('export/en/' + f, 'utf8').split('\n')) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (LEAD|ALI|US \(automated template\)): ([\s\S]*)$/);
    if (m) { flush(); cur = { key: m[1] + '|' + (m[2] === 'LEAD' ? 'LEAD' : 'US'), text: m[3] }; }
    else if (cur) cur.text += '\n' + line;
  }
  flush();
  const q = new Map();
  for (const l of lines) {
    if (!q.has(l.key)) q.set(l.key, []);
    q.get(l.key).push(l.text.trim());
  }
  byPhone.set(phone, q);
}
// Exact overrides for individual lines, keyed "phone|timestamp|side"
const patch = JSON.parse(readFileSync('export/en-extra-3.json', 'utf8'));
// Threads the earlier export never covered
const extra = {};
for (const f of ['export/en-extra-1.json', 'export/en-extra-2.json']) {
  Object.assign(extra, JSON.parse(readFileSync(f, 'utf8')));
}

const threads = readFileSync('data/french/threads-full.jsonl', 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l)).filter((t) => !INTERNAL.has(t.phone));

const picked = [];
for (const t of threads) {
  const win = t.msgs
    .filter((m) => String(m.at) >= SINCE && String(m.text || '').trim())
    .filter((m) => m.who === 'LEAD' || m.tpl || m.op === ALI);
  const ali = win.filter((m) => m.who === 'US' && !m.tpl && m.op === ALI).length;
  const lead = win.filter((m) => m.who === 'LEAD').length;
  if (ali < 2 || lead < 2) continue;
  picked.push({ t, win, ali, lead });
}
picked.sort((a, b) => b.win.length - a.win.length);

let missing = 0;
let html = `<html><head><meta charset="utf-8"><title>Closing conversations — last two weeks</title></head><body>\n`;
html += `<p>${picked.length} closing conversations handled by Ali on the France Sales number (+33 6 73 55 59 77), `
     +  `from ${SINCE} onwards. Translated into English, Madrid times. Nothing older than two weeks, and no messages `
     +  `written by another adviser.<br>LEAD = the prospect · ALI = written by Ali · AUTO = automated template.<br>`
     +  `<b>Tip:</b> View → Show outline to jump between conversations.</p>\n`;

for (const p of picked) {
  const q = byPhone.get(p.t.phone);              // ordered queues from the earlier translation
  const pool = (extra[p.t.phone] || []).slice(); // ordered list for newly translated threads
  html += `\n<h1>+${esc(p.t.phone)} — ${esc(p.t.name || 'Sans nom')}</h1>\n`;
  html += `<p><i>CRM stage: ${esc(p.t.stage || 'unknown')} | ${fmt(p.win[0].at)} → ${fmt(p.win[p.win.length - 1].at)} | `
       +  `${p.win.length} messages (${p.ali} by Ali, ${p.lead} from the lead)</i></p>\n`;
  for (const m of p.win) {
    const side = m.who === 'LEAD' ? 'LEAD' : 'US';
    const key = fmt(m.at) + '|' + side;
    let text = q?.get(key)?.shift();
    if (!text) text = pool.shift();
    if (!text) text = patch[`${p.t.phone}|${key}`];   // last-resort, per-line override
    if (!text) { text = m.text; missing++; console.error(`UNTRANSLATED ${p.t.phone} [${fmt(m.at)}] ${m.who}: ${JSON.stringify(m.text)}`); }
    const who = m.who === 'LEAD' ? 'LEAD' : m.tpl ? 'AUTO' : 'ALI';
    html += `<p>[${fmt(m.at)}] ${who}: ${esc(text).replace(/\n/g, '<br>')}</p>\n`;
  }
}
html += '</body></html>\n';
writeFileSync('export/closing-doc.html', html);
console.log(`${picked.length} conversations · ${Math.round(html.length / 1024)} KB · lines left untranslated: ${missing}`);
