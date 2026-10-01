// Reply suggestions for the app, drafted by Claude Code running headless on this Mac
// (`claude -p`, Sonnet, inside ../Wati outreach so its CLAUDE.md and playbook apply).
// No API key, no interactive session, no remote control: the subscription pays,
// and nothing runs while there is nothing to draft.
//
//   Since 2026-09-30 (Ali's rule, reversing 09-29): a draft starts BY ITSELF AUTO_DELAY_MS after a lead's
//   last bubble. Claude picks the moves (directions.mjs) from the conversation; when one piece of context is
//   missing (the initial offer for a downsell, what was said on the call…) it does not draft but asks Ali
//   (kind = needs); when the message needs no answer it says so (kind = skip). Ali can still steer with the
//   moves panel and a consigne, and every send is learned from.
//
// One suggestion = ONE set of bubbles (2026-09-27, Ali's rule). Never two options.
//
//   node --env-file=.env suggest-engine.mjs 33612345678 [objective] ["consigne"]     draft one lead from the terminal

import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { db, getThread, latestSuggestion, insertSuggestion, getOffer, autoSuggestionsSince, threadMessages, sentTemplates } from './db.mjs';
import { describeDirection, describeOffer, currencyFor, MOVES } from './directions.mjs';

export const OUTREACH = resolve(process.env.OUTREACH_DIR || '../Wati outreach');
export const JOURNAL = join(OUTREACH, 'playbook', '04-CAS-APPRIS.md');      // raw learned cases, appended by the app and the reviews
export const RULES = join(OUTREACH, 'playbook', '06-REGLES-APPRISES.md');    // consolidated rules, rebuilt every evening (consolidate-engine.mjs)
// What was appended to the journal after the last consolidation marker: injected into every draft prompt.
export function unconsolidatedTail() {
  if (!existsSync(JOURNAL)) return '';
  const s = readFileSync(JOURNAL, 'utf8');
  const i = s.lastIndexOf("<!-- consolidé jusqu'ici");
  if (i < 0) return '';
  const nl = s.indexOf('\n', i);
  return nl < 0 ? '' : s.slice(nl + 1).trim();
}
const NODE_DIR = dirname(process.execPath);
const CLAUDE = process.env.CLAUDE_BIN || join(NODE_DIR, 'claude');
export const MODEL = process.env.SUGGEST_MODEL || 'claude-sonnet-5';
export const AUTO_DELAY_MS = Number(process.env.AUTO_DELAY_MS || 60_000); // quiet time after the lead's last bubble before Claude drafts
export const AUTO_MAX_PER_DAY = Number(process.env.SUGGEST_MAX_PER_DAY || 60);
const TEST_NUMBER = '34695064884'; // Ali's own number: never drafted by itself
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
    moves: { type: 'array', items: { type: 'string' } },
    needs: { type: 'string' },
    skip: { type: 'boolean' },
  },
  required: ['bubbles', 'later', 'why', 'note', 'moves', 'needs', 'skip'],
};

const queue = new Map();   // waId → { direction }
const status = new Map();  // waId → { state: queued | drafting | done | error, at, direction, error? }
export const suggestStatus = (waId) => status.get(waId) || null;

// Ali picked the cap in the app → draft now (a second tap while queued replaces the cap). No moves and no
// consigne = auto: Claude chooses.
export function requestSuggestion(waId, direction = {}) {
  const d = describeDirection(direction, getOffer(waId), currencyFor(getThread(waId)?.country));
  queue.set(waId, { direction, text: d.text || (direction.auto ? 'auto' : '') });
  status.set(waId, { state: 'queued', at: new Date().toISOString(), direction: d.text || 'Claude chooses' });
  return true;
}

// A lead wrote: wait for the quiet time (more bubbles may follow), then draft by itself.
const autoTimers = new Map();
export function scheduleAutoDraft(waId) {
  if (waId === TEST_NUMBER) return false;
  const t = getThread(waId);
  if (!t || t.muted) return false;
  clearTimeout(autoTimers.get(waId));
  autoTimers.set(waId, setTimeout(() => {
    autoTimers.delete(waId);
    const th = getThread(waId);
    if (!th?.last_inbound_at || Date.now() - Date.parse(th.last_inbound_at) > 24 * 3600e3) return; // window closed meanwhile
    if (th.last_outbound_at && th.last_outbound_at > th.last_inbound_at) return; // Ali already answered
    const since = new Date(); since.setHours(0, 0, 0, 0);
    if (autoSuggestionsSince(since.toISOString()) >= AUTO_MAX_PER_DAY) { log('auto cap reached today'); return; }
    if (running === waId || queue.has(waId)) return;
    requestSuggestion(waId, { auto: true });
  }, AUTO_DELAY_MS));
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
  log(`ready — model ${MODEL}, auto draft ${Math.round(AUTO_DELAY_MS / 1000)} s after a lead's last bubble (max ${AUTO_MAX_PER_DAY}/day), Ali can steer`);
}

export async function draft(waId, direction = {}) {
  const t = getThread(waId);
  if (!t) throw new Error('conversation inconnue');
  const offer = getOffer(waId);
  const cur = currencyFor(t.country); // € for France/Belgium, CHF for Switzerland (same figures)
  const d = describeDirection(direction, offer, cur);
  const auto = !d.moves.length && !String(direction.instruction || '').trim();
  const instruction = d.text;
  status.set(waId, { state: 'drafting', at: new Date().toISOString(), direction: instruction || 'Claude chooses' });
  log('drafting for', t.name || waId, instruction ? `— ${instruction}` : '(sans cap)');
  // The draft Ali is replacing, if one is on screen: Claude must see what he did not send.
  const prev = latestSuggestion(waId);
  const prevFresh = prev && (!t.last_inbound_at || prev.created_at >= t.last_inbound_at) ? prev : null;
  let extra = `\n## Offre initiale (ce qui a été proposé à l'appel, saisi par Ali)\n${offer?.format ? describeOffer(offer, cur) : 'non renseignée — ne suppose rien, laisse un [CROCHET] si un chiffre d’origine manque'}\nDevise du lead : ${cur} (pays CRM : ${t.country || 'inconnu'}).\n`;
  if (auto) {
    extra += '\n## Personne n’a choisi de cap : c’est toi qui décides\n';
    extra += 'Lis la conversation et choisis toi-même le ou les moves qui s’imposent (ids possibles ci-dessous, mets-les dans `moves`), puis rédige. Si le message du lead n’appelle aucune réponse (remerciement final après une clôture, simple accusé de réception d’un message automatique, message vide ou hors sujet), réponds `skip: true` avec la raison dans `why` et aucune bulle. Si un élément de contexte INDISPENSABLE manque — l’offre initiale (format, niveau visé, heures/semaine) pour un downsell ou un acompte, ce qui a été dit à l’appel, un chiffre qu’Ali seul connaît — ne rédige pas : mets dans `needs` UNE question courte et précise pour Ali (ex. « Quelle offre a été faite à l’appel : format, niveau visé, h/semaine ? »), aucune bulle. Sinon rédige directement.\n';
    extra += 'Moves possibles :\n' + MOVES.map((m) => `- \`${m.id}\` — ${m.label} : ${m.hint.slice(0, 220)}…`).join('\n') + '\n';
    extra += 'Règles de choix : friction crédible sur le prix ou le financement et offre initiale connue → `downsell` (un cran sous l’offre) ; le lead demande du temps ou a fixé sa prochaine étape → `doux` ; le lead demande une extension, un délai, un format ou une exception → `admin` (deux temps) avec le move concerné ; problème de paiement → `paiement` ; question de calendrier → `demarrage` ; deuxième refus net ou demande d’être laissé tranquille → `cloture` ; simple question du lead → aucun move, réponds précisément.\n';
  } else {
    extra += '\n## Ce qu’Ali a choisi — prioritaire sur la carte\n';
    extra += d.block;
  }
  if (prevFresh) {
    const o = JSON.parse(prevFresh.options)[0] || { bubbles: [] };
    extra += `\nAli avait déjà une proposition sous les yeux${prevFresh.instruction ? ` (${prevFresh.instruction})` : ''} et ne l'a pas envoyée :\n${o.bubbles.map((b) => `> ${b}`).join('\n')}\nNe la recopie pas ; rédige selon le nouveau cap et dis dans \`why\` ce qui change.\n`;
  }
  extra += 'Le cap dit OÙ on va ; la carte et les cas appris disent COMMENT on l’écrit. Si le cap contredit une règle dure (chiffre inventé, remise gratuite, deux messages de pression le même jour), suis le cap mais signale-le dans `note`.\n';
  const fresh = unconsolidatedTail();
  if (fresh) extra += `\n## Appris depuis la dernière consolidation (prime sur 06-REGLES-APPRISES.md, applique en priorité)\n${fresh.length > 7000 ? '…\n' + fresh.slice(-7000) : fresh}\n`;
  // Everything Claude needs goes into the prompt (2026-09-30, Ali: a draft in under two minutes): the thread from
  // the database, the CRM card, the quick card, the consolidated rules and the principles. Zero tool turns normally.
  const msgs = threadMessages(waId).slice(-40);
  const transcript = msgs.map((m) => `[${madrid(new Date(m.at)).slice(5, 16)}] ${m.who === 'LEAD' ? 'LEAD' : m.tpl ? `AUTO${m.tpl_name ? ' ' + m.tpl_name : ''}` : 'ALI'} : ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 600)}`).join('\n') || '(aucun message lisible sur le numéro Sales — lead du numéro télémarketing ?)';
  const windowOpen = !!t.last_inbound_at && Date.now() - Date.parse(t.last_inbound_at) < 24 * 3600e3;
  const appTpls = sentTemplates(waId).map((s) => { try { return JSON.parse(s.payload).template; } catch { return null; } }).filter(Boolean);
  const card = `Fiche CRM : étape ${t.stage || 'inconnue'}${t.meeting ? ` · entretien ${t.meeting}` : ''} · pays ${t.country || 'inconnu'} · devise ${cur}${t.email ? ` · ${t.email}` : ''}${appTpls.length ? ` · templates envoyés depuis l'app : ${appTpls.join(', ')}` : ''}\nFenêtre de 24h : ${windowOpen ? 'OUVERTE — message libre possible' : 'FERMÉE — seul un template peut partir'}${t.last_inbound_at ? ` (dernier message du lead ${madrid(new Date(t.last_inbound_at)).slice(0, 16)})` : ''}`;
  const pb = (f) => { try { return readFileSync(join(OUTREACH, 'playbook', f), 'utf8'); } catch { return `(fichier ${f} introuvable)`; } };
  const prompt = readFileSync(new URL('./suggest-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{waId}}', waId).replaceAll('{{name}}', t.name || 'prénom inconnu').replaceAll('{{now}}', madrid()).replaceAll('{{node}}', process.execPath)
    .replaceAll('{{card}}', card).replaceAll('{{extra}}', extra).replaceAll('{{transcript}}', transcript)
    .replaceAll('{{quick}}', pb('00-QUICK.md')).replaceAll('{{rules}}', pb('06-REGLES-APPRISES.md')).replaceAll('{{principes}}', pb('05-PRINCIPES-conversation.md'));
  const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 6, tools: ['Read'], lane: 'draft', timeoutMs: 3 * 60_000 });
  const raw = Array.isArray(out.bubbles) ? out.bubbles : (Array.isArray(out.options) ? out.options[0]?.bubbles : []);
  const bubbles = (raw || []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4);
  const chosen = auto ? (Array.isArray(out.moves) ? out.moves.map(String).filter((m) => MOVES.some((x) => x.id === m)) : []) : d.moves;
  const needs = String(out.needs || '').trim();
  const skip = !!out.skip && !bubbles.length;
  const why = String(out.why || out.options?.[0]?.why || '').trim();
  const note = String(out.note || '').trim();
  const source = direction.auto ? 'auto' : 'ali';
  const label = auto ? (chosen.length ? `Claude: ${chosen.map((m) => MOVES.find((x) => x.id === m).label).join(' · ')}` : '') : instruction;
  if (direction.dry) { log(`dry run for ${t.name || waId}: ${bubbles.length} bulle(s), ${Math.round(out.ms / 1000)} s`); return { dry: true, bubbles, later: out.later, why, note, needs, skip, moves: chosen, ms: out.ms }; }
  if ((needs || skip) && !bubbles.length) {
    // Not a draft: Claude asks Ali for one thing (needs) or says the message calls for no reply (skip).
    const kind = needs ? 'needs' : 'skip';
    const id = insertSuggestion(waId, [{ bubbles: [], later: [], why }], note, source, { instruction: label || null, parentId: prevFresh?.id ?? null, kind, moves: chosen, needs: needs || null });
    db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
    status.set(waId, { state: 'done', at: new Date().toISOString(), direction: label });
    try { saveDraftBlock(t, [{ bubbles: [], later: [], why: `${kind === 'needs' ? 'Claude demande : ' + needs : 'Pas de réponse nécessaire'} — ${why}` }], note, label); } catch {}
    log(`${kind} for ${t.name || waId}: ${(needs || why).slice(0, 100)}`);
    return { id, kind, needs, why };
  }
  if (!bubbles.length) throw new Error('Claude n’a proposé aucune bulle');
  const twoStep = d.twoStep || (auto && chosen.includes('admin'));
  const later = twoStep ? (Array.isArray(out.later) ? out.later : []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4) : [];
  const options = [{ bubbles, later, why }];
  const id = insertSuggestion(waId, options, note, source, { instruction: label || null, parentId: prevFresh?.id ?? null, kind: 'draft', moves: chosen });
  db.prepare('UPDATE threads SET wanted = 0 WHERE wa_id = ?').run(waId);
  status.set(waId, { state: 'done', at: new Date().toISOString(), direction: label });
  try { saveDraftBlock(t, options, note, label); } catch (e) { log('draft file error:', e.message); }
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
  let s = `\n## ${now.slice(11, 16)} · ${t.name || '?'} · +${t.wa_id} (app${instruction && instruction.startsWith('Claude :') ? ', cap choisi par Claude' : ', sur le cap d’Ali'})\nContexte : dernier message du lead — « ${ctx} »\n`;
  if (instruction) s += `${instruction.replace(/\s+/g, ' ')}\n`;
  for (const o of options) {
    for (const b of o.bubbles) s += '```\n' + b + '\n```\n';
    if (o.later?.length) { s += 'Dans 5-10 min :\n'; for (const b of o.later) s += '```\n' + b + '\n```\n'; }
    if (o.why) s += `Règles appliquées : ${o.why.replace(/\s+/g, ' ')}\n`;
  }
  if (note) s += `Note : ${note.replace(/\s+/g, ' ')}\n`;
  appendFileSync(file, s);
}

// Two lanes (2026-09-30): drafts run one at a time in their own lane so they never wait behind a learning,
// Sales Hub or consolidation run; everything else queues in the background lane.
const chains = { draft: Promise.resolve(), background: Promise.resolve() };
export function runClaude(prompt, opts = {}) {
  const lane = opts.lane === 'draft' ? 'draft' : 'background';
  const r = chains[lane].then(() => spawnClaude(prompt, opts), () => spawnClaude(prompt, opts));
  chains[lane] = r.catch(() => {});
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
  const dry = process.argv.includes('--dry'); // measure / inspect a draft without storing it or pushing the phone
  const args = process.argv.slice(3).filter((a) => a !== '--dry');
  draft(waId, { moves: args[0] || '', instruction: args[1] || '', dry }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error('Error:', e.message); process.exit(1); });
}
