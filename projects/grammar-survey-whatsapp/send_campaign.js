/**
 * WhatsApp Campaign Sender
 * Reads campaign_data.csv and sends 3 batches with 1-hour gaps.
 *
 * Usage:
 *   node send_campaign.js            # real send
 *   node send_campaign.js --dry-run  # preview only, no messages sent
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const fs      = require('fs');
const path    = require('path');
const { parse } = require('csv-parse/sync');

// ── CONFIG ───────────────────────────────────────────────────────────────────
const DELAY_BETWEEN_MESSAGES_MS = 30_000;   // 30 seconds between each message
const DELAY_BETWEEN_BATCHES_MS  = 3_600_000; // 1 hour between batches
const PROGRESS_FILE = path.join(__dirname, '.campaign_progress.json');
const CSV_FILE      = path.join(__dirname, 'campaign_data.csv');
const DRY_RUN       = process.argv.includes('--dry-run');

// ── HELPERS ──────────────────────────────────────────────────────────────────

function formatPhone(phone) {
  // WhatsApp expects: digits only + @c.us  (e.g. "34612345678@c.us")
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits}@c.us`;
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { sent: [] }; // sent = array of "Batch-Order" keys already sent
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function sleep(ms, label) {
  if (ms <= 0) return Promise.resolve();
  const mins = Math.round(ms / 60000);
  console.log(`\n⏳  ${label} — waiting ${mins} minute${mins !== 1 ? 's' : ''}…`);
  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed  = Date.now() - start;
      const remaining = Math.ceil((ms - elapsed) / 60000);
      process.stdout.write(`\r   ${remaining} min remaining…   `);
      if (elapsed >= ms) {
        clearInterval(interval);
        process.stdout.write('\r                          \r');
        resolve();
      }
    }, 30_000);
    // Also resolve after exact ms
    setTimeout(() => { clearInterval(interval); resolve(); }, ms);
  });
}

function loadCampaign() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`\n❌  campaign_data.csv not found. Run generate_campaign.py first.\n`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CSV_FILE, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true });
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const rows     = loadCampaign();
  const progress = loadProgress();

  console.log('\n' + '='.repeat(60));
  console.log('  WHATSAPP CAMPAIGN SENDER');
  if (DRY_RUN) console.log('  ⚠️   DRY-RUN MODE — no messages will be sent');
  console.log('='.repeat(60));
  console.log(`\n  Messages total : ${rows.length}`);
  console.log(`  Already sent   : ${progress.sent.length}`);
  console.log(`  Remaining      : ${rows.length - progress.sent.length}`);

  // Group by batch
  const batches = {};
  for (const row of rows) {
    const b = row.Batch;
    if (!batches[b]) batches[b] = [];
    batches[b].push(row);
  }
  const batchNums = Object.keys(batches).sort();

  if (DRY_RUN) {
    console.log('\n── DRY RUN PREVIEW ──\n');
    for (const b of batchNums) {
      console.log(`BATCH ${b}:`);
      for (const row of batches[b]) {
        const key = `${row.Batch}-${row.Order}`;
        const done = progress.sent.includes(key) ? ' ✅ already sent' : '';
        console.log(`  [${row.Order}/10] ${row.Name} | ${row.Phone}${done}`);
        console.log(`         ${row.Message.split('\n')[0]}…`);
      }
      console.log('');
    }
    console.log('Run without --dry-run to send for real.\n');
    return;
  }

  // ── CLIENT FACTORY — recreated fresh for each batch to avoid detached frame ─
  async function startClient() {
    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    c.on('qr', qr => {
      qrcode.generate(qr, { small: true });
      console.log('\n👆  Scan the QR code above with WhatsApp on your phone.\n');
    });

    c.on('authenticated', () => {
      console.log('✅  Authenticated — session saved.');
    });

    await new Promise((resolve, reject) => {
      c.on('ready', resolve);
      c.on('auth_failure', reject);
      c.initialize();
    });

    return c;
  }

  console.log('\n🔌  Connecting to WhatsApp…');
  console.log('    (Scan the QR code if prompted: Phone > Linked Devices > Link a Device)\n');

  // ── SEND BATCHES ─────────────────────────────────────────────────────────
  for (let bi = 0; bi < batchNums.length; bi++) {
    const batchNum = batchNums[bi];
    const messages = batches[batchNum];

    // Check before running whether this whole batch is already done
    const batchAlreadyDone = messages.every(r => progress.sent.includes(`${r.Batch}-${r.Order}`));

    if (batchAlreadyDone) {
      console.log(`\n  BATCH ${batchNum} — all messages already sent, skipping.\n`);
      continue;
    }

    // Fresh client for every batch — avoids detached frame after 1h idle
    const client = await startClient();
    console.log(`\n✅  WhatsApp ready.\n`);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  BATCH ${batchNum} — ${messages[0].Level.toUpperCase()}  (${messages.length} messages)`);
    console.log('─'.repeat(60));

    for (let mi = 0; mi < messages.length; mi++) {
      const row = messages[mi];
      const key = `${row.Batch}-${row.Order}`;

      if (progress.sent.includes(key)) {
        console.log(`  [${row.Order}/10] ⏭️   ${row.Name} — already sent, skipping`);
        continue;
      }

      process.stdout.write(`  [${row.Order}/10] Sending to ${row.Name} (${row.Phone})… `);

      try {
        await client.sendMessage(formatPhone(row.Phone), row.Message);
        progress.sent.push(key);
        saveProgress(progress);
        console.log('✅');
      } catch (err) {
        console.log(`❌  Failed: ${err.message}`);
      }

      const isLastInBatch = mi === messages.length - 1;
      if (!isLastInBatch) {
        await sleep(DELAY_BETWEEN_MESSAGES_MS, `Next message in ${DELAY_BETWEEN_MESSAGES_MS / 1000}s`);
      }
    }

    await client.destroy();

    const isLastBatch = bi === batchNums.length - 1;
    if (!isLastBatch) {
      await sleep(
        DELAY_BETWEEN_BATCHES_MS,
        `Batch ${batchNum} complete. Batch ${batchNums[bi + 1]} starts in 1 hour`
      );
    }
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log(`  ✅  Campaign complete — ${progress.sent.length} messages sent`);
  console.log('='.repeat(60) + '\n');

  await client.destroy();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Unexpected error:', err);
  process.exit(1);
});
