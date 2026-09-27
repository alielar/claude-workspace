// Shows, for one lead, the last lead message, what Claude suggested, and what
// Ali actually sent afterwards — the input for a lesson in 04-CAS-APPRIS.md.
//
//   node compare-sent.mjs 33612345678

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const waId = (process.argv[2] || '').replace(/\D/g, '');
if (!waId) { console.error('Usage: node compare-sent.mjs <waId>'); process.exit(1); }
const db = new DatabaseSync(fileURLToPath(new URL('../wati-inbox/data/inbox.sqlite', import.meta.url)), { readOnly: true });
const fmt = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);
const t = db.prepare('SELECT * FROM threads WHERE wa_id = ?').get(waId);
const s = db.prepare('SELECT * FROM suggestions WHERE wa_id = ? ORDER BY id DESC LIMIT 1').get(waId);
if (!t || !s) { console.log('No suggestion recorded for this lead.'); process.exit(0); }
console.log(`${t.name || waId} · +${waId} · ${t.stage || ''} · ${t.country || ''}\n`);
console.log('── Contexte (derniers messages avant la suggestion) ──');
for (const m of db.prepare('SELECT * FROM messages WHERE wa_id = ? AND at <= ? ORDER BY at DESC LIMIT 6').all(waId, s.created_at).reverse()) console.log(`[${fmt(m.at)}] ${m.who === 'US' ? 'ALI ' : 'LEAD'}: ${m.text}`);
console.log(`\n── Suggestion #${s.id} (${fmt(s.created_at)}) ──`);
JSON.parse(s.options).forEach((o, i) => { console.log(`Option ${i + 1}:`); o.bubbles.forEach((b) => console.log(`  • ${b}`)); if (o.why) console.log(`  (pourquoi : ${o.why})`); });
console.log('\n── Ce qu\'Ali a réellement envoyé ensuite ──');
const sends = db.prepare("SELECT at, payload FROM sends WHERE wa_id = ? AND kind = 'text' AND ok = 1 AND at > ?").all(waId, s.created_at);
for (const x of sends) { const p = JSON.parse(x.payload); console.log(`[${fmt(x.at)}] via l'app${p.suggestionId ? ` (option ${(p.option ?? 0) + 1}${p.edited ? ', modifiée' : ', telle quelle'})` : ' (texte libre)'}: ${p.text}`); }
for (const m of db.prepare("SELECT * FROM messages WHERE wa_id = ? AND who = 'US' AND at > ? ORDER BY at").all(waId, s.created_at)) console.log(`[${fmt(m.at)}] ${m.tpl ? 'template' : 'Wati'}: ${m.text}`);
const after = db.prepare("SELECT * FROM messages WHERE wa_id = ? AND who = 'LEAD' AND at > ? ORDER BY at").all(waId, s.created_at);
if (after.length) { console.log('\n── Réponse du lead depuis ──'); for (const m of after) console.log(`[${fmt(m.at)}] LEAD: ${m.text}`); }
