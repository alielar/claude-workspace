# Apple Watch → Control Center Setup Guide

This guide helps you connect your Apple Watch data (sleep + running) to your Life Control Center dashboard using Apple Shortcuts automations.

---

## Before You Start — Quick Test

Open this URL in your phone's browser to verify the endpoint is alive:

```
https://life-control-center-eta.vercel.app/api/sleep/ingest
```

You should see a JSON response with `"ok": true`. If you see an error, the platform isn't deployed properly.

---

## Part 1: Sleep Sync Shortcut

### Create the Shortcut

1. Open **Shortcuts** app on your iPhone
2. Tap **+** (top right) → name it **"CC Sleep Sync"**
3. Add these actions in order:

---

**Action 1 — Get today's date**
- Search for: **Date**
- It will show "Current Date" — leave it as is
- Then add: **Format Date**
- Set format to: **Custom** → type: `yyyy-MM-dd`
- This gives you today's date like "2026-06-06"

**Action 2 — Find last night's sleep**
- Search for: **Find Health Samples**
- Type: **Sleep Analysis**
- Add filter: **Start Date** → **is in the last** → **1 day**
- Sort by: **Start Date** → **Latest First**
- Limit: **1**

**Action 3 — Send to Control Center**
- Search for: **Get Contents of URL**
- URL: `https://life-control-center-eta.vercel.app/api/sleep/ingest`
- Method: **POST**
- Request Body: **JSON**
- Add these fields one by one (tap "Add new field"):

| Field name | Type | Value |
|-----------|------|-------|
| `date` | Text | Pick the **Formatted Date** from Action 1 |
| `bedtime` | Text | Pick **Start Date** from the Health Sample → format as `HH:mm` |
| `wake_time` | Text | Pick **End Date** from the Health Sample → format as `HH:mm` |
| `duration_minutes` | Number | Pick **Duration** from the Health Sample (Apple gives this in minutes) |

> **To format Start/End Date as HH:mm:** When you pick "Start Date" from the Health Sample, tap on it → choose "Format Date" → set to Custom → type `HH:mm`

**Action 4 — Show what happened**
- Search for: **Show Notification**
- Title: `Sleep Sync`
- Body: Pick the result from "Get Contents of URL" (this shows the API response)

> This notification is important! It tells you if the sync worked or failed.

---

### Optional: Add More Health Data

If you want heart rate, respiratory rate, and blood oxygen, add these BEFORE the "Get Contents of URL" action:

- **Find Health Samples** → Type: **Heart Rate** → Start Date: **is in the last 1 day** → Sort: Start Date, Latest First
- **Find Health Samples** → Type: **Respiratory Rate** → Start Date: **is in the last 1 day**
- **Find Health Samples** → Type: **Blood Oxygen Saturation** → Start Date: **is in the last 1 day**

Then add these extra fields to the JSON body:

| Field name | Type | Value |
|-----------|------|-------|
| `heart_rate_avg` | Number | Average of Heart Rate samples |
| `respiratory_rate_avg` | Number | Average of Respiratory Rate samples |
| `blood_oxygen_avg` | Number | Average of Blood Oxygen samples |

---

### Set Up Daily Automation

1. In Shortcuts app, go to **Automation** tab
2. Tap **+ New Automation**
3. Choose **Time of Day** → set to **10:00 AM** → **Daily**
4. Set to **Run Immediately** (not "Ask Before Running")
5. Pick your **CC Sleep Sync** shortcut

---

## Part 2: Running Sync Shortcut

### Create the Shortcut

1. Open **Shortcuts** app → tap **+** → name it **"CC Run Sync"**
2. Add these actions:

---

**Action 1 — Get today's date**
- Same as sleep: **Date** → **Format Date** → Custom: `yyyy-MM-dd`

**Action 2 — Find the workout**
- Search for: **Find Health Samples**
- Type: **Running Workouts** (or **Walking + Running Distance**)
- Add filter: **Start Date** → **is in the last** → **1 day**
- Sort by: **Start Date** → **Latest First**
- Limit: **1**

> **Alternative:** If "Running Workouts" doesn't appear, search for **Find Health Samples** → type **Workout** and add a filter for Workout Activity Type = Running.

**Action 3 — Send to Control Center**
- Search for: **Get Contents of URL**
- URL: `https://life-control-center-eta.vercel.app/api/workouts/run-ingest`
- Method: **POST**
- Request Body: **JSON**
- Add these fields:

| Field name | Type | Value |
|-----------|------|-------|
| `date` | Text | Pick **Formatted Date** from Action 1 |
| `distance_km` | Number | Pick **Distance** from the Health Sample (in km) |
| `duration_seconds` | Number | Pick **Duration** from the Health Sample (in seconds) |
| `notes` | Text | (Optional) Type "Apple Watch" or leave blank |

**Action 4 — Show what happened**
- Search for: **Show Notification**
- Title: `Run Sync`
- Body: Pick the result from "Get Contents of URL"

---

### Set Up Automation (Optional)

If you run regularly, set up a daily automation like the sleep one (e.g., at 9 PM). Or just run the shortcut manually after each run.

---

## Troubleshooting

### "Nothing shows on the platform"

1. **Run the shortcut manually** — open Shortcuts app, tap the shortcut. Watch for the notification.
2. **Check the notification** — it should say `{"success": true, ...}`. If it shows an error, the issue is in the data being sent.
3. **Check the debug endpoint** — open this in your browser:
   - Sleep: `https://life-control-center-eta.vercel.app/api/sleep/ingest`
   - Running: `https://life-control-center-eta.vercel.app/api/workouts/run-ingest`
   
   These show the most recent data received. If your data isn't there, the shortcut isn't sending correctly.

### "Shortcut doesn't run automatically"

- Go to **Settings → Shortcuts → Advanced** → turn on **Allow Running Scripts**
- Make sure your automation is set to **Run Immediately**, not "Ask Before Running"

### "Shortcut shows an error"

- Make sure the URL is exactly right (copy-paste from this guide)
- Make sure Method is **POST** (not GET)
- Make sure Request Body is **JSON** (not Form)
- Make sure field names are exactly as shown (lowercase, underscores)

### "Health data is empty"

- Go to **Settings → Health → Data Access & Devices → Shortcuts**
- Turn on ALL categories (Sleep, Heart Rate, etc.)
- Make sure your Apple Watch was actually worn during sleep/running

### "Date format looks wrong"

- The Format Date action MUST use Custom format: `yyyy-MM-dd`
- This produces dates like "2026-06-06", which is what the API expects
- If you use the default date format, it will send something like "June 6, 2026" which won't work
