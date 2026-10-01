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

for (const col of ['wanted INTEGER NOT NULL DEFAULT 0', 'muted INTEGER NOT NULL DEFAULT 0', 'stage TEXT', 'meeting TEXT', 'country TEXT', 'email TEXT', 'contact_at TEXT', 'offer TEXT', 'handled_at TEXT']) { // handled_at = the lead message Ali marked as treated (2026-09-30) // offer = JSON {format, level, hpw, months} typed by Ali (2026-09-29)
  try { db.exec(`ALTER TABLE threads ADD COLUMN ${col}`); } catch {}
}
// note = what Ali should know before sending; source = auto | ali (app button) | chat (Claude Code session)
// instruction = what Ali typed to get this draft instead of the previous one (parent_id)
for (const col of ['note TEXT', 'source TEXT', 'instruction TEXT', 'parent_id INTEGER', 'kind TEXT', 'moves TEXT', 'needs TEXT']) { // kind = draft | needs | skip (2026-09-30)
  try { db.exec(`ALTER TABLE suggestions ADD COLUMN ${col}`); } catch {}
}
try { db.exec('ALTER TABLE messages ADD COLUMN tpl_name TEXT'); } catch {} // name of the automated template (2026-09-30)
// Sales Hub automation alerts (2026-09-30): one row per (lead, step) when the next TBC template should be
// paused by Ali in the Sales Hub — kind timing (he replied just before it) or fit (it contradicts his
// unanswered question; Claude judged it). state: open → paused → sent | replied | fired | expired | ignored | ok
db.exec(`CREATE TABLE IF NOT EXISTS tbc_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  name TEXT,
  step INTEGER NOT NULL,
  day0 TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  at TEXT NOT NULL,
  fires_at TEXT NOT NULL,
  tpl TEXT NOT NULL,
  tpl_text TEXT,
  question TEXT,
  question_at TEXT,
  why TEXT,
  bubbles TEXT,
  window_open INTEGER NOT NULL DEFAULT 1,
  pushed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tbc_alert ON tbc_alerts(wa_id, day0, step, kind)`);
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

// Telemarketing number (+33671283778): both sides of each conversation, read from the webhook
// (the API cannot read that channel), and the flags Claude raises on the booking bot (2026-09-29).
db.exec(`CREATE TABLE IF NOT EXISTS tm_messages (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  at TEXT NOT NULL,
  who TEXT NOT NULL,
  text TEXT,
  type TEXT,
  name TEXT
);
CREATE INDEX IF NOT EXISTS ix_tm_thread ON tm_messages(wa_id, at);
CREATE TABLE IF NOT EXISTS tm_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  quote TEXT,
  name TEXT,
  seen INTEGER NOT NULL DEFAULT 0
)`);

export const getState = (k) => db.prepare('SELECT value FROM state WHERE key = ?').get(k)?.value ?? null;
export const setState = (k, v) => db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

export function upsertMessages(waId, msgs) {
  const ins = db.prepare('INSERT OR REPLACE INTO messages (id, wa_id, at, who, text, kind, tpl, tpl_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const m of msgs) ins.run(m.id, waId, m.at, m.who, m.text, m.kind, m.tpl ? 1 : 0, m.tplName ?? null);
}

// ── Sales Hub automation alerts ───────────────────────────────────────────────
export const tbcAlert = (waId, day0, step, kind) => db.prepare('SELECT * FROM tbc_alerts WHERE wa_id = ? AND day0 = ? AND step = ? AND kind = ?').get(waId, day0, step, kind);
export const tbcAlertById = (id) => db.prepare('SELECT * FROM tbc_alerts WHERE id = ?').get(id);
export const insertTbcAlert = (a) => Number(db.prepare('INSERT INTO tbc_alerts (wa_id, name, step, day0, kind, state, at, fires_at, tpl, tpl_text, question, question_at, why, bubbles, window_open, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(a.wa_id, a.name ?? null, a.step, a.day0, a.kind, a.state || 'open', new Date().toISOString(), a.fires_at, a.tpl, a.tpl_text ?? null, a.question ?? null, a.question_at ?? null, a.why ?? null, a.bubbles ? JSON.stringify(a.bubbles) : null, a.window_open ? 1 : 0, new Date().toISOString()).lastInsertRowid);
export const setTbcAlertState = (id, state) => db.prepare('UPDATE tbc_alerts SET state = ?, updated_at = ? WHERE id = ?').run(state, new Date().toISOString(), id);
export const closeTbcAlerts = (waId, state) => db.prepare("UPDATE tbc_alerts SET state = ?, updated_at = ? WHERE wa_id = ? AND state IN ('open', 'paused')").run(state, new Date().toISOString(), waId).changes;
export const openTbcAlerts = () => db.prepare("SELECT * FROM tbc_alerts WHERE state IN ('open', 'paused') ORDER BY fires_at").all();
export const openTbcAlert = (waId) => db.prepare("SELECT * FROM tbc_alerts WHERE wa_id = ? AND state IN ('open', 'paused') ORDER BY fires_at LIMIT 1").get(waId);
export const unpushedTbcAlerts = () => db.prepare("SELECT * FROM tbc_alerts WHERE pushed = 0 AND state = 'open'").all();
export const markTbcAlertPushed = (id) => db.prepare('UPDATE tbc_alerts SET pushed = 1 WHERE id = ?').run(id);
export const tbcFitRunsSince = (iso) => db.prepare("SELECT count(*) n FROM tbc_alerts WHERE kind = 'fit' AND at >= ?").get(iso).n;
export const tbcAlertCounts = () => db.prepare("SELECT count(*) open FROM tbc_alerts WHERE state = 'open'").get();

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

export const setOffer = (waId, offer) => db.prepare('UPDATE threads SET offer = ? WHERE wa_id = ?').run(offer ? JSON.stringify(offer) : null, waId);
export const getOffer = (waId) => { try { const r = db.prepare('SELECT offer FROM threads WHERE wa_id = ?').get(waId); return r?.offer ? JSON.parse(r.offer) : null; } catch { return null; } };
export const setHandled = (waId, upTo) => db.prepare('UPDATE threads SET pending = 0, handled_at = ? WHERE wa_id = ?').run(upTo, waId);
export const setMuted = (waId, muted) => db.prepare('UPDATE threads SET muted = ? WHERE wa_id = ?').run(muted ? 1 : 0, waId);
export const saveContact = (waId, c) => db.prepare('UPDATE threads SET name = COALESCE(NULLIF(?, \'\'), name), stage = ?, meeting = ?, country = ?, email = ?, contact_at = ? WHERE wa_id = ?').run(c.name, c.stage, c.meeting, c.country, c.email, new Date().toISOString(), waId);
export const wantSuggestion = (waId) => db.prepare('UPDATE threads SET wanted = 1 WHERE wa_id = ?').run(waId);
export const latestSuggestion = (waId) => db.prepare('SELECT * FROM suggestions WHERE wa_id = ? ORDER BY id DESC LIMIT 1').get(waId);
export const insertSuggestion = (waId, options, note, source, { instruction = null, parentId = null, kind = 'draft', moves = null, needs = null } = {}) => Number(db.prepare('INSERT INTO suggestions (wa_id, created_at, options, pushed, note, source, instruction, parent_id, kind, moves, needs) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)').run(waId, new Date().toISOString(), JSON.stringify(options), note || null, source, instruction, parentId, kind, moves ? JSON.stringify(moves) : null, needs).lastInsertRowid);
export const getSuggestion = (id) => db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id);
export const insertLesson = (l) => Number(db.prepare('INSERT INTO lessons (wa_id, at, kind, suggestion_id, batch, sent, title, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(l.wa_id, new Date().toISOString(), l.kind, l.suggestion_id ?? null, l.batch ?? null, JSON.stringify(l.sent), l.title ?? null, l.text ?? null).lastInsertRowid);
export const latestLesson = (waId) => db.prepare('SELECT id, at, kind, title FROM lessons WHERE wa_id = ? ORDER BY id DESC LIMIT 1').get(waId);
export const lessonRunsSince = (iso) => db.prepare("SELECT count(*) n FROM lessons WHERE at >= ? AND kind != 'confirmed'").get(iso).n;
export const messagesBefore = (waId, iso, n) => db.prepare('SELECT at, who, text, tpl FROM messages WHERE wa_id = ? AND at <= ? ORDER BY at DESC LIMIT ?').all(waId, iso, n).reverse();
export const autoSuggestionsSince = (iso) => db.prepare("SELECT count(*) n FROM suggestions WHERE created_at >= ? AND source = 'auto'").get(iso).n;
export const pendingRecent = (hours) => db.prepare('SELECT * FROM threads WHERE pending = 1 AND muted = 0 AND last_inbound_at > ?').all(new Date(Date.now() - hours * 3600e3).toISOString());
export const unpushedSuggestions = () => db.prepare('SELECT s.*, t.name FROM suggestions s LEFT JOIN threads t ON t.wa_id = s.wa_id WHERE s.pushed = 0').all();
// A draft is shown only while it is still useful (Ali, 2026-09-30): not after a newer lead message, not once Ali
// replied after it (from the app or straight from Wati — automatic templates do not count) and not once he marked the
// thread treated. Exception: a two-step draft whose second part is still to send stays until that part left.
const humanReplyAfter = (waId, iso) => !!db.prepare("SELECT 1 FROM messages WHERE wa_id = ? AND who = 'US' AND tpl = 0 AND at > ? LIMIT 1").get(waId, iso)
  || !!db.prepare("SELECT 1 FROM sends WHERE wa_id = ? AND kind = 'text' AND ok = 1 AND at > ? LIMIT 1").get(waId, iso);
const laterSent = (id) => !!db.prepare(`SELECT 1 FROM sends WHERE kind = 'text' AND ok = 1 AND payload LIKE ? AND payload LIKE ? LIMIT 1`).get(`%"suggestionId":${id},%`, '%"part":"later"%');
export function suggestionVisible(t, s, { laterScheduled = false } = {}) {
  if (!s || !t) return false;
  if (t.last_inbound_at && s.created_at < t.last_inbound_at) return false;
  const answered = humanReplyAfter(t.wa_id, s.created_at) || (t.handled_at && t.handled_at > s.created_at);
  if (!answered) return true;
  if (s.kind && s.kind !== 'draft') return false;
  let later = []; try { later = JSON.parse(s.options)[0]?.later || []; } catch {}
  return later.length > 0 && !laterSent(s.id) && !laterScheduled;
}
export const markSuggestionPushed = (id) => db.prepare('UPDATE suggestions SET pushed = 1 WHERE id = ?').run(id);

export const logSend = (waId, kind, payload, ok, error) =>
  db.prepare('INSERT INTO sends (wa_id, at, kind, payload, ok, error) VALUES (?, ?, ?, ?, ?, ?)').run(waId, new Date().toISOString(), kind, JSON.stringify(payload), ok ? 1 : 0, error ?? null);
export const sentTexts = (waId) => new Set(db.prepare("SELECT payload FROM sends WHERE wa_id = ? AND kind = 'text' AND ok = 1").all(waId).map((r) => JSON.parse(r.payload).text));
export const sentTemplates = (waId) => db.prepare("SELECT at, payload FROM sends WHERE wa_id = ? AND kind = 'template' AND ok = 1 ORDER BY at").all(waId);

export const subscriptions = () => db.prepare('SELECT * FROM push_subscriptions').all();
export const addSubscription = (s, ua) => db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?)').run(s.endpoint, s.keys.p256dh, s.keys.auth, ua, new Date().toISOString());
export const removeSubscription = (endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);

// ── telemarketing bot monitor ─────────────────────────────────────────────────
export const upsertTmMessages = (rows) => { const ins = db.prepare('INSERT OR IGNORE INTO tm_messages (id, wa_id, at, who, text, type, name) VALUES (?, ?, ?, ?, ?, ?, ?)'); let n = 0; for (const m of rows) n += ins.run(m.id, m.wa_id, m.at, m.who, m.text, m.type, m.name ?? null).changes; return n; };
export const tmThread = (waId, limit = 40) => db.prepare('SELECT * FROM tm_messages WHERE wa_id = ? ORDER BY at DESC LIMIT ?').all(waId, limit).reverse();
export const tmThreadsSince = (iso) => db.prepare('SELECT wa_id, MAX(at) last_at, MAX(name) name, count(*) n FROM tm_messages WHERE at > ? GROUP BY wa_id ORDER BY last_at DESC').all(iso);
export const insertTmFlag = (f) => Number(db.prepare('INSERT INTO tm_flags (wa_id, at, kind, title, detail, quote, name) VALUES (?, ?, ?, ?, ?, ?, ?)').run(f.wa_id, new Date().toISOString(), f.kind, f.title, f.detail ?? null, f.quote ?? null, f.name ?? null).lastInsertRowid);
export const tmFlags = (limit = 80) => db.prepare('SELECT * FROM tm_flags ORDER BY seen ASC, id DESC LIMIT ?').all(limit);
try { db.exec('ALTER TABLE tm_flags ADD COLUMN verdict TEXT'); } catch {} // 'not_issue' = Ali says the bot behaved as intended (2026-10-01)
export const tmFlagVerdict = (id, verdict) => db.prepare('UPDATE tm_flags SET verdict = ?, seen = ? WHERE id = ?').run(verdict, verdict ? 1 : 0, id);
export const tmDismissed = (limit = 40) => db.prepare("SELECT kind, title, detail, quote FROM tm_flags WHERE verdict = 'not_issue' ORDER BY id DESC LIMIT ?").all(limit);
export const tmFlagSeen = (id, seen) => db.prepare('UPDATE tm_flags SET seen = ? WHERE id = ?').run(seen ? 1 : 0, id);
export const tmFlagCounts = () => db.prepare('SELECT count(*) total, COALESCE(sum(seen = 0 AND verdict IS NULL), 0) unseen FROM tm_flags').get();

// ── Sales Hub mirror + the day plan (2026-10-01) ──────────────────────────────
// hub_leads: the FR automations as the Hub sees them, refreshed every minute (hub-sync.mjs).
// plan_items: one card per lead and per day, written by plan-engine.mjs — what to do, when, why.
db.exec(`CREATE TABLE IF NOT EXISTS hub_leads (
  wa_id TEXT PRIMARY KEY,
  lead_id TEXT, name TEXT, last_name TEXT, status TEXT, paused INTEGER NOT NULL DEFAULT 0, skip_next INTEGER NOT NULL DEFAULT 0,
  phase TEXT, meeting_date TEXT, last_reason TEXT, last_reason_at TEXT, next_tpl TEXT, next_at TEXT, citf TEXT, raw TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS hub_templates (
  template TEXT PRIMARY KEY, day INTEGER, time TEXT, anchor TEXT, enabled INTEGER, text TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL, name TEXT, day TEXT NOT NULL,
  kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open',
  at TEXT NOT NULL, when_at TEXT,
  title TEXT, why TEXT, action TEXT,
  hub_status TEXT, hub_next TEXT, hub_next_at TEXT, hub_paused INTEGER, hub_sig TEXT,
  bubbles TEXT, template TEXT, suggestion_id INTEGER,
  note TEXT, pushed INTEGER NOT NULL DEFAULT 0, reminded INTEGER NOT NULL DEFAULT 0, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_plan_day ON plan_items(day, state)`);

export function saveHubLeads(rows) {
  const up = db.prepare(`INSERT INTO hub_leads (wa_id, lead_id, name, last_name, status, paused, skip_next, phase, meeting_date, last_reason, last_reason_at, next_tpl, next_at, citf, raw, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wa_id) DO UPDATE SET lead_id = excluded.lead_id, name = excluded.name, last_name = excluded.last_name, status = excluded.status, paused = excluded.paused, skip_next = excluded.skip_next,
      phase = excluded.phase, meeting_date = excluded.meeting_date, last_reason = excluded.last_reason, last_reason_at = excluded.last_reason_at, next_tpl = excluded.next_tpl, next_at = excluded.next_at, citf = excluded.citf, raw = excluded.raw, updated_at = excluded.updated_at`);
  const now = new Date().toISOString();
  const seen = new Set();
  for (const l of rows) {
    const wa = String(l.phone || '').replace(/\D/g, '');
    if (!wa) continue;
    seen.add(wa);
    up.run(wa, l.leadId != null ? String(l.leadId) : null, l.name || null, l.lastName || null, l.status || null, l.paused ? 1 : 0, l.skipNextPending ? 1 : 0, l.phase || null, l.meetingDate || null,
      l.lastReason?.label || l.lastReason?.text || null, l.lastReason?.at || null, l.next?.template || null, l.next?.at || null, l.citf ? JSON.stringify(l.citf) : null, JSON.stringify(l), now);
  }
  // Leads that left the automations tab disappear from the mirror.
  const gone = db.prepare('SELECT wa_id FROM hub_leads').all().map((r) => r.wa_id).filter((w) => !seen.has(w));
  if (rows.length && gone.length) { const del = db.prepare('DELETE FROM hub_leads WHERE wa_id = ?'); for (const w of gone) del.run(w); }
  return { saved: seen.size, gone: rows.length ? gone.length : 0 };
}
export const hubLeadRow = (waId) => db.prepare('SELECT * FROM hub_leads WHERE wa_id = ?').get(waId);
export const hubLeadRows = () => db.prepare('SELECT * FROM hub_leads ORDER BY next_at').all();
export function saveHubTemplates(steps) {
  const up = db.prepare('INSERT OR REPLACE INTO hub_templates (template, day, time, anchor, enabled, text, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  for (const s of steps) if (s.template) up.run(s.template, s.day ?? null, s.time || null, s.anchor || null, s.enabled === false ? 0 : 1, s.watiText || s.text || null, now);
}
export const hubTemplate = (name) => db.prepare('SELECT * FROM hub_templates WHERE template = ?').get(name);
export const hubTemplateRows = () => db.prepare('SELECT * FROM hub_templates ORDER BY anchor, day, time').all();

for (const col of ['pause_scope TEXT', 'skip_templates TEXT']) { try { db.exec(`ALTER TABLE plan_items ADD COLUMN ${col}`); } catch {} } // all = pause the whole automation, next = skip the named template(s) (2026-10-01)
export const insertPlanItem = (p) => Number(db.prepare(`INSERT INTO plan_items (wa_id, name, day, kind, state, at, when_at, title, why, action, hub_status, hub_next, hub_next_at, hub_paused, hub_sig, bubbles, template, suggestion_id, pause_scope, skip_templates, pushed, updated_at)
  VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(p.wa_id, p.name ?? null, p.day, p.kind, new Date().toISOString(), p.when_at ?? null, p.title ?? null, p.why ?? null, p.action ?? null, p.hub_status ?? null, p.hub_next ?? null, p.hub_next_at ?? null, p.hub_paused ? 1 : 0, p.hub_sig ?? null, p.bubbles ? JSON.stringify(p.bubbles) : null, p.template ?? null, p.suggestion_id ?? null, p.pause_scope ?? null, p.skip_templates ? JSON.stringify(p.skip_templates) : null, p.pushed ? 1 : 0, new Date().toISOString()).lastInsertRowid);
export const planItemById = (id) => db.prepare('SELECT * FROM plan_items WHERE id = ?').get(id);
export const planItems = (day) => db.prepare('SELECT * FROM plan_items WHERE day = ? ORDER BY CASE state WHEN \'open\' THEN 0 ELSE 1 END, COALESCE(when_at, hub_next_at, \'9\'), id').all(day);
export const openPlanItems = (waId = null) => waId ? db.prepare("SELECT * FROM plan_items WHERE wa_id = ? AND state = 'open' ORDER BY id DESC").all(waId) : db.prepare("SELECT * FROM plan_items WHERE state = 'open' ORDER BY COALESCE(when_at, hub_next_at, '9')").all();
export const planItemsFor = (waId, day) => db.prepare('SELECT * FROM plan_items WHERE wa_id = ? AND day = ? ORDER BY id DESC').all(waId, day);
export const setPlanState = (id, state, note = null) => db.prepare('UPDATE plan_items SET state = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?').run(state, note, new Date().toISOString(), id);
export const closePlanItems = (waId, state, kinds = null) => kinds
  ? db.prepare(`UPDATE plan_items SET state = ?, updated_at = ? WHERE wa_id = ? AND state = 'open' AND kind IN (${kinds.map(() => '?').join(',')})`).run(state, new Date().toISOString(), waId, ...kinds).changes
  : db.prepare("UPDATE plan_items SET state = ?, updated_at = ? WHERE wa_id = ? AND state = 'open'").run(state, new Date().toISOString(), waId).changes;
export const expirePlanItems = (beforeDay) => db.prepare("UPDATE plan_items SET state = 'expired', updated_at = ? WHERE state = 'open' AND day < ?").run(new Date().toISOString(), beforeDay).changes;
export const unpushedPlanItems = () => db.prepare("SELECT * FROM plan_items WHERE pushed = 0 AND state = 'open'").all();
export const markPlanPushed = (id) => db.prepare('UPDATE plan_items SET pushed = 1 WHERE id = ?').run(id);
export const markPlanReminded = (id) => db.prepare('UPDATE plan_items SET reminded = 1 WHERE id = ?').run(id);
export const dueReminders = (untilIso) => db.prepare("SELECT * FROM plan_items WHERE state = 'open' AND reminded = 0 AND when_at IS NOT NULL AND when_at <= ? ORDER BY when_at").all(untilIso);
export const planDismissed = (limit = 30) => db.prepare("SELECT name, kind, title, note, day FROM plan_items WHERE state = 'dismissed' ORDER BY id DESC LIMIT ?").all(limit);
export const planRunsSince = (iso) => db.prepare("SELECT count(*) n FROM state WHERE key LIKE 'plan_call_%' AND value >= ?").get(iso).n;
export const planCounts = (day) => db.prepare(`SELECT
  COALESCE(sum(state = 'open' AND kind IN ('pause', 'fix')), 0) todo,
  COALESCE(sum(state = 'open' AND kind = 'followup'), 0) followups,
  COALESCE(sum(state = 'open' AND kind = 'wait'), 0) waits,
  COALESCE(sum(state = 'open' AND kind = 'ok'), 0) oks,
  COALESCE(sum(state = 'done'), 0) done FROM plan_items WHERE day = ?`).get(day);
