// SQLite storage (Node's built-in driver). One file: data/inbox.sqlite.
// The watcher and suggest scripts in "Wati outreach" open the same file.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
export const db = new DatabaseSync('data/inbox.sqlite');
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS threads (
    wa_id TEXT PRIMARY KEY,
    name TEXT,
    last_inbound_at TEXT,
    last_outbound_at TEXT,
    last_text TEXT,
    pending INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    wa_id TEXT NOT NULL,
    at TEXT NOT NULL,
    who TEXT NOT NULL,
    text TEXT,
    kind TEXT,
    tpl INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS ix_messages_thread ON messages(wa_id, at);
  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    options TEXT NOT NULL,
    pushed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    ok INTEGER NOT NULL,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT);
`);

for (const col of ['wanted INTEGER NOT NULL DEFAULT 0', 'muted INTEGER NOT NULL DEFAULT 0', 'stage TEXT', 'meeting TEXT', 'country TEXT', 'email TEXT', 'contact_at TEXT']) {
  try { db.exec(`ALTER TABLE threads ADD COLUMN ${col}`); } catch {}
}
// note = what Ali should know before sending; source = auto | ali (app button) | chat (Claude Code session)
// instruction = what Ali typed to get this draft instead of the previous one (parent_id)
for (const col of ['note TEXT', 'source TEXT', 'instruction TEXT', 'parent_id INTEGER']) {
  try { db.exec(`ALTER TABLE suggestions ADD COLUMN ${col}`); } catch {}
}
// What the app learned from each send (2026-09-27): confirmed = sent as drafted, lesson = Ali changed
// or wrote it himself and Claude logged why in 04-CAS-APPRIS.md, none = nothing worth keeping.
db.exec(`CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  suggestion_id INTEGER,
  batch TEXT,
  sent TEXT NOT NULL,
  title TEXT,
  text TEXT
)`);

export const getState = (k) => db.prepare('SELECT value FROM state WHERE key = ?').get(k)?.value ?? null;
export const setState = (k, v) => db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

export function upsertMessages(waId, msgs) {
  const ins = db.prepare('INSERT OR REPLACE INTO messages (id, wa_id, at, who, text, kind, tpl) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const m of msgs) ins.run(m.id, waId, m.at, m.who, m.text, m.kind, m.tpl ? 1 : 0);
}

export const threadMessages = (waId) => db.prepare('SELECT * FROM messages WHERE wa_id = ? ORDER BY at').all(waId);
export const getThread = (waId) => db.prepare('SELECT * FROM threads WHERE wa_id = ?').get(waId);

export function saveThread(t) {
  db.prepare(`INSERT INTO threads (wa_id, name, last_inbound_at, last_outbound_at, last_text, pending, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wa_id) DO UPDATE SET name = COALESCE(excluded.name, name), last_inbound_at = excluded.last_inbound_at,
      last_outbound_at = excluded.last_outbound_at, last_text = excluded.last_text, pending = excluded.pending, updated_at = excluded.updated_at`)
    .run(t.wa_id, t.name ?? null, t.last_inbound_at ?? null, t.last_outbound_at ?? null, t.last_text ?? null, t.pending ? 1 : 0, new Date().toISOString());
}

export const activeThreads = (days) => db.prepare(`SELECT * FROM threads WHERE COALESCE(last_inbound_at, '') > ? OR COALESCE(last_outbound_at, '') > ?`).all(new Date(Date.now() - days * 864e5).toISOString(), new Date(Date.now() - days * 864e5).toISOString());

export const inbox = () => db.prepare(`SELECT * FROM threads WHERE last_inbound_at IS NOT NULL OR last_outbound_at IS NOT NULL
  ORDER BY pending DESC, MAX(COALESCE(last_inbound_at, ''), COALESCE(last_outbound_at, '')) DESC LIMIT 60`).all();

export const setMuted = (waId, muted) => db.prepare('UPDATE threads SET muted = ? WHERE wa_id = ?').run(muted ? 1 : 0, waId);
export const saveContact = (waId, c) => db.prepare('UPDATE threads SET name = COALESCE(NULLIF(?, \'\'), name), stage = ?, meeting = ?, country = ?, email = ?, contact_at = ? WHERE wa_id = ?').run(c.name, c.stage, c.meeting, c.country, c.email, new Date().toISOString(), waId);
export const wantSuggestion = (waId) => db.prepare('UPDATE threads SET wanted = 1 WHERE wa_id = ?').run(waId);
export const latestSuggestion = (waId) => db.prepare('SELECT * FROM suggestions WHERE wa_id = ? ORDER BY id DESC LIMIT 1').get(waId);
export const insertSuggestion = (waId, options, note, source, { instruction = null, parentId = null } = {}) => Number(db.prepare('INSERT INTO suggestions (wa_id, created_at, options, pushed, note, source, instruction, parent_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?)').run(waId, new Date().toISOString(), JSON.stringify(options), note || null, source, instruction, parentId).lastInsertRowid);
export const getSuggestion = (id) => db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id);
export const insertLesson = (l) => Number(db.prepare('INSERT INTO lessons (wa_id, at, kind, suggestion_id, batch, sent, title, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(l.wa_id, new Date().toISOString(), l.kind, l.suggestion_id ?? null, l.batch ?? null, JSON.stringify(l.sent), l.title ?? null, l.text ?? null).lastInsertRowid);
export const latestLesson = (waId) => db.prepare('SELECT id, at, kind, title FROM lessons WHERE wa_id = ? ORDER BY id DESC LIMIT 1').get(waId);
export const lessonRunsSince = (iso) => db.prepare("SELECT count(*) n FROM lessons WHERE at >= ? AND kind != 'confirmed'").get(iso).n;
export const messagesBefore = (waId, iso, n) => db.prepare('SELECT at, who, text, tpl FROM messages WHERE wa_id = ? AND at <= ? ORDER BY at DESC LIMIT ?').all(waId, iso, n).reverse();
export const autoSuggestionsSince = (iso) => db.prepare("SELECT count(*) n FROM suggestions WHERE created_at >= ? AND source = 'auto'").get(iso).n;
export const pendingRecent = (hours) => db.prepare('SELECT * FROM threads WHERE pending = 1 AND muted = 0 AND last_inbound_at > ?').all(new Date(Date.now() - hours * 3600e3).toISOString());
export const unpushedSuggestions = () => db.prepare('SELECT s.*, t.name FROM suggestions s LEFT JOIN threads t ON t.wa_id = s.wa_id WHERE s.pushed = 0').all();
export const markSuggestionPushed = (id) => db.prepare('UPDATE suggestions SET pushed = 1 WHERE id = ?').run(id);

export const logSend = (waId, kind, payload, ok, error) =>
  db.prepare('INSERT INTO sends (wa_id, at, kind, payload, ok, error) VALUES (?, ?, ?, ?, ?, ?)').run(waId, new Date().toISOString(), kind, JSON.stringify(payload), ok ? 1 : 0, error ?? null);
export const sentTexts = (waId) => new Set(db.prepare("SELECT payload FROM sends WHERE wa_id = ? AND kind = 'text' AND ok = 1").all(waId).map((r) => JSON.parse(r.payload).text));
export const sentTemplates = (waId) => db.prepare("SELECT at, payload FROM sends WHERE wa_id = ? AND kind = 'template' AND ok = 1 ORDER BY at").all(waId);

export const subscriptions = () => db.prepare('SELECT * FROM push_subscriptions').all();
export const addSubscription = (s, ua) => db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?)').run(s.endpoint, s.keys.p256dh, s.keys.auth, ua, new Date().toISOString());
export const removeSubscription = (endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
