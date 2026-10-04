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
import { getThread, getSuggestion, latestSuggestion, insertLesson, lessonRunsSince, messagesBefore, setPlanLesson, planItemById } from './db.mjs';
import { runClaude, OUTREACH, madrid } from './suggest-engine.mjs';
import { hubNextFor } from './hub-sync.mjs';
import { pushAll } from './push.mjs';

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
  if (meta.reaction) return; // a one-tap emoji reply to a 'nothing to answer' card: nothing to learn from (Ali, 2026-10-01)
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

// « I did it differently » on a plan card (Ali, 2026-10-04: « when I do stuff differently I tell you why, you need to learn from it »).
// Before this, the note was only pasted raw into the next 30 judgements and never became a rule. Now one Claude run turns the card,
// the Hub state, the thread and Ali's note into a lesson in 04-CAS-APPRIS.md (consolidated every evening into 06, read by the plan
// and by every draft). When the gesture contradicts a written rule, the card shows both and Ali decides: new rule, or one-off.
const PLAN_SCHEMA = { type: 'object', properties: { kind: { type: 'string', enum: ['lesson', 'minor', 'none'] }, title: { type: 'string' }, situation: { type: 'string' }, card: { type: 'string' }, did: { type: 'string' }, why: { type: 'string' }, apply: { type: 'string' }, contradicts: { type: 'string' }, source: { type: 'string' } },
  required: ['kind', 'title', 'situation', 'card', 'did', 'why', 'apply', 'contradicts', 'source'] };
const fmtM = (iso) => madrid(new Date(iso)).slice(5, 16);
export async function learnFromPlanNote(item, note) {
  const waId = item.wa_id, t = getThread(waId), who = item.name || t?.name || `+${waId}`;
  const day = madrid().slice(0, 10), hhmm = madrid().slice(11, 16);
  if (lessonRunsSince(new Date(day + 'T00:00:00').toISOString()) >= MAX_PER_DAY) throw new Error(`plafond du jour atteint (${MAX_PER_DAY} leçons)`);
  const h = hubNextFor(waId);
  const hub = h ? [`statut ${h.status}${h.paused ? ' · EN PAUSE' : ''}${h.skipNext ? ' · prochain sauté' : ''} · phase ${h.phase || '-'}`,
    h.next ? `prochain template : ${h.next.step != null ? `#${h.next.step} ` : ''}${h.next.template} à ${fmtM(h.next.at)}${h.next.text ? ` : « ${h.next.text.replace(/\s+/g, ' ').slice(0, 200)} »` : ''}` : 'prochain template : aucun',
    (h.upcoming || []).filter((u) => !u.past).length ? 'étapes à venir : ' + h.upcoming.filter((u) => !u.past).map((u) => `#${u.step} ${u.template} ${fmtM(u.at)}`).join(', ') : ''].filter(Boolean).join('\n') : '(lead absent du Sales Hub)';
  const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const card = [`geste : ${item.kind}${item.pause_scope ? ` (${item.pause_scope === 'next' ? 'décocher un template' : 'pause complète'})` : ''}${item.when_at ? ` · heure prévue ${fmtM(item.when_at)}` : ''}`, `titre : ${item.title || ''}`, item.why && `pourquoi : ${item.why}`, item.action && `action : ${item.action}`,
    j(item.skip_templates)?.length && `à décocher : ${j(item.skip_templates).join(', ')}`, j(item.keep_templates)?.length && `à garder : ${j(item.keep_templates).join(', ')}`, item.template && `template : ${item.template}`, j(item.bubbles)?.length && `bulles : ${j(item.bubbles).join(' / ')}`].filter(Boolean).join('\n');
  const history = messagesBefore(waId, new Date().toISOString(), 12).map((m) => `[${fmtM(m.at)}] ${m.who === 'US' ? (m.tpl ? 'AUTO' : 'ALI') : 'LEAD'} : ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const prompt = readFileSync(new URL('./learn-plan-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{name}}', who).replaceAll('{{waId}}', waId).replaceAll('{{now}}', madrid()).replaceAll('{{hub}}', hub).replaceAll('{{card}}', card)
    .replaceAll('{{history}}', history || '(aucune conversation lisible)').replaceAll('{{note}}', String(note || '').trim());
  log(`${who}: learning from « I did it differently » on card #${item.id}`);
  const out = await runClaude(prompt, { schema: PLAN_SCHEMA, maxTurns: 8, tag: 'learn-plan', timeoutMs: 4 * 60_000, tools: ['Read', 'Grep', 'Glob', 'Bash(cat:*)', 'Bash(sed -n:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)'] });
  const kind = ['lesson', 'minor', 'none'].includes(out.kind) ? out.kind : 'lesson';
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const contradicts = clean(out.contradicts), source = /^(plan-prompt|06)$/.test(clean(out.source)) ? clean(out.source) : '';
  let text = '';
  if (kind === 'lesson') text = `### ${hhmm} · ${who} — ${clean(out.title)} (plan du jour : Ali a fait autrement)\n**Situation :** ${clean(out.situation)}\n**Ce que la carte proposait :** ${clean(out.card)}\n**Ce qu'Ali a fait :** ${clean(out.did)}\n**Pourquoi :** ${clean(out.why)}\n**Comment appliquer :** ${clean(out.apply)}\n${contradicts ? `**Contredit la règle :** « ${contradicts} » (${source || 'source non précisée'}) — en attente de la décision d'Ali dans l'app\n` : ''}`;
  else if (kind === 'minor') text = `- ${hhmm} · ${who} · **plan, cas particulier** — ${clean(out.title)}${out.why ? ` (${clean(out.why)})` : ''}\n`;
  if (text) appendCase(day, text);
  insertLesson({ wa_id: waId, kind: kind === 'none' ? 'none' : 'plan', suggestion_id: item.suggestion_id ?? null, batch: `plan-${item.id}`, sent: [String(note || '')], title: clean(out.title), text });
  const lesson = { kind, title: clean(out.title), situation: clean(out.situation), card: clean(out.card), did: clean(out.did), why: clean(out.why), apply: clean(out.apply), contradicts, source, decided: null, at: new Date().toISOString() };
  setPlanLesson(item.id, lesson);
  log(`${who} → plan ${kind}: ${clean(out.title)}${contradicts ? ' · CONFLICT with a written rule' : ''} (${Math.round(out.ms / 1000)} s)`);
  if (contradicts) pushAll({ title: `Rule conflict · ${who}`, body: `${clean(out.title)}. This contradicts: « ${contradicts.slice(0, 120)} ». New rule or one-off? Decide on the card.`, tag: `plan-rule-${item.id}`, url: '/plan' }).catch(() => {});
  return lesson;
}
// Ali's verdict on a conflict (Ali, 2026-10-04 evening: « so I can pick the rule to apply, and add context so it applies once and
// for all »): `rule` = B replaces A, `oneoff` = A stays and this lead was an exception, `conditional` = A stays the general rule and
// B applies in the context Ali gives. The verdict goes to the journal with his words; the evening consolidation makes it the rule.
export function decidePlanRule(item, verdict, context = '') {
  let lesson = null; try { lesson = item.lesson ? JSON.parse(item.lesson) : null; } catch {}
  if (!lesson) throw new Error('No lesson on this card');
  if (!['rule', 'oneoff', 'conditional'].includes(verdict)) throw new Error('Unknown verdict');
  const ctx = String(context || '').replace(/\s+/g, ' ').trim();
  if (verdict === 'conditional' && !ctx) throw new Error('Say in which context the new rule applies');
  const day = madrid().slice(0, 10), hhmm = madrid().slice(11, 16), who = item.name || `+${item.wa_id}`;
  const A = lesson.contradicts || '…', B = lesson.apply || lesson.title, src = lesson.source ? `, ${lesson.source}` : '';
  const line = verdict === 'rule' ? `- ${hhmm} · ${who} · **RÈGLE REMPLACÉE (décision d'Ali)** — ${B} (remplace : « ${A} »${src})${ctx ? ` — précision d'Ali : ${ctx}` : ''}\n`
    : verdict === 'conditional' ? `- ${hhmm} · ${who} · **RÈGLE PRÉCISÉE (décision d'Ali)** — « ${A} » reste la règle générale ; quand ${ctx} : ${B}\n`
    : `- ${hhmm} · ${who} · **cas particulier (décision d'Ali)** — la règle « ${A} » reste ; exception pour ce lead seulement : ${lesson.title}${ctx ? ` — précision d'Ali : ${ctx}` : ''}\n`;
  appendCase(day, line);
  lesson.decided = verdict; lesson.context = ctx || null; lesson.decidedAt = new Date().toISOString();
  setPlanLesson(item.id, lesson);
  log(`${who}: conflict decided → ${verdict}${ctx ? ` (${ctx.slice(0, 80)})` : ''}`);
  return lesson;
}

// Appends under today's "## <date> — Appris dans l'app" heading at the end of 04-CAS-APPRIS.md (created once a day).
export function appendCase(day, text) {
  const head = `## ${day} — Appris dans l'app`;
  const cur = existsSync(CASES) ? readFileSync(CASES, 'utf8') : '';
  const lastHead = cur.lastIndexOf('\n## ');
  const todayLast = lastHead >= 0 && cur.slice(lastHead + 1, cur.indexOf('\n', lastHead + 1)).trim() === head;
  let s = cur.endsWith('\n') || !cur ? '' : '\n';
  if (!todayLast) s += `\n${head}\n\n<!-- écrit par l'app Wati Inbox après chaque envoi : "validé tel quel" = brouillon envoyé sans changement (règle confirmée) ; "retouche" = petit écart ; bloc titré = leçon -->\n\n`;
  appendFileSync(CASES, s + text);
}
