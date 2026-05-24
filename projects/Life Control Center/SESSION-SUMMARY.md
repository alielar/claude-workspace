# Life Control Center — Session Summary

> Generated: 2026-05-24. Use this as context when starting a new chat.

## Current State

The app is **live in production** on Vercel. All changes below are deployed and running.

---

## What Was Done Today (8 commits)

### 1. Dashboard Crash Fix
- Dashboard was crashing because the `books` table was missing `started_at` and `finished_at` columns in production
- Added inline migration before querying + `.catch()` fallback on books query

### 2. News Brief — Full Rewrite
- **Before:** News only showed on `/news` page. Dashboard had a small "top 3 headlines" card that rarely worked.
- **Now:** Dashboard has a full 4-column news grid (Football, Geopolitics, Business, Tech & AI) at the bottom
- The grid is **self-contained** — it fetches and generates its own data client-side
- Shows skeleton placeholders while loading, error state with retry button if generation fails
- **Never returns null** — always renders something visible
- `maxDuration=60` added to `/api/news/generate` and `/api/news/cron` routes to prevent Vercel function timeouts
- Fixed timezone mismatch: dashboard now uses Madrid timezone for date queries (matching how briefs are stored)
- Daily cron at 06:00 UTC auto-generates the brief; dashboard also auto-generates on visit if none exists

### 3. Library — Vercel Blob PDF Upload
- **Before:** PDFs stored as base64 in SQLite (30MB limit, hit serverless body size limit)
- **Now:** Uses Vercel Blob for client-side upload (up to 500MB)
- Browser uploads directly to Vercel Blob, then saves the URL to the book record
- Legacy base64 PDFs still served via redirect from `/api/library/pdf/[bookId]`
- Relevant files:
  - `src/app/api/library/upload/route.ts` — token generation for blob upload
  - `src/components/library/UploadButton.tsx` — client-side upload component
  - `src/app/api/library/books/[id]/route.ts` — PATCH endpoint accepts `pdfKey`

### 4. Workout Data Loss Fix (Critical)
- **Root cause:** The migration endpoint (`/api/admin/migrate`) contained destructive `DELETE FROM` statements that wiped workout plans, exercises, and programs. These ran every time the Library page loaded (which called migrate in a `useEffect`).
- **Fix:** Commented out the destructive statements with a warning. Removed the auto-migrate call from the Library page.
- **Additional fix:** Workout plan persistence — the GET endpoint now falls back to any user program if the `isActive` boolean flag didn't persist correctly through libSQL. POST also does an explicit `isActive` update after insert.

### 5. Coach Cron Auth Fix
- **Before:** The weekly coach cron (`/api/workouts/coach-cron`) made a self-fetch to `/api/workouts/coach` which required browser auth → always got 401.
- **Now:** Generation logic extracted to `src/lib/workouts/generateCoach.ts`. Cron calls it directly. Coach POST route also uses the shared function with proper try/catch and error logging.

### 6. Dashboard — Wired to v3 Workout Data
- **Before:** Dashboard streak counter and 7-day heatmap read from legacy `workout_logs`/`workout_sessions` tables (v1). Showed stale/zero data.
- **Now:** Reads from `gym_sessions` (v3) — the actual table where workouts are logged. Streak, sparkline, heatmap, and week count are all accurate.

### 7. Dashboard — Next Workout Card
- New card shows the upcoming scheduled workout based on plan assigned days
- Shows "Today" (with gradient text) if today's workout isn't done yet, or the next scheduled day
- Displays target muscle tags
- Links to /workouts

### 8. Dashboard Layout Optimization
- Removed redundant NewsCard (the full grid at the bottom handles all news)
- Cleaned layout for all time periods (morning/afternoon/evening/night)
- Morning: Streak hero | Checklist + Next Workout + Reading | Heatmap
- Afternoon: Streak + Next Workout + Reading (top) | Checklist | Heatmap
- Evening: Checklist | Streak + Next Workout | Reading + Heatmap
- Deleted dead HamburgerMenu component

### 9. Other Cleanup
- Finance page removed
- Mood/Sleep/Journal UI trimmed
- Checklist: clickable URLs in notes
- Navigation updated

---

## Known Issues / Deferred Items

These were identified in a peer review but deferred (low risk for a single-user app):

| Issue | Severity | Status |
|-------|----------|--------|
| PDFs uploaded with `access: "public"` to Vercel Blob | Medium | Accepted — auth required to get the URL, single-user app |
| No unique constraint on `(user_id, date)` for `news_briefs` | Medium | Low risk — `ensureTodaysBrief` is idempotent per call |
| Upload token doesn't verify book ownership | Medium | Single-user app, auth required |
| `as any` on Anthropic beta messages API | Low | Can't fix until SDK adds types |
| Coach rate limit uses approximate Madrid midnight | Low | Fixed to use +02:00 offset |

---

## Architecture Quick Reference

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js App Router | Server + client components, no Tailwind (inline styles + CSS vars) |
| Database | Drizzle ORM + Turso | libSQL/SQLite, schema in `src/db/schema.ts` |
| Auth | NextAuth v5 | Google OAuth, single user |
| AI | Anthropic SDK | `claude-sonnet-4-6`, web search beta for news |
| Storage | Vercel Blob | PDF uploads (500MB max) |
| Hosting | Vercel | 3 crons: news (daily 6AM UTC), checklist suggestions (Sun 7PM UTC), coach (Mon 7AM UTC) |
| Migrations | `/api/admin/migrate` | Idempotent CREATE TABLE IF NOT EXISTS + ALTER TABLE. No Drizzle CLI. |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(app)/dashboard/page.tsx` | Dashboard server component — time-aware layout, all data queries |
| `src/components/dashboard/DashboardNewsGrid.tsx` | News grid — self-contained, auto-generates, never null |
| `src/lib/news/generateBrief.ts` | `ensureTodaysBrief()` — idempotent news generation |
| `src/lib/news-brief.ts` | `generateNewsBrief()` — Claude web search API call |
| `src/lib/workouts/generateCoach.ts` | Shared coach card generation (used by cron + manual) |
| `src/app/api/workouts/plans/route.ts` | Workout plan CRUD with isActive fallback |
| `src/app/api/admin/migrate/route.ts` | All DB migrations (destructive ones commented out) |
| `src/db/schema.ts` | Single source of truth for all tables |
| `src/app/api/library/upload/route.ts` | Vercel Blob upload token handler |

---

## What Needs Attention Next

1. **Verify news auto-generation works** — visit the dashboard and confirm the skeleton loads, then 20 stories appear after ~30 seconds. On subsequent visits, should be instant.
2. **Checklist auto-complete on workout** — already wired (`autoCheck("workout")` fires when a gym session is marked finished). Verify it works by finishing a workout and checking if the "Workout" checklist item auto-completes.
3. **Mood/Sleep/Journal** — still on localStorage, no backend. These are the next modules to wire up if desired.
4. **Finance** — page was removed. Decide if it should come back.
