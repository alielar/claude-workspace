// Mirrors the Sales Hub FR automations into SQLite (2026-10-01): /leads every minute, /templates every
// hour, well inside the Hub's limits (30 calls/min, 600/h). Everything else in the app reads the mirror,
// never the Hub directly, so one 502 or 429 never blocks a screen.
//
//   node --env-file=.env hub-sync.mjs     one sync now, prints what changed

import { hubReady, hubLeads, hubTemplates } from './hub.mjs';
import { saveHubLeads, saveHubTemplates, hubLeadRow, hubLeadRows, hubTemplate, getState, setState } from './db.mjs';

const LEADS_MS = Number(process.env.HUB_LEADS_MS || 60_000);
const TEMPLATES_MS = Number(process.env.HUB_TEMPLATES_MS || 3_600_000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'hub:', ...a);
const status = { ready: hubReady(), leadsAt: null, templatesAt: null, error: null, backoffUntil: 0, leads: 0 };
export const hubStatus = () => status;
const listeners = new Set(); // called with the list of wa_ids whose Hub state changed
export const onHubChange = (fn) => listeners.add(fn);

const sig = (r) => r ? `${r.status}|${r.paused}|${r.skip_next}|${r.next_tpl || ''}|${r.next_at || ''}|${r.phase || ''}` : '';
export const hubSig = (waId) => sig(hubLeadRow(waId));

export async function syncLeads() {
  if (!hubReady() || Date.now() < status.backoffUntil) return null;
  try {
    const r = await hubLeads();
    const rows = Array.isArray(r) ? r : r.leads || r.data || [];
    const before = new Map(hubLeadRows().map((x) => [x.wa_id, sig(x)]));
    const { saved, gone } = saveHubLeads(rows);
    const changed = hubLeadRows().filter((x) => before.get(x.wa_id) !== sig(x)).map((x) => x.wa_id);
    status.leadsAt = new Date().toISOString(); status.error = null; status.leads = saved;
    setState('hub_leads_at', status.leadsAt);
    if (changed.length && before.size) for (const fn of listeners) { try { fn(changed); } catch (e) { log('listener:', e.message); } }
    return { saved, gone, changed };
  } catch (e) {
    status.error = e.message;
    status.backoffUntil = Date.now() + (e.retryAfter ? e.retryAfter * 1000 : 2 * 60_000); // a 429 or a 502: wait before asking again
    log('leads:', e.message);
    return null;
  }
}

export async function syncTemplates() {
  if (!hubReady()) return null;
  try {
    const r = await hubTemplates();
    const steps = Array.isArray(r) ? r : r.templates || r.steps || r.data || [];
    saveHubTemplates(steps);
    status.templatesAt = new Date().toISOString();
    setState('hub_templates_at', status.templatesAt);
    return { templates: steps.length, watiAsOf: r.watiAsOf || null };
  } catch (e) { log('templates:', e.message); return null; }
}

// What one lead's next automatic step is, with the real text — for the thread screen and the prompts.
export function hubNextFor(waId) {
  const r = hubLeadRow(waId);
  if (!r) return null;
  const tpl = r.next_tpl ? hubTemplate(r.next_tpl) : null;
  return { status: r.status, paused: !!r.paused, skipNext: !!r.skip_next, phase: r.phase, meetingDate: r.meeting_date, lastReason: r.last_reason, lastReasonAt: r.last_reason_at,
    next: r.next_tpl ? { template: r.next_tpl, at: r.next_at, text: tpl?.text || null, stale: !!r.next_at && Date.parse(r.next_at) < Date.now() - 60 * 60e3 } : null,
    citf: r.citf ? JSON.parse(r.citf) : null, leadId: r.lead_id, updatedAt: r.updated_at };
}

export function startHubSync() {
  if (!hubReady()) { log('no SALES_HUB_TOKEN in .env — the Sales Hub mirror is off'); return; }
  syncTemplates().then(() => syncLeads()).catch(() => {});
  setInterval(() => syncLeads().catch(() => {}), LEADS_MS);
  setInterval(() => syncTemplates().catch(() => {}), TEMPLATES_MS);
  log(`mirror ready — leads every ${Math.round(LEADS_MS / 1000)} s, templates every ${Math.round(TEMPLATES_MS / 60000)} min`);
}

if (process.argv[1] && process.argv[1].endsWith('hub-sync.mjs')) {
  const t = await syncTemplates(); const l = await syncLeads();
  console.log('templates:', t, '\nleads:', l ? { saved: l.saved, gone: l.gone, changed: l.changed.length } : null);
  process.exit(0);
}
