# How to Send the Campaign

## Files you need
- `whatsapp_campaign.txt` — readable reference (all 30 messages)
- `campaign_data.csv` — one row per message (Phone, Message columns)

---

## Option A — Manual (safest, zero risk)
Open `whatsapp_campaign.txt`, go batch by batch:
1. Open WhatsApp on your laptop
2. Search for the phone number
3. Paste the message → Send
4. Wait 1 hour, then do the next batch

The file is formatted so each message is clearly separated and ready to copy.

---

## Option B — WA-Automate / Baileys (semi-automated, free)
These are Node.js libraries that control WhatsApp Web via a real browser session.
They work on your existing WhatsApp account — no Business API needed.

> ⚠️  Technically against WhatsApp ToS. Use with care: small volumes (30 messages),
> spaced out (1 hour between batches), and from your real professional number.
> The 1-hour delay between batches is important to avoid triggering spam detection.

### Setup (one-time)
```bash
npm install @open-wa/wa-automate
# or
npm install @whiskeysockets/baileys
```

### Quick send script (wa-automate style)
```javascript
const wa = require('@open-wa/wa-automate');
const csv = require('csv-parse/sync');
const fs  = require('fs');
const rows = csv.parse(fs.readFileSync('campaign_data.csv'), { columns: true });

wa.create().then(async client => {
  const batches = [1, 2, 3];
  for (const batch of batches) {
    const msgs = rows.filter(r => r.Batch == batch);
    for (const row of msgs) {
      const phone = row.Phone.replace(/\D/g, '') + '@c.us'; // WhatsApp ID format
      await client.sendText(phone, row.Message);
      await new Promise(r => setTimeout(r, 30000)); // 30s between messages
    }
    if (batch < 3) {
      console.log(`Batch ${batch} done. Waiting 1 hour...`);
      await new Promise(r => setTimeout(r, 3600000)); // 1 hour
    }
  }
  await client.kill();
});
```

---

## Option C — Twilio WhatsApp API (most reliable, paid)
If you have a Twilio account with WhatsApp sandbox or Business number:

```python
from twilio.rest import Client
import csv, time

client = Client('ACCOUNT_SID', 'AUTH_TOKEN')

with open('campaign_data.csv') as f:
    rows = list(csv.DictReader(f))

current_batch = 0
for row in rows:
    if int(row['Batch']) > current_batch:
        if current_batch > 0:
            print(f'Batch {current_batch} done. Waiting 1 hour...')
            time.sleep(3600)
        current_batch = int(row['Batch'])

    client.messages.create(
        from_='whatsapp:+1XXXXXXXXXX',  # your Twilio WhatsApp number
        to=f"whatsapp:{row['Phone']}",
        body=row['Message']
    )
    time.sleep(30)  # 30s between messages
```

---

## Recommended approach for 30 messages
**Use Option A (manual)**. 30 messages across 3 hours is very manageable,
and manual sending guarantees zero WhatsApp account risk.
