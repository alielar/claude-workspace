// Writes reply suggestions for one lead into the Wati Inbox app (they appear on
// Ali's phone with a push "Suggestions prêtes"). Used by Claude Code after drafting.
//
//   node suggest.mjs 33612345678 '[{"bubbles":["…","…"],"why":"…"}]'
//   node suggest.mjs 33612345678 < options.json
//   node suggest.mjs 33612345678 --at 18:05 [--title "Follow-up 18:05, window closes 19:04"] < options.json
//
// ONE option only (Ali's rule, 2026-09-27): bubbles = the messages to send, in order; why = two lines
// of reasoning. A second option is dropped.
// --at HH:MM (Madrid) = the time to send (Ali, 2026-10-01: « when the time comes, not now », « on my today
// planning, as a notification »): the draft stays hidden until 15 min before, a `followup` card goes on the
// Today screen at that time (any open card of the lead for that day is replaced, and the day plan will not
// re-judge the lead while this card is open), and the app pushes the reminder 10 min before.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const madrid = (d) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
let sendAt = null, showAt = null, title = null;
const atIdx = argv.indexOf('--at');
if (atIdx !== -1) {
  const m = /^(\d{4}-\d{2}-\d{2})?\s*(\d{1,2}):(\d{2})$/.exec(argv[atIdx + 1] || '');
  if (!m) { console.error('--at expects HH:MM (today, Madrid) or YYYY-MM-DD HH:MM'); process.exit(1); }
  const date = m[1] || madrid(new Date()).slice(0, 10);
  const guess = Date.parse(`${date}T${m[2].padStart(2, '0')}:${m[3]}:00Z`);
  const offset = Date.parse(madrid(new Date(guess)).replace(' ', 'T') + 'Z') - guess;
  sendAt = new Date(guess - offset).toISOString();
  showAt = new Date(Math.max(Date.now(), Date.parse(sendAt) - 15 * 60e3)).toISOString();
  argv.splice(atIdx, 2);
}
const titleIdx = argv.indexOf('--title');
if (titleIdx !== -1) { title = String(argv[titleIdx + 1] || '').trim().slice(0, 140) || null; argv.splice(titleIdx, 2); }
const [waId, inline] = argv;
if (!/^\d{8,15}$/.test(waId || '')) { console.error('Usage: node suggest.mjs <waId> [--at HH:MM] [--title "…"] <json options>'); process.exit(1); }
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
const clean = options.slice(0, 1).map((o) => ({ bubbles: o.bubbles.map((b) => b.trim()), why: String(o.why || '') }));
const suggestionId = Number(db.prepare("INSERT INTO suggestions (wa_id, created_at, options, pushed, note, source, show_at) VALUES (?, ?, ?, 0, ?, 'chat', ?)").run(waId, new Date().toISOString(), JSON.stringify(clean), process.env.SUGGEST_NOTE || null, showAt).lastInsertRowid);
db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
if (sendAt) {
  // The card on the Today screen: the reminder push 10 min before comes from the app's plan loop (dueReminders).
  const now = new Date().toISOString();
  const day = madrid(new Date(sendAt)).slice(0, 10), hm = madrid(new Date(sendAt)).slice(11, 16);
  const replaced = db.prepare("UPDATE plan_items SET state = 'superseded', updated_at = ? WHERE wa_id = ? AND day = ? AND state = 'open'").run(now, waId, day).changes;
  const n = clean[0].bubbles.length;
  db.prepare(`INSERT INTO plan_items (wa_id, name, day, kind, state, at, when_at, title, why, action, hub_sig, bubbles, suggestion_id, pushed, reminded, updated_at)
    VALUES (?, ?, ?, 'followup', 'open', ?, ?, ?, ?, ?, 'manual', ?, ?, 1, 0, ?)`)
    .run(waId, t?.name || null, day, now, sendAt, title || `Follow-up ${hm}, planned in chat`, clean[0].why.slice(0, 600), `Send the ${n} bubble${n > 1 ? 's' : ''} waiting in the thread (shown from ${madrid(new Date(showAt)).slice(11, 16)})`, JSON.stringify(clean[0].bubbles), suggestionId, now);
  console.log(`Suggestion saved for ${t?.name || waId} — hidden until ${madrid(new Date(showAt)).slice(11, 16)} Madrid; follow-up card at ${hm} on the Today screen${replaced ? ` (replaces ${replaced} open card)` : ''}, reminder push 10 min before.`);
} else console.log(`Suggestion saved for ${t?.name || waId} — the phone will be notified within 10 s.`);
