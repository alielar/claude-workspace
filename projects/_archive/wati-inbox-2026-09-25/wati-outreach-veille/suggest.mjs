// Writes reply suggestions for one lead into the Wati Inbox app (they appear on
// Ali's phone with a push "Suggestions prêtes"). Used by Claude Code after drafting.
//
//   node suggest.mjs 33612345678 '[{"bubbles":["…","…"],"why":"…"}, {"bubbles":["…"],"why":"…"}]'
//   node suggest.mjs 33612345678 < options.json
//
// Each option: bubbles = the messages to send, in order; why = two lines of reasoning.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const [waId, inline] = process.argv.slice(2);
if (!/^\d{8,15}$/.test(waId || '')) { console.error('Usage: node suggest.mjs <waId> <json options>'); process.exit(1); }
let options;
try { options = JSON.parse(inline ?? readFileSync(0, 'utf8')); } catch (e) { console.error('Options must be valid JSON:', e.message); process.exit(1); }
if (!Array.isArray(options) || !options.length || !options.every((o) => Array.isArray(o.bubbles) && o.bubbles.every((b) => typeof b === 'string' && b.trim()))) {
  console.error('Expected [{bubbles:[string,…], why?:string}, …]'); process.exit(1);
}

const db = new DatabaseSync(fileURLToPath(new URL('../wati-inbox/data/inbox.sqlite', import.meta.url)));
db.exec('PRAGMA busy_timeout = 3000');
const t = db.prepare('SELECT name FROM threads WHERE wa_id = ?').get(waId);
db.prepare('INSERT INTO suggestions (wa_id, created_at, options, pushed) VALUES (?, ?, ?, 0)').run(waId, new Date().toISOString(), JSON.stringify(options.map((o) => ({ bubbles: o.bubbles.map((b) => b.trim()), why: String(o.why || '') }))));
db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
console.log(`${options.length} suggestion(s) saved for ${t?.name || waId} — the phone will be notified within 10 s.`);
