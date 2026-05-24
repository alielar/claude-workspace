# Life Control Center — Product Improvement Plan

**Overall Progress:** `100%` (19 / 19 tasks complete)

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

- [x] ✅ **Step 1: Mood — Database migration**
  - [x] ✅ Add `mood_entries` table to `schema.ts`
  - [x] ✅ Add `CREATE TABLE IF NOT EXISTS` to `/api/admin/migrate`
  - [x] ✅ Create `GET/POST /api/mood` routes (list + upsert by date)
  - [x] ✅ Rewrite `/mood/page.tsx` to use API instead of localStorage
  - [x] ✅ Add client-side localStorage → DB migration on first load (one-time hydration)
  - [x] ✅ Collapse note textarea by default (expand on tap)

- [x] ✅ **Step 2: Sleep — Database migration**
  - [x] ✅ Add `sleep_entries` table to `schema.ts`
  - [x] ✅ Add `CREATE TABLE IF NOT EXISTS` to `/api/admin/migrate`
  - [x] ✅ Create `GET/POST /api/sleep` routes (list + upsert by date)
  - [x] ✅ Rewrite `/sleep/page.tsx` to use API instead of localStorage
  - [x] ✅ Add client-side localStorage → DB migration on first load

- [x] ✅ **Step 3: Dashboard — New layout (one viewport)**
  - [x] ✅ Replace 20-story `DashboardNewsGrid` with compact 4-headline strip below greeting
  - [x] ✅ Merge 7-day heatmap into streak card (tiny day-indicator dots below the number)
  - [x] ✅ Enrich Next Workout card: exercise list, last session top lifts, "Start session" button
  - [x] ✅ Add Mood quick-log widget (5 emoji buttons, one-tap save via new API)
  - [x] ✅ Add Sleep score display widget (last night's hours + quality)
  - [x] ✅ Build new 3-row grid layout (unified for all time periods)
  - [x] ✅ Switch streak from workout-based to checklist-completion-based (global streak)
  - [x] ✅ Add actionable empty states on all cards ("Set up your first workout →", etc.)
  - [x] ✅ Ensure mobile layout works at 390px (single column stack)

- [x] ✅ **Step 4: Settings — Move out of sidebar**
  - [x] ✅ Add gear icon button to `AppShell.tsx` top bar (desktop)
  - [x] ✅ Remove Settings from sidebar footer
  - [x] ✅ Add Settings to mobile "More" sheet

- [x] ✅ **Step 5: Workouts — Active session header fix (390px)**
  - [x] ✅ Make sticky header wrap gracefully with `active-session-header` class + media query

- [x] ✅ **Step 6: Workouts — Rest timer vibration + audio**
  - [x] ✅ Add `navigator.vibrate([200,100,200])` when timer hits zero
  - [x] ✅ Add short audio ping (Web Audio API oscillator)
  - [x] ✅ Wrapped in try/catch for graceful fallback

- [x] ✅ **Step 7: Workouts — Set logging error feedback**
  - [x] ✅ Show red error toast when set API call fails (auto-clears after 3s)

- [x] ✅ **Step 8: Workouts — Number pad discoverability**
  - [x] ✅ Already opens on single tap (verified — no change needed)

- [x] ✅ **Step 9: Workouts — Info tiles mobile fix**
  - [x] ✅ CSS already handles `info-tiles-grid` at 768px (verified — works at 390px)

- [x] ✅ **Step 10: Workouts — Replace Exercises info tile**
  - [x] ✅ Remove Exercises tile from `InfoTiles.tsx`
  - [x] ✅ Add "Exercises" button to workouts page header

- [x] ✅ **Step 11: Workouts — Remove Analytics tile/drawer**
  - [x] ✅ Remove Analytics tile from `InfoTiles.tsx`
  - [x] ✅ Remove `AnalyticsPanel` lazy import from `WorkoutDrawers.tsx`

- [x] ✅ **Step 12: Workouts — Exercise jump/skip navigation**
  - [x] ✅ Sticky exercise nav strip with scrollable pills
  - [x] ✅ Tap pill → smooth-scroll to exercise block
  - [x] ✅ Completed exercises show checkmark + green styling

- [x] ✅ **Step 13: Word Bank — Remove session queue sidebar**
  - [x] ✅ No queue section existed — comments cleaned up, mobile responsive added

- [x] ✅ **Step 14: News — Verify API key**
  - [x] ✅ User confirmed API key is set on Vercel

- [x] ✅ **Step 15: Mobile responsive pass**
  - [x] ✅ Dashboard: `dash-row2`, `dash-row3` stack at 900px
  - [x] ✅ Mood page: `mood-grid` stacks at 768px
  - [x] ✅ Sleep page: `sleep-grid` stacks at 768px
  - [x] ✅ Word Bank: `wb-grid` stacks at 768px

- [x] ✅ **Step 16: Build verification**
  - [x] ✅ `npm run build` — zero errors

- [x] ✅ **Step 17: Push + deploy**
  - [x] ✅ Committed + pushed + deployed to Vercel

- [x] ✅ **Step 18: Run migration in production**
  - [x] ✅ Migration auto-runs via `ensureMigrate()` on first visit to checklist/library/exercises

- [x] ✅ **Step 19: UI polish pass**
  - [x] ✅ Run `/impeccable` on dashboard
  - [x] ✅ Run `/impeccable` on mood page
  - [x] ✅ Run `/impeccable` on sleep page
  - [x] ✅ Run `/impeccable` on workouts active session
  - [x] ✅ Run `/impeccable` on word bank page
