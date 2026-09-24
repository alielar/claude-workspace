// Prints one line whenever a lead on the France Sales number is waiting for a
// reply and has no suggestion yet. Meant to be watched by Claude Code (Monitor):
//
//   node watch-pending.mjs
//
// Reads the Wati Inbox database directly (../wati-inbox/data/inbox.sqlite).
// Costs nothing while idle. Ctrl-C to stop.

import { DatabaseSync } from 'node:sqlite';

const DB = new URL('../wati-inbox/data/inbox.sqlite', import.meta.url).pathname;
const db = new DatabaseSync(DB, { readOnly: true });
const q = db.prepare(`SELECT t.wa_id, t.name, t.last_inbound_at, t.last_text
  FROM threads t
  WHERE t.pending = 1
    AND t.wa_id != '34695064884'  -- Ali's own number (test thread)
    AND NOT EXISTS (SELECT 1 FROM suggestions s WHERE s.wa_id = t.wa_id AND s.created_at >= t.last_inbound_at)
  ORDER BY t.last_inbound_at DESC`);

const seen = new Map(); // wa_id → last_inbound_at already announced
console.log(`watching ${DB} — one line per lead waiting for a reply`);
const check = () => {
  for (const r of q.all()) {
    if (seen.get(r.wa_id) === r.last_inbound_at) continue;
    seen.set(r.wa_id, r.last_inbound_at);
    console.log(`PENDING ${r.wa_id} ${r.name || '?'} — ${new Date(r.last_inbound_at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })} — ${String(r.last_text || '').replace(/\s+/g, ' ').slice(0, 90)}`);
  }
};
check();
setInterval(check, 30_000);
