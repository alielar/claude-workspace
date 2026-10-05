// CPF question to every offer-rejected (OR) lead, one at a time on their own timeline (Ali + Andrin, 2026-10-05).
// Each OR lead is somewhere in the Sales Hub value drip. For each one we take the day its last template went out and
// the day its next one is due, and put the CPF template on a day in between, so it never lands on a day the Hub
// sends something else to that lead.
//
//   node --env-file=.env cpf-campaign.mjs plan [--from YYYY-MM-DD]   read-only: build data/cpf-plan.json and print it
//   node --env-file=.env cpf-campaign.mjs send [--dry]               send what is due today (Ali's go: 2026-10-05)
//   node --env-file=.env cpf-campaign.mjs report [--push]            yes / no / to read / no answer, per lead
//   node --env-file=.env cpf-campaign.mjs tick                       what launchd runs: send before 20:00, report + push after
//
// Template `cpf_question` (UTILITY, one variable `name`). Before each send the lead is checked again: still OR, not
// paused, no Hub template today or tomorrow, no live conversation in the last 48 h, never sent before. If one of those
// fails the lead moves to its next quiet day (last day END), or is dropped with the reason. Log: data/cpf-sent.jsonl.

import fs from 'node:fs';
import { hubLeads, hubLead, hubUpcoming } from './hub.mjs';
import { getThread, getContact, sendTemplate } from './wati.mjs';

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

const TEMPLATE = 'cpf_question';
const END = process.env.CPF_END || '2026-10-17';           // a lead not sent by then is dropped, not pushed later
const LAST_SEND_HOUR = 20;                                 // never send in the evening
const SENT_LOG = new URL('./data/cpf-sent.jsonl', import.meta.url);
const LOCK = new URL('./data/cpf-send.lock', import.meta.url);
const REPORT_FILE = new URL('./data/cpf-report.md', import.meta.url);

const nowParis = () => { if (process.env.CPF_TODAY) return { date: process.env.CPF_TODAY, hm: '12:30', hour: 12 }; // dry-run tests only
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, hour: Number(p.hour) }; };
const readPlan = () => JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
const savePlan = (p) => fs.writeFileSync(PLAN_FILE, JSON.stringify(p, null, 2));
const logSent = (row) => fs.appendFileSync(SENT_LOG, JSON.stringify(row) + '\n');
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';
// Swapped Hub names and numbers never to send to, checked by hand (2026-10-05). Kept in data/ (git-ignored): personal data.
const OVERRIDES = (() => { try { return JSON.parse(fs.readFileSync(new URL('./data/cpf-overrides.json', import.meta.url), 'utf8')); } catch { return {}; } })();
const NAME_FIX = OVERRIDES.names || {};
const NEVER = new Set(OVERRIDES.never || []);

async function hubCall(fn) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fn(); await sleep(2600); return r; }
    catch (e) { if (i === 2) throw e; await sleep(e.retryAfter ? e.retryAfter * 1000 : 10000); } // 429 or a network drop
  }
}

// Move a lead to its next quiet day after `today`, with room left that day. null when nothing before END.
function reschedule(plan, r, busy, today) {
  const load = {};
  for (const x of plan.leads) if (x.status === 'planned' && x !== r) load[x.date] = (load[x.date] || 0) + 1;
  return freeDays(busy, addDays(today, 1)).find((d) => d < END && (load[d] || 0) < PER_DAY) || null;
}

async function send({ dry }) {
  const { date: today, hour } = nowParis();
  if (hour >= LAST_SEND_HOUR) return console.log(`${today}: after ${LAST_SEND_HOUR}:00, nothing sent`);
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 30 * 60e3) return console.log('another send is running (lock), stop');
  fs.writeFileSync(LOCK, String(process.pid));
  try {
    const plan = readPlan();
    const due = plan.leads.filter((r) => r.status === 'planned' && r.date <= today);
    console.log(`${today}: ${due.length} due${dry ? ' (dry run, nothing sent)' : ''}`);
    for (const r of due) {
      try { await sendOne(plan, r, today, dry); }
      catch (e) { console.log(`retry later  ${r.name} +${r.phone}: ${String(e.cause?.code || e.message).slice(0, 120)}`); } // stays planned, next tick tries again
    }
    if (!dry) savePlan(plan);
  } finally { fs.rmSync(LOCK, { force: true }); }
}

async function sendOne(plan, r, today, dry) {
  const tag = `${r.name} +${r.phone}`;
  if (NEVER.has(r.phone)) { Object.assign(r, { status: 'dropped', why: 'test contact' }); console.log(`drop  ${tag}: test contact`); return; }
  const hub = await hubCall(() => hubLead('+' + r.phone));
  const h = (Array.isArray(hub) ? hub : hub.leads || hub.data || [hub])[0];
  if (!h || h.status !== 'OR') { Object.assign(r, { status: 'dropped', why: `no longer OR in the Hub (${h?.status || 'not found'})` }); console.log(`drop  ${tag}: ${r.why}`); return; }
  if (h.paused) { Object.assign(r, { status: 'dropped', why: 'paused in the Hub' }); console.log(`drop  ${tag}: paused`); return; }
  const up = (await hubCall(() => hubUpcoming(h.leadId))).upcoming || [];
  const busy = new Set(up.map((u) => day(u.scheduledAt)));
  if (h.lastReason?.at) busy.add(day(h.lastReason.at));
  const thread = await getThread(r.phone, 3);
  if (thread.some((m) => m.tplName === TEMPLATE)) { Object.assign(r, { status: 'sent', why: 'already in the thread' }); console.log(`skip  ${tag}: already received it`); return; }
  const lastHuman = [...thread].reverse().find((m) => !m.tpl);
  const live = lastHuman && Date.now() - new Date(lastHuman.at) < 48 * 3600e3;
  const clash = busy.has(today) || busy.has(addDays(today, 1));
  if (live || clash) {
    const why = live ? 'live conversation in the last 48 h' : 'Hub template today or tomorrow';
    const d = reschedule(plan, r, busy, today);
    if (d) { Object.assign(r, { date: d, why: `moved: ${why}` }); console.log(`move  ${tag} → ${d}: ${why}`); }
    else { Object.assign(r, { status: 'dropped', why: `${why}, no quiet day before ${END}` }); console.log(`drop  ${tag}: ${r.why}`); }
    return;
  }
  let name = NAME_FIX[r.phone] || firstName(h.name) || firstName((await getContact(r.phone))?.name);
  if (!name || /\d/.test(name)) { Object.assign(r, { status: 'dropped', why: 'no usable first name' }); console.log(`drop  ${tag}: no first name`); return; }
  name = name[0].toUpperCase() + name.slice(1);
  if (dry) { console.log(`would send  ${tag} (Bonjour ${name}, …)`); return; }
  try {
    await sendTemplate(r.phone, TEMPLATE, { name });
    Object.assign(r, { status: 'sent', sentAt: new Date().toISOString(), sentName: name });
    logSent({ at: r.sentAt, phone: r.phone, name, leadId: r.leadId });
    console.log(`sent  ${tag} (Bonjour ${name})`);
  } catch (e) {
    r.errors = (r.errors || 0) + 1; // a network drop stays planned for the next tick; the third failure stops it
    Object.assign(r, { why: e.message.slice(0, 200), ...(r.errors >= 3 ? { status: 'error' } : {}) });
    console.log(`ERROR ${tag} (try ${r.errors}): ${r.why}`);
  }
  savePlan(plan);
  await sleep(5000 + Math.random() * 5000);
}

// Reading the answers: the first message the lead wrote after the template. Words decide yes / no; anything else is
// left for Ali to read (no paid model on this).
const YES = /\b(oui|ouais|yes|ok|okay|d'accord|daccord|bien s[uû]r|volontiers|pourquoi pas|carr[ée]ment|avec plaisir|int[ée]ress[ée]e?)\b/i;
const NO = /\b(non|no|nan|pas int[ée]ress|pas besoin|pas pour le moment|pas maintenant|pas le cpf|pas de cpf|n'ai pas de cpf)\b/i;
function classify(text) {
  const t = String(text || '');
  const no = NO.test(t), yes = YES.test(t) && !/pas int[ée]ress/i.test(t);
  return yes && !no ? 'yes' : no && !yes ? 'no' : 'read';
}

async function report({ push }) {
  const plan = readPlan();
  const sent = plan.leads.filter((r) => r.status === 'sent' && r.sentAt);
  const rows = [];
  for (const r of sent) {
    const thread = await getThread(r.phone, 2);
    const reply = thread.find((m) => m.who === 'LEAD' && m.at > r.sentAt);
    rows.push({ ...r, answer: reply ? classify(reply.text) : 'none', reply: reply?.text || '' });
    await sleep(300);
  }
  const n = (k) => rows.filter((x) => x.answer === k).length;
  const counts = { yes: n('yes'), no: n('no'), read: n('read'), none: n('none') };
  const left = plan.leads.filter((r) => r.status === 'planned').length;
  const dropped = plan.leads.filter((r) => r.status === 'dropped' || r.status === 'error');
  const label = { yes: 'Oui', no: 'Non', read: 'À lire', none: 'Pas de réponse' };
  const md = [
    `# CPF question — answers (${nowParis().date} ${nowParis().hm})`, '',
    `| Sent | Yes | No | To read | No answer | Still planned | Not sent |`, `|---|---|---|---|---|---|---|`,
    `| ${rows.length} | ${counts.yes} | ${counts.no} | ${counts.read} | ${counts.none} | ${left} | ${dropped.length} |`, '',
    ...['yes', 'read', 'no', 'none'].flatMap((k) => { const g = rows.filter((x) => x.answer === k); return g.length ? [`## ${label[k]} (${g.length})`, ...g.map((x) => `- ${x.name} +${x.phone} · sent ${day(x.sentAt)}${x.reply ? ` · « ${x.reply.replace(/\s+/g, ' ').slice(0, 160)} »` : ''}`), ''] : []; }),
    ...(dropped.length ? [`## Not sent (${dropped.length})`, ...dropped.map((x) => `- ${x.name} +${x.phone} · ${x.why}`), ''] : []),
  ].join('\n');
  fs.writeFileSync(REPORT_FILE, md);
  console.log(md);
  if (push && rows.length) {
    const { pushAll } = await import('./push.mjs');
    await pushAll({ title: 'CPF question', body: `${rows.length} sent. Yes ${counts.yes}, no ${counts.no}, to read ${counts.read}, no answer ${counts.none}. ${left} still planned.`, url: '/' });
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'send') await send({ dry: args.includes('--dry') });
else if (cmd === 'report') await report({ push: args.includes('--push') });
else if (cmd === 'tick') {
  const { date, hour } = nowParis();
  if (date > addDays(END, 7)) console.log('CPF campaign over, nothing to do');
  else if (hour >= LAST_SEND_HOUR) await report({ push: true });
  else await send({ dry: false });
} else if (cmd === 'plan') {
  const i = args.indexOf('--from');
  const from = i >= 0 ? args[i + 1] : addDays(day(new Date().toISOString()), 1);
  const out = await plan(from);
  const perDay = {};
  for (const r of out) if (r.date) perDay[r.date] = (perDay[r.date] || 0) + 1;
  console.log(`OR leads: ${out.length} · planned: ${out.filter((r) => r.date).length} · skipped: ${out.filter((r) => !r.date).length}`);
  console.log('per day:', perDay);
  for (const r of out) console.log(`${r.date || '—'.padEnd(10)}  ${r.name.padEnd(14).slice(0, 14)} +${r.phone}  meeting ${r.meetingDate || '?'}  (${r.why})`);
} else {
  console.log('Usage: cpf-campaign.mjs plan [--from YYYY-MM-DD] | send [--dry] | report [--push] | tick');
}
