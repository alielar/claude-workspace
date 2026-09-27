// Reply suggestions for the app, drafted by Claude Code running headless on this Mac
// (`claude -p`, Sonnet, inside ../Wati outreach so its CLAUDE.md and playbook apply).
// No API key, no interactive session, no remote control: the subscription pays,
// and nothing runs while there is nothing to draft.
//
//   auto — a lead writes → 90 s after the last bubble, one draft (switch "Suggestions auto" in the app)
//   ali  — Ali taps "Demander une suggestion" → drafts now, even if muted or already drafted
//
//   node --env-file=.env suggest-engine.mjs 33612345678     draft one lead from the terminal

import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { db, getState, setState, getThread, latestSuggestion, insertSuggestion, autoSuggestionsSince, pendingRecent } from './db.mjs';

const OUTREACH = resolve(process.env.OUTREACH_DIR || '../Wati outreach');
const NODE_DIR = dirname(process.execPath);
const CLAUDE = process.env.CLAUDE_BIN || join(NODE_DIR, 'claude');
const MODEL = process.env.SUGGEST_MODEL || 'claude-sonnet-5';
const ME = process.env.MY_NUMBER || '34695064884';               // Ali's own number (test thread)
const DEBOUNCE_MS = Number(process.env.SUGGEST_DEBOUNCE_MS || 90_000);
const MAX_PER_DAY = Number(process.env.SUGGEST_MAX_PER_DAY || 40); // automatic drafts only
const TIMEOUT_MS = 6 * 60_000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'suggest:', ...a);
const madrid = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }); // "2026-09-27 14:35:50"

const SCHEMA = {
  type: 'object',
  properties: {
    options: { type: 'array', items: { type: 'object', properties: { bubbles: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } }, required: ['bubbles', 'why'] } },
    note: { type: 'string' },
  },
  required: ['options', 'note'],
};

export const autoEnabled = () => getState('suggest_auto') !== '0';
export const setAuto = (on) => setState('suggest_auto', on ? '1' : '0');

const queue = new Map();   // waId → { due, reason }
const status = new Map();  // waId → { state: queued | drafting | done | error, at, reason, error? }
export const suggestStatus = (waId) => status.get(waId) || null;

const fresh = (t) => { const s = latestSuggestion(t.wa_id); return !!s && (!t.last_inbound_at || s.created_at >= t.last_inbound_at); };

export function requestSuggestion(waId, reason = 'lead') {
  if (reason === 'lead') {
    if (waId === ME || !autoEnabled()) return false;
    const t = getThread(waId);
    if (!t || t.muted || !t.pending || fresh(t)) return false;
  }
  const prev = queue.get(waId);
  const r = prev?.reason === 'ali' || reason === 'ali' ? 'ali' : 'lead';
  queue.set(waId, { due: Date.now() + (r === 'ali' ? 0 : DEBOUNCE_MS), reason: r }); // a new bubble restarts the wait
  status.set(waId, { state: 'queued', at: new Date().toISOString(), reason: r });
  return true;
}

let running = null;
async function pump() {
  if (running) return;
  const now = Date.now();
  let pick = null;
  for (const [waId, q] of queue) if (q.due <= now && (!pick || q.due < pick.q.due)) pick = { waId, q };
  if (!pick) return;
  queue.delete(pick.waId);
  running = pick.waId;
  try { await draft(pick.waId, pick.q.reason); }
  catch (e) { log(pick.waId, 'error:', e.message); status.set(pick.waId, { state: 'error', at: new Date().toISOString(), reason: pick.q.reason, error: e.message }); db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(pick.waId); }
  finally { running = null; }
}

export function startSuggesting() {
  mkdirSync('logs', { recursive: true });
  // Leads still waiting (window open) when the server starts: draft for them too, once.
  for (const t of pendingRecent(24)) requestSuggestion(t.wa_id, 'lead');
  setInterval(() => pump().catch((e) => log('pump error:', e.message)), 5_000);
  log(`ready — model ${MODEL}, auto ${autoEnabled() ? 'on' : 'off'}, ${queue.size} lead(s) queued`);
}

export async function draft(waId, reason) {
  const t = getThread(waId);
  if (!t) throw new Error('conversation inconnue');
  if (reason === 'lead') {
    if (t.muted || !t.pending || fresh(t)) { status.delete(waId); return null; }
    const n = autoSuggestionsSince(new Date(madrid().slice(0, 10) + 'T00:00:00').toISOString());
    if (n >= MAX_PER_DAY) throw new Error(`plafond du jour atteint (${MAX_PER_DAY} brouillons automatiques)`);
  }
  status.set(waId, { state: 'drafting', at: new Date().toISOString(), reason });
  log('drafting for', t.name || waId, `(${reason})`);
  const prompt = readFileSync(new URL('./suggest-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{waId}}', waId).replaceAll('{{name}}', t.name || 'prénom inconnu').replaceAll('{{now}}', madrid()).replaceAll('{{node}}', process.execPath);
  const out = await runClaude(prompt);
  const options = (Array.isArray(out.options) ? out.options : []).slice(0, 3)
    .map((o) => ({ bubbles: (Array.isArray(o.bubbles) ? o.bubbles : []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4), why: String(o.why || '').trim() }))
    .filter((o) => o.bubbles.length);
  if (!options.length) throw new Error('Claude n’a proposé aucune bulle');
  const note = String(out.note || '').trim();
  const id = insertSuggestion(waId, options, note, reason === 'ali' ? 'ali' : 'auto');
  db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
  status.set(waId, { state: 'done', at: new Date().toISOString(), reason });
  try { saveDraftBlock(t, options, note, reason); } catch (e) { log('draft file error:', e.message); }
  log(`saved suggestion #${id} for ${t.name || waId} — ${options.length} option(s), ${Math.round(out.ms / 1000)} s`);
  return { id, options, note };
}

// Every draft shown to Ali is kept in Wati outreach/data/suggestions/<date>.md (the nightly review reads it).
function saveDraftBlock(t, options, note, reason) {
  const dir = join(OUTREACH, 'data', 'suggestions');
  mkdirSync(dir, { recursive: true });
  const now = madrid();
  const file = join(dir, `${now.slice(0, 10)}.md`);
  if (!existsSync(file)) appendFileSync(file, `# Brouillons proposés — ${now.slice(0, 10)}\n\nFormat : un bloc par lead — heure, prénom, numéro, contexte en une ligne, bulles telles que proposées, règles appliquées. La veille du soir (scripts/nightly-review-prompt.md) compare ces blocs à ce qu'Ali a réellement envoyé.\n`);
  const ctx = String(t.last_text || '').replace(/\s+/g, ' ').slice(0, 160);
  let s = `\n## ${now.slice(11, 16)} · ${t.name || '?'} · +${t.wa_id} (app, ${reason === 'ali' ? 'demandé par Ali' : 'automatique'})\nContexte : dernier message du lead — « ${ctx} »\n`;
  options.forEach((o, i) => {
    if (options.length > 1) s += `Option ${i + 1} :\n`;
    for (const b of o.bubbles) s += '```\n' + b + '\n```\n';
    if (o.why) s += `Règles appliquées : ${o.why.replace(/\s+/g, ' ')}\n`;
  });
  if (note) s += `Note : ${note.replace(/\s+/g, ' ')}\n`;
  appendFileSync(file, s);
}

function runClaude(prompt) {
  return new Promise((ok, ko) => {
    // A clean environment: none of the variables an interactive Claude Code session sets.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/.test(k) && k !== 'AI_AGENT'));
    env.HOME = process.env.HOME || '/Users/alielaraki';
    env.PATH = `${NODE_DIR}:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin`;
    const leadRules = [process.execPath, process.execPath.replace(env.HOME, '~'), 'node'].map((n) => `Bash(${n} --env-file=.env lead.mjs:*)`);
    const args = ['-p', prompt, '--model', MODEL, '--max-turns', '30', '--output-format', 'json', '--no-session-persistence',
      // user settings included again since 2026-09-27 (global file cleaned; the ask/deny gates apply here too)
      '--setting-sources', 'user,project,local',
      '--allowedTools', ...leadRules, 'Read', 'Grep', 'Glob', 'Bash(cat:*)', 'Bash(sed -n:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(date:*)', 'Bash(wc:*)',
      '--json-schema', JSON.stringify(SCHEMA)];
    const t0 = Date.now();
    const child = spawn(CLAUDE, args, { cwd: OUTREACH, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); ko(new Error('Claude n’a pas répondu en 6 min')); }, TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); ko(new Error(`claude introuvable (${CLAUDE}): ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try { appendFileSync('logs/suggest.log', `\n=== ${new Date().toISOString()} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s\n${err.trim()}\n${out.trim()}\n`); } catch {}
      let r; try { r = JSON.parse(out); } catch { return ko(new Error(`sortie illisible (exit ${code}) : ${(err || out).trim().slice(0, 160)}`)); }
      if (r.is_error) return ko(new Error(String(r.result || 'erreur Claude').slice(0, 160)));
      let data = r.structured_output;
      if (!data && typeof r.result === 'string') { const m = /\{[\s\S]*\}/.exec(r.result); if (m) try { data = JSON.parse(m[0]); } catch {} }
      if (!data) return ko(new Error('pas de JSON dans la réponse de Claude'));
      ok({ ...data, ms: Date.now() - t0, denials: r.permission_denials?.length || 0 });
    });
  });
}

// Terminal use: node --env-file=.env suggest-engine.mjs <waId>
if (process.argv[1] && process.argv[1].endsWith('suggest-engine.mjs')) {
  const waId = (process.argv[2] || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(waId)) { console.error('Usage: node --env-file=.env suggest-engine.mjs <waId>'); process.exit(1); }
  mkdirSync('logs', { recursive: true });
  draft(waId, 'ali').then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
