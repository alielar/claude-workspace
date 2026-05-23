@AGENTS.md

---

# Life Control Center — Session Handoff

> Last updated: 2026-05-21. Read this entire file before touching anything.

---

## 1. What This Is

**Life Control Center** is Ali's personal life dashboard — a single-user Next.js web app deployed on Vercel. It aggregates daily habits, workouts, reading, vocabulary, news, mood, sleep, finance, and journaling into one ambient dark-mode interface.

**Stack:**
- Next.js (App Router, latest — see AGENTS.md warning)
- Drizzle ORM + Turso (libSQL/SQLite) — no Prisma, no raw SQL in app code
- NextAuth v5 with Google OAuth
- Anthropic API (`claude-sonnet-4-6`) with `web_search_20250305` tool
- Vercel (hosting + cron jobs via `vercel.json`)
- Tailwind is NOT used — all styles are inline or via `globals.css` CSS custom properties

**Deployed at:** production Vercel URL (check Vercel dashboard). Local dev: `npm run dev`.

---

## 2. Design System — Source of Truth

**`design-system/mockups/`** is the authoritative reference for every page's layout and visual style.

| File | Module |
|------|--------|
| `Life Control Center Mockup.html` | Dashboard |
| `workouts.html` | Workouts |
| `news.html` | News Brief |
| `checklist.html` | Checklist |
| `words.html` | Word Bank |
| `library.html` | Library |
| `mood.html` | Mood |
| `sleep.html` | Sleep |
| `journal.html` | Journal |
| `finance.html` | Finance |
| `system.css` + `system.js` | Token reference |

**Rule: reproduce mockups pixel-faithfully. Do not invent layout changes.**

### Design Tokens (CSS custom properties in `globals.css`)

```
--bg / --bg-card / --bg-input
--ink / --ink-2 / --ink-3 / --ink-4 / --ink-5
--line / --line-hi / --line-strong
--violet / --cyan / --pos / --neg / --warn
--grad (purple→cyan gradient)
--f-sans / --f-mono
--easeOut
```

### Reusable CSS classes

```
.cc-card           — card container, dark bg, border, radius 16px
.cc-card-head      — card header: padding 14px 16px, flex, border-bottom (MUST USE — content must not be flush with borders)
.cc-card-body      — card body: padding 14px 16px
.cc-btn            — base button
.cc-btn-primary    — violet gradient button
.cc-pagetitle      — page header: h1 + .sub subtitle, flex row with action button
.grad-text         — purple→cyan gradient text via WebkitBackgroundClip
.num               — large number display
```

---

## 3. Architecture

### Auth & User Model
- Single-user personal app. In production it's always Ali's account.
- Auth: NextAuth with Google OAuth. Session available via `auth()` (server) or `useSession()` (client).
- Always guard routes with `if (!session?.user?.id) return 401`. Never hardcode a user ID.

### Database
- **Drizzle ORM** with **Turso** (libSQL/SQLite). Client in `src/db/index.ts`.
- Schema: `src/db/schema.ts` — single source of truth. When adding a column, update both the schema file AND the migrate route.
- No Drizzle migrations CLI is used. Instead: `POST /api/admin/migrate` — an idempotent endpoint with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` statements. Safe to call multiple times.
- **Call `/api/admin/migrate` from `useEffect` on any page that introduces new schema columns.**

### Timezone
- All "today" calculations use **Europe/Madrid** timezone.
- Standard helper (defined locally in each file that needs it):
  ```ts
  function todayMadrid(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  }
  ```

### Cron Jobs
- Defined in `vercel.json`. Currently: news brief generation at `0 6 * * *` (06:00 UTC).
- Vercel sends `Authorization: Bearer $CRON_SECRET` header on cron requests.

### AI Calls
- Use `@anthropic-ai/sdk`. Model: `claude-sonnet-4-6`.
- News uses `web_search_20250305` built-in tool for live web results.
- Limit to 1 Anthropic call per user per day where possible (cache results in DB).

### File Conventions
```
src/
  app/
    (app)/         — authenticated pages (layout wraps with sidebar)
    api/           — API routes
  components/      — shared React components
  db/
    index.ts       — Drizzle client
    schema.ts      — all table definitions
  lib/             — shared logic (auth, news generation, checklist helpers, SRS, etc.)
```

---

## 4. Module Status

| Module | Status | Notes |
|--------|--------|-------|
| **Dashboard** | ✅ Done | Server component, time-aware layout (morning/afternoon/evening/night), 5 data-wired cards: streak hero, news top-3, checklist interactive, 7-day heatmap, current book. |
| **Workouts** | ✅ Done | Full PPL program (Push/Pull/Legs/Core/Push-Up Skill), live workout logger with rest timer, set logging with RIR tracking, personal records (Epley 1RM), progression suggestions (AI), run log. Session seeding via `/api/workouts/seed`. |
| **News Brief** | ✅ Done | 4-column grid (Football / Geopolitics / Business / Tech & AI), 20 stories total, auto-generated on page load, archive drawer (30 days DB-only), 1hr refresh guard. Cron at 06:00 UTC generates for all users. Morocco politics required ≥1 story in Geopolitics column. Stories have `summary` (factual 3-4 sentences) + `keyPoints[]` (2-3 bullets) — NOT editorial "why it matters". 30-day DB retention pruning. |
| **Checklist** | 🔄 In Progress | **Steps 1+2 done:** DB columns (auto_source, color, notes), drawer redesign (emoji picker, 6 color swatches, time-of-day, manual/auto-tracked type selector), CkRow with color accent stripe + streak badge + AUTO badge. **Steps 3-8 pending** — see Active TODOs. |
| **Word Bank** | ✅ Done | SRS flashcard review (3-button: Again/Good/Easy), fill-in-the-blank mode, multi-language (en/fr/darija), AI-powered word suggestions via wordbank/suggestions, streak tracking. Step index stored in `interval` column (0–6 fixed intervals). |
| **Library** | ✅ Done | Book list with 12-book/year plan tracker, PDF reader (inline, page-by-page, pinch zoom), reading sessions logged to DB, per-book streak + reading stats, annotations with color coding, word lookup (highlight → define → save to Word Bank), book upload. |
| **Mood** | ⚠️ localStorage only | Full UI built (5-point scale, daily note, monthly heatmap, history). All data in localStorage — no backend yet. DB table not created. `autoCheck` hook for mood not wired. |
| **Sleep** | ⚠️ localStorage only | Full UI built (bedtime/wake pickers, quality score, weekly bars, debt tracking). All data in localStorage — no backend yet. DB table not created. |
| **Journal** | ⚠️ localStorage only | Full UI built (3-question nightly journal, history list, themes, yearly grid). Uses EB Garamond font for question text. All data in localStorage — no backend yet. DB table not created. `autoCheck` hook for journal not wired. |
| **Finance** | ⚠️ localStorage only | Full UI built (net worth hero, assets/liabilities table, 12-month chart, goals). All data in localStorage — no backend yet. DB table not created. |
| **Settings** | ✅ Done | Timezone and news preferences. Stored in `user_settings` table. |

---

## 5. DB Schema Summary

Tables in `src/db/schema.ts`:

**NextAuth:** `users`, `accounts`, `sessions`, `verification_tokens`

**Settings:** `user_settings` — timezone, news preferences

**Workouts:** `workout_programs`, `workout_sessions`, `exercises`, `set_templates`, `workout_logs`, `set_logs`, `personal_records`, `run_logs`

**News:** `news_briefs` — userId, date (YYYY-MM-DD), content (JSON string), createdAt

**Library:** `books`, `reading_progress`, `annotations`, `reading_sessions`, `pdf_blobs`

**Word Bank:** `word_bank_entries` — SM-2 fields kept but `interval` column repurposed as step index 0–6

**Checklist:** `checklist_items` (title, emoji, active, sort_order, time_of_day, auto_source, color, notes), `checklist_completions` (unique on item_id+user_id+date), `checklist_suggestions` (AI weekly habit ideas, status: pending/accepted/dismissed), `weekly_reviews` (AI pattern observations)

**Tasks / Goals:** `tasks`, `goals` — tables exist in schema, no UI yet

---

## 6. Active TODOs

### Checklist — Steps 3–8 (in order, wait for "continue" between each)

**Step 3: Per-item streaks verified**
- Streak badge already in `CkRow` using `item.streak` from API.
- API already computes `calcStreak` per item from `checklistCompletions`.
- Need to verify with real data after deploying steps 1+2. If badge shows, step 3 is done.

**Step 4: Overall completion streak**
- Add `overallStreak` field to `GET /api/checklist` response (consecutive days where all DB items were completed — use current item count as threshold).
- Change API response shape from `Item[]` to `{ items: Item[], overallStreak: number }`.
- Display `overallStreak` in the right panel hero stat area (e.g. a second stat under "Today's completion").
- Show screenshot after this step.

**Step 5: Auto-check integrations**
Wire `autoCheck(userId, source)` from `src/lib/checklist/autoCheck.ts` into:
- `POST /api/workouts/log` — after saving workout log, call `autoCheck(userId, 'workout')`
- `POST /api/library/sessions` — after saving reading session (already skips <1 min), call `autoCheck(userId, 'reading')` if `durationMinutes >= 5`
- `POST /api/wordbank/review` — after SRS review, call `autoCheck(userId, 'words')` (fires on every review; idempotent)
- Journal and Mood: not yet — those modules have no backend. Leave "SOON" badge in drawer.

**Step 6: Historical views**
- 7-day grid: API needs to return per-item completion history for the past 7 days (dates array or bool[7]). Update `GET /api/checklist` to include `last7` field per item.
- Monthly heatmap: calendar-style grid of current month, each day cell colored by completion % (all-done = full accent, 0% = empty, partial = faded).
- 30-day stats: "avg completion %" and "best streak" computed from completions history.

**Step 7: AI habit suggestions cron**
- New cron in `vercel.json`: Sunday 19:00 UTC → `POST /api/checklist/suggestions/cron`
- Anthropic call: analyze last 30 days of completion data, suggest 2-3 new habits with rationale and emoji
- Save to `checklist_suggestions` table with status='pending'
- UI card in checklist right panel: "This week's suggestions" with "Add this" → creates item, "Not now" → status='dismissed'
- Show screenshot after this step.

**Step 8: AI weekly pattern review**
- Combine with Step 7 cron (single Anthropic call that returns BOTH suggestions and a pattern observation paragraph)
- Save observation to `weekly_reviews` table
- UI card in right panel below suggestions: "Weekly insight" with the observation text
- Show screenshot after this step.

### Other pending work
- **Mood, Sleep, Journal, Finance backends:** Create DB tables + API routes + replace localStorage with DB persistence. Do not start until Steps 3-8 are done.
- **`autoCheck` for Journal/Mood:** Wire after those backends exist. Remove "SOON" badge from drawer source selector.

---

## 7. Rules & Conventions

**Communication:**
- Always use plain, everyday language. No technical jargon or slang.
- Describe issues in terms of what the user sees or experiences, not internal code details.

**Read first:**
- Read `node_modules/next/dist/docs/` before writing any Next.js-specific code. This version has breaking API changes.

**UI rules:**
- No direct DOM mutation. All state via React `useState` / `useReducer`.
- Use `—` or skeleton placeholders when data is loading, not spinners.
- Match `design-system/mockups/` exactly — do not invent new layouts.
- Every card header must use `.cc-card-head` class — content must not sit flush against borders.
- Use `cc-card-body` (or explicit `padding: "14px 16px"`) for card body content.

**Data rules:**
- All "today" dates in Europe/Madrid timezone via `todayMadrid()`.
- Optimistic UI updates with rollback on error (see checklist toggle pattern).
- Idempotent writes: use unique DB constraints + silent catch on duplicate errors.
- Schema change = update `src/db/schema.ts` + add `ALTER TABLE` to `src/app/api/admin/migrate/route.ts`.
- Call `POST /api/admin/migrate` in `useEffect` on pages that add new schema columns.

**API rules:**
- All API routes: check `session.user.id` and return 401 if missing.
- Never hardcode user IDs.
- Keep Anthropic calls to 1/user/day max. Cache results in DB.

**Commit rules:**
- Small, reviewable commits.
- Commit after each major step (Steps 3, 4, 5, etc.) with a descriptive message.
