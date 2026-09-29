// Reply suggestions for the app, drafted by Claude Code running headless on this Mac
// (`claude -p`, Sonnet, inside ../Wati outreach so its CLAUDE.md and playbook apply).
// No API key, no interactive session, no remote control: the subscription pays,
// and nothing runs while there is nothing to draft.
//
//   Since 2026-09-29 nothing is drafted until Ali picks the cap in the app (objective, downsell level,
//   tone, free consigne — see directions.mjs): no automatic draft when a lead writes. Ali reads the
//   thread, chooses where the reply is heading, taps "Rédiger", and Claude drafts along that line.
//
// One suggestion = ONE set of bubbles (2026-09-27, Ali's rule). Never two options.
//
//   node --env-file=.env suggest-engine.mjs 33612345678 [objective] ["consigne"]     draft one lead from the terminal

import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { db, getThread, latestSuggestion, insertSuggestion, getOffer } from './db.mjs';
import { describeDirection, describeOffer } from './directions.mjs';

export const OUTREACH = resolve(process.env.OUTREACH_DIR || '../Wati outreach');
const NODE_DIR = dirname(process.execPath);
const CLAUDE = process.env.CLAUDE_BIN || join(NODE_DIR, 'claude');
export const MODEL = process.env.SUGGEST_MODEL || 'claude-sonnet-5';
const TIMEOUT_MS = 6 * 60_000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'suggest:', ...a);
export const madrid = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }); // "2026-09-27 14:35:50"

const SCHEMA = {
  type: 'object',
  properties: {
    bubbles: { type: 'array', items: { type: 'string' } },
    later: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['bubbles', 'later', 'why', 'note'],
};

const queue = new Map();   // waId → { direction }
const status = new Map();  // waId → { state: queued | drafting | done | error, at, direction, error? }
export const suggestStatus = (waId) => status.get(waId) || null;

// Ali picked the cap in the app → draft now (a second tap while queued replaces the cap).
export function requestSuggestion(waId, direction = {}) {
  const d = describeDirection(direction, getOffer(waId));
  queue.set(waId, { direction, text: d.text });
  status.set(waId, { state: 'queued', at: new Date().toISOString(), direction: d.text });
  return true;
}

let running = null;
async function pump() {
  if (running) return;
  const first = queue.entries().next();
  if (first.done) return;
  const [waId, q] = first.value;
  queue.delete(waId);
  running = waId;
  try { await draft(waId, q.direction); }
  catch (e) { log(waId, 'error:', e.message); status.set(waId, { state: 'error', at: new Date().toISOString(), direction: q.text, error: e.message }); db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId); }
  finally { running = null; }
}

export function startSuggesting() {
  mkdirSync('logs', { recursive: true });
  setInterval(() => pump().catch((e) => log('pump error:', e.message)), 3_000);
  log(`ready — model ${MODEL}, drafts only on Ali's cap`);
}

export async function draft(waId, direction = {}) {
  const t = getThread(waId);
  if (!t) throw new Error('conversation inconnue');
  const offer = getOffer(waId);
  const d = describeDirection(direction, offer);
  const instruction = d.text;
  status.set(waId, { state: 'drafting', at: new Date().toISOString(), direction: instruction });
  log('drafting for', t.name || waId, instruction ? `— ${instruction}` : '(sans cap)');
  // The draft Ali is replacing, if one is on screen: Claude must see what he did not send.
  const prev = latestSuggestion(waId);
  const prevFresh = prev && (!t.last_inbound_at || prev.created_at >= t.last_inbound_at) ? prev : null;
  let extra = `\n## Offre initiale (ce qui a été proposé à l'appel, saisi par Ali)\n${offer?.format ? describeOffer(offer) : 'non renseignée — ne suppose rien, laisse un [CROCHET] si un chiffre d’origine manque'}\n`;
  extra += '\n## Ce qu’Ali a choisi — prioritaire sur la carte\n';
  extra += d.block || '- Ali n’a coché aucun move : réponds simplement et précisément à ce que le lead a écrit, selon la carte.\n';
  if (prevFresh) {
    const o = JSON.parse(prevFresh.options)[0] || { bubbles: [] };
    extra += `\nAli avait déjà une proposition sous les yeux${prevFresh.instruction ? ` (${prevFresh.instruction})` : ''} et ne l'a pas envoyée :\n${o.bubbles.map((b) => `> ${b}`).join('\n')}\nNe la recopie pas ; rédige selon le nouveau cap et dis dans \`why\` ce qui change.\n`;
  }
  extra += 'Le cap dit OÙ on va ; la carte et les cas appris disent COMMENT on l’écrit. Si le cap contredit une règle dure (chiffre inventé, remise gratuite, deux messages de pression le même jour), suis le cap mais signale-le dans `note`.\n';
  const prompt = readFileSync(new URL('./suggest-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{waId}}', waId).replaceAll('{{name}}', t.name || 'prénom inconnu').replaceAll('{{now}}', madrid()).replaceAll('{{node}}', process.execPath).replaceAll('{{extra}}', extra);
  const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 30 });
  const raw = Array.isArray(out.bubbles) ? out.bubbles : (Array.isArray(out.options) ? out.options[0]?.bubbles : []);
  const bubbles = (raw || []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4);
  if (!bubbles.length) throw new Error('Claude n’a proposé aucune bulle');
  const later = d.twoStep ? (Array.isArray(out.later) ? out.later : []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4) : [];
  const options = [{ bubbles, later, why: String(out.why || out.options?.[0]?.why || '').trim() }];
  const note = String(out.note || '').trim();
  const id = insertSuggestion(waId, options, note, 'ali', { instruction: instruction || null, parentId: prevFresh?.id ?? null });
  db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
  status.set(waId, { state: 'done', at: new Date().toISOString(), direction: instruction });
  try { saveDraftBlock(t, options, note, instruction); } catch (e) { log('draft file error:', e.message); }
  log(`saved suggestion #${id} for ${t.name || waId} — ${bubbles.length} bulle(s), ${Math.round(out.ms / 1000)} s`);
  return { id, options, note };
}

// Every draft shown to Ali is kept in Wati outreach/data/suggestions/<date>.md (the nightly review reads it).
function saveDraftBlock(t, options, note, instruction) {
  const dir = join(OUTREACH, 'data', 'suggestions');
  mkdirSync(dir, { recursive: true });
  const now = madrid();
  const file = join(dir, `${now.slice(0, 10)}.md`);
  if (!existsSync(file)) appendFileSync(file, `# Brouillons proposés — ${now.slice(0, 10)}\n\nFormat : un bloc par lead — heure, prénom, numéro, contexte en une ligne, bulles telles que proposées, règles appliquées. La veille du soir (scripts/nightly-review-prompt.md) compare ces blocs à ce qu'Ali a réellement envoyé.\n`);
  const ctx = String(t.last_text || '').replace(/\s+/g, ' ').slice(0, 160);
  let s = `\n## ${now.slice(11, 16)} · ${t.name || '?'} · +${t.wa_id} (app, sur le cap d’Ali)\nContexte : dernier message du lead — « ${ctx} »\n`;
  if (instruction) s += `${instruction.replace(/\s+/g, ' ')}\n`;
  for (const o of options) {
    for (const b of o.bubbles) s += '```\n' + b + '\n```\n';
    if (o.later?.length) { s += 'Dans 5-10 min :\n'; for (const b of o.later) s += '```\n' + b + '\n```\n'; }
    if (o.why) s += `Règles appliquées : ${o.why.replace(/\s+/g, ' ')}\n`;
  }
  if (note) s += `Note : ${note.replace(/\s+/g, ' ')}\n`;
  appendFileSync(file, s);
}

// One headless Claude at a time on this Mac: drafts and lessons wait for each other.
let chain = Promise.resolve();
export function runClaude(prompt, opts = {}) {
  const r = chain.then(() => spawnClaude(prompt, opts), () => spawnClaude(prompt, opts));
  chain = r.catch(() => {});
  return r;
}

function spawnClaude(prompt, { schema, maxTurns = 30, tools, timeoutMs = TIMEOUT_MS, tag = 'suggest' }) {
  return new Promise((ok, ko) => {
    // A clean environment: none of the variables an interactive Claude Code session sets.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/.test(k) && k !== 'AI_AGENT'));
    env.HOME = process.env.HOME || '/Users/alielaraki';
    env.PATH = `${NODE_DIR}:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin`;
    const leadRules = [process.execPath, process.execPath.replace(env.HOME, '~'), 'node'].map((n) => `Bash(${n} --env-file=.env lead.mjs:*)`);
    const allowed = tools || [...leadRules, 'Read', 'Grep', 'Glob', 'Bash(cat:*)', 'Bash(sed -n:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(date:*)', 'Bash(wc:*)'];
    const args = ['-p', prompt, '--model', MODEL, '--max-turns', String(maxTurns), '--output-format', 'json', '--no-session-persistence',
      // user settings included again since 2026-09-27 (global file cleaned; the ask/deny gates apply here too)
      '--setting-sources', 'user,project,local',
      '--allowedTools', ...allowed];
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    const t0 = Date.now();
    const child = spawn(CLAUDE, args, { cwd: OUTREACH, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); ko(new Error(`Claude n’a pas répondu en ${Math.round(timeoutMs / 60000)} min`)); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); ko(new Error(`claude introuvable (${CLAUDE}): ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try { appendFileSync('logs/suggest.log', `\n=== ${new Date().toISOString()} ${tag} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s\n${err.trim()}\n${out.trim()}\n`); } catch {}
      let r; try { r = JSON.parse(out); } catch { return ko(new Error(`sortie illisible (exit ${code}) : ${(err || out).trim().slice(0, 160)}`)); }
      if (r.is_error) return ko(new Error(String(r.result || 'erreur Claude').slice(0, 160)));
      let data = r.structured_output;
      if (!data && typeof r.result === 'string') { const m = /\{[\s\S]*\}/.exec(r.result); if (m) try { data = JSON.parse(m[0]); } catch {} }
      if (!data) return ko(new Error('pas de JSON dans la réponse de Claude'));
      ok({ ...data, ms: Date.now() - t0, denials: r.permission_denials?.length || 0 });
    });
  });
}

// Terminal use: node --env-file=.env suggest-engine.mjs <waId> ["consigne"]
if (process.argv[1] && process.argv[1].endsWith('suggest-engine.mjs')) {
  const waId = (process.argv[2] || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(waId)) { console.error('Usage: node --env-file=.env suggest-engine.mjs <waId> [objective] ["consigne"]'); process.exit(1); }
  mkdirSync('logs', { recursive: true });
  draft(waId, { moves: process.argv[3] || '', instruction: process.argv[4] || '' }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
