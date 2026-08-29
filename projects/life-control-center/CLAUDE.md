@AGENTS.md

---

# Control Center

> Last updated: 2026-08-30 (Phase 6). Read `CONTROL_CENTER_SPEC.md` first — it is the product brief and phase plan. This file is the engineering map.

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
src/app/(app)/stretch     guided stretching timer (16 moves, 30/10, wake lock, voice + beeps)
src/app/(app)/train       Train tab: next workout, weekly bests, recent · /train/w1 AMRAP · /train/w2 sets
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
- `store.ts` — `useCached(key, fetcher)`: paints the phone's saved copy instantly, refreshes in the background, `setData` for optimistic edits. Backed by localStorage (swap for IndexedDB in one file if a module outgrows it).
- `outbox.ts` — `sendOrQueue(...)`: writes go straight to the server; if offline they queue and replay in order on reconnect. Entries have a `dedupeKey` so repeated taps collapse to the final state. **Every endpoint used through the outbox must be idempotent** (send the desired final state, never "toggle").
- `SyncOutbox` (in AppShell) replays on open / online / foreground and fires `cc:outbox-flushed`.

### Service worker (`public/sw.js`, registered by `SwRegister`)
- `/_next/static/*` cache-first · page navigations stale-while-revalidate · `GET /api/*` network-first (3s) then cache · `/offline` fallback.
- Bump `VERSION` in `sw.js` when cache behaviour changes. Settings → "Update app" clears caches and reloads.

### Theme
- Tokens in `globals.css` `:root` (dark). Light values under `:root[data-theme="light"]` and `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`.
- `src/lib/theme.ts` reads/writes `localStorage["cc-theme"]`; the root layout applies it before first paint.
- **Never hardcode `rgba(255,255,255,…)` or `#E8E8F0` in new UI** — use `--fill-1/2/3`, `--ink*`, `--line*`, `--bg-chrome`.

### Routine engine (Phase 2)
- Routine steps, habits and regular items are all **checklist items** with a `kind`: `routine` (counts toward the day's streak), `habit` (being built — own streak, not counted until promoted), `manual`. Promotion = set `kind` to `routine` in the editor.
- Built-in steps carry a stable `routineKey` and are seeded once by `GET /api/checklist` from `ROUTINE_SEED` in `src/lib/checklist/types.ts` (stretch, breathe, supp-am, supp-pm, read). Never seed by title.
- Today shows: NOW (this part of day + anytime) · Still open (earlier parts) · Building (habits in their part) · Up next (next part only — evening items stay hidden in the morning) · Done · News.
- Stretch/breathe rows get an action button (`/stretch`, or the YouTube link opening externally). Finishing the timer ticks the item via the outbox.
- `src/lib/routine/stretching.ts` holds the movement list/timings; `cues.ts` the beep/vibration/voice cues (AudioContext must be armed from a tap).
- Breathing pacer (replacing the video) is a planned drop-in: same `breathe` item, add a `/breathe` page and switch `routineAction`.

### Train (Phase 3 — kettlebell era)
- Tables `kb_workouts` (two templates per user, `exercises` JSON, `assignedDays` reserved for a future fixed schedule) and `kb_sessions` (`clientId` unique → offline replays upsert). Kettlebell weight is `user_settings.kettlebell_kg` (12 → 16 later, changed in Settings).
- `src/lib/train/types.ts` — defaults from spec §4.2, ISO-week helpers, `weeklyBests`, `numberToBeat` (last week's best, else most recent earlier week), `nextWorkoutKey` (alternate W1/W2).
- `src/lib/train/useTrain.ts` — cached templates + overview, active session persisted in localStorage on every tap, `saveSession` through the outbox.
- `/train` hub · `/train/w1` AMRAP game (whole middle = +1 round, 700 ms double-tap guard, undo, pace projection, record flash, no pause — it's a race) · `/train/w2` straight sets with set bubbles, sticky rest bar, inline rep/set/weight editor (`RepEditor`).
- Today shows a virtual "Train" row from today's `kb_sessions` (source `workout`): informational, **never counted** toward the daily streak.
- Old gym system stays at `/workouts` (archive).

### Books (Phase 4 — physical reading list)
- Table `reading_queue`; seeded once from `BOOK_SEED` in `src/lib/books/types.ts` (matched by `slug`, researched editions + verified cover URLs). Custom books get `slug = "c:<clientId>"` so offline replays of the add never duplicate.
- Status `queue | reading | finished`, one book "reading" at a time (starting another sends the current one back to the queue). Covers: Open Library by ISBN (`coverByIsbn`), Google Books for the one book Open Library lacks.
- `src/lib/books/useBooks.ts` — cached list, optimistic status/order/add/remove through the outbox. Today reads the current book from the cache only (`Reading: <title>` under the read habit) — no extra request on the home screen.
- Reading is still the `read` **habit** on Today; `/books` is just the shelf. Old `/library` (PDF reader + notes) stays archived.

### To-do (Phase 5)
- Table `todos`; every write is `PUT /api/todos` with the **full task** keyed by a phone-generated `clientId` (upsert, last-writer-wins on `updatedAt`, soft `deleted`) — replay-safe from the outbox.
- `src/lib/todo/types.ts` — `parseQuickAdd()` (tomorrow/fri/weekend/next week/15/9/10am/#project/!!/someday), `bucketOf()` (overdue · today · evening · upcoming · anytime · someday), `badgeCount()`.
- `src/lib/todo/useTodos.ts` — cached list, optimistic upsert, and it sets the **home-screen badge** (`navigator.setAppBadge`) to the count due today/overdue. Reminders are due date + time shown in the app and the badge; push notifications are Phase 7.
- Today shows a "To-do" card with up to 4 tasks due today/overdue (evening tasks wait until the evening); tick inline.
- Design borrowed: Things (Today/Evening/Anytime/Someday), Todoist (one-line natural-language quick add), TickTick (one-tap "→ tomorrow" defer). Deliberately no sub-tasks, filters or databases.

### News (Phase 6 upgrade)
- Brief = RSS stories (5 per interest) + YouTube videos (2 per interest) from `YT_CHANNELS` in `src/lib/news/youtube.ts` (public channel Atom feeds, no API key). Enabled channels live in `user_settings.news_channels` (JSON array; null = all) — toggles in Settings.
- `relevanceScore()` marks the best-matching story of each interest `featured` → "Worth your time" on News and the headlines on Today. "World Cup" is in `EXCLUDE_KEYWORDS` and never appears (spec §4.6).
- Football interest = Real Madrid + Morocco national team (keywords in `INTEREST_KEYWORDS`). Video links open the YouTube app (`target="_blank"`).
- Generated by the 06:00 UTC cron (`/api/news/cron`), cached in `news_briefs`; News renders the phone's copy first.

### Day / time
- Everything runs on **Europe/Madrid**. Use `src/lib/checklist/day.ts`: `checklistToday()` (before 04:00 still counts as yesterday), `dayPart()` → morning 04–12, afternoon 12–21, evening 21–04 (Ali's clock, spec §8a).

### Auth
- `src/lib/auth.ts` is a stub: `auth()` always resolves to the one user. API routes still guard `if (!session?.user?.id) return 401` so a real login can be added later (spec Phase 7).

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
