// Sends the feedback_call_request_fr template to the Trustpilot-campaign audience
// (existing students, 50%+ attendance), one person every --gap seconds, from the
// default channel (France Sales). Mirrors send.mjs's safety machinery.
//
//   node --env-file=.env send-feedback-call.mjs --dry-run
//   node --env-file=.env send-feedback-call.mjs --test +34695064884 --name Ali
//   node --env-file=.env send-feedback-call.mjs --limit 3
//   node --env-file=.env send-feedback-call.mjs
//
// Options:
//   --dry-run        print who would get it, send nothing
//   --test <phone>   send once to this number only, ignoring the audience file
//   --name <name>    the name used by --test (default: Ali)
//   --limit <n>      only the first n people (after exclusions)
//   --gap <seconds>  minutes... no, SECONDS between one person and the next (default 300 = 5 min)

import { readFileSync, appendFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, writeSync } from 'node:fs';
import { checkKeys, wati } from './wati.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
};
const flag = (name) => process.argv.includes(`--${name}`);

const KNOWN_ARGS = new Set(['test', 'name', 'limit', 'gap']);
const KNOWN_FLAGS = new Set(['dry-run']);
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const name = a.slice(2);
  if (KNOWN_FLAGS.has(name)) continue;
  if (KNOWN_ARGS.has(name)) { i++; continue; }
  console.log(`\n  Unknown option "--${name}" — refusing to run. Known: ${[...KNOWN_ARGS].map((x) => '--' + x).join(', ')}, --dry-run\n`);
  process.exit(1);
}

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

const TEMPLATE = 'feedback_call_request_fr';
const AUDIENCE_FILE = 'data/french/trustpilot-campaign-50plus-2026-09-19.csv';
const LOG = 'logs/sent.jsonl';
const DRY = flag('dry-run');
const GAP = Number(arg('gap', 300)) * 1000; // default 5 minutes between people

// Same lock as send.mjs — one sender running at a time, whichever script it is.
const LOCK = 'logs/send.lock';
if (!DRY) {
  try {
    const fd = openSync(LOCK, 'wx');
    writeSync(fd, `pid ${process.pid} started ${new Date().toISOString()} (send-feedback-call.mjs)\n`);
    closeSync(fd);
  } catch {
    console.log(`\n  Refusing to run: ${LOCK} exists — another sender is (or was) running.`);
    console.log('  If you are sure nothing is running (check with: pgrep -fl "send.*\\.mjs"), delete the lock file and retry.\n');
    process.exit(1);
  }
  const releaseLock = () => { try { unlinkSync(LOCK); } catch {} };
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(130); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
}

const problems = checkKeys();
if (problems.length) {
  console.log('\n  Cannot send:\n');
  for (const p of problems) console.log(`   • ${p}`);
  console.log();
  process.exit(1);
}

// ── Never contact these people — same exclusion lists as send.mjs ───────────

const blocked = new Map();

const DNC_FILE = 'data/do-not-contact-full.csv';
if (!existsSync(DNC_FILE)) {
  console.log(`\n  Refusing to send: ${DNC_FILE} is missing.\n`);
  process.exit(1);
}
for (const line of readFileSync(DNC_FILE, 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue;
  const f = line.split(',');
  const reason = f[3] || '';
  if (/false positive/i.test(reason)) continue;
  blocked.set(f[2].replace(/[^\d]/g, ''), reason);
}

const MR_FILE = 'data/french/must-remove.csv';
if (existsSync(MR_FILE)) {
  for (const line of readFileSync(MR_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const phone = (line.match(/^"([^"]*)"/) || [])[1];
    if (phone) blocked.set(phone.replace(/[^\d]/g, ''), 'asked to be removed / called it harassment');
  }
}

const CU_FILE = 'data/crm-unsuitable.csv';
if (existsSync(CU_FILE)) {
  for (const line of readFileSync(CU_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const phone = (line.match(/^"?(\d+)"?/) || [])[1];
    if (phone) blocked.set(phone, 'ruled out from the CRM — see data/crm-unsuitable.csv');
  }
}

const RS_FILE = 'data/replied-since.csv';
if (existsSync(RS_FILE)) {
  for (const line of readFileSync(RS_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const f = line.split(',');
    blocked.set(f[2].replace(/[^\d]/g, ''), 'replied since — needs a human reply, not a template');
  }
}

// ── Dedupe against everything already sent, ever ────────────────────────────

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

// ── Who are we sending to? ───────────────────────────────────────────────────

let audience;
const testPhone = arg('test');
if (testPhone) {
  audience = [{ phone: String(testPhone).replace(/[^\d]/g, ''), name: String(arg('name', 'Ali')) }];
} else {
  if (!existsSync(AUDIENCE_FILE)) {
    console.log(`\n  Refusing to send: ${AUDIENCE_FILE} is missing.\n`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(AUDIENCE_FILE, 'utf8'));
  audience = rows
    .filter((r) => r['Call?'] === 'YES')
    .map((r) => ({ phone: r.Phone.replace(/[^\d]/g, ''), name: r['First name'].trim() }));

  const noName = audience.filter((l) => !l.name);
  audience = audience.filter((l) => l.name);
  if (noName.length) {
    console.log(`\n  ${noName.length} people have no usable first name — skipped:`);
    for (const l of noName) console.log(`   • +${l.phone}`);
  }

  const excluded = audience.filter((l) => blocked.has(l.phone));
  audience = audience.filter((l) => !blocked.has(l.phone));
  if (excluded.length) {
    console.log(`\n  Excluded ${excluded.length} on the blocked lists:`);
    for (const l of excluded) console.log(`   • ${l.name} +${l.phone} — ${blocked.get(l.phone)}`);
  }

  const before = audience.length;
  audience = audience.filter((l) => !done.has(`${l.phone}:${TEMPLATE}`));
  if (before - audience.length) console.log(`\n  Skipping ${before - audience.length} already sent this template.`);

  const limit = arg('limit');
  if (limit) audience = audience.slice(0, Number(limit));
}

const record = (entry) => {
  if (!DRY) appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
};

// ── Sending — default channel (France Sales), one person per call ───────────

async function sendOne(person) {
  if (DRY) return { ok: true };
  try {
    const res = await wati('/api/v1/sendTemplateMessages', {
      method: 'POST',
      body: {
        template_name: TEMPLATE,
        broadcast_name: `${TEMPLATE}_${new Date().toISOString().slice(0, 10)}`,
        receivers: [{ whatsappNumber: person.phone, customParams: [{ name: 'name', value: person.name }] }],
      },
    });
    const ok = res.result === true || res.result === 'success';
    if (!ok) return { ok: false, error: JSON.stringify(res.errors || res).slice(0, 300) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\n  ${DRY ? 'DRY RUN — nothing will be sent.' : 'Sending for real.'}`);
console.log(`  template: ${TEMPLATE}`);
console.log(`  ${audience.length} people, one every ${GAP / 1000}s → about ${Math.round((audience.length - 1) * GAP / 60000)} min total`);
console.log(`  sending from: the default channel (France Sales)\n`);

let sent = 0, failed = 0;
for (const [i, person] of audience.entries()) {
  const r = await sendOne(person);
  if (r.ok) sent++; else failed++;
  record({ phone: person.phone, name: person.name, template: TEMPLATE, channel: 'default', ok: r.ok, error: r.error });
  const status = r.ok ? 'sent' : `FAILED — ${r.error}`;
  console.log(`   [${i + 1}/${audience.length}] +${person.phone}  (${person.name})  ${status}`);
  if (i < audience.length - 1 && GAP > 0 && !DRY) await sleep(GAP);
}

console.log(`\n  Done. Sent ${sent}, failed ${failed}.`);
console.log(`  Every send is logged in ${LOG}\n`);
