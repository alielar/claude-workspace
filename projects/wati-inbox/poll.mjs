// Asks Wati every POLL_MS for contacts that moved, reads their thread on the
// France Sales number, and pushes a notification for every new lead message.
// First run only records what exists (no notification storm).

import { recentContacts, getThread, getContact, FR } from './wati.mjs';
import { getState, setState, getThread as storedThread, saveThread, upsertMessages, activeThreads, sentTexts, saveContact, unpushedSuggestions, markSuggestionPushed, threadMessages, suggestionVisible } from './db.mjs';
import { pushAll } from './push.mjs';
import { startSuggesting, scheduleAutoDraft, AUTO_DELAY_MS } from './suggest-engine.mjs';
import { startTbcWatch, watch as tbcWatch } from './tbc-watch.mjs';
import { closeTbcAlerts, closePlanItems, openPlanItems, setPlanState } from './db.mjs';
import { afterAliMessage, today } from './plan-engine.mjs';
import { laterPending, hubLeadRows } from './db.mjs';

export const POLL_MS = 45_000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Reads one thread from Wati, stores it, and returns what changed.
// Known threads only need the newest page; a new lead gets the full history.
export async function refreshThread(waId, name, { notify = true } = {}) {
  const before = storedThread(waId);
  const msgs = await getThread(waId, before ? 1 : 6);
  if (!msgs.length) return null;
  upsertMessages(waId, msgs);
  const lastIn = [...msgs].reverse().find((m) => m.who === 'LEAD');
  const lastOut = [...msgs].reverse().find((m) => m.who === 'US');
  // A lead is waiting until a HUMAN answers. Something on the Wati side replies
  // automatically through the API token ("Salut X, je vois que vous êtes là…");
  // those API-token messages only count when this app sent them.
  const ours = sentTexts(waId);
  const human = (m) => m.who === 'US' && (!/^API Token/i.test(m.op) || ours.has(m.text));
  const lastHuman = [...msgs].reverse().find(human);
  // Waiting for a human reply — but a lead message older than 48 h is history (window
  // closed, template only), not something to answer now: old threads seed as handled.
  // A tap on « Traité » covers every lead message up to that moment (handled_at): only a newer one reopens the thread.
  const pending = !!lastIn && (!lastHuman || lastHuman.at < lastIn.at) && Date.now() - new Date(lastIn.at).getTime() < 48 * 3600e3 && !(before?.handled_at && before.handled_at >= lastIn.at);
  const last = msgs[msgs.length - 1];
  saveThread({
    wa_id: waId, name: name || before?.name || null,
    last_inbound_at: lastIn?.at ?? before?.last_inbound_at ?? null,
    last_outbound_at: lastOut?.at ?? before?.last_outbound_at ?? null,
    last_text: last.text.slice(0, 200), pending,
  });
  // CRM card (stage, meeting, country) — fetched for new threads, refreshed every 6 h.
  if (!before?.contact_at || Date.now() - new Date(before.contact_at).getTime() > 6 * 3600e3) {
    try { const c = await getContact(waId); if (c) saveContact(waId, c); } catch {}
  }
  const isNew = !!lastIn && (!before || (before.last_inbound_at || '') < lastIn.at);
  // The lead answered: the Sales Hub warning and today's cards are over. Cards planned for a later day stay (Carmelo, 2026-10-07:
  // « Demain sans faute » at 18:53 closed the next day's deadline check-ins, and the morning plan, seeing them 'replied', made none).
  if (isNew && before) { closeTbcAlerts(waId, 'replied'); for (const i of openPlanItems(waId)) if (i.day <= today()) setPlanState(i.id, 'replied'); }
  // Ali answered straight from Wati after a follow-up card was written: that card is done.
  if (lastHuman) for (const i of openPlanItems(waId)) if (i.kind === 'followup' && lastHuman.at > i.at && (!i.when_at || Date.parse(i.when_at) <= Date.parse(lastHuman.at) + 120 * 60e3)) setPlanState(i.id, 'done');
  // The welcome message went out: the lead bought, the day plan's cards for them are over (Ali, 2026-10-04).
  const welcome = msgs.find((m) => m.who !== 'LEAD' && (m.tplName === 'sales_text_1_fr' || /^Bienvenue chez easypeasy/.test(m.text || '')) && (!before?.last_outbound_at || m.at > before.last_outbound_at));
  if (welcome && before) for (const i of openPlanItems(waId)) setPlanState(i.id, 'done', 'registered: welcome message sent');
  // A new manual message from Ali (from Wati itself, or from the app: the debounce makes it one judgement) → what next.
  if (lastHuman && before && (before.last_outbound_at || '') < lastHuman.at && !lastHuman.tpl) afterAliMessage(waId);
  if (isNew && notify && before && !before.muted) {
    log('new message from', name || waId);
    // One notification per lead message, and it arrives when the draft is ready (Ali, 2026-09-30): the
    // push carries the lead's message and the reply is already on screen when he opens it. The message
    // itself is pushed only when no draft will come (window closed, cap reached) or when it is late.
    // Step 2 of an administration two-step still to send: the lead's "merci" gets no draft, the step 2 stays on screen
    // and the push says so (Ali, 2026-10-01). He can still ask for a draft by hand if the lead asked something real.
    if (laterPending(waId)) await pushAll({ title: `${name || waId} · step 2 still to send`, body: lastIn.text.slice(0, 180), tag: `wati-${waId}`, url: `/t/${waId}` });
    else if (pending && scheduleAutoDraft(waId)) deferNotification(waId, name);
    else await pushAll({ title: name || waId, body: waitingText(waId) || lastIn.text.slice(0, 180), tag: `wati-${waId}`, url: `/t/${waId}` });
  }
  return { isNew, pending };
}

// What the lead wrote since our last human reply — the body of every notification.
export function waitingText(waId) {
  const msgs = threadMessages(waId);
  let i = msgs.length;
  while (i > 0 && !(msgs[i - 1].who === 'US' && !msgs[i - 1].tpl)) i--; // automatic templates do not count as a reply
  const since = msgs.slice(i).filter((m) => m.who === 'LEAD' && m.text);
  const lead = since.length ? since : msgs.filter((m) => m.who === 'LEAD' && m.text).slice(-1);
  return lead.map((m) => m.text.trim()).join(' · ').slice(0, 300);
}

// Lead messages whose notification waits for the draft: pushed as plain messages if no draft came in time.
const deferred = new Map(); // wa_id → { name, timer }
const LATE_MS = AUTO_DELAY_MS + 4 * 60_000; // quiet time + the draft's own timeout
function deferNotification(waId, name) {
  const prev = deferred.get(waId);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(async () => {
    if (!deferred.has(waId)) return;
    deferred.delete(waId);
    const t = storedThread(waId);
    if (!t?.pending) return; // answered or handled meanwhile
    try { await pushAll({ title: t.name || name || waId, body: waitingText(waId) || t.last_text || '', tag: `wati-${waId}`, url: `/t/${waId}` }); log('late draft: plain notification for', t.name || waId); }
    catch (e) { log('push error:', e.message); }
  }, LATE_MS);
  deferred.set(waId, { name, timer });
}

const HOT_H = 24, WARM_DAYS = 14, WARM_EVERY_MS = 5 * 60_000;
const lastCheck = new Map(); // wa_id → time of the last read

// Wati's contact timestamp only moves when a chat is opened, not on each
// message, so contacts page 1 only reveals NEW leads. Known threads are read
// directly: every tick while active in the last 24h, every 5 min up to 14 days,
// and (since 2026-10-01, Hajar El Rhomri's "Bonsoir" after 15 days of silence went unseen):
//   - every 2 min when the Sales Hub moved the lead in the last 24 h (a template just left, a reply may follow),
//   - every 30 min for every other known thread, a few per tick, oldest check first — so a lead who comes back
//     after weeks is seen within half an hour at worst, instead of never.
const HUBWARM_H = 24, HUBWARM_EVERY_MS = 2 * 60_000, COLD_EVERY_MS = 30 * 60_000, COLD_PER_TICK = 6;
async function tick() {
  const first = !getState('last_poll');
  const contacts = await recentContacts(first ? 3 : 1);
  const now = Date.now();
  const due = new Map();
  for (const c of contacts) if (FR.test(c.waId) && !storedThread(c.waId)) due.set(c.waId, c.name);
  const lastAt = (t) => Math.max(new Date(t.last_inbound_at || 0).getTime(), new Date(t.last_outbound_at || 0).getTime());
  for (const t of activeThreads(WARM_DAYS)) {
    const hot = now - lastAt(t) < HOT_H * 3600e3;
    if (hot || now - (lastCheck.get(t.wa_id) || 0) > WARM_EVERY_MS) due.set(t.wa_id, t.name);
  }
  for (const r of hubLeadRows()) {
    const ev = Math.max(Date.parse(r.last_reason_at || 0) || 0, (Date.parse(r.next_at || 0) || 0) <= now ? Date.parse(r.next_at || 0) || 0 : 0);
    const t = now - ev < HUBWARM_H * 3600e3 && !due.has(r.wa_id) ? storedThread(r.wa_id) : null;
    if (t && now - (lastCheck.get(t.wa_id) || 0) > HUBWARM_EVERY_MS) due.set(t.wa_id, t.name || r.name);
  }
  const cold = activeThreads(3650).filter((t) => !due.has(t.wa_id) && now - lastAt(t) >= WARM_DAYS * 864e5 && now - (lastCheck.get(t.wa_id) || 0) > COLD_EVERY_MS)
    .sort((a, b) => (lastCheck.get(a.wa_id) || 0) - (lastCheck.get(b.wa_id) || 0)).slice(0, COLD_PER_TICK);
  for (const t of cold) due.set(t.wa_id, t.name);
  for (const [waId, name] of due) {
    try { const r = await refreshThread(waId, name, { notify: !first }); lastCheck.set(waId, Date.now()); if (r?.isNew && cold.some((t) => t.wa_id === waId)) log('cold thread came back:', name || waId); }
    catch (e) { log('thread', waId, e.message); }
  }
  setState('last_poll', new Date().toISOString());
  if (first) log('first poll: recorded', due.size, 'French threads, no notifications sent');
}

async function pushSuggestions() {
  for (const s of unpushedSuggestions()) {
    const kind = s.kind || 'draft';
    const waiting = deferred.get(s.wa_id);
    if (waiting) { clearTimeout(waiting.timer); deferred.delete(s.wa_id); }
    // Ali already answered (from the app or straight from Wati) while Claude was drafting: nothing to announce.
    if (!suggestionVisible(storedThread(s.wa_id), s)) { markSuggestionPushed(s.id); continue; }
    // The notification is the lead's message; the title says what is waiting on screen.
    const who = s.name || s.wa_id;
    const title = kind === 'needs' ? `${who} · Claude has a question` : kind === 'skip' ? `${who} · no reply needed` : `${who} · reply ready`;
    const body = waitingText(s.wa_id) || (kind === 'needs' ? (s.needs || '').slice(0, 160) : '');
    await pushAll({ title, body, tag: `wati-${s.wa_id}`, url: `/t/${s.wa_id}` });
    markSuggestionPushed(s.id);
  }
}

export function startPolling() {
  startSuggesting();
  startTbcWatch();
  const loop = async () => {
    try { await tick(); } catch (e) { log('poll error:', e.message); }
    tbcWatch().catch((e) => log('tbc error:', e.message)); // right after a read, so a reply closes its alert within a minute
    try { await pushSuggestions(); } catch (e) { log('suggestion push error:', e.message); }
    setTimeout(loop, POLL_MS);
  };
  loop();
  // Suggestions written by Claude should reach the phone faster than the poll rhythm.
  setInterval(() => pushSuggestions().catch(() => {}), 10_000);
}
