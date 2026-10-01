// Writes reply suggestions for one lead into the Wati Inbox app (they appear on
// Ali's phone with a push "Suggestions prêtes"). Used by Claude Code after drafting.
//
//   node suggest.mjs 33612345678 '[{"bubbles":["…","…"],"why":"…"}]'
//   node suggest.mjs 33612345678 < options.json
//   node suggest.mjs 33612345678 --at 18:00 < options.json    hidden (no push, not on screen) until 18:00 Madrid
//
// ONE option only (Ali's rule, 2026-09-27): bubbles = the messages to send, in order; why = two lines
// of reasoning. A second option is dropped. --at (Ali, 2026-10-01): a message planned for later in the day
// appears on the phone when the time comes, not now.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
let showAt = null;
const atIdx = argv.indexOf('--at');
if (atIdx !== -1) {
  const m = /^(\d{4}-\d{2}-\d{2})?\s*(\d{1,2}):(\d{2})$/.exec(argv[atIdx + 1] || '');
  if (!m) { console.error('--at expects HH:MM (today, Madrid) or YYYY-MM-DD HH:MM'); process.exit(1); }
  const madrid = (d) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  const date = m[1] || madrid(new Date()).slice(0, 10);
  const guess = Date.parse(`${date}T${m[2].padStart(2, '0')}:${m[3]}:00Z`);
  const offset = Date.parse(madrid(new Date(guess)).replace(' ', 'T') + 'Z') - guess;
  showAt = new Date(guess - offset).toISOString();
  argv.splice(atIdx, 2);
}
const [waId, inline] = argv;
if (!/^\d{8,15}$/.test(waId || '')) { console.error('Usage: node suggest.mjs <waId> [--at HH:MM] <json options>'); process.exit(1); }
let options;
try { options = JSON.parse(inline ?? readFileSync(0, 'utf8')); } catch (e) { console.error('Options must be valid JSON:', e.message); process.exit(1); }
if (!Array.isArray(options) || !options.length || !options.every((o) => Array.isArray(o.bubbles) && o.bubbles.every((b) => typeof b === 'string' && b.trim()))) {
  console.error('Expected [{bubbles:[string,…], why?:string}, …]'); process.exit(1);
}

const db = new DatabaseSync(fileURLToPath(new URL('../wati-inbox/data/inbox.sqlite', import.meta.url)));
db.exec('PRAGMA busy_timeout = 3000');
const t = db.prepare('SELECT name FROM threads WHERE wa_id = ?').get(waId);
if (options.length > 1) console.error('One set of bubbles per suggestion — keeping the first, dropping', options.length - 1);
try { db.exec('ALTER TABLE suggestions ADD COLUMN show_at TEXT'); } catch {}
db.prepare("INSERT INTO suggestions (wa_id, created_at, options, pushed, note, source, show_at) VALUES (?, ?, ?, 0, ?, 'chat', ?)").run(waId, new Date().toISOString(), JSON.stringify(options.slice(0, 1).map((o) => ({ bubbles: o.bubbles.map((b) => b.trim()), why: String(o.why || '') }))), process.env.SUGGEST_NOTE || null, showAt);
db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
console.log(showAt
  ? `Suggestion saved for ${t?.name || waId} — hidden until ${new Date(showAt).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(11, 16)} Madrid, then shown and pushed.`
  : `Suggestion saved for ${t?.name || waId} — the phone will be notified within 10 s.`);
