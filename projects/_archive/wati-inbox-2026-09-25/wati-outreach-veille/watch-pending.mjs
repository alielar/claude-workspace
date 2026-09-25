// Prints one line per event Claude should act on, read from the Wati Inbox
// database (../wati-inbox/data/inbox.sqlite). Meant to run under Claude Code's
// Monitor tool (signal `veille`). Costs nothing while idle. Ctrl-C to stop.
//
//   PENDING   <waId> <name> — a lead is waiting for a reply and has no suggestion yet
//   REQUESTED <waId> <name> — Ali tapped "Demander une suggestion" in the app
//   LESSON    <waId> <name> — Ali answered differently from the suggestion: learn from it
//
//   node watch-pending.mjs

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DB = fileURLToPath(new URL('../wati-inbox/data/inbox.sqlite', import.meta.url));
const SEEN = fileURLToPath(new URL('./data/veille-seen.json', import.meta.url));
const ME = '34695064884'; // Ali's own number (test thread)
const db = new DatabaseSync(DB, { readOnly: true });
const fmt = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 90);

const qPending = db.prepare(`SELECT t.wa_id, t.name, t.last_inbound_at, t.last_text, t.wanted
  FROM threads t
  WHERE t.wanted = 1
     OR (t.pending = 1 AND t.muted = 0 AND t.wa_id != ? AND t.last_inbound_at > datetime('now', '-48 hours')
    AND NOT EXISTS (SELECT 1 FROM suggestions s WHERE s.wa_id = t.wa_id AND s.created_at >= t.last_inbound_at))
  ORDER BY t.last_inbound_at DESC`);

// Latest suggestion per thread that Ali has answered after (from the app or from Wati).
const qAnswered = db.prepare(`SELECT s.id, s.wa_id, t.name, s.created_at, s.options, t.last_outbound_at
  FROM suggestions s JOIN threads t ON t.wa_id = s.wa_id
  WHERE s.id = (SELECT MAX(id) FROM suggestions WHERE wa_id = s.wa_id)
    AND t.last_outbound_at > s.created_at AND t.wa_id != ?`);
const qSends = db.prepare(`SELECT payload FROM sends WHERE wa_id = ? AND kind = 'text' AND ok = 1 AND at > ?`);
const qSentMsgs = db.prepare(`SELECT text FROM messages WHERE wa_id = ? AND who = 'US' AND at > ?`);

const seen = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
const remember = (k, v) => { seen[k] = v; writeFileSync(SEEN, JSON.stringify(seen)); };

function check() {
  for (const r of qPending.all(ME)) {
    const key = `${r.last_inbound_at}|${r.wanted}`;
    if (seen[`p:${r.wa_id}`] === key) continue;
    remember(`p:${r.wa_id}`, key);
    console.log(`${r.wanted ? 'REQUESTED' : 'PENDING'} ${r.wa_id} ${r.name || '?'} — ${fmt(r.last_inbound_at)} — ${short(r.last_text)}`);
  }
  // Links and [PLACEHOLDERS] are meant to be replaced — not a deviation.
  const norm = (t) => String(t).trim().replace(/https?:\/\/\S+/g, '[LIEN]').replace(/\[[A-ZÉ ]+\]/g, '[LIEN]').replace(/\s+/g, ' ');
  for (const s of qAnswered.all(ME)) {
    if (seen[`l:${s.id}`]) continue;
    if (Date.now() - new Date(s.last_outbound_at).getTime() < 10 * 60_000) continue; // Ali may still be sending bubbles
    const options = JSON.parse(s.options);
    const proposed = new Set(options.flatMap((o) => o.bubbles.map(norm)));
    const sends = qSends.all(s.wa_id, s.created_at).map((x) => JSON.parse(x.payload));
    const viaAppUnedited = sends.length && sends.every((x) => x.suggestionId === s.id && !x.edited);
    const sentTexts = qSentMsgs.all(s.wa_id, s.created_at).map((m) => norm(m.text)).filter(Boolean);
    // Small wording changes (a synonym, a word dropped) are not lessons: ≥ 80 % of the words in common counts as "used as is".
    const words = (t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean));
    const similar = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return (2 * n) / (A.size + B.size || 1) >= 0.8; };
    const identical = sentTexts.length && sentTexts.every((t) => [...proposed].some((p) => similar(t, p)));
    remember(`l:${s.id}`, true);
    if (viaAppUnedited || identical) continue; // Ali used the suggestion as is — nothing to learn
    console.log(`LESSON ${s.wa_id} ${s.name || '?'} — ${sends.length ? 'modifié dans l’app' : 'répondu depuis Wati'} — suggestion #${s.id}`);
  }
}
console.log(`watching ${DB}`);
check();
setInterval(check, 30_000);
