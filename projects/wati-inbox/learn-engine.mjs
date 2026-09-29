// Learns from every message Ali sends from the app (2026-09-27).
//
//   sent as drafted        → one line "validé tel quel" in 04-CAS-APPRIS.md, no Claude run (free)
//   edited, or free text   → one short headless Claude run (Sonnet) that compares what was proposed,
//                            the instruction Ali typed to get a redraft, and what he really sent, and
//                            writes the lesson to ../Wati outreach/playbook/04-CAS-APPRIS.md
//
// Every draft already reads the tail of that file, so the next suggestion applies the lesson.
// Nothing is sent, nothing else is written. Cap: LEARN_MAX_PER_DAY Claude runs a day (default 40).

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getThread, getSuggestion, latestSuggestion, insertLesson, lessonRunsSince, messagesBefore } from './db.mjs';
import { runClaude, OUTREACH, madrid } from './suggest-engine.mjs';

const CASES = join(OUTREACH, 'playbook', '04-CAS-APPRIS.md');
const MAX_PER_DAY = Number(process.env.LEARN_MAX_PER_DAY || 40);
const QUIET_MS = Number(process.env.LEARN_QUIET_MS || 45_000); // a second batch sent right after joins the first
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'learn:', ...a);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[.!\s]+$/g, '').trim().toLowerCase();

const SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['lesson', 'minor', 'none'] },
    title: { type: 'string' },
    situation: { type: 'string' },
    proposed: { type: 'string' },
    sent: { type: 'string' },
    why: { type: 'string' },
    apply: { type: 'string' },
  },
  required: ['kind', 'title', 'situation', 'proposed', 'sent', 'why', 'apply'],
};

const pendingSends = new Map(); // waId → { bubbles, meta, timer, at }
const status = new Map();       // waId → { state: waiting | learning | done | error, at, kind?, error? }
export const learnStatus = (waId) => status.get(waId) || null;

// Called by the server once every bubble of a send is out.
export function learnFromSend(waId, bubbles, meta = {}) {
  const p = pendingSends.get(waId);
  if (p) { clearTimeout(p.timer); p.bubbles.push(...bubbles); }
  const entry = p || { bubbles: [...bubbles], meta, at: new Date().toISOString() };
  entry.timer = setTimeout(() => { pendingSends.delete(waId); learn(waId, entry).catch((e) => { log(waId, 'error:', e.message); status.set(waId, { state: 'error', at: new Date().toISOString(), error: e.message }); }); }, QUIET_MS);
  pendingSends.set(waId, entry);
  status.set(waId, { state: 'waiting', at: new Date().toISOString() });
}

async function learn(waId, { bubbles, meta, at }) {
  const t = getThread(waId);
  if (!t) return;
  const sugg = meta.suggestionId ? getSuggestion(meta.suggestionId) : null;
  const o0 = sugg ? (JSON.parse(sugg.options)[meta.option ?? 0] || JSON.parse(sugg.options)[0]) : null;
  const opt = o0 && meta.part === 'later' ? { bubbles: o0.later || [], why: o0.why } : o0; // the "dans 5-10 min" block is judged against its own draft
  const asIs = !!opt && opt.bubbles.length === bubbles.length && opt.bubbles.every((b, i) => norm(b) === norm(bubbles[i]));
  const day = madrid().slice(0, 10);
  const hhmm = madrid().slice(11, 16);
  const who = t.name || `+${waId}`;

  if (asIs) {
    const w = String(opt.why || '').replace(/\s+/g, ' ');
    const why = w.length > 220 ? w.slice(0, 220).replace(/\s+\S*$/, '') + '…' : w;
    appendCase(day, `- ${hhmm} · ${who} · **validé tel quel**${sugg.instruction ? ` (${sugg.instruction.replace(/\s+/g, ' ')})` : ''} — ${bubbles.map((b) => `« ${b} »`).join(' / ')}${why ? `\n  Règle confirmée : ${why}` : ''}\n`);
    insertLesson({ wa_id: waId, kind: 'confirmed', suggestion_id: sugg.id, batch: meta.batch, sent: bubbles, title: 'validé tel quel' });
    status.set(waId, { state: 'done', at: new Date().toISOString(), kind: 'confirmed' });
    log(who, 'sent as drafted — confirmed');
    return;
  }

  const n = lessonRunsSince(new Date(day + 'T00:00:00').toISOString());
  if (n >= MAX_PER_DAY) throw new Error(`plafond du jour atteint (${MAX_PER_DAY} leçons)`);
  status.set(waId, { state: 'learning', at: new Date().toISOString() });

  // The chain of drafts Ali refused, oldest first, each with the instruction that replaced it.
  const chain = [];
  for (let s = sugg, guard = 0; s && guard < 5; guard++, s = s.parent_id ? getSuggestion(s.parent_id) : null) chain.unshift(s);
  if (meta.part === 'later' && chain.length) chain.splice(0, chain.length - 1); // only the draft this block came from
  const history = messagesBefore(waId, at, 10).map((m) => `[${madrid(new Date(m.at)).slice(5, 16)}] ${m.who === 'US' ? 'ALI' : 'LEAD'} : ${String(m.text || '').replace(/\s+/g, ' ')}${m.tpl ? ' (template)' : ''}`).join('\n');
  let drafts = '';
  if (chain.length) {
    drafts = chain.map((s, i) => {
      const o0 = JSON.parse(s.options)[0] || { bubbles: [] };
      const o = meta.part === 'later' ? { bubbles: o0.later || [], why: o0.why } : o0;
      return `${chain.length > 1 ? `Proposition ${i + 1}${i === chain.length - 1 ? ' (la dernière affichée)' : ''}` : 'Proposition'}${s.instruction ? ` — refaite sur consigne d'Ali : « ${s.instruction} »` : ''} :\n${o.bubbles.map((b) => `> ${b}`).join('\n')}${o.why ? `\n(raisonnement : ${o.why.replace(/\s+/g, ' ')})` : ''}`;
    }).join('\n\n');
  } else drafts = '(aucune proposition affichée — Ali a écrit lui-même, sans brouillon)';
  const prompt = readFileSync(new URL('./learn-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{name}}', who).replaceAll('{{waId}}', waId).replaceAll('{{now}}', madrid())
    .replaceAll('{{ctx}}', [t.stage, t.meeting && `entretien ${t.meeting}`, t.country].filter(Boolean).join(' · ') || '—')
    .replaceAll('{{history}}', history || '(historique indisponible)')
    .replaceAll('{{drafts}}', drafts)
    .replaceAll('{{sent}}', bubbles.map((b) => `> ${b}`).join('\n'));
  const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 8, tag: 'learn', timeoutMs: 4 * 60_000, tools: ['Read', 'Grep', 'Glob', 'Bash(cat:*)', 'Bash(sed -n:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)'] });
  const kind = ['lesson', 'minor', 'none'].includes(out.kind) ? out.kind : 'lesson';
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  let text = '';
  if (kind === 'lesson') {
    text = `### ${hhmm} · ${who} — ${clean(out.title)}\n**Situation :** ${clean(out.situation)}\n**Ce qui était proposé :** ${clean(out.proposed)}\n**Ce qu'Ali a envoyé :** ${clean(out.sent)}\n**Pourquoi :** ${clean(out.why)}\n**Comment appliquer :** ${clean(out.apply)}\n`;
  } else if (kind === 'minor') {
    text = `- ${hhmm} · ${who} · **retouche** — ${clean(out.title)}${out.why ? ` (${clean(out.why)})` : ''}\n`;
  }
  if (text) appendCase(day, text);
  insertLesson({ wa_id: waId, kind, suggestion_id: sugg?.id ?? null, batch: meta.batch, sent: bubbles, title: clean(out.title), text });
  status.set(waId, { state: 'done', at: new Date().toISOString(), kind });
  log(who, `→ ${kind}${out.title ? `: ${clean(out.title)}` : ''} (${Math.round(out.ms / 1000)} s)`);
}

// Appends under today's "## <date> — Appris dans l'app" heading at the end of 04-CAS-APPRIS.md (created once a day).
function appendCase(day, text) {
  const head = `## ${day} — Appris dans l'app`;
  const cur = existsSync(CASES) ? readFileSync(CASES, 'utf8') : '';
  const lastHead = cur.lastIndexOf('\n## ');
  const todayLast = lastHead >= 0 && cur.slice(lastHead + 1, cur.indexOf('\n', lastHead + 1)).trim() === head;
  let s = cur.endsWith('\n') || !cur ? '' : '\n';
  if (!todayLast) s += `\n${head}\n\n<!-- écrit par l'app Wati Inbox après chaque envoi : "validé tel quel" = brouillon envoyé sans changement (règle confirmée) ; "retouche" = petit écart ; bloc titré = leçon -->\n\n`;
  appendFileSync(CASES, s + text);
}
