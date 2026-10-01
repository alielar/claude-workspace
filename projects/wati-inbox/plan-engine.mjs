// The day plan (2026-10-01): one card per lead that matters today — paused leads needing a human
// follow-up, leads whose next Sales Hub template is due, finished or stuck sequences — judged by one
// Sonnet run per batch of leads, with the real template text and the conversation. Nothing is sent and
// nothing is changed in the Hub: the cards tell Ali what to do, when, and carry the draft.
//
//   morning run at PLAN_AT (09:15 Madrid) over every candidate; then every 5 min, any lead whose Hub
//   state changed or whose template is due within 5 h and that has no card yet. Cap: PLAN_MAX_CALLS/day.
//   A card closes by itself when the lead writes (replied), when Ali sends a message to that lead
//   (followup → done), at midnight (expired); Ali taps « Fait » or « Pas d'accord » (with a note that the
//   next judgements read).
//
//   node --env-file=.env plan-engine.mjs            candidates now (no Claude)
//   node --env-file=.env plan-engine.mjs --run      judge them now, write the cards, push the summary

import { readFileSync, mkdirSync } from 'node:fs';
import { db, getThread, threadMessages, hubLeadRows, hubTemplate, hubTemplateRows, insertPlanItem, planItems, openPlanItems, planItemsFor, setPlanState, expirePlanItems, unpushedPlanItems, markPlanPushed, dueReminders, markPlanReminded, planDismissed, planCounts, getState, setState, insertSuggestion, markSuggestionPushed } from './db.mjs';
import { hubReady } from './hub.mjs';
import { hubSig, onHubChange, syncUpcoming, upcomingOf, realNext, stepOf } from './hub-sync.mjs';
import { runClaude, madrid } from './suggest-engine.mjs';
import { pushAll } from './push.mjs';
import { frenchTemplates } from './wati.mjs';

const PLAN_AT = process.env.PLAN_AT || '09:15';
const MAX_CALLS = Number(process.env.PLAN_MAX_CALLS || 15);
const BATCH = 6;
const DUE_H = Number(process.env.PLAN_DUE_H || 5);
const FROM_H = 8, TO_H = 22;
// Second, low-pressure follow-up before the 24h window shuts (Ali, 2026-10-01): a paused lead whose window closes within
// CLOSING_H and who stayed silent since Ali's manual message of the day (sent ≥ CLOSING_GAP_H ago) is judged once more.
const CLOSING_H = Number(process.env.PLAN_CLOSING_H || 2.5);
const CLOSING_GAP_H = Number(process.env.PLAN_CLOSING_GAP_H || 2);
const TEST_NUMBER = '34695064884';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'plan:', ...a);
export const today = () => madrid().slice(0, 10);
const status = { state: 'idle', at: null, last: null, error: null, calls: 0 };
export const planStatus = () => ({ ...status, calls: callsToday(), max: MAX_CALLS, ready: hubReady() });
const callsToday = () => db.prepare("SELECT count(*) n FROM state WHERE key LIKE 'plan_call_%' AND value LIKE ?").get(`${today()}%`).n;
const countCall = () => setState(`plan_call_${Date.now()}`, new Date().toISOString());

// "14:00" today or "2026-10-02 09:00" (Madrid) → ISO instant.
function madridIso(s) {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})?\s*(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const date = m[1] || today(), hhmm = `${m[2].padStart(2, '0')}:${m[3]}`;
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const local = madrid(new Date(guess));
  const offset = Date.parse(local.replace(' ', 'T') + 'Z') - guess;
  return new Date(guess - offset).toISOString();
}
const fmtHM = (iso) => madrid(new Date(iso)).slice(11, 16);

// The 24h free-text window of a thread and Ali's last manual message (templates excluded).
// closingSoon: the window shuts within CLOSING_H, Ali wrote by hand today after the lead's last message, at least
// CLOSING_GAP_H ago, and the lead has not answered → a second, low-pressure card before the window closes.
export function windowInfo(msgs, now = Date.now()) {
  const lastLead = [...msgs].reverse().find((m) => m.who === 'LEAD');
  const lastAli = [...msgs].reverse().find((m) => m.who !== 'LEAD' && !m.tpl);
  const closeAt = lastLead ? Date.parse(lastLead.at) + 24 * 3600e3 : null;
  const open = !!closeAt && closeAt > now;
  const aliAfterLead = !!lastAli && !!lastLead && Date.parse(lastAli.at) > Date.parse(lastLead.at);
  const closingSoon = open && closeAt - now <= CLOSING_H * 3600e3 && aliAfterLead
    && madrid(new Date(lastAli.at)).slice(0, 10) === madrid(new Date(now)).slice(0, 10)
    && now - Date.parse(lastAli.at) >= CLOSING_GAP_H * 3600e3;
  return { open, closeAt, lastLead, lastAli, closingSoon };
}
// A closing card has its own signature so it can follow a done/dismissed card of the same Hub state.
const cardSig = (c) => hubSig(c.wa_id) + (c.reason === 'closing' ? '|closing' : '');

// Who matters today. reason: paused | closing | due | finished | stale.
// Leads Ali took out of the plan for good (state key plan_ignore, JSON list of wa_ids): e.g. Ilyes, a minor whose
// mother decided not to buy (2026-10-01) — paused in the Hub indefinitely, never a card again.
export const ignored = () => { try { return new Set(JSON.parse(getState('plan_ignore') || '[]')); } catch { return new Set(); } };
export const ignore = (waId, on = true) => { const s = ignored(); on ? s.add(waId) : s.delete(waId); setState('plan_ignore', JSON.stringify([...s])); if (on) for (const i of openPlanItems(waId)) setPlanState(i.id, 'dismissed', 'Lead removed from the plan by Ali'); return [...s]; };
export function candidates(now = Date.now()) {
  const out = [];
  const skip = ignored();
  const dueBefore = new Date(now + 24 * 3600e3).toISOString();
  for (const r of hubLeadRows()) {
    if (r.wa_id === TEST_NUMBER || skip.has(r.wa_id)) continue;
    let reason = null;
    if (r.paused && ['TBC', 'IITF', 'CITF'].includes(r.status)) reason = 'paused';
    else if (r.status === 'TBC' && r.next_at && r.next_at <= dueBefore && r.next_at >= new Date(now - 60 * 60e3).toISOString()) reason = 'due';
    else if (r.status === 'TBC' && r.next_at && r.next_at < new Date(now - 60 * 60e3).toISOString()) reason = 'stale';
    else if (r.status === 'TBC' && !r.next_tpl && r.last_reason_at && now - Date.parse(r.last_reason_at) < 3 * 864e5) reason = 'finished';
    if (!reason) continue;
    const t = getThread(r.wa_id);
    const msgs = t ? threadMessages(r.wa_id) : [];
    const win = windowInfo(msgs, now);
    if (reason === 'paused' && win.closingSoon) reason = 'closing';
    out.push({ ...r, reason, thread: t, msgs, win });
  }
  // Most urgent first: paused leads (a human gesture is due), then templates by time, then stuck and finished sequences.
  // Recent leads (meeting in the last 3 days) and soonest templates first; stuck and finished sequences last.
  const cutoff = new Date(now - 3 * 864e5).toISOString().slice(0, 10);
  const rank = (c) => (c.reason === 'stale' || c.reason === 'finished' ? 2 : 0) + ((c.meeting_date || '') >= cutoff ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || String(a.next_at || '9').localeCompare(String(b.next_at || '9')));
}

// Leads with no card today, or whose Hub state moved since their card (then the old card is superseded).
function needing(cands) {
  const d = today();
  return cands.filter((c) => {
    const items = planItemsFor(c.wa_id, d);
    const sig = cardSig(c);
    const open = items.find((i) => i.state === 'open');
    if (open && open.hub_sig === 'manual') return false; // planned by Ali or a chat (suggest.mjs --at): not re-judged while open
    if (open && open.hub_sig === sig) return false;
    if (items.some((i) => i.state !== 'open' && i.state !== 'superseded' && i.hub_sig === sig)) return false; // done/dismissed/replied for this same state
    return true;
  });
}

export function leadBlock(c) {
  const fmt = (iso) => madrid(new Date(iso)).slice(5, 16);
  const tpl = c.next_tpl ? hubTemplate(c.next_tpl) : null;
  const win = c.win || windowInfo(c.msgs);
  const name = [c.name, c.last_name].filter(Boolean).join(' ') || c.thread?.name || c.wa_id;
  const head = [`### ${name} · waId ${c.wa_id}${c.thread?.country === 'Switzerland' ? ' · SUISSE (CHF)' : ''}`,
    `Hub : statut ${c.status}${c.paused ? ' · EN PAUSE' : ''}${c.skip_next ? ' · prochain sauté' : ''} · phase ${c.phase || '-'} · entretien ${c.meeting_date || '-'} · dernier événement : ${c.last_reason || '-'}${c.last_reason_at ? ` (${fmt(c.last_reason_at)})` : ''}`,
    c.next_tpl ? `Prochain template selon le Hub : ${stepOf(c, c.next_tpl) ? `#${stepOf(c, c.next_tpl).stepIndex} ` : ''}${c.next_tpl} à ${fmt(c.next_at)}${Date.parse(c.next_at) < Date.now() - 3600e3 ? ' (DANS LE PASSÉ : probablement décoché par Ali)' : ''}${c.paused ? ' (ne partira pas tant que la pause tient)' : ''}` : 'Prochain template : aucun (séquence terminée)',
    tpl?.text ? `> ${tpl.text.replace(/\s+/g, ' ')}` : '',
    upcomingOf(c).length ? 'Étapes à venir (numéro, template, heure) :\n' + upcomingOf(c).map((u) => { const t = hubTemplate(u.template); return `  #${u.stepIndex} ${u.template} · ${fmt(u.scheduledAt)}${Date.parse(u.scheduledAt) < Date.now() - 15 * 60e3 ? ' (passé)' : ''}${t?.text ? ` : « ${t.text.replace(/\s+/g, ' ').slice(0, 110)} »` : ''}`; }).join('\n') : '',
    c.citf ? `Plan CITF : ${c.citf}` : '',
    `Pourquoi ce lead est dans la liste : ${{ paused: 'automatisation en pause → relance humaine à décider', closing: 'la fenêtre 24h se ferme ce soir et le lead n’a pas répondu à la relance manuelle d’Ali du jour → seconde relance basse pression avant la fermeture (règle « fenêtre qui se ferme »), ou wait', due: 'template dans les 24 h', stale: 'prochain template dans le passé', finished: 'séquence terminée sans réponse' }[c.reason]}`,
    `Fenêtre 24h : ${win.open ? `OUVERTE, se ferme à ${fmt(win.closeAt)} (dernier message du lead ${fmt(win.lastLead.at)})` : 'FERMÉE (template seulement)'}`,
    win.lastAli ? `Dernier message manuel d’Ali : ${fmt(win.lastAli.at)}${win.lastLead && Date.parse(win.lastAli.at) > Date.parse(win.lastLead.at) ? ' (sans réponse du lead depuis)' : ''}` : '',
    c.thread?.stage ? `CRM : ${c.thread.stage}` : ''].filter(Boolean).join('\n');
  const conv = c.msgs.length
    ? c.msgs.slice(-18).map((m) => `[${fmt(m.at)}] ${m.who === 'LEAD' ? 'LEAD' : m.tpl ? `AUTO ${m.tpl_name || ''}` : 'ALI '} : ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 320)}`).join('\n')
    : '(aucune conversation lisible sur le numéro Sales : le lead n’a répondu à aucun message)';
  return `${head}\nConversation :\n${conv}`;
}

// The CITF reasons the Hub knows (seen in /leads): each one starts its own template set.
export const CITF_CASES = { payment: 'will pay later', payment_month: 'pays next month', more_time: 'needs time', general_later: 'later, no specific reason' };
const SCHEMA = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: {
    waId: { type: 'string' }, kind: { type: 'string', enum: ['pause', 'followup', 'resume', 'wait', 'fix', 'ok'] }, when: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' }, action: { type: 'string' },
    pauseScope: { type: 'string' }, skipTemplates: { type: 'array', items: { type: 'string' } }, keepTemplates: { type: 'array', items: { type: 'string' } }, hubStatus: { type: 'string' }, citfCase: { type: 'string' }, citfDate: { type: 'string' }, bubbles: { type: 'array', items: { type: 'string' } }, template: { type: 'string' } },
    required: ['waId', 'kind', 'when', 'title', 'why', 'action', 'pauseScope', 'skipTemplates', 'keepTemplates', 'hubStatus', 'citfCase', 'citfDate', 'bubbles', 'template'] } },
  summary: { type: 'string' } }, required: ['items', 'summary'] };

async function judgeBatch(batch) {
  for (const c of batch) { const u = await syncUpcoming(c.wa_id); if (u) c.upcoming = JSON.stringify(u); } // the #n steps the Hub shows Ali
  const weekday = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const dismissed = planDismissed(30).map((p) => `- ${p.day} · ${p.name || ''} · ${p.kind} « ${p.title} »${p.note ? ` — Ali : ${p.note}` : ''}`).join('\n') || '(rien pour le moment)';
  let tpls = [];
  try { tpls = (await frenchTemplates()).filter((t) => /^tbc_|^followup_|_replied/.test(t.name)).slice(0, 25); } catch {}
  const templates = tpls.map((t) => `- ${t.name} : « ${String(t.body || '').replace(/\s+/g, ' ').slice(0, 160)} »`).join('\n') || '(liste indisponible)';
  const prompt = readFileSync(new URL('./plan-prompt.md', import.meta.url), 'utf8')
    .replaceAll('{{now}}', madrid()).replaceAll('{{weekday}}', weekday).replaceAll('{{dismissed}}', dismissed).replaceAll('{{templates}}', templates)
    .replaceAll('{{leads}}', batch.map(leadBlock).join('\n\n'));
  countCall();
  const out = await runClaude(prompt, { schema: SCHEMA, maxTurns: 3, tag: 'plan', timeoutMs: 5 * 60_000, tools: [] });
  return { items: Array.isArray(out.items) ? out.items : [], summary: String(out.summary || '').trim(), ms: out.ms };
}

function store(c, it) {
  const d = today();
  let pushed = false;
  for (const old of planItemsFor(c.wa_id, d)) if (old.state === 'open') { setPlanState(old.id, 'superseded'); if (old.pushed) pushed = true; } // a re-judged card is not pushed twice
  const name = [c.name, c.last_name].filter(Boolean).join(' ') || c.thread?.name || null;
  const bubbles = (Array.isArray(it.bubbles) ? it.bubbles : []).map((b) => String(b).trim()).filter(Boolean).slice(0, 4);
  let kind = ['pause', 'followup', 'resume', 'wait', 'fix', 'ok'].includes(it.kind) ? it.kind : 'ok';
  if (kind === 'pause' && c.paused) kind = bubbles.length ? 'followup' : 'wait'; // already paused: nothing to pause, a human gesture or a date
  const whenIso = madridIso(it.when) || (kind === 'pause' && c.next_at ? c.next_at : null);
  // Which Hub mechanism: pause the whole automation, or skip only the named template(s) (Ali, 2026-10-01).
  const pauseScope = kind === 'pause' ? (it.pauseScope === 'next' ? 'next' : 'all') : null;
  const skip = (kind === 'pause' && pauseScope === 'next') || kind === 'resume' ? (Array.isArray(it.skipTemplates) ? it.skipTemplates.map(String).filter(Boolean) : []) : [];
  const keep = kind === 'resume' ? (Array.isArray(it.keepTemplates) ? it.keepTemplates.map(String).filter(Boolean) : []) : [];
  const label = (t) => { const u = stepOf(c, t); return u ? `#${u.stepIndex} ${t}` : t; };
  if (pauseScope === 'next' && !skip.length) { const n = realNext(c); skip.push(n ? n.template : c.next_tpl); }
  const skipLabel = skip.map((t) => { const u = stepOf(c, t); return u ? `#${u.stepIndex} ${t}` : t; });
  const actionBits = [pauseScope === 'all' ? 'Hub: full pause' : pauseScope === 'next' ? `Hub: untick ${skipLabel.join(' and ')}, the rest goes out normally` : kind === 'resume' ? `Hub: lift the pause${skip.length ? `, untick ${skip.map(label).join(', ')}` : ''}${keep.length ? `, keep ${keep.map(label).join(', ')}` : ''}` : '', String(it.action || '').trim()];
  // IITF is retired (Ali, 2026-10-01): a lead who comes back later is CITF with a reason and a date.
  const hubStatus = it.hubStatus === 'IITF' ? 'CITF' : it.hubStatus;
  if (hubStatus && /^(OR|CITF)$/.test(hubStatus)) actionBits.push(`Hub status: ${hubStatus}${hubStatus === 'CITF' ? ` (${[CITF_CASES[it.citfCase] || it.citfCase, it.citfDate].filter(Boolean).join(', ')})` : ''}`);
  let suggestionId = null;
  if (bubbles.length) { // the draft becomes a normal suggestion in the thread: editable, sendable, learned from
    // Shown in the thread 15 min before its time (the reminder push comes 10 min before), not all day (Ali, 2026-10-01).
    const showAt = whenIso && Date.parse(whenIso) - 15 * 60e3 > Date.now() ? new Date(Date.parse(whenIso) - 15 * 60e3).toISOString() : null;
    suggestionId = insertSuggestion(c.wa_id, [{ bubbles, later: [], why: String(it.why || '') }], null, 'plan', { instruction: `Today’s plan: ${String(it.title || '').slice(0, 80)}`, kind: 'draft', moves: [], showAt });
    markSuggestionPushed(suggestionId);
  }
  return insertPlanItem({ wa_id: c.wa_id, name, day: d, kind, when_at: whenIso, title: String(it.title || '').trim().slice(0, 140), why: String(it.why || '').trim().slice(0, 600), action: actionBits.filter(Boolean).join(' · ').slice(0, 400),
    hub_status: c.status, hub_next: c.next_tpl, hub_next_at: c.next_at, hub_paused: c.paused, hub_sig: cardSig(c), bubbles: bubbles.length ? bubbles : null, template: String(it.template || '').trim() || null, suggestion_id: suggestionId, pause_scope: pauseScope, skip_templates: skip.length ? skip : null, keep_templates: keep.length ? keep : null, pushed });
}

let running = false;
// scope: 'all' (morning) or 'due' (state changed / template within DUE_H).
export async function plan({ scope = 'due', reason = 'auto', dry = false, only = null } = {}) {
  if (running || !hubReady()) return null;
  running = true; status.state = 'running'; status.at = new Date().toISOString(); status.error = null;
  try {
    expirePlanItems(today());
    let cands = only ? candidates().filter((c) => only.includes(c.wa_id)) : needing(candidates()); // only = re-judge these leads now, replacing their cards
    if (scope === 'due') { const lim = new Date(Date.now() + DUE_H * 3600e3).toISOString(); cands = cands.filter((c) => c.reason === 'paused' || c.reason === 'closing' || (c.next_at && c.next_at <= lim) || c.reason === 'finished' || c.reason === 'stale'); }
    if (dry) { status.state = 'idle'; return { candidates: cands.map((c) => ({ wa_id: c.wa_id, name: c.name, reason: c.reason, status: c.status, next: c.next_tpl, at: c.next_at })) }; }
    if (!cands.length) { status.state = 'idle'; return { judged: 0 }; }
    let judged = 0; const summaries = [];
    for (let i = 0; i < cands.length; i += BATCH) {
      if (callsToday() >= MAX_CALLS) { log(`cap of ${MAX_CALLS} calls reached today`); break; }
      const batch = cands.slice(i, i + BATCH);
      log(`judging ${batch.map((c) => c.name || c.wa_id).join(', ')} (${reason})`);
      let out;
      try { out = await judgeBatch(batch); } catch (e) { log('judge error:', e.message); status.error = e.message; continue; }
      const byWa = new Map(batch.map((c) => [c.wa_id, c]));
      for (const it of out.items) { const c = byWa.get(String(it.waId || '').replace(/\D/g, '')); if (!c) continue; store(c, it); judged++; }
      if (out.summary) summaries.push(out.summary);
      log(`${out.items.length} card(s) in ${Math.round((out.ms || 0) / 1000)} s`);
    }
    status.last = { at: new Date().toISOString(), judged, scope, summary: summaries.join(' ').slice(0, 400) };
    setState('plan_last', JSON.stringify(status.last));
    status.state = 'idle';
    if (judged && scope === 'all') { const c = planCounts(today()); await pushAll({ title: 'Today’s plan is ready', body: `${c.todo} to handle in the Hub · ${c.followups} follow-up(s) · ${c.waits} waiting · ${c.oks} template(s) fine`, tag: 'plan', url: '/plan' }); for (const i of unpushedPlanItems()) markPlanPushed(i.id); }
    return status.last;
  } finally { running = false; status.state = 'idle'; }
}

// Pushes for cards created during the day (pause/fix: now; followup: 10 min before its time).
async function pushes() {
  if (!hubReady()) return;
  const h = Number(madrid().slice(11, 13));
  if (h < FROM_H || h >= TO_H) return;
  for (const i of unpushedPlanItems()) {
    if (i.kind === 'pause' || i.kind === 'fix' || i.kind === 'resume') await pushAll({ title: `${i.kind === 'pause' ? (i.pause_scope === 'next' ? 'Template to untick' : 'Full pause') : i.kind === 'resume' ? 'Resume automation' : 'To check'} · ${i.name || i.wa_id}`, body: `${i.title}${i.hub_next_at ? `. ${i.hub_next} at ${fmtHM(i.hub_next_at)}` : ''}`, tag: `plan-${i.wa_id}`, url: `/t/${i.wa_id}` });
    markPlanPushed(i.id);
  }
  for (const i of dueReminders(new Date(Date.now() + 10 * 60e3).toISOString())) {
    if (i.kind === 'followup' && i.day === today()) await pushAll({ title: `Follow-up ${fmtHM(i.when_at)} · ${i.name || i.wa_id}`, body: i.title, tag: `plan-${i.wa_id}`, url: `/t/${i.wa_id}` });
    markPlanReminded(i.id);
  }
}

export function startPlanning() {
  if (!hubReady()) { log('off (no Sales Hub token)'); return; }
  mkdirSync('logs', { recursive: true });
  onHubChange((changed) => { for (const w of changed) for (const i of openPlanItems(w)) if (String(i.hub_sig || '').replace(/\|closing$/, '') !== hubSig(w)) log(`${i.name || w}: Hub state moved, card will be re-judged`); });
  setInterval(async () => {
    try {
      const now = madrid();
      if (now.slice(11, 16) >= PLAN_AT && getState('plan_day') !== now.slice(0, 10)) { setState('plan_day', now.slice(0, 10)); await plan({ scope: 'all', reason: 'morning' }); }
      else await plan({ scope: 'due', reason: 'auto' });
      await pushes();
    } catch (e) { log('tick error:', e.message); }
  }, 5 * 60_000);
  setInterval(() => pushes().catch(() => {}), 60_000);
  log(`ready — morning plan at ${PLAN_AT} Madrid, then every 5 min for what moves, max ${MAX_CALLS} judgements/day`);
}

if (process.argv[1] && process.argv[1].endsWith('plan-engine.mjs')) {
  mkdirSync('logs', { recursive: true });
  const { syncLeads, syncTemplates } = await import('./hub-sync.mjs');
  await syncTemplates(); await syncLeads();
  const onlyArg = process.argv[process.argv.indexOf('--only') + 1];
  const only = process.argv.includes('--only') && onlyArg ? onlyArg.split(',').map((x) => x.replace(/\D/g, '')) : null;
  if (process.argv.includes('--run')) { const r = await plan({ scope: 'all', reason: 'ali', only }); console.log(JSON.stringify(r, null, 2)); for (const i of planItems(today())) console.log(`${i.state.padEnd(6)} ${i.kind.padEnd(8)} ${(i.name || i.wa_id).padEnd(24)} ${i.when_at ? fmtHM(i.when_at) : '     '}  ${i.title}`); }
  else { const r = await plan({ dry: true, scope: 'all' }); console.log(JSON.stringify(r, null, 2)); }
  process.exit(0);
}
