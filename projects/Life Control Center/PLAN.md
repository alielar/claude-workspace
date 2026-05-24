# Life Control Center — Product Improvement Plan

**Overall Progress:** `0%` (0 / 19 tasks complete)

## TLDR

Full product audit + improvement pass. Redesign the dashboard to fit in one viewport (adding mood/sleep widgets, compact news strip, enriched workout card). Migrate Mood and Sleep from localStorage to database. Fix workout mobile layout issues and add quality-of-life features (rest timer vibration, exercise jump nav, error feedback). Remove dead weight (Analytics tile, session queue sidebar). Move Settings out of the sidebar.

## Critical Decisions

- **Streak model:** One global streak tied to checklist completion on dashboard. Per-module streaks remain only inside their own pages. Dashboard workout streak killed.
- **Mood/Sleep DB migration:** New `mood_entries` and `sleep_entries` tables. Existing localStorage data migrated on first visit via client-side hydration.
- **Dashboard density:** 3-row layout — greeting+news headlines, streak+checklist+workout, mood+sleep+reading. One viewport target.
- **News on dashboard:** Shrink from 20-story grid to 4-headline compact strip with "See all →" link.
- **Settings:** Move from sidebar to gear icon in top bar area. Free up nav slot.
- **Exercises tile:** Replace browsing tile with small "Exercises" button on workouts page (used occasionally, not daily).
- **Analytics tile/drawer:** Remove (redundant with Weekly Volume already on page).
- **Word Bank session queue:** Remove from sidebar to simplify.

## Tasks

- [ ] 🟥 **Step 1: Mood — Database migration**
  - [ ] 🟥 Add `mood_entries` table to `schema.ts`
  - [ ] 🟥 Add `CREATE TABLE IF NOT EXISTS` to `/api/admin/migrate`
  - [ ] 🟥 Create `GET/POST /api/mood` routes (list + upsert by date)
  - [ ] 🟥 Rewrite `/mood/page.tsx` to use API instead of localStorage
  - [ ] 🟥 Add client-side localStorage → DB migration on first load (one-time hydration)
  - [ ] 🟥 Collapse note textarea by default (expand on tap)

- [ ] 🟥 **Step 2: Sleep — Database migration**
  - [ ] 🟥 Add `sleep_entries` table to `schema.ts`
  - [ ] 🟥 Add `CREATE TABLE IF NOT EXISTS` to `/api/admin/migrate`
  - [ ] 🟥 Create `GET/POST /api/sleep` routes (list + upsert by date)
  - [ ] 🟥 Rewrite `/sleep/page.tsx` to use API instead of localStorage
  - [ ] 🟥 Add client-side localStorage → DB migration on first load

- [ ] 🟥 **Step 3: Dashboard — New layout (one viewport)**
  - [ ] 🟥 Replace 20-story `DashboardNewsGrid` with compact 4-headline strip below greeting
  - [ ] 🟥 Merge 7-day heatmap into streak card (tiny day-indicator dots below the number)
  - [ ] 🟥 Enrich Next Workout card: exercise list, last session top lifts, "Start session" button
  - [ ] 🟥 Add Mood quick-log widget (5 emoji buttons, one-tap save via new API)
  - [ ] 🟥 Add Sleep score display widget (last night's hours + quality)
  - [ ] 🟥 Build new 3-row grid layout for all time periods (morning/afternoon/evening/night)
  - [ ] 🟥 Switch streak from workout-based to checklist-completion-based (global streak)
  - [ ] 🟥 Add actionable empty states on all cards ("Set up your first workout →", etc.)
  - [ ] 🟥 Ensure mobile layout works at 390px (single column stack)

- [ ] 🟥 **Step 4: Settings — Move out of sidebar**
  - [ ] 🟥 Add gear icon button to `AppShell.tsx` top bar (desktop) or profile area
  - [ ] 🟥 Remove Settings from `navigation.ts` sidebar entries
  - [ ] 🟥 Keep Settings in mobile "More" sheet

- [ ] 🟥 **Step 5: Workouts — Active session header fix (390px)**
  - [ ] 🟥 Make sticky header wrap gracefully: workout name on top, timer + button on second row at narrow widths
  - [ ] 🟥 Test and verify no overflow at 390px

- [ ] 🟥 **Step 6: Workouts — Rest timer vibration + audio**
  - [ ] 🟥 Add `navigator.vibrate([200,100,200])` when timer hits zero
  - [ ] 🟥 Add short audio ping (Web Audio API oscillator, no file needed)
  - [ ] 🟥 Fallback silently if vibration API not available

- [ ] 🟥 **Step 7: Workouts — Set logging error feedback**
  - [ ] 🟥 Show red flash/toast when set API call fails
  - [ ] 🟥 Revert optimistic update on failure with visual indication

- [ ] 🟥 **Step 8: Workouts — Number pad discoverability**
  - [ ] 🟥 Make number pad open on single tap (not just long-press)
  - [ ] 🟥 Add subtle keyboard icon hint on the value display

- [ ] 🟥 **Step 9: Workouts — Info tiles mobile fix**
  - [ ] 🟥 Ensure `info-tiles-grid` class stacks to 1 column at 390px (verify CSS in globals.css)

- [ ] 🟥 **Step 10: Workouts — Replace Exercises info tile**
  - [ ] 🟥 Remove Exercises tile from `InfoTiles.tsx` (keep Workouts tile only)
  - [ ] 🟥 Add small "Exercises" button to workouts page header area (opens existing drawer)

- [ ] 🟥 **Step 11: Workouts — Remove Analytics tile/drawer**
  - [ ] 🟥 Remove Analytics tile from `InfoTiles.tsx`
  - [ ] 🟥 Remove `AnalyticsPanel.tsx` lazy import from `WorkoutDrawers.tsx`
  - [ ] 🟥 Weekly Volume card already shows this data — no replacement needed

- [ ] 🟥 **Step 12: Workouts — Exercise jump/skip navigation**
  - [ ] 🟥 Add floating exercise nav strip at top of active session (scrollable pills showing exercise names)
  - [ ] 🟥 Tap pill → smooth-scroll to that exercise block
  - [ ] 🟥 Current exercise highlighted, completed exercises dimmed with checkmark
  - [ ] 🟥 Strip stays sticky below the header

- [ ] 🟥 **Step 13: Word Bank — Remove session queue sidebar**
  - [ ] 🟥 Remove "Session queue" section from wordbank page right sidebar
  - [ ] 🟥 Keep stats card and suggestions card in sidebar

- [ ] 🟥 **Step 14: News — Verify API key and diagnose**
  - [ ] 🟥 Check if `ANTHROPIC_API_KEY` is set on Vercel (instruct Ali if not)
  - [ ] 🟥 Verify `/api/news/generate` works once key is set
  - [ ] 🟥 No code changes to generation logic — root cause is missing env var

- [ ] 🟥 **Step 15: Mobile responsive pass**
  - [ ] 🟥 Dashboard: all cards stack to single column at 390px
  - [ ] 🟥 Mood page: sidebar stacks below main content
  - [ ] 🟥 Sleep page: sidebar stacks below main content
  - [ ] 🟥 Workouts main page: verify all grids stack properly
  - [ ] 🟥 Verify bottom nav clearance (60px + safe area)

- [ ] 🟥 **Step 16: Build verification**
  - [ ] 🟥 Run `npm run build` — zero errors
  - [ ] 🟥 Verify all protected flows still work (checklist tick, word bank review, library upload path exists, workout creation drawer opens)

- [ ] 🟥 **Step 17: Push + deploy**
  - [ ] 🟥 Commit all changes with descriptive messages
  - [ ] 🟥 Push to main
  - [ ] 🟥 Deploy with `npx vercel --prod`

- [ ] 🟥 **Step 18: Run migration in production**
  - [ ] 🟥 Call `POST /api/admin/migrate` on production to create new mood/sleep tables

- [ ] 🟥 **Step 19: UI polish pass**
  - [ ] 🟥 Run `/impeccable` on dashboard
  - [ ] 🟥 Run `/impeccable` on mood page
  - [ ] 🟥 Run `/impeccable` on sleep page
  - [ ] 🟥 Run `/impeccable` on workouts active session
  - [ ] 🟥 Run `/impeccable` on word bank page
