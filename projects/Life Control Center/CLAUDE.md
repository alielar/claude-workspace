@AGENTS.md

---

# Life Control Center

> Last updated: 2026-05-24. Read this before touching anything.

## 1. What This Is

Ali's personal life dashboard — a single-user Next.js web app on Vercel. Modules: dashboard, workouts, news, checklist, word bank, library, mood, sleep, journal, finance, settings.

**Stack:** Next.js (App Router, latest — see AGENTS.md), Drizzle ORM + Turso (libSQL/SQLite), NextAuth v5 (Google OAuth), Anthropic API (`claude-haiku-4-5-20251001`), Vercel hosting + cron. **No Tailwind** — all styles are inline or via `globals.css` CSS custom properties.

---

## 2. Design System

**`design-system/mockups/`** is the authoritative reference for every page. Reproduce mockups pixel-faithfully. Do not invent layout changes.

### Tokens (CSS custom properties in `globals.css`)

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
.cc-card           — card container (dark bg, border, radius 16px)
.cc-card-head      — card header (padding 14px 16px, flex, border-bottom) — MUST USE, content must not sit flush
.cc-card-body      — card body (padding 14px 16px)
.cc-btn            — base button (ghost/outline style)
.cc-btn-primary    — primary button: rgba(124,77,255,0.15) bg, rgba(124,77,255,0.4) border, #E8E8F0 text
                     hover: rgba(124,77,255,0.25) bg + 0 0 20px rgba(124,77,255,0.25) glow
                     active: scale(0.98). disabled: 40% opacity.
                     REPLACES all former white #E8E8F0 / #06060B buttons app-wide.
.cc-pagetitle      — page header (h1 + .sub subtitle)
.grad-text         — gradient text via WebkitBackgroundClip
.num               — large number display
```

### Primary button rule

**Every primary action button in the app uses `.cc-btn-primary`.** No more white (`#E8E8F0`) buttons.

Keep unchanged: ghost/secondary buttons, Discard/red-tinted buttons, the floating `+` FAB (gradient orb).

---

## 3. Architecture

### Auth
- Single-user app, always Ali's account in production.
- `auth()` (server) or `useSession()` (client). Always guard with `if (!session?.user?.id) return 401`.
- Never hardcode user IDs.

### Database
- **Drizzle ORM + Turso**. Client: `src/db/index.ts`. Schema: `src/db/schema.ts` (single source of truth).
- No Drizzle migrations CLI. Use `POST /api/admin/migrate` (idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`).
- Schema change = update `schema.ts` + add `ALTER TABLE` to migrate route. Call `/api/admin/migrate` in `useEffect` on pages with new columns.

### Timezone
- All "today" calculations: **Europe/Madrid** via `todayMadrid()`:
  ```ts
  function todayMadrid(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  }
  ```

### AI
- `@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`. Limit to 1 call/user/day max. Cache in DB.

### File Structure
```
src/
  app/(app)/       — authenticated pages (sidebar layout)
  app/api/         — API routes
  components/      — React components
  db/              — index.ts (client) + schema.ts (tables)
  lib/             — shared logic (auth, news, checklist, SRS, etc.)
```

---

## 4. Module Status

| Module | Backend | Notes |
|--------|---------|-------|
| Dashboard | DB | Server component, time-aware layout, 5 data-wired cards |
| Workouts | DB | User-created workouts saved to Turso. No auto-generation. Live logger, rest timer, PRs (Epley 1RM), run log. Seed script (`/api/workouts/seed-history`) populates historical sessions only and is idempotent. |
| News Brief | DB | 4-column grid, cron at 06:00 UTC, 30-day retention |
| Checklist | DB | Drawer with emoji/color, auto-tracked items, streaks |
| Word Bank | DB | SRS flashcards, fill-in-the-blank, multi-language |
| Library | DB | PDF reader, reading sessions, annotations, word lookup |
| Mood | localStorage | Full UI, no backend yet |
| Sleep | localStorage | Full UI, no backend yet |
| Journal | localStorage | Full UI, no backend yet |
| Finance | localStorage | Full UI, no backend yet |
| Settings | DB | Timezone and news preferences |

---

## 5. Rules

**Communication:**
- Plain, everyday language. No jargon.
- Describe issues in terms of what the user sees, not code internals.

**Read first:**
- Read `node_modules/next/dist/docs/` before writing Next.js-specific code. Breaking API changes.

**UI:**
- No direct DOM mutation. State via `useState` / `useReducer`.
- Use `—` or skeleton placeholders when loading, not spinners.
- Match `design-system/mockups/` exactly.
- Every card header uses `.cc-card-head`. Every card body uses `.cc-card-body` or `padding: "14px 16px"`.

**Data:**
- All dates in Europe/Madrid timezone via `todayMadrid()`.
- Optimistic UI updates with rollback on error.
- Idempotent writes with unique DB constraints + silent catch on duplicates.

**API:**
- All routes: check `session.user.id`, return 401 if missing.
- Never hardcode user IDs.

**Commits:**
- Small, reviewable commits with descriptive messages.
