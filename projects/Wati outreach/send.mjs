// Sends the campaign. Every send is written to logs/sent.jsonl, and anything
// already in that log is never sent again — so stopping and restarting is safe.
//
//   npm run send -- --test +34695064884 --track no_meeting
//   npm run send -- --dry-run
//   npm run send -- --limit 4
//   npm run send -- --limit 4 --track had_meeting
//   npm run send
//
// Options:
//   --stage <s>      campaign | followup1 | reengage | reengage2
//   --bucket <text>  reengage only: just one situation, e.g. "by hand"
//   --test <phone>   send one pair to this number only, ignoring the lead list
//   --name <name>    the name used by --test (default: Ali)
//   --track <t>      no_meeting | had_meeting
//   --limit <n>      only the first n people
//   --dry-run        print what would happen, send nothing
//   --gap <seconds>  wait between the 1st and 2nd message (default 10)
//   --channel <n>    send from a specific WhatsApp number, e.g. 33671283778
//                    (the telemarketing line). Omit to use the default channel.
//   --batch <n>      people per batch (default 10)
//   --every <min>    minutes from the start of one batch to the next (default 10)
//   --until <HH:MM>  start no new batch at or after this time (Europe/Madrid)

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { checkKeys, wati } from './wati.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
};
const flag = (name) => process.argv.includes(`--${name}`);

// Minimal quoted-CSV reader — the stalled list contains commas inside messages.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// A first name fit to drop into a template, or '' if there isn't one.
const PARTICLES = new Set(['el','al','de','da','du','di','le','la','ben','bin','ait','aït','van','von','der','den','dos','des','ould','abd','ba','mc','mac']);
function firstName(full) {
  for (const w of String(full || '').trim().split(/[\s_.-]+/)) {
    const c = w.replace(/[^\p{L}'’]/gu, '');
    if (c.length < 3) continue;
    if (PARTICLES.has(c.toLowerCase())) continue;
    if (/^(test|tbc|eeee+|moi|nuovo|null|undefined|whatsapp|lead)$/i.test(c)) continue;
    return c[0].toUpperCase() + c.slice(1);
  }
  return '';
}

const DRY = flag('dry-run');
const GAP = Number(arg('gap', 10)) * 1000;
const BATCH = Number(arg('batch', 10));
const EVERY = Number(arg('every', 10)) * 60 * 1000;
const LOG = 'logs/sent.jsonl';

// A hard stop, so an evening run cannot spill past a sensible hour.
// --until 21:00 means "start no new batch at or after 21:00 Europe/Madrid".
const UNTIL = arg('until');
function pastDeadline() {
  if (!UNTIL) return false;
  const [h, m] = String(UNTIL).split(':').map(Number);
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return local.getHours() * 60 + local.getMinutes() >= h * 60 + (m || 0);
}

const problems = checkKeys();
if (problems.length) {
  console.log('\n  Cannot send:\n');
  for (const p of problems) console.log(`   • ${p}`);
  console.log();
  process.exit(1);
}

// ── Which pair of messages, for which kind of lead ───────────────────────────

const STAGES = {
  // The first approach — already sent to everyone.
  campaign: {
    no_meeting: ['no_meating_fr_1_1', 'no_meating_fr_1_2'],
    had_meeting: ['hadmeating_fr_1_1', 'hadmeating_fr_1_2'],
  },
  // First follow-up, for people who never replied to the campaign.
  followup1: {
    no_meeting: ['followup_text_1_fra_v2', 'followup_text_2_fra'],
    had_meeting: ['noshow_text_3_france', 'noshow_text_4_fra'],
  },
  // Reopening the door on people who said yes and then went quiet.
  // Audience comes from data/french/stalled.csv, not plan.json.
  reengage: {
    stalled: ['reschedule_text_1_fra'],
  },
  // If they stay quiet after reengage.
  reengage2: {
    stalled: ['reschedule_followup_1_fr'],
  },
};

// Stages whose audience is the stalled list rather than the campaign plan.
const STALLED_STAGES = new Set(['reengage', 'reengage2']);

const STAGE = String(arg('stage', 'campaign'));
const tracks = STAGES[STAGE];
if (!tracks) {
  console.log(`\n  Unknown stage "${STAGE}". Use: ${Object.keys(STAGES).join(', ')}\n`);
  process.exit(1);
}

// ── Never contact these people ───────────────────────────────────────────────

// This gate is not optional. If the exclusion list is missing we stop, rather
// than send to people who asked us not to.
const DNC_FILE = 'data/do-not-contact-full.csv';
if (!existsSync(DNC_FILE)) {
  console.log(`\n  Refusing to send: ${DNC_FILE} is missing.`);
  console.log('  Run "npm run scan-history" first — without it we could message');
  console.log('  someone who asked to be removed.\n');
  process.exit(1);
}
const blocked = new Map();
for (const line of readFileSync(DNC_FILE, 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue;
  const f = line.split(',');
  const reason = f[3] || '';
  // Rows flagged as likely false positives are not blocks.
  if (/false positive/i.test(reason)) continue;
  blocked.set(f[2].replace(/[^\d]/g, ''), reason);
}

// People who asked to be taken off the list, or called it harassment. Found by
// find-missed.mjs across the whole conversation history.
const MR_FILE = 'data/french/must-remove.csv';
if (existsSync(MR_FILE)) {
  for (const line of readFileSync(MR_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const phone = (line.match(/^"([^"]*)"/) || [])[1];
    if (phone) blocked.set(phone.replace(/[^\d]/g, ''), 'asked to be removed / called it harassment');
  }
}

// Leads whose CSV track turned out to be wrong — their Wati history shows a
// meeting already happened, or a sequence already ran. Found by check-601.mjs.
const WT_FILE = 'data/wrong-track.csv';
if (existsSync(WT_FILE)) {
  for (const line of readFileSync(WT_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const phone = (line.match(/^"?([\d+]+)"?/) || [])[1];
    if (phone) blocked.set(phone.replace(/[^\d]/g, ''), 'wrong track — see data/wrong-track.csv');
  }
}

// Numbers Ali ruled out from the CRM: unknown to the CRM, wrong language
// tenant, or a terminal status where the bot forwards instead of talking.
const CU_FILE = 'data/crm-unsuitable.csv';
if (existsSync(CU_FILE)) {
  for (const line of readFileSync(CU_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const phone = (line.match(/^"?(\d+)"?/) || [])[1];
    if (phone) blocked.set(phone, 'ruled out from the CRM — see data/crm-unsuitable.csv');
  }
}

// Anyone who has replied since the campaign went out must never be told they
// did not reply. Built by freshcheck.mjs.
const RS_FILE = 'data/replied-since.csv';
if (existsSync(RS_FILE)) {
  for (const line of readFileSync(RS_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const f = line.split(',');
    blocked.set(f[2].replace(/[^\d]/g, ''), 'replied since — needs a human reply, not a follow-up');
  }
}

// ── Who are we sending to? ───────────────────────────────────────────────────

// Load the log of what has already gone out first, so --limit can mean
// "this many people who have not been messaged yet".
mkdirSync('logs', { recursive: true });
const done = new Set();
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.ok) done.add(`${e.phone}:${e.template}`);
    } catch { /* ignore a half-written line */ }
  }
}

let audience;
const testPhone = arg('test');
if (testPhone) {
  const track = arg('track', 'no_meeting');
  if (!tracks[track]) { console.log(`\n  Unknown track "${track}". Use no_meeting or had_meeting.\n`); process.exit(1); }
  audience = [{
    leadId: 'TEST',
    name: String(arg('name', 'Ali')),
    phone: String(testPhone).replace(/[^\d]/g, ''),
    track,
  }];
} else if (STALLED_STAGES.has(STAGE)) {
  // People who showed interest and then went silent. Built by french-stalled.mjs.
  const SF = 'data/french/stalled.csv';
  if (!existsSync(SF)) {
    console.log(`\n  Refusing to send: ${SF} is missing. Run "npm run french-stalled" first.\n`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(SF, 'utf8'));
  audience = rows.map((r) => ({
    leadId: r.phone,
    name: firstName(r.name),
    phone: r.phone.replace(/[^\d]/g, ''),
    track: 'stalled',
    bucket: r.bucket,
    window: r.window,
    days: Number(r.days_silent),
  }));

  // Anyone whose 24-hour window is still open should get a real typed reply,
  // not a template. Those are listed, never sent to.
  const stillOpen = audience.filter((l) => l.window === 'OPEN');
  audience = audience.filter((l) => l.window !== 'OPEN');
  if (stillOpen.length) {
    console.log(`\n  ${stillOpen.length} people are still inside the 24-hour window — answer these by hand, not by template:`);
    for (const l of stillOpen) console.log(`   • ${l.name} +${l.phone} — silent ${l.days} days`);
  }

  // People already contacted outside this tool. Not a do-not-contact — just
  // not to be messaged again by this stage.
  const AC_FILE = 'data/french/already-contacted.csv';
  if (existsSync(AC_FILE)) {
    const contacted = new Set();
    for (const line of readFileSync(AC_FILE, 'utf8').split('\n').slice(1)) {
      if (!line.trim()) continue;
      const phone = line.split(',')[0].replace(/[^\d]/g, '');
      if (phone) contacted.add(phone);
    }
    const before = audience.length;
    audience = audience.filter((l) => !contacted.has(l.phone));
    const n = before - audience.length;
    if (n) console.log(`\n  Skipping ${n} people recorded as already contacted.`);
  }

  const bucket = arg('bucket');
  if (bucket) audience = audience.filter((l) => l.bucket.includes(String(bucket)));

  // A template needs a usable first name for {{1}}.
  const noName = audience.filter((l) => !l.name);
  audience = audience.filter((l) => l.name);
  if (noName.length) {
    console.log(`\n  ${noName.length} people have no usable first name — skipped (the template needs one):`);
    for (const l of noName) console.log(`   • +${l.phone}`);
  }

  const excluded = audience.filter((l) => blocked.has(l.phone));
  audience = audience.filter((l) => !blocked.has(l.phone));
  if (excluded.length) {
    console.log(`\n  Excluded ${excluded.length} people who asked not to be contacted:`);
    for (const l of excluded) console.log(`   • ${l.name} +${l.phone} — ${blocked.get(l.phone)}`);
  }

  const before = audience.length;
  audience = audience.filter((l) => !tracks.stalled.every((t) => done.has(`${l.phone}:${t}`)));
  const already = before - audience.length;
  if (already) console.log(`\n  Skipping ${already} people already messaged at this stage.`);

  const limit = arg('limit');
  if (limit) audience = audience.slice(0, Number(limit));
} else {
  audience = JSON.parse(readFileSync('data/plan.json', 'utf8')).leads;

  // A follow-up only goes to people who stayed silent through the campaign.
  if (STAGE === 'followup1') {
    const silent = new Set(
      readFileSync('data/no-reply.csv', 'utf8').split('\n').slice(1)
        .filter((l) => l.trim()).map((l) => l.split(',')[2].replace(/[^\d]/g, '')),
    );
    audience = audience.filter((l) => silent.has(l.phone));
  }

  const track = arg('track');
  if (track) audience = audience.filter((l) => l.track === track);

  // Remove anyone who asked not to be contacted. Always, before anything else.
  const excluded = audience.filter((l) => blocked.has(l.phone));
  audience = audience.filter((l) => !blocked.has(l.phone));
  if (excluded.length) {
    console.log(`\n  Excluded ${excluded.length} people who asked not to be contacted:`);
    for (const l of excluded) console.log(`   • ${l.name} +${l.phone} — ${blocked.get(l.phone)}`);
  }

  // Drop anyone who already got their whole pair, BEFORE applying the limit —
  // so --limit counts fresh people, not rows we are about to skip.
  const alreadyFullyDone = (l) => tracks[l.track].every((t) => done.has(`${l.phone}:${t}`));
  const before = audience.length;
  audience = audience.filter((l) => !alreadyFullyDone(l));
  const skippedUpFront = before - audience.length;
  if (skippedUpFront) console.log(`\n  Skipping ${skippedUpFront} people already messaged at this stage.`);

  const limit = arg('limit');
  if (limit) audience = audience.slice(0, Number(limit));
}

const record = (entry) => {
  if (!DRY) appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
};

// ── Sending ──────────────────────────────────────────────────────────────────

// Sending from a specific number needs the v3 API, which lives on the bare
// host with no tenant in the path — and resolves the channel by NAME OR NUMBER,
// never by its id. Passing an id silently sends on the default channel instead.
const CHANNEL = arg('channel');
const V3_SEND = 'https://eu-api.wati.io/api/ext/v3/messageTemplates/send';
const RAW_TOKEN = (process.env.WATI_TOKEN || '').replace(/^Bearer\s+/i, '');

// One person per call. Sending a whole batch in a single call would be fewer
// requests, but the per-recipient name substitution has never been verified on
// this endpoint — and because the telemarketing channel cannot be read back,
// a mistake there would be invisible. One name per request removes the doubt.
async function sendOneV3(template, person) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(V3_SEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${RAW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: template,
          broadcast_name: `${template}_${new Date().toISOString().slice(0, 10)}`,
          channel: String(CHANNEL),
          recipients: [{ phone_number: person.phone, custom_params: [{ name: 'name', value: person.name }] }],
        }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 160)}` };
      const data = JSON.parse(text);
      if (data.success !== true) return { ok: false, error: text.slice(0, 160) };
      const errs = (data.recipients || [])[0]?.errors || [];
      return errs.length ? { ok: false, error: JSON.stringify(errs).slice(0, 160) } : { ok: true };
    } catch (err) {
      if (attempt === 2) return { ok: false, error: err.message };
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
}

async function sendToBatchV3(template, people) {
  const out = [];
  for (const person of people) out.push(await sendOneV3(template, person));
  return out;
}

// One API call carries a whole batch, each person with their own name.
async function sendToBatch(template, people) {
  if (CHANNEL) {
    if (DRY) return people.map(() => ({ ok: true }));
    return sendToBatchV3(template, people);
  }
  const receivers = people.map((p) => ({
    whatsappNumber: p.phone,
    customParams: [{ name: 'name', value: p.name }],
  }));

  if (DRY) return people.map(() => ({ ok: true }));

  try {
    const res = await wati('/api/v1/sendTemplateMessages', {
      method: 'POST',
      body: {
        template_name: template,
        broadcast_name: `${template}_${new Date().toISOString().slice(0, 10)}`,
        receivers,
      },
    });
    const ok = res.result === true || res.result === 'success';
    if (!ok) {
      const why = JSON.stringify(res.errors || res).slice(0, 300);
      return people.map(() => ({ ok: false, error: why }));
    }
    return people.map(() => ({ ok: true }));
  } catch (err) {
    return people.map(() => ({ ok: false, error: err.message }));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const batches = [];
for (let i = 0; i < audience.length; i += BATCH) batches.push(audience.slice(i, i + BATCH));

const totalMessages = audience.reduce((n, l) => n + tracks[l.track].length, 0);
const estimateMin = Math.round(((batches.length - 1) * EVERY + GAP) / 60000);

console.log(`\n  ${DRY ? 'DRY RUN — nothing will be sent.' : 'Sending for real.'}`);
console.log(`  ${audience.length} people · ${totalMessages} messages · ${batches.length} batch(es)`);
if (!testPhone) console.log(`  ${BATCH} people per batch, a new batch every ${EVERY / 60000} min → about ${estimateMin} min total`);
console.log(`  ${GAP / 1000}s between each person's first and second message`);
console.log(`  sending from: ${CHANNEL ? `+${CHANNEL}` : 'the default channel (France Sales)'}\n`);

let sent = 0, failed = 0, skipped = 0;

let stoppedEarly = 0;
for (const [n, batch] of batches.entries()) {
  if (pastDeadline()) {
    stoppedEarly = batches.length - n;
    console.log(`\n  Reached ${UNTIL} Europe/Madrid — stopping. ${stoppedEarly} batch(es) not sent; they stay in the queue for next time.`);
    break;
  }
  const startedAt = Date.now();

  // Both messages of a pair use the same track, so group by it.
  for (const track of [...new Set(batch.map((p) => p.track))]) {
    const people = batch.filter((p) => p.track === track);

    // Some stages are a pair of messages, some are a single one.
    for (const [step, template] of tracks[track].entries()) {
      const todo = people.filter((p) => !done.has(`${p.phone}:${template}`));
      skipped += people.length - todo.length;
      if (!todo.length) continue;

      const results = await sendToBatch(template, todo);
      todo.forEach((p, i) => {
        const r = results[i];
        if (r.ok) sent++; else failed++;
        record({ leadId: p.leadId, phone: p.phone, name: p.name, template, channel: CHANNEL || 'default', ok: r.ok, error: r.error });
        if (testPhone || batches.length === 1) {
          const status = r.ok ? 'sent' : `FAILED — ${r.error}`;
          console.log(`   ${template.padEnd(20)} → +${p.phone}  (${p.name})  ${status}`);
        }
      });

      const isLast = step === tracks[track].length - 1;
      if (!isLast && GAP > 0 && !DRY) await sleep(GAP);
    }
  }

  if (batches.length > 1) {
    const pct = Math.round(((n + 1) / batches.length) * 100);
    console.log(`   batch ${n + 1}/${batches.length} (${pct}%) — sent ${sent}, failed ${failed}, already done ${skipped}`);
  }

  const wait = EVERY - (Date.now() - startedAt);
  if (n < batches.length - 1 && wait > 0 && !DRY) await sleep(wait);
}

console.log(`\n  Done. Sent ${sent}, failed ${failed}, skipped as already sent ${skipped}.`);
console.log(`  Every send is logged in ${LOG}\n`);
