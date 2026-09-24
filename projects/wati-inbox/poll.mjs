// Asks Wati every POLL_MS for contacts that moved, reads their thread on the
// France Sales number, and pushes a notification for every new lead message.
// First run only records what exists (no notification storm).

import { recentContacts, getThread, FR } from './wati.mjs';
import { getState, setState, getThread as storedThread, saveThread, upsertMessages, activeThreads, sentTexts, unpushedSuggestions, markSuggestionPushed } from './db.mjs';
import { pushAll } from './push.mjs';

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
  const pending = !!lastIn && (!lastHuman || lastHuman.at < lastIn.at);
  const last = msgs[msgs.length - 1];
  saveThread({
    wa_id: waId, name: name || before?.name || null,
    last_inbound_at: lastIn?.at ?? before?.last_inbound_at ?? null,
    last_outbound_at: lastOut?.at ?? before?.last_outbound_at ?? null,
    last_text: last.text.slice(0, 200), pending,
  });
  const isNew = !!lastIn && (!before || (before.last_inbound_at || '') < lastIn.at);
  if (isNew && notify && before) {
    await pushAll({ title: name || waId, body: lastIn.text.slice(0, 180), tag: `wati-${waId}`, url: `/t/${waId}` });
    log('new message from', name || waId);
  }
  return { isNew, pending };
}

const HOT_H = 24, WARM_DAYS = 14, WARM_EVERY_MS = 5 * 60_000;
const lastCheck = new Map(); // wa_id → time of the last read

// Wati's contact timestamp only moves when a chat is opened, not on each
// message, so contacts page 1 only reveals NEW leads. Known threads are read
// directly: every tick while active in the last 24h, every 5 min up to 14 days.
async function tick() {
  const first = !getState('last_poll');
  const contacts = await recentContacts(first ? 3 : 1);
  const now = Date.now();
  const due = new Map();
  for (const c of contacts) if (FR.test(c.waId) && !storedThread(c.waId)) due.set(c.waId, c.name);
  for (const t of activeThreads(WARM_DAYS)) {
    const lastAt = Math.max(new Date(t.last_inbound_at || 0).getTime(), new Date(t.last_outbound_at || 0).getTime());
    const hot = now - lastAt < HOT_H * 3600e3;
    if (hot || now - (lastCheck.get(t.wa_id) || 0) > WARM_EVERY_MS) due.set(t.wa_id, t.name);
  }
  for (const [waId, name] of due) {
    try { await refreshThread(waId, name, { notify: !first }); lastCheck.set(waId, Date.now()); }
    catch (e) { log('thread', waId, e.message); }
  }
  setState('last_poll', new Date().toISOString());
  if (first) log('first poll: recorded', due.size, 'French threads, no notifications sent');
}

async function pushSuggestions() {
  for (const s of unpushedSuggestions()) {
    await pushAll({ title: `Suggestions prêtes · ${s.name || s.wa_id}`, body: 'Touchez pour choisir une réponse', tag: `sugg-${s.wa_id}`, url: `/t/${s.wa_id}` });
    markSuggestionPushed(s.id);
  }
}

export function startPolling() {
  const loop = async () => {
    try { await tick(); } catch (e) { log('poll error:', e.message); }
    try { await pushSuggestions(); } catch (e) { log('suggestion push error:', e.message); }
    setTimeout(loop, POLL_MS);
  };
  loop();
  // Suggestions written by Claude should reach the phone faster than the poll rhythm.
  setInterval(() => pushSuggestions().catch(() => {}), 10_000);
}
