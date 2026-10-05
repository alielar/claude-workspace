// CPF question to every offer-rejected (OR) lead, one at a time on their own timeline (Ali + Andrin, 2026-10-05).
// Each OR lead is somewhere in the Sales Hub value drip. For each one we take the day its last template went out and
// the day its next one is due, and put the CPF template on a day in between, so it never lands on a day the Hub
// sends something else to that lead.
//
//   node --env-file=.env cpf-campaign.mjs plan [--from YYYY-MM-DD]   read-only: build data/cpf-plan.json and print it
//   node --env-file=.env cpf-campaign.mjs send --go                  send what is due now (not built yet: needs Ali's go)
//
// Reads the Hub (GET only, 30 calls/min). Never sends in plan mode.

import fs from 'node:fs';
import { hubLeads, hubUpcoming } from './hub.mjs';

const TZ = 'Europe/Paris';
const SEND_TIME = process.env.CPF_SEND_TIME || '12:30';   // Paris time
const PLAN_FILE = new URL('./data/cpf-plan.json', import.meta.url);
const DNC_FILE = new URL('../Wati outreach/data/do-not-contact.csv', import.meta.url);

const day = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function doNotContact() {
  try { return new Set(fs.readFileSync(DNC_FILE, 'utf8').split('\n').slice(1).map((l) => l.split(',')[2]?.replace(/\D/g, '')).filter(Boolean)); }
  catch { return new Set(); }
}

// A free day for one lead (Ali, 2026-10-05): no Hub template that day, nor the day before or after (a quiet day,
// not squeezed next to another message), never a Sunday, at most PER_DAY leads a day. Leads are placed by meeting
// date, oldest first, each on the first day that is free for that lead and still has room.
const PER_DAY = Number(process.env.CPF_PER_DAY || 10);
const HORIZON = 30;
function freeDays(busy, from) {
  const near = new Set([...busy].flatMap((d) => [addDays(d, -1), d, addDays(d, 1)]));
  const out = [];
  for (let i = 0; i < HORIZON; i++) {
    const d = addDays(from, i);
    if (!near.has(d) && new Date(d + 'T12:00:00Z').getUTCDay() !== 0) out.push(d);
  }
  return out;
}

async function plan(from) {
  const res = await hubLeads();
  const rows = (Array.isArray(res) ? res : res.leads || res.data || []).filter((l) => l.status === 'OR');
  const dnc = doNotContact();
  const out = [];
  for (const l of rows) {
    const phone = String(l.phone).replace(/\D/g, '');
    const base = { leadId: l.leadId, name: l.name, phone, meetingDate: l.meetingDate };
    if (l.paused) { out.push({ ...base, date: null, why: 'paused in the Hub' }); continue; }
    if (dnc.has(phone)) { out.push({ ...base, date: null, why: 'do-not-contact list' }); continue; }
    let up = [];
    try { up = (await hubUpcoming(l.leadId)).upcoming || []; }
    catch (e) { if (e.retryAfter) { await sleep(e.retryAfter * 1000); up = (await hubUpcoming(l.leadId)).upcoming || []; } else throw e; }
    await sleep(2600); // stay under 30 calls/min, leaving room for hub-sync
    const busy = new Set(up.map((u) => day(u.scheduledAt)));
    const lastSent = l.lastReason?.at ? day(l.lastReason.at) : null;
    if (lastSent) busy.add(lastSent);
    out.push({ ...base, lastSent, hubDays: [...busy].sort(), free: freeDays(busy, from) });
  }
  const load = {};
  out.sort((a, b) => String(a.meetingDate || '').localeCompare(String(b.meetingDate || '')));
  for (const r of out) {
    if (!r.free) continue;
    const d = r.free.find((x) => (load[x] || 0) < PER_DAY);
    if (d) { load[d] = (load[d] || 0) + 1; Object.assign(r, { date: d, time: SEND_TIME, why: `Hub sends on ${r.hubDays.join(', ') || 'no day'}`, status: 'planned' }); }
    else Object.assign(r, { date: null, why: `no free day in ${HORIZON} days`, status: 'skipped' });
    delete r.free;
  }
  out.sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  fs.writeFileSync(PLAN_FILE, JSON.stringify({ builtAt: new Date().toISOString(), from, time: SEND_TIME, leads: out }, null, 2));
  return out;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'plan') {
  const i = args.indexOf('--from');
  const from = i >= 0 ? args[i + 1] : addDays(day(new Date().toISOString()), 1);
  const out = await plan(from);
  const perDay = {};
  for (const r of out) if (r.date) perDay[r.date] = (perDay[r.date] || 0) + 1;
  console.log(`OR leads: ${out.length} · planned: ${out.filter((r) => r.date).length} · skipped: ${out.filter((r) => !r.date).length}`);
  console.log('per day:', perDay);
  for (const r of out) console.log(`${r.date || '—'.padEnd(10)}  ${r.name.padEnd(14).slice(0, 14)} +${r.phone}  meeting ${r.meetingDate || '?'}  (${r.why})`);
} else {
  console.log('Usage: cpf-campaign.mjs plan [--from YYYY-MM-DD]   (sending is not built until Ali gives the go)');
}
