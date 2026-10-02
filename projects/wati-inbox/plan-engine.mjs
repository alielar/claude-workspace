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
import { db, getThread, threadMessages, hubLeadRows, hubTemplate, hubTemplateRows, insertPlanItem, laterPending, planItems, openPlanItems, planItemsFor, setPlanState, expirePlanItems, unpushedPlanItems, markPlanPushed, dueReminders, markPlanReminded, planDismissed, planCounts, getState, setState, insertSuggestion, markSuggestionPushed } from './db.mjs';
import { hubReady } from './hub.mjs';
import { hubSig, onHubChange, syncUpcoming, upcomingOf, realNext, stepOf } from './hub-sync.mjs';
import { runClaude, madrid } from './suggest-engine.mjs';
import { pushAll } from './push.mjs';
import { frenchTemplates } from './wati.mjs';

const PLAN_AT = process.env.PLAN_AT || '09:15';
const MAX_CALLS = Number(process.env.PLAN_MAX_CALLS || 30); // raised 15 → 30 on 2026-10-01: every manual message now costs one judgement
const BATCH = 6;
// After a manual message from Ali (app or Wati), the lead is judged again SENT_DELAY_MS later (Ali, 2026-10-01: "what
// should I do in the Hub now: wait, second follow-up, pause, skip a template, resume, change the status").
const SENT_DELAY_MS = Number(process.env.PLAN_SENT_DELAY_MIN || 3) * 60e3;
const DUE_H = Number(process.env.PLAN_DUE_H || 5);
const FROM_H = 8, TO_H = 22;
// Second, low-pressure follow-up before the 24h window shuts (Ali, 2026-10-01): a paused lead whose window closes within
// CLOSING_H and who stayed silent since Ali's manual message of the day (sent ≥ CLOSING_GAP_H ago) is judged once more.
const CLOSING_H = Number(process.env.PLAN_CLOSING_H || 4);
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
// closingSoon: the window shuts within CLOSING_H, Ali wrote by hand after the lead's last message (today or the day
// before), at least CLOSING_GAP_H ago, and the lead has not answered → a short follow-up card while free text still
// works (Ali, 2026-10-02: Liliane's window closed at 19:14 with no card because his last message was from the day before).
export function windowInfo(msgs, now = Date.now()) {
  const lastLead = [...msgs].reverse().find((m) => m.who === 'LEAD');
  const lastAli = [...msgs].reverse().find((m) => m.who !== 'LEAD' && !m.tpl);
  const closeAt = lastLead ? Date.parse(lastLead.at) + 24 * 3600e3 : null;
  const open = !!closeAt && closeAt > now;
  const aliAfterLead = !!lastAli && !!lastLead && Date.parse(lastAli.at) > Date.parse(lastLead.at);
  const closingSoon = open && closeAt - now <= CLOSING_H * 3600e3 && aliAfterLead
    && now - Date.parse(lastAli.at) >= CLOSING_GAP_H * 3600e3;
  const aliToday = !!lastAli && madrid(new Date(lastAli.at)).slice(0, 10) === madrid(new Date(now)).slice(0, 10);
  return { open, closeAt, lastLead, lastAli, closingSoon, aliToday };
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
    // The Hub moves a lead to OR by itself 48 h after the last TBC template when there is no reply (Mateo, 2026-10-01):
    // the empty gap between is normal, no card. Only a lead still TBC with nothing planned 72 h to 6 days after its last
    // template is a real anomaly worth a card (the automatic move did not happen).
    else if (r.status === 'TBC' && !r.next_tpl && r.last_reason_at && now - Date.parse(r.last_reason_at) >= 3 * 864e5 && now - Date.parse(r.last_reason_at) < 6 * 864e5) reason = 'finished';
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
// A « wait » card whose time has come is judged again (Ali, 2026-10-02: Liliane's « wait until 13:14 » was still on
// screen at 17:39 with no follow-up). The new card never keeps a time already past, so this happens once per card.
function needing(cands, now = Date.now()) {
  const d = today();
  return cands.filter((c) => {
    const items = planItemsFor(c.wa_id, d);
    const sig = cardSig(c);
    const open = items.find((i) => i.state === 'open');
    if (open && open.hub_sig === 'manual') return false; // planned by Ali or a chat (suggest.mjs --at): not re-judged while open
    if (open && open.kind === 'wait' && open.when_at && Date.parse(open.when_at) <= now && c.reason !== 'closing') { c.prior = c.reason; c.reason = 'overdue'; c.overdueAt = open.when_at; return true; }
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
    `Pourquoi ce lead est dans la liste : ${{ paused: 'automatisation en pause → relance humaine à décider', closing: `la fenêtre 24h se ferme à ${c.win?.closeAt ? fmtHM(new Date(c.win.closeAt).toISOString()) : '?'} et le lead n’a pas répondu au dernier message manuel d’Ali (${c.win?.aliToday ? 'envoyé aujourd’hui → seconde relance basse pression' : 'envoyé avant aujourd’hui, aucune relance aujourd’hui → relance courte et directe'}) avant la fermeture (règle « fenêtre qui se ferme »)`,
      overdue: `la carte « wait » prévoyait un geste à ${c.overdueAt ? fmtHM(c.overdueAt) : '?'}, l’heure est passée et le lead n’a pas répondu → décide maintenant : si la fenêtre est ouverte et qu’Ali n’a pas encore relancé aujourd’hui, followup court avec \`when\` dans les 30 min ; sinon resume, fix ou wait avec une heure à venir`, due: 'template dans les 24 h', stale: 'prochain template dans le passé', finished: 'séquence terminée sans réponse', sent: 'ALI VIENT D’ÉCRIRE À LA MAIN (dernier message du fil) → dire ce que le Hub doit faire maintenant (règle « après un message manuel ») : wait jusqu’à quand, pause ou template à décocher s’il contredit ce message, resume, fix (statut), ou followup seulement si une règle l’autorise' }[c.reason]}${c.prior ? ` (sinon : ${c.prior})` : ''}`,
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
  let whenIso = madridIso(it.when) || (kind === 'pause' && c.next_at ? c.next_at : null);
  if (kind === 'wait' && whenIso && Date.parse(whenIso) <= Date.now() + 5 * 60e3) whenIso = null; // a time already past would re-judge every 5 min
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
  if (bubbles.length && laterPending(c.wa_id)) log(`${name || c.wa_id}: step 2 of a two-step draft still to send, the card keeps its bubbles but does not replace it`);
  else if (bubbles.length) { // the draft becomes a normal suggestion in the thread: editable, sendable, learned from
    // Shown in the thread 15 min before its time (the reminder push comes 10 min before), not all day (Ali, 2026-10-01).
    const showAt = whenIso && Date.parse(whenIso) - 15 * 60e3 > Date.now() ? new Date(Date.parse(whenIso) - 15 * 60e3).toISOString() : null;
    suggestionId = insertSuggestion(c.wa_id, [{ bubbles, later: [], why: String(it.why || '') }], null, 'plan', { instruction: `Today’s plan: ${String(it.title || '').slice(0, 80)}`, kind: 'draft', moves: [], showAt });
    markSuggestionPushed(suggestionId);
  }
  return insertPlanItem({ wa_id: c.wa_id, name, day: d, kind, when_at: whenIso, title: String(it.title || '').trim().slice(0, 140), why: String(it.why || '').trim().slice(0, 600), action: actionBits.filter(Boolean).join(' · ').slice(0, 400),
    hub_status: c.status, hub_next: c.next_tpl, hub_next_at: c.next_at, hub_paused: c.paused, hub_sig: cardSig(c), bubbles: bubbles.length ? bubbles : null, template: String(it.template || '').trim() || null, suggestion_id: suggestionId, pause_scope: pauseScope, skip_templates: skip.length ? skip : null, keep_templates: keep.length ? keep : null, pushed });
}

let running = false;
// Ali just wrote to this lead by hand: judge the lead again a few minutes later (the lead may answer in between: then
// the reply flow takes over and this judgement is skipped). Debounced per lead, so a 3-bubble send is one judgement.
const sentTimers = new Map();
export function afterAliMessage(waId, attempt = 0) {
  if (!hubReady() || !waId || waId === TEST_NUMBER) return;
  clearTimeout(sentTimers.get(waId));
  sentTimers.set(waId, setTimeout(async () => {
    sentTimers.delete(waId);
    const msgs = threadMessages(waId);
    const win = windowInfo(msgs);
    if (win.lastLead && win.lastAli && Date.parse(win.lastLead.at) > Date.parse(win.lastAli.at)) { log(`${waId}: the lead answered, no after-send judgement`); return; }
    const r = await plan({ only: [waId], reason: 'sent', sent: true }).catch((e) => { log('after-send error:', e.message); return 'error'; });
    if (r === null && attempt < 5) afterAliMessage(waId, attempt + 1); // another judgement was running: try again in a few minutes
  }, attempt ? 60e3 : SENT_DELAY_MS));
}

// scope: 'all' (morning) or 'due' (state changed / template within DUE_H). sent: judge the lead(s) in `only` because
// Ali just wrote by hand, even if nothing else makes them a candidate (reason 'sent', the prompt reads it).
export async function plan({ scope = 'due', reason = 'auto', dry = false, only = null, sent = false } = {}) {
  if (running || !hubReady()) return null;
  running = true; status.state = 'running'; status.at = new Date().toISOString(); status.error = null;
  try {
    expirePlanItems(today());
    let cands = only ? candidates().filter((c) => only.includes(c.wa_id)) : needing(candidates()); // only = re-judge these leads now, replacing their cards
    if (only && sent) {
      cands = cands.map((c) => ({ ...c, reason: 'sent', prior: c.reason }));
      for (const w of only) if (!cands.some((c) => c.wa_id === w)) {
        const row = hubLeadRows().find((x) => x.wa_id === w);
        if (!row) { log(`${w}: not in the Sales Hub mirror, no after-send judgement`); continue; }
        const t = getThread(w); const msgs = t ? threadMessages(w) : [];
        cands.push({ ...row, reason: 'sent', prior: null, thread: t, msgs, win: windowInfo(msgs) });
      }
    }
    if (scope === 'due' && !only) { const lim = new Date(Date.now() + DUE_H * 3600e3).toISOString(); cands = cands.filter((c) => c.reason === 'paused' || c.reason === 'closing' || c.reason === 'overdue' || (c.next_at && c.next_at <= lim) || c.reason === 'finished' || c.reason === 'stale'); }
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
