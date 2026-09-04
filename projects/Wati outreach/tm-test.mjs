// Test the telemarketing pair on one number, on the New France TM channel.
//
//   node --env-file=.env tm-test.mjs [phone] [name]

const TOKEN = process.env.WATI_TOKEN.replace(/^Bearer\s+/i, '');
const URL = 'https://eu-api.wati.io/api/ext/v3/messageTemplates/send';
const PHONE = process.argv[2] || '34695064884';
const NAME = process.argv[3] || 'Ali';
const GAP = 10_000;

// The API resolves the channel by name or by number, never by id.
async function send(template, channel, params) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: template,
      broadcast_name: `tm_test_${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')}`,
      channel,
      recipients: [{ phone_number: PHONE, ...(params ? { custom_params: params } : {}) }],
    }),
  });
  return { status: r.status, body: await r.text() };
}

// Prefer the number — it survives the channel being renamed. Fall back to the name.
let channel = '33671283778';
let res = await send('no_meating_fr_1_1', channel, [{ name: 'name', value: NAME }]);
if (res.status === 404) {
  console.log(`  the number form is not accepted, using the channel name instead`);
  channel = 'New France TM';
  res = await send('no_meating_fr_1_1', channel, [{ name: 'name', value: NAME }]);
}
console.log(`\n  channel: "${channel}"\n`);
console.log(`  1/2  no_meating_fr_1_1   HTTP ${res.status}  ${res.body.slice(0, 160)}`);
console.log(`       waiting ${GAP / 1000}s …`);
await new Promise((r) => setTimeout(r, GAP));
const res2 = await send('no_meating_fr_1_2', channel, null);
console.log(`  2/2  no_meating_fr_1_2   HTTP ${res2.status}  ${res2.body.slice(0, 160)}\n`);
