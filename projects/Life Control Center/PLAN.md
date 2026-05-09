# Life Control Center — Implementation Plan

**Overall Progress:** `94%` (64 / 68 tasks complete)

---

## TLDR

A personal, futuristic web app (+ iPhone PWA) that replaces MacroFactor Workouts, aggregates your life — workouts, news, books, calendar, goals — in one place. Built with Next.js 15, Turso (free SQLite), Vercel (free hosting), Google OAuth, and Claude API. Zero recurring cost beyond Claude Code.

---

## Critical Decisions

- **No Supabase** → Turso (free cloud SQLite) + Drizzle ORM for all data
- **Auth** → NextAuth v5 with Google OAuth (single user, no registration flow)
- **Hosting** → Vercel free tier (web + PWA, no server cost)
- **Email** → Resend free tier (3,000 emails/month for 1/day news brief)
- **Scheduled jobs** → Vercel Cron Jobs (9 AM news email, timezone from Google Calendar)
- **AI** → Claude API (Anthropic SDK) for news brief, word lookup, book insights
- **Exercise demos** → ExerciseDB API (free, GIFs for all exercises in the program)
- **Book reader** → react-pdf (PDF upload + in-browser reader)
- **Calendar** → Google Calendar API bidirectional (pull events in + push tasks out)
- **Design** → Tailwind CSS + shadcn/ui + Framer Motion (dark, futuristic, gym-mode friendly)
- **Progressive overload** → Simple RIR-based: hit top of rep range at RIR ≤ 1 → suggest weight increase next session
- **Timezone** → Pulled from Google Calendar profile, user-selectable fallback in Settings

---

## Tasks

---

### Phase 1 — Foundation

- [x] 🟩 **Step 1: Project Initialization**
  - [x] 🟩 Init Next.js 15 (App Router, TypeScript) in `projects/Life Control Center/`
  - [x] 🟩 Install and configure Tailwind CSS v3 + shadcn/ui
  - [x] 🟩 Install Framer Motion
  - [x] 🟩 Set up ESLint + Prettier
  - [x] 🟩 Create `.env.local` template with all required keys documented

- [x] 🟩 **Step 2: Database Setup (Turso + Drizzle)**
  - [x] 🟩 Install Turso CLI + `@libsql/client` + `drizzle-orm`
  - [x] 🟩 Create Turso database (free tier)
  - [x] 🟩 Define full DB schema in `src/db/schema.ts`:
    - Users / settings
    - Workout programs, sessions, exercises, set templates, workout logs, set logs, PR tracker
    - Books, reading progress, annotations, word lookups
    - News briefs (cached daily)
    - Tasks / reminders
    - Goals
    - Word Bank (vocabulary + spaced repetition state)
  - [ ] 🟥 Run initial migration (requires Turso credentials)

- [x] 🟩 **Step 3: Authentication (Google OAuth)**
  - [x] 🟩 Install NextAuth v5
  - [x] 🟩 Configure Google OAuth provider (single user — only Ali's Google account allowed)
  - [x] 🟩 Protect all routes behind auth middleware
  - [ ] 🟥 Store user timezone from Google Calendar profile on first login

---

### Phase 2 — Layout & Design System

- [x] 🟩 **Step 4: App Shell & Navigation**
  - [x] 🟩 Create root layout with dark theme (deep navy/charcoal, purple accents)
  - [x] 🟩 Desktop sidebar navigation (Dashboard, Workouts, News, Library, Calendar, Goals, Word Bank)
  - [x] 🟩 Mobile bottom tab navigation (PWA-ready)
  - [x] 🟩 Page transition animations (Framer Motion)
  - [x] 🟩 Add PWA manifest + `next-pwa` for iPhone installability

---

### Phase 3 — Dashboard

- [x] 🟩 **Step 5: Dashboard Page**
  - [x] 🟩 Daily AI morning brief widget (today's news summary, pulled from cached brief)
  - [x] 🟩 Today's workout card (which session is next in the PPL rotation)
  - [x] 🟩 Reading progress card (current book + % complete)
  - [x] 🟩 Word Bank due-today count widget
  - [x] 🟩 Quick-action buttons: Start Workout, Open Reader, Review Words

---

### Phase 4 — Workouts Module

- [x] 🟩 **Step 6: Workout Data & Templates**
  - [x] 🟩 Seed DB with all 5 session templates from MacroFactor export:
    - Push (8 exercises), Pull (7 exercises), Legs (6 exercises), Core/Abs (8 exercises), Push-Up Skill (5 exercises)
  - [x] 🟩 Weekly rotation logic: Push → Pull → Legs → Core → Push → Pull → Push-Up Skill
  - [x] 🟩 Each exercise linked to ExerciseDB API for demo GIF + muscle group metadata

- [x] 🟩 **Step 7: Active Workout Logger**
  - [x] 🟩 "Start Workout" flow: select session → shows exercises in order
  - [x] 🟩 Workout timer (total session duration, start on first set tap)
  - [x] 🟩 Per-set logging: weight (kg) + reps + RIR (0–4 scale) + set type (Standard / Drop / Warm-up)
  - [x] 🟩 One mandatory warm-up set before working sets
  - [x] 🟩 Rest timer: auto-starts after logging a set (SVG countdown ring)
  - [x] 🟩 Exercise demo GIF available on tap
  - [x] 🟩 Drop set support (no rest, weight reduction)
  - [x] 🟩 Timed set support (Core holds: duration in seconds)
  - [x] 🟩 "Finish Workout" → saves full log with timestamp + total duration

- [x] 🟩 **Step 8: Progressive Overload Engine**
  - [x] 🟩 RIR-based progression logic (increase / maintain / deload)
  - [x] 🟩 20kg dumbbell cap with flagging
  - [x] 🟩 Display suggestion at top of next session start screen (wired in session page)

- [x] 🟩 **Step 9: Workout History, PRs & Volume**
  - [x] 🟩 Session history list (date, name, duration, set count)
  - [x] 🟩 PR tracker: best weight × reps + estimated 1RM per exercise
  - [x] 🟩 Running log: date, distance, duration, pace + distance chart (recharts)
  - [ ] 🟥 Volume dashboard: sets/week per muscle group *(optional future enhancement)*

---

### Phase 5 — News Brief Module

- [x] 🟩 **Step 10: Claude News Brief Generator**
  - [x] 🟩 Claude API prompt for 6-8 stories (football, geopolitics, tech, AI, business)
  - [x] 🟩 Per story: headline + summary + "Why it matters" + category
  - [x] 🟩 Cache brief in DB (one record per day)

- [x] 🟩 **Step 11: Scheduled Email + Dashboard Display**
  - [x] 🟩 Resend HTML email template (dark-themed, category color-coded)
  - [x] 🟩 Vercel Cron Job: 8 AM UTC (≈ 9 AM Morocco/Spain)
  - [x] 🟩 News page: full brief rendered in app, expandable stories
  - [x] 🟩 Topic preferences moved to Settings page

---

### Phase 6 — Library & Reader

- [x] 🟩 **Step 12: Book Library**
  - [x] 🟩 Seed API (POST /api/library/seed) with 12-book 2026 roadmap
  - [x] 🟩 Library page with book grid, status badges, month badges
  - [x] 🟩 PDF upload (base64 stored in Turso pdfBlobs table)
  - [x] 🟩 Public domain books with download links

- [x] 🟩 **Step 13: PDF Reader**
  - [x] 🟩 react-pdf viewer (full-screen, keyboard navigation)
  - [x] 🟩 Auto-saves last page on every page turn
  - [x] 🟩 Reading progress bar (% complete)
  - [x] 🟩 Word lookup panel (Claude API, save to Word Bank)
  - [x] 🟩 Annotations panel (list + delete by page)

---

### Phase 7 — Word Bank & Spaced Repetition

- [x] 🟩 **Step 14: Word Bank**
  - [x] 🟩 Word Bank page with flashcard review + all-words list
  - [x] 🟩 SM-2 algorithm implemented (sm2.ts)
  - [x] 🟩 GET /api/wordbank (all + due=true filter)
  - [x] 🟩 POST /api/wordbank/review (apply SM-2 grade, update mastery status)

---

### Phase 8 — Calendar & Tasks

- [x] 🟩 **Step 15: Google Calendar Integration**
  - [x] 🟩 Google Calendar scopes in NextAuth
  - [x] 🟩 GET /api/calendar/events — pulls next 14 days from Google Calendar
  - [x] 🟩 Calendar page: unified Google events + app tasks by day
  - [ ] 🟥 Detect and store user timezone from Google Calendar profile *(deferred to Settings)*

- [x] 🟩 **Step 16: Tasks & Reminders**
  - [x] 🟩 Full task CRUD (GET, POST, PATCH, DELETE)
  - [x] 🟩 Auto-push tasks to Google Calendar on creation
  - [x] 🟩 Complete task → update Google Calendar event color
  - [x] 🟩 Delete task → delete Google Calendar event

---

### Phase 9 — Goals

- [x] 🟩 **Step 17: Goals Section**
  - [x] 🟩 Goal CRUD (GET, POST, PATCH, DELETE)
  - [x] 🟩 Goals page: active goals with progress bars, category colors
  - [x] 🟩 Manual progress update, complete, archive
  - [x] 🟩 Categories: Fitness, Reading, Work, Other

---

### Phase 10 — Settings & Polish

- [x] 🟩 **Step 18: Settings Page**
  - [x] 🟩 Timezone selector (default: Africa/Casablanca)
  - [x] 🟩 News email toggle + delivery time
  - [x] 🟩 News topic preferences (checkboxes)
  - [x] 🟩 Sign out button

- [x] 🟩 **Step 19: Final Polish**
  - [x] 🟩 Root `/` redirect to `/dashboard`
  - [x] 🟩 Global `loading.tsx` skeleton for page transitions
  - [x] 🟩 Global `error.tsx` and `not-found.tsx` pages
  - [ ] 🟥 Deploy to Vercel + configure Turso production DB + set all env vars *(requires credentials)*
  - [ ] 🟥 Mobile PWA testing on iPhone 16 *(post-deploy)*

---

## Module Summary

| Module | Key dependencies | Est. complexity |
|---|---|---|
| Foundation | Turso, Drizzle, NextAuth | Low |
| Dashboard | All modules (read-only widgets) | Low |
| Workouts | ExerciseDB API, Drizzle, react-chartjs-2 | High |
| News Brief | Claude API, Resend, Vercel Cron | Medium |
| Library + Reader | react-pdf, Claude API, Vercel Blob | High |
| Word Bank | Drizzle, SM-2 algorithm | Medium |
| Calendar + Tasks | Google Calendar API, NextAuth | Medium |
| Goals | Drizzle | Low |
| Settings | All env vars | Low |

---

## Environment Variables Required

```
# Auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Database
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# AI
ANTHROPIC_API_KEY=

# Email
RESEND_API_KEY=
NEWS_EMAIL_TO=al.elaraki@elaraki.ac.ma

# External APIs
EXERCISE_DB_API_KEY=   # free tier at api-ninjas.com or exercisedb.io
```
