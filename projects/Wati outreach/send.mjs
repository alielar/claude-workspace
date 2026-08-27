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
//   --test <phone>   send one pair to this number only, ignoring the lead list
//   --name <name>    the name used by --test (default: Ali)
//   --track <t>      no_meeting | had_meeting
//   --limit <n>      only the first n people
//   --dry-run        print what would happen, send nothing
//   --gap <seconds>  wait between the 1st and 2nd message (default 5)
//   --batch <n>      people per batch (default 10)
//   --every <min>    minutes from the start of one batch to the next (default 10)

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { checkKeys, wati } from './wati.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
};
const flag = (name) => process.argv.includes(`--${name}`);

const DRY = flag('dry-run');
const GAP = Number(arg('gap', 5)) * 1000;
const BATCH = Number(arg('batch', 10));
const EVERY = Number(arg('every', 10)) * 60 * 1000;
const LOG = 'logs/sent.jsonl';

const problems = checkKeys();
if (problems.length) {
  console.log('\n  Cannot send:\n');
  for (const p of problems) console.log(`   • ${p}`);
  console.log();
  process.exit(1);
}

const { tracks } = JSON.parse(readFileSync('data/plan.json', 'utf8'));

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
} else {
  audience = JSON.parse(readFileSync('data/plan.json', 'utf8')).leads;
  const track = arg('track');
  if (track) audience = audience.filter((l) => l.track === track);

  // Drop anyone who already got their whole pair, BEFORE applying the limit —
  // so --limit counts fresh people, not rows we are about to skip.
  const alreadyFullyDone = (l) => tracks[l.track].every((t) => done.has(`${l.phone}:${t}`));
  const before = audience.length;
  audience = audience.filter((l) => !alreadyFullyDone(l));
  const skippedUpFront = before - audience.length;
  if (skippedUpFront) console.log(`\n  Skipping ${skippedUpFront} people already messaged in an earlier run.`);

  const limit = arg('limit');
  if (limit) audience = audience.slice(0, Number(limit));
}

const record = (entry) => {
  if (!DRY) appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
};

// ── Sending ──────────────────────────────────────────────────────────────────

// One API call carries a whole batch, each person with their own name.
async function sendToBatch(template, people) {
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

const totalMessages = audience.length * 2;
const estimateMin = Math.round(((batches.length - 1) * EVERY + GAP) / 60000);

console.log(`\n  ${DRY ? 'DRY RUN — nothing will be sent.' : 'Sending for real.'}`);
console.log(`  ${audience.length} people · ${totalMessages} messages · ${batches.length} batch(es)`);
if (!testPhone) console.log(`  ${BATCH} people per batch, a new batch every ${EVERY / 60000} min → about ${estimateMin} min total`);
console.log(`  ${GAP / 1000}s between each person's first and second message\n`);

let sent = 0, failed = 0, skipped = 0;

for (const [n, batch] of batches.entries()) {
  const startedAt = Date.now();

  // Both messages of a pair use the same track, so group by it.
  for (const track of [...new Set(batch.map((p) => p.track))]) {
    const people = batch.filter((p) => p.track === track);
    const [first, second] = tracks[track];

    for (const [step, template] of [first, second].entries()) {
      const todo = people.filter((p) => !done.has(`${p.phone}:${template}`));
      skipped += people.length - todo.length;
      if (!todo.length) continue;

      const results = await sendToBatch(template, todo);
      todo.forEach((p, i) => {
        const r = results[i];
        if (r.ok) sent++; else failed++;
        record({ leadId: p.leadId, phone: p.phone, name: p.name, template, ok: r.ok, error: r.error });
        if (testPhone || batches.length === 1) {
          const status = r.ok ? 'sent' : `FAILED — ${r.error}`;
          console.log(`   ${template.padEnd(20)} → +${p.phone}  (${p.name})  ${status}`);
        }
      });

      if (step === 0 && GAP > 0 && !DRY) await sleep(GAP);
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
