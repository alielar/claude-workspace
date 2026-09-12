# Apple Watch data into A L I · research report (2026-09-12)

Spec §7c item 5. Report only, no code. Ali's go is required before building.

## 0. Why the old Shortcut failed (evidence from the database)

`GET /api/sleep/ingest` still lists the last three Shortcut posts: 2026-09-01, 09-02 and 09-10,
each at 08:30 UTC, each with bedtime 00:00, wake 00:00, 0 hours. So the 08:30 "Time of Day"
automation ran on 3 of 10 days and every run sent an empty Health query.

Root cause, confirmed by Apple's own docs: **Health data cannot be read by any app while the
iPhone is locked** (Data Protection class "Protected Unless Open"; access drops ~10 min after
lock). A timed automation firing on a phone lying on the table reads nothing. Shortcuts
automations are also documented as best-effort, which explains the missing days.

Second finding: `/api/workouts/run-ingest` is not in the proxy's public list, so since login
was turned on it answers `Unauthorized` to anything without the app key. Runs could never land.

**Consequence for every route below:** nothing on iOS can deliver Health data at a guaranteed
clock time. The server must accept data whenever it arrives (upsert by day / by workout id),
the app must show "as of" and degrade quietly, and there must be a one-tap "sync now" fallback.

## 1. The realistic routes

| Route | Sleep (times, duration, stages) | Workouts | Resting HR / HRV | Cost | Reliability (honest) | Setup | Runs on the phone | Runs on the server |
|---|---|---|---|---|---|---|---|---|
| **A. Health Auto Export (HAE) Premium → webhook** | Yes (sleepStart/End, total, core/deep/REM/awake) | Yes (type, duration, distance, avg/min/max HR, kcal) | Yes | 7,99 €/yr (or 1,99 €/mo, 29,99 € lifetime), 7-day trial | Daily sync dependable if the phone is unlocked at some point; hourly is "opportunistic". Data lands minutes to ~1 h after the first morning unlock. Widget tap = instant sync | ~15 min of tapping | HAE reads Health, POSTs JSON | one ingest endpoint + upserts |
| **B. Shortcuts, redesigned** (Alarm "Is Stopped" trigger + fallback time + Watch "Workout ends") | Yes, fiddly (night spans midnight, whole-day filters, loop needed) | Yes via Workout-end trigger | Yes | Free | Better than before because the alarm trigger fires with the phone in hand, but still locked-phone blocker, silent trigger stops reported 2020–2024, no fix. Community verdict: best-effort | 45–90 min, three shortcuts, fragile | Shortcuts | reuse endpoints, must become idempotent |
| **C. Newer webhook apps** (Health Export Pro 9,99 $/yr · Health Webhook, appears free) | Yes | Yes | Yes | 0–10 $/yr | Same iOS limits as A; younger, unproven, thin docs | ~15 min | the app | same endpoint as A |
| **D. Tiny native companion app** (SwiftUI, HealthKit background delivery) | Yes | Yes | Yes | Mac + Xcode free; **99 $/yr Apple Developer Program** or free signing that expires every 7 days | Highest ceiling: iOS wakes the app when sleep lands on the phone. Still cannot read while locked, so in practice the same "after first unlock" as A, a bit faster | 1–2 days build + days of tuning; reinstall from the Mac yearly | own app | same endpoint |
| **E. Data aggregators** (Terra, Junction, Rook, Thryve, Spike, Sahha) | Yes | Yes | Yes | **300–500 $/month** | Enterprise products; most need their SDK inside your own native app | – | – | – |
| **F. Strava relay** (Apple Workout app → Strava, free API + webhooks) | **No sleep** | Yes, runs from the native Workout app only | Workout HR only | Free API (Strava subscription needed to register an app) | Solid for runs | 20 min | Strava app | webhook receiver |
| **G. Exist.io** | Yes | Yes | Yes | 6,99 $/month | Poll their API; no webhooks | 10 min | Exist app | poller |

Ruled out: PWA reading HealthKit directly (no web API exists, confirmed), Apple Health web API or
iCloud export (none in 2026), Swift Playgrounds (no HealthKit), TestFlight/AltStore (same 7- or
90-day expiry problems).

Bonus: **Speediance writes finished sessions to Apple Health**, so any Apple Health pipe (A, C,
D) carries the machine's strength sessions for free. That is phase 1 of spec item 10 without
the fragile unofficial CLI.

## 2. Recommendation

**Route A: Health Auto Export Premium, yearly (7,99 €), posting to one new endpoint.**

Why, in plain words:
- It is the only cheap route that carries all four things Ali cares about: sleep with stages,
  workouts with distance and heart rate, resting heart rate and HRV.
- No native code, no Mac dependency, no yearly Apple fee. The developer has maintained it for
  ~10 years and version 10 shipped this week.
- It supports a custom header, so the endpoint can be locked with the existing `APP_KEY`.
- The native app (D) costs 12× more per year and buys maybe half an hour of earlier delivery,
  because the locked-phone rule binds it too.
- Shortcuts (B) is free but already burned Ali once, and nothing in iOS 26 fixed the underlying
  problems.

What Ali must accept: data arrives after the first unlock of the morning, not at a fixed time.
For his day (wake 07:30, stretch, breathe, supplements) the sleep line should be there by the
time he reaches the supplements row. If it is not, one tap on the HAE home-screen widget syncs
it. HAE also has its own "Schedule reminder with Open & Sync button" if he wants a nudge.

Known HAE quirks I would design around:
- Resting heart rate is written by the Watch ~11 h after its timestamp, so "Since last sync"
  misses it. Use the "Default (yesterday + today)" window and upsert.
- One automation with every metric can drop Watch sleep segments. Use two automations: one for
  sleep + recovery, one for workouts.
- Background runs must finish in ~30 s. Keep metrics few, "Summarize" on, grouping by day.
- Store the raw payload for the first weeks; users report fields that differ from the docs.

Sleep "quality": Apple provides **no** sleep score. We show duration, awake time and deep sleep
instead. I would not invent a score.

## 3. Who does what

### Ali, click by click (~15 minutes, after I deploy the endpoint)
1. App Store → search "Health Auto Export" (JSON+CSV, by Lybron Sobers) → Get → open.
2. Grant Health access when asked. Turn on: Sleep Analysis, Workouts, Resting Heart Rate,
   Heart Rate Variability, Heart Rate. (Everything else off.)
3. Settings inside HAE → Premium → start the 7-day trial on the **yearly** plan (7,99 €).
4. Automations tab → + → "REST API".
   - Name: `ALI sleep`
   - URL: `https://ali-hub.vercel.app/api/health/ingest`
   - Add header: key `x-app-key`, value = the key shown in A L I → Settings → Apple Watch (copy button, signed-in only).
   - Format JSON · Summarize ON · group by day · Date range "Default".
   - Metrics: Sleep Analysis, Resting Heart Rate, Heart Rate Variability. Workouts OFF.
   - Frequency: every 1 hour. Save.
5. + again → "REST API" → name `ALI workouts`, same URL and header, Metrics none,
   **Workouts ON**, date range "Previous 7 days", every 1 hour. Save.
6. Tap "Run" on each automation once. Then open A L I → Settings → Apple Watch: it should say
   "Sleep received · today HH:MM" and "Workouts received".
7. iPhone Settings → Apps → Health Auto Export → Background App Refresh ON. Keep Low Power Mode off overnight.
8. Long-press the home screen → Edit → Add Widget → Health Auto Export → "Automations" (small).
   This is the one-tap "sync now" fallback and, per the developer, keeps background runs alive.
9. Watch side: wear it at night, charged above ~30 %, "Track Sleep with Apple Watch" on
   (Watch app → Sleep). Stages need a Sleep Focus schedule or at least Sleep Focus on.

Before the endpoint exists Ali can already do steps 1–3 and 7–9.

### What I build (rough size, one working day)
1. **`POST /api/health/ingest`** — accepts the HAE envelope, checks `x-app-key`, upserts:
   sleep → `sleep_entries` (existing table, one row per date, stages + new `resting_hr`,
   `hrv_ms` columns); workouts → new table `health_workouts` (`hk_id` unique, type, start, end,
   duration, distance_km, kcal, avg/max HR, source). Raw payload kept for 30 days. ~200 lines.
   Proxy public prefix + migrate route additions. Old `/api/sleep/ingest` and
   `/api/workouts/run-ingest` removed (the first is public with no key today).
2. **`GET /api/health/summary`** — last 7 nights, last 10 workouts, latest resting HR / HRV
   with 7-day trend, last-received stamps. ~80 lines. Read through `useCached`, so it paints
   instantly and never spins.
3. **Today** — see §4. ~120 lines.
4. **Train** — Watch workouts in "Recent" and a two-number recovery line. ~60 lines.
5. **Settings → Apple Watch card** — status stamps, copy-key button, the 9 steps folded.
   ~80 lines.
6. Widget JSON: one optional `sleep` string ("7h20"). ~10 lines, keeps the JSON tiny.
No new dependency. Spec §7c item 5 and CLAUDE.md updated.

## 4. What Ali would see (phone first, small)

- **Today, mornings only (04–12):** one "Last night" line at the top of the Today card, above
  the routine rows: `7 h 20 · 23:41 → 07:05 · deep 1 h 10 · awake 25 min`. Below it a
  seven-dot row, one dot per night, height = hours. Before the sync lands it shows
  `Last night · —` in muted ink (no spinner). After 12:00 the line folds away. It never counts
  toward the streak.
- **Today, Train row:** when a Watch workout exists for today the informational Train row
  reads `Run 5.2 km · 28:10` or `Strength 42 min · Watch`; the KB Hour logic is untouched.
- **Train hub:** Watch workouts appear in "Recent" with a small "Watch" tag; a one-line
  "Recovery" strip under the weekly bests: `Resting 52 · HRV 48 ms · ↑ vs last week`. Hidden
  when there is no data.
- **Settings → Apple Watch:** `Sleep · received today 07:52` / `Workouts · received yesterday`,
  copy-key button, "Set up" fold with the steps above. If nothing arrived for 3 days the tail
  turns to the warn colour with "Open Health Auto Export and tap Run".
- **Archived `/sleep` page:** left as is (it will start filling again from the same table).

## 5. Other next steps (spec §7c), for parallel thinking

| Item | State | What is needed from Ali |
|---|---|---|
| 10 Speediance | waiting on Ali | Decide the machine program. If sessions are logged to Apple Health, this pipe already carries them; the unofficial CLI can stay unbuilt. |
| 13 Exercise demo animations | parked, ~15 $ one-time (GymVisual) | A yes/no on paying. |
| 11 Reels knowledge hub | waiting on Apify decision | Try the free Apify credit or drop it. |
| 9 Flo cycle awareness | don't build yet | Only a go plus the cycle start date. |
| 8 Word bank revival | optional, one-line restore | A yes/no. |
| Hygiene | ready when told | Remove the two dead ingest endpoints (one is public with no key); Settings → App card still says 2026-09-07. |
