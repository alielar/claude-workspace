# Bsaha — Implementation Plan

**Overall Progress:** `58%`

## TLDR
Bsaha is a standalone phone-first web app (installable, no app store) for one household: Ali, both parents, Anas (15), Layla (11), a brother away in Amsterdam who returns later, and the cook. Each evening the family picks lunch and dinner for the next day from a two-week shortlist. At 23:00 the app settles each meal to at most two dishes, and the cook opens a Darija-only view at 06:30 with the day's orders, headcount and recipes. Breakfast is not voted: each person picks their own and the cook sees the list. A grocery list for the two-week cycle is shown to the grocery account and can be copied as Darija text to WhatsApp.

## Critical Decisions
- **The cook curates a daily pool (decided 2026-09-14).** The day before, the cook picks about 5 lunches and 5 dinners from the library based on what the kitchen has, capped at 10 dishes total. The family votes only from that pool.
- **Voting: pick one, add a backup.** First pick 2 points, backup 1 point. Top two dishes per meal at 23:00, chosen from the pool. Ties: more first picks, then least recently cooked, then random. A dish that won yesterday cannot win today. Admins can override with a visible "changed by" label.
- **Breakfast is individual.** Each person picks their own breakfast the evening before. No vote, no two-dish limit. The cook sees a per-person list.
- **Headcount.** Anyone eating at home marks it the day before by voting. No vote means not eating at home. The cook always cooks for at least three.
- **Cycle: two weeks.** Shortlist of 10 lunches and 10 dinners plus a breakfast set. One big shop at cycle start, one fresh top-up list generated on day 7 from actual orders. Grocery quantities assume each shortlisted dish is cooked about twice.
- **Grocery list goes out through the cook.** One button copies the list as Darija text. She can paste it to the grocery person on WhatsApp. No notifications or reminders anywhere in the app.
- **Identity: the device is the person (decided 2026-09-14).** Tap your name once and that phone is locked to you. No switching, no logging out. Ali's account can switch to anyone, but only from his master device: the first device that ever taps "Ali" becomes the master. Extra devices claiming Ali are ordinary until promoted. Ali releases or promotes devices from the People screen.
- **Roles.** Family, cook, or grocery. The grocery account (never called driver) is for the person who shops. It sees only the shopping list. Admins: Ali and both parents. Admins curate the shortlist together, manage people and can override results.
- **Children's views.** Anas and Layla never see macros or calories. Layla's interface is photo-first with almost no reading. Adults see everything, labelled as estimates.
- **Personal dislikes are per person, not global.** Ali's filter: no peppers, no fresh or raw onions, cooked-down onions fine. The library stays complete for everyone else. Filters hide dishes from that person's view and recommendations only.
- **Main menu is international plus lean Moroccan (decided 2026-09-14).** Everything Moroccan stays reachable in the Moroccan menu. Lean Moroccan dishes, chosen by hand in `data/lean-moroccan.json` (soups, grilled fish, legume stews, cooked salads, lean chicken and fish dishes), also appear in the main menu. Heavy ones (fried or sweet doughs, honey-and-fat tagines, seffa, rfissa, couscous with meat) live only in the Moroccan menu.
- **Search and filters run on the phone.** One load, then meal switching, text search and filters (light, balanced, hearty, high protein, high fibre, under 30 min, vegetarian, fish, chicken, red meat) are instant.
- **Speed rule.** The app runs in Dublin next to the database. Every screen has a loading skeleton. Grids use 420px thumbnails.
- **Library built like a nutritionist would.** Genuinely healthy and tasty, adequate protein and carbs across the day for the whole family, Moroccan throughout but not exclusively, halal, everything sourced in Morocco. About 120 dishes at launch, generated with Claude, Darija reviewed by the family before going live.
- **Custom dishes.** Anyone adds a name plus a photo found online. That is enough to pick it for a meal. No API call at runtime (decided 2026-09-14, no Anthropic key needed). Admins can add a Darija recipe from the dish page. A custom dish without ingredients does not feed the grocery list.
- **Darija in Arabic script** for recipes, the cook's view and the grocery list. Dish names also shown in Latin letters for the family. Right-to-left layout when Darija is selected.
- **Photos.** Launch with free-licence stock (Wikimedia Commons, Openverse, Unsplash, Pexels), licence and credit stored per image. The cook replaces any photo with one she takes. No scraping.
- **Stack: same as A L I hub.** Next.js 16, Drizzle with Turso, Tailwind 4, Vercel. Project folder: `Home Food MGMT/bsaha`. Name: Bsaha, Latin letters.
- **Out of scope:** guests, Ramadan and fixed traditional days, notifications, PINs.

## Tasks:

- [ ] 🟨 **Step 1: Foundation** (all built, only the production database step is open)
  - [x] 🟩 Next.js project, Drizzle with Turso, deployed to Vercel (bsaha-pink.vercel.app), installable on phone and Android tablet
  - [x] 🟩 "Who are you?" screen: tap your name, big tiles, cook gets her own view
  - [x] 🟩 Device lock, owner master device, release and promote devices from People
  - [x] 🟩 People screen for admins: add, rename, family or cook, admin, away, child view, language
  - [x] 🟩 Three languages: English, French, Darija in Arabic script with right-to-left layout
  - [x] 🟩 Me screen: change language, switch person
  - [ ] 🟥 Turso database created and connected in production (needs Ali's Turso account, see notes)

- [ ] 🟨 **Step 2: Meal library** (built and live, family review of the Darija still open)
  - [x] 🟩 Dish model: names in three languages, meal type, photo with licence and credit, per-serving macros, ingredients with quantities per serving, Darija recipe with steps and tips, tags for dislike filters (peppers, raw onion)
  - [ ] 🟨 120 dishes written (40/40/40) as a nutritionist would · family review pass on the Darija still to do (admins: open a dish, Edit recipe, mark Reviewed)
  - [x] 🟩 Source photos from free-licence libraries, store credit per image
  - [x] 🟩 Browse by meal, dish detail, cook recipe view in Darija with large text
  - [x] 🟩 Main menu vs Moroccan menu, search, filters, instant switching on the phone
  - [ ] 🟨 International library expansion: 60 more high-protein dishes (20 per meal) being written, photos to follow
  - [x] 🟩 Per-person dislikes: settings in Me, filter applied to that person's views
  - [x] 🟩 Add your own dish: name plus photo link, ready at once, admins add the recipe later
  - [x] 🟩 Macros hidden for children, labelled estimates for adults

- [ ] 🟥 **Step 3: Two-week cycle and grocery list** (starts once the production database is confirmed)
  - [ ] 🟥 Admins create a cycle: dates, 10 lunches, 10 dinners, breakfast set
  - [ ] 🟥 Grocery list: aggregate ingredients assuming each dish cooked about twice, grouped dry vs fresh, units normalised
  - [ ] 🟥 Grocery account: third role, its own sign-in tile, one screen with the current list and tick-off boxes, Darija by default
  - [ ] 🟥 Product catalogue: map each ingredient to a real product as sold at Marjane and Carrefour Morocco (name as on the shelf, usual pack size, approximate price in dirhams). Research the common products first. See notes on prices and images.
  - [ ] 🟥 Cook's "Copy list" button producing Darija text for WhatsApp, kept as the fallback
  - [ ] 🟥 Day 7 fresh top-up list from actual orders and remaining days

- [ ] 🟨 **Step 4: Daily picks and the cook's morning view**
  - [x] 🟩 Cook's pool screen: pick tomorrow's 5 lunches and 5 dinners with search, cap 10, instant taps
  - [x] 🟩 Family Today shows tomorrow's pool as a preview
  - [ ] 🟥 Evening screen: breakfast pick, lunch pick plus backup, dinner pick plus backup, from the pool
  - [ ] 🟥 23:00 lock via scheduled job, top two per meal, tie-breaks, no repeat of yesterday's winner
  - [ ] 🟥 Result screen: the dishes, who is eating what, "changed by" label on override
  - [ ] 🟥 Cook's morning view: breakfast list, lunch and dinner with headcount (minimum three), tap for recipe
  - [ ] 🟥 Cook marks a meal done and can replace the photo with her own

- [ ] 🟥 **Step 5: Polish after the first real cycle**
  - [ ] 🟥 Offline shell so a recipe still opens without WiFi
  - [ ] 🟥 Layla-mode review with her, adjust tile sizes and wording

## Notes
- Live URL: https://bsaha-pink.vercel.app (bsaha.vercel.app belongs to someone else). Vercel project `bsaha`, linked from `bsaha/.vercel`.
- Production database: Bsaha needs its own Turso database. Creating one needs a login to Ali's Turso account, which cannot be done from a non-interactive session. Two commands once logged in: `turso db create bsaha` and `turso db tokens create bsaha`, then set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` on the Vercel project.
- Photos: 116 of 120 dishes have a free-licence photo from Wikimedia Commons or Openverse, each checked by eye, credit and licence stored in `data/photos.json`. Four have none yet (date and almond bites, sardine kefta, turkey escalopes, and one more) and show a plain tile until the cook photographs them.
- Library refresh: `POST /api/admin/migrate` re-reads `data/dishes/*.json` and updates built-in dishes by slug without touching custom dishes, the Reviewed flag, or a photo the cook replaced.
- Grocery product catalogue, two honest limits. Prices at Marjane and Carrefour change weekly and neither publishes a stable public price feed, so prices will be approximate and dated, editable by admins or the grocery person. Product packshots on retailer sites belong to the brands, so the app will show our own photos or a plain tile, not copied catalogue images.
- Time zone fixed to Africa/Casablanca for deadlines and "today".
