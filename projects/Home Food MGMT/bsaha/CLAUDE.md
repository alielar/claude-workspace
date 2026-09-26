# Bsaha

Household meal app: family picks tomorrow's meals, the cook sees the orders in Darija.
Plan and decisions live in `../PLAN.md`. Read it before changing behaviour.

## Stack
Next.js 16 (app router, `src/`), Drizzle + Turso (libsql), Tailwind 4, Vercel.
Dev database: `TURSO_DATABASE_URL=file:local.db` in `.env.local`.
Schema changes go in `src/db/schema.ts` AND `src/db/migrate.ts` (idempotent SQL, runs once per server instance and via `POST /api/admin/migrate`).

## Rules
- Phone first. Big tap targets, one action per screen, no reading-heavy screens.
- Every user-facing string goes through `t(lang, key)` in `src/lib/i18n/dict.ts`. Three languages: en, fr, ar (Moroccan Darija in Arabic script, right-to-left).
- Cook-facing content (recipes, orders, grocery text) is always Darija.
- Children (`isChild`) never see macros or calories.
- No emojis in UI labels.
- Custom dishes are name plus photo only. No Claude API call at runtime. Admins add a recipe from the dish page.
- Library content comes from `scripts/myplate/` (see its README); never hand-edit `data/dishes/myplate.json`.
- The menu is per meal: `dishes.menu_meals` (JSON list) says which meals a dish is picked for; `on_menu` only mirrors "not empty". Filter with `onMenuFor(d, meal)`, never `inMeal` alone, on every menu-facing screen.
- Family photos live in the `photos` table and are served by `/api/photo/[id]` (`?t=1` = grid size). The add-dish form shrinks them client-side (`PhotoField`).
- Theme is per person (`people.theme`: system, light, dark) and applied as `data-theme` on `<html>`; colours are the CSS tokens in `globals.css` only.
- Dish pages use `BackLink` (history first) and links carry `?from=<screen>`; browsers remember filters with `useRemembered`.
- Deploy: `npx vercel --prod --yes` from this folder, then `curl -X POST https://<url>/api/admin/migrate`. Vercel's own Git deploys fail (they build from the workspace root) and can be ignored.
