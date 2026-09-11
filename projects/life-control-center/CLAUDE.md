@AGENTS.md

---

# A L I (Control Center)

> App name on the phone is **A L I** (picked 2026-08-30, after a brief stop at "Helm"; manifest + iOS title + icon in `src/lib/appIcon.tsx` — white A, violet sun rising behind the crossbar). The repo, spec and this file keep "Control Center" as the project name. Deferred work lives in the spec §7c — read it before proposing new features.

> Last updated: 2026-09-11. Read `CONTROL_CENTER_SPEC.md` first — it is the product brief and phase plan. This file is the engineering map.

## 1. What this is

Ali's private daily dashboard, used on an **iPhone, installed as a PWA**, every day. Single user, no login (deliberate for now — see spec §8a). Deployed on Vercel.

**The rebuild is a convenience problem first.** Phone first, instant open, works offline, dark + light, few sections. If a feature makes the app slower or heavier on the phone, cut the feature.

**Stack:** Next.js 16 (App Router, see AGENTS.md), Drizzle ORM + Turso (libSQL), Tailwind v4 utilities are available but the design system is hand-written CSS in `globals.css` + inline styles. Anthropic API (`claude-haiku-4-5-20251001`) for the few AI features. Vercel cron.

## 2. Acceptance gates (every phase, spec §3)

1. Phone first — thumb-reachable actions, ≥44px tap targets, single column on the phone.
2. Installable + offline — service worker, local-first data, never a hanging spinner.
3. Fast — usable screen under ~1.5s on a cold open; render the local copy first, refresh after.
4. Dark and light — follows the phone by default, manual override in Settings.
5. Simple — five tabs (Today · Train · To-do · News · Settings). Books and Stretch are reached from Today, not tabs.
6. Links open externally — `target="_blank" rel="noopener noreferrer"`.

## 3. Architecture

### Screens
```
src/app/(app)/today       home screen — what to do right now (client, local-first)
src/app/(app)/stretch     guided stretching timer (21 moves in 4 blocks, per-move 20-50s + 10s rests, 14:55, wake lock, voice + beeps)
src/app/(app)/podcast     morning-brief full-screen player (chapters, synced captions, speed, lock-screen controls) — reached from the Today/News launcher card. Script rules in `src/lib/podcast/generate.ts` (2026-09-11): friend-explaining tone, plain words, bridges between chapters, ~5 min guide / 4-10 min band, closes with "### For the day"; dates = absolute publish stamps + weekday-only rule + `relativeDayWords` lint with one corrective pass (the "yesterday" bug's root cause is documented there). Voice rate -8 %.
src/app/(app)/train       Train tab: ONE workout since 2026-09-10 — the KB Hour (/train/kb1, AMRAP 60 min, 13 KB moves × 5 reps) · weekly bests, recent
src/app/(app)/books       reading waiting list (Phase 4) — reached from Today's read row and Settings, not a tab
src/app/(app)/todo        to-do list (Phase 5) — quick add with natural-language dates, intent buckets, badge
src/app/(app)/news        daily brief: Worth your time · Videos · by interest (client, local-first, cron-generated)
src/app/(app)/settings    theme, news topics, install hint, archive, force-update
src/app/(app)/archive     index of archived modules
src/app/(app)/checklist   checklist editor (add/edit items) — reached from Today → Edit
src/app/offline           shown by the service worker only when nothing is cached
```
Archived (working, out of nav): `/workouts/**`, `/library/**`, `/knowledge`, `/wordbank`, `/mood`, `/sleep`, `/journal`.

### Local-first data (`src/lib/local/`)
- `store.ts` — `useCached(key, fetcher)`: paints the phone's saved copy instantly, refreshes in the background (on mount, on focus/foreground, after an outbox flush, and every 45 s while visible — cross-device sync), `setData` for optimistic edits. Backed by localStorage (swap for IndexedDB in one file if a module outgrows it).
- `outbox.ts` — `sendOrQueue(...)`: writes go straight to the server; if offline they queue and replay in order on reconnect. Entries have a `dedupeKey` so repeated taps collapse to the final state. **Every endpoint used through the outbox must be idempotent** (send the desired final state, never "toggle").
- `SyncOutbox` (in AppShell) replays on open / online / foreground and fires `cc:outbox-flushed`.

### Service worker (`public/sw.js`, registered by `SwRegister`)
- `/_next/static/*` cache-first · page navigations stale-while-revalidate · `GET /api/*` network-first (3s) then cache · `/offline` fallback.
- Bump `VERSION` in `sw.js` when cache behaviour changes. Settings → "Update app" clears caches and reloads.

### Theme — "Quiet Morning" (2026-08-30)
- Flat solid surfaces (no blur/grain/gradients), **system font** (`-apple-system…`, no web fonts), body 17px, card titles 15/600, captions 13–14 sentence case. Mono (`ui-monospace`) only for clocks/counters. One accent (`--violet`: #8B7CF0 dark / #5B4BD6 light) + semantic pos/warn/neg. `--accent-soft` for selected chips, `--on-accent` for text on the accent.
- Tokens in `globals.css` `:root` (dark). Light values under `:root[data-theme="light"]` and `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`.
- Timer/workout screens keep the big high-contrast numerals — the one place the app may shout.
- `src/lib/theme.ts` reads/writes `localStorage["cc-theme"]`; the root layout applies it before first paint. Four choices: Automatic · Light · Dark · **Night**; 20:00–07:00 Light/Automatic are overridden to Dark (`refreshThemeAttr` + `ThemeSunset` in AppShell) (`data-theme="night"` — warm dark palette, amber accent, low blue light; tokens under `:root[data-theme="night"]`).
- **Never hardcode `rgba(255,255,255,…)` or `#E8E8F0` in new UI** — use `--fill-1/2/3`, `--ink*`, `--line*`, `--bg-chrome`.

### Routine engine (Phase 2)
- Routine steps, habits and regular items are all **checklist items** with a `kind`: `routine` (counts toward the day's streak), `habit` (being built — own streak, not counted until promoted), `manual`. Promotion = set `kind` to `routine` in the editor.
- Built-in steps carry a stable `routineKey` and are seeded once by `GET /api/checklist` from `ROUTINE_SEED` in `src/lib/checklist/types.ts` (stretch, breathe, supp-am, supp-pm, read). Never seed by title.
- Today (redesigned 2026-09-08): Headlines strip (3 featured one-liners → News) · ONE "Today" timeline card merging the checklist, to-dos due today/overdue and calendar blocks (Still open + overdue on top → current part routine → timed entries in clock order → Anytime to-dos → next part → This evening folded in, dimmed until evening) · In the building (habits; the read row carries the current book — no separate Books card) · Done (one collapsed line). Calendar: two Google secret-iCal feeds (Settings → Calendars, `user_settings.calendar_feeds`) + the work calendar via the cloud routine → `POST /api/calendar/ingest` (every event incl. Ali's "Morning/Lunch/Evening block" placeholders). **Work day = at most TWO tickable rows** (2026-09-11): Morning = first meeting → Lunch block start, Afternoon = Lunch block end → Evening block start (`collapseWorkDay` in `src/lib/calendar/server.ts`; no lunch marker → split at 14:00). Ticks in `calendar_ticks` (idempotent; `calendar_cache` 10 min), personal events individual · `src/lib/calendar/server.ts`, needs `node-ical` (server-only).
- Vault (2026-09-08): `todos.wake_date` — any task/doc with a future wakeDate is hidden from every list/badge/nag (`isSleeping`), browsable in the Vault card at the bottom of /todo; on the wake day the reminders tick sends one "Back from the Vault" push and clears wakeDate (promotion).
- `/stretch` has a music library: 10 CC tracks (self-hosted in `public/music/`, list in `src/lib/routine/music.ts`; 2026-09-11: five Kai Engel epic-neoclassical pieces led by "Embracing the Sunrise", plus five other styles), preview + pick on the idle screen, plays looped at 0.35 vol during the session (pause/stop follows the timer). Movement names are spoken ONCE — at move start, never during rest.
- Stretch/breathe rows get an action button (`/stretch`, or the YouTube link opening externally). Finishing the timer ticks the item via the outbox.
- `src/lib/routine/stretching.ts` holds the movement list/timings; `cues.ts` the beep/vibration/voice cues (AudioContext must be armed from a tap).
- `/breathe` (2026-09-07) = technique picker + players. Picker: Wim Hof hero card (the daily) + 6 paced techniques from `src/lib/breathe/techniques.ts` (coherent, cyclic sighing, box, 4-7-8, alternate nostril, Kapalabhati), each row = goal · duration · honest 1-3 evidence dots; detail one tap deeper (pattern, copy, duration chips, Start). Generic player runs any step cycle (breath cues, hold countdowns, Kapalabhati snap-per-beat, nostril cues panned L/R); every finished session ticks the `breathe` item. Dizziness warning box (`DANGER_TEXT`) shows on Wim Hof + Kapalabhati before start. Wim Hof player: 3×30 breaths, 1:30 retention (tap ends it), 15 s recovery hold then an 8 s long exhale before the next round (Ali's deliberate deviation from the standard protocol, 2026-09-08 — never "fix" it back), hold tone = ONE constant oscillator (never two detuned — equal tones beat to silence) + 1 s watchdog against iOS audio interruptions, volume follows the slider; hold tones split into brainwave beats (6/10/40 Hz, headphones, some evidence) vs solfeggio lore, key `cc-breathe-freq`. Breath sound: 6 styles (waves/ocean/bowl/hum/chime/sweep) + volume, keys `cc-breathe-sound`/`cc-breathe-vol`. Rising bell on the last 10 breaths of each round (one scale step per breath, G4 → B5). 3-2-1 countdown after Start (all players). Hold tone chosen PER ROUND (key `cc-breathe-freqs`, JSON array of 3; legacy `cc-breathe-freq` migrates to all rounds). Exercise demos: none (Ali wants precise motion or nothing, spec §7c item 13). UI copy rule: no em dashes, use `·` or a period.

### Train (Phase 3 — kettlebell era)
- Tables `kb_workouts` (two templates per user, `exercises` JSON, `assignedDays` reserved for a future fixed schedule) and `kb_sessions` (`clientId` unique → offline replays upsert). Kettlebell weight is `user_settings.kettlebell_kg` (12 → 16 later, changed in Settings).
- `src/lib/train/types.ts` — one default workout (key `kb1` "KB Hour": every KB move from the old W1/W2/W3, 5 reps each, AMRAP 60), ISO-week helpers, `weeklyBests` (default key kb1), `numberToBeat`, `nextWorkoutKey` (always kb1). Old w1/w2/w3 DB rows + sessions kept for history, filtered out by `loadOrSeedWorkouts`.
- `src/lib/train/useTrain.ts` — cached templates + overview, active session persisted in localStorage on every tap, `saveSession` through the outbox.
- `/train` hub · `/train/kb1` AMRAP game (whole middle = +1 round, 700 ms double-tap guard, undo, pace projection, record flash, no pause — it's a race; `RepEditor` inline). The w1/w2/w3 pages were removed 2026-09-10.
- Today shows a virtual "Train" row from today's `kb_sessions` (source `workout`): informational, **never counted** toward the daily streak.
- Fixed days (opt-in, Settings → Training days): `kb_workouts.assignedDays` = `["mon","wed",…]`. Helpers `hasSchedule/scheduledFor/nextScheduled` in `types.ts`; `loadOrSeedWorkouts` in `src/lib/train/workoutRows.ts` (server). Overview carries `target` + `schedule`; the checklist workout row becomes "Rest day" on unplanned days.
- Old gym system stays at `/workouts` (archive).

### Books (Phase 4 — physical reading list)
- Table `reading_queue`; seeded once from `BOOK_SEED` in `src/lib/books/types.ts` (matched by `slug`, researched editions + verified cover URLs). Custom books get `slug = "c:<clientId>"` so offline replays of the add never duplicate.
- Status `queue | reading | finished`, one book "reading" at a time (starting another sends the current one back to the queue). Covers: Open Library by ISBN (`coverByIsbn`), Google Books for the one book Open Library lacks.
- `src/lib/books/useBooks.ts` — cached list, optimistic status/order/add/remove through the outbox. Today reads the current book from the cache only (`Reading: <title>` under the read habit) — no extra request on the home screen.
- Reading is still the `read` **habit** on Today; `/books` is just the shelf. Old `/library` (PDF reader + notes) stays archived.

### To-do (Phase 5)
- Table `todos`; every write is `PUT /api/todos` with the **full task** keyed by a phone-generated `clientId` (upsert, last-writer-wins on `updatedAt`, soft `deleted`) — replay-safe from the outbox.
- `src/lib/todo/types.ts` — `parseQuickAdd()` (tomorrow/fri/weekend/next week/15/9/10am/#project/!!/someday), `bucketOf()` (overdue · today · evening · tomorrow · week · nextWeek · nextMonth · later · someday — the last three fold by default on /todo and graduate upward automatically), `badgeCount()`.
- `src/lib/todo/useTodos.ts` — cached list, optimistic upsert, and it sets the **home-screen badge** (`navigator.setAppBadge`) to the count due today/overdue. Reminders are due date + time shown in the app and the badge; push notifications are Phase 7.
- `area: "work" | "personal" | "list"` (segments on /todo, remembered in `localStorage["cc-todo-area"]`; `badgeCount(todos, today, area?)`). `area="list"` = the **Docs** segment — kept notes/lists (spec §7c item 7; label renamed from "Lists" 2026-08-30): no buckets, pin = `priority>0`, search client-side, optional reminder via dueDate/dueTime → Today card + "📒" nag.
- Today shows a "To-do" card with up to 4 tasks due today/overdue (evening tasks wait until the evening); tick inline.
- Design borrowed: Things (Today/Evening/Anytime/Someday), Todoist (one-line natural-language quick add), TickTick (one-tap "→ tomorrow" defer, plus "Later" = native time wheel → same day). Deliberately no sub-tasks, filters or databases.
- Task sheet (2026-09-11): nag cadence is a native `<select>` (5/10/15/30/60 min), project is a folded one-line field, notes editor auto-grows and follows the caret (mirror-element measurement, `scrollCaretIntoView`) with H / • / 1. / ☐ / ✓ / indent tools; row preview renders `- [ ]` as ☐.

### News (Phase 6 upgrade)
- Brief = RSS stories (5 per interest) + YouTube videos (2 per interest) from `YT_CHANNELS` in `src/lib/news/youtube.ts` (public channel Atom feeds, no API key). Enabled channels live in `user_settings.news_channels` (JSON array; null = all) — toggles in Settings.
- `relevanceScore()` marks the best-matching story of each interest `featured` → "Worth your time" on News and the headlines on Today. "World Cup" is in `EXCLUDE_KEYWORDS` and never appears (spec §4.6).
- Football interest = Real Madrid + Morocco national team (keywords in `INTEREST_KEYWORDS`). Video links open the YouTube app (`target="_blank"`).
- Generated by the 06:00 UTC cron (`/api/news/cron`), cached in `news_briefs`; News renders the phone's copy first.

### Home-screen widget
- iOS has no PWA widgets. `GET /api/widget` returns a flat JSON (done/total, next 3 steps, to-dos due) and `public/widget.js` is a Scriptable script that draws it as a 2×2/4×2 widget in the Quiet Morning palette (2026-09-11: motivator top strip, two mono lines "N SOMEDAYS WAITING" / "20 MIN KILLS ONE", hidden at zero; lock-screen widgets have no frosted box, iOS paints them in its own vibrant material — colours cannot survive there). Keep the JSON tiny; the script has ~20 KB widget memory headroom.

### Day / time
- Everything runs on **Europe/Madrid**. Use `src/lib/checklist/day.ts`: `checklistToday()` (before 04:00 still counts as yesterday), `dayPart()` → morning 04–12, afternoon 12–21, evening 21–04 (Ali's clock, spec §8a).

### Auth
- `auth()` resolves to the one user. With `AUTH_REQUIRED=1` (+ GOOGLE_CLIENT_ID/SECRET, AUTH_SECRET) it needs the `ali_session` cookie (`src/lib/session.ts`, HMAC, 400 days) or the `x-app-key: APP_KEY` header (widget, curl). `src/proxy.ts` redirects pages to `/login` and 401s APIs; public paths listed there. Cron/pinger routes check their own secrets. Migrate via curl: add `-H "x-app-key: $APP_KEY"`.

### Reminders (push)
- `web-push` + VAPID env (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`). `src/lib/push/server.ts` `sendToUser`; `src/lib/push/client.ts` subscribe/unsubscribe. `/api/reminders/tick?key=APP_KEY` is hit every 5 min by cron-job.org (Vercel Hobby cron is daily-only); nags per list at each task's own cadence (`todos.nag_minutes` 5/10/15/30, null = 30) via `todos.last_nagged_at`; quiet 23:00–08:00.

### Database
- Drizzle + Turso. Client `src/db/index.ts`, schema `src/db/schema.ts` (only tables the code uses are declared; old tables stay in Turso untouched).
- No migrations CLI. `POST /api/admin/migrate` is idempotent (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`). Schema change = update `schema.ts` + add to the migrate route.

### AI
- `@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`, lazy-imported server-side only. ≤1 call/user/day per feature; cache in DB.

## 4. Archive — how to restore

Each archived module is one line away from the main navigation:

| Module | Pages | Restore |
|---|---|---|
| Gym workouts | `/workouts`, `/workouts/session/*` | add `{ href: "/workouts", label: "Gym", icon: "train" }` to `NAV` in `src/lib/navigation.ts` |
| Library & notes | `/library`, `/library/read/[id]`, `/knowledge` | add `{ href: "/library", … }` to `NAV` |
| Word bank | `/wordbank` | add `{ href: "/wordbank", … }` to `NAV` |
| Mood / Sleep / Journal | `/mood`, `/sleep`, `/journal` | add the href(s) to `NAV` |

Icons for new nav entries go in `src/components/Icon.tsx`. All API routes and tables behind these pages are still live. `/api/sleep/ingest` keeps accepting the Apple Shortcut (data is unreliable — don't trust it yet).

## 5. Rules

**Communication** — plain language, describe what the user sees, one-line "I decided X because Y" for judgement calls (spec §9).

**UI** — phone layout first, then widen. Every card: `.cc-card` + `.cc-card-head` + `.cc-card-body`. Use `—` or `.cc-skeleton` while loading, never spinners. No fixed pixel widths wider than `min(Npx, 100vw - 32px)`. No hover-only controls. Inputs ≥16px on the phone.

**Data** — optimistic updates with rollback; writes through `sendOrQueue`; reads through `useCached`. Idempotent endpoints with unique constraints + silent catch on duplicates.

**Performance** — no new dependency without a reason it can't be 30 lines of code. No client component that pulls a library into every route (`AppShell` must stay tiny). Check `next build` route sizes before shipping a phase.

**Read first** — `node_modules/next/dist/docs/` before any Next.js-specific code.

**Commits** — small, descriptive. After pushing, run `npx vercel --prod` (auto-deploy is not relied on).
