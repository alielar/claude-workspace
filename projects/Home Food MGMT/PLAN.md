# Bsaha — Implementation Plan

**Overall Progress:** `74%`

## TLDR
Bsaha is a standalone phone-first web app (installable, no app store) for one household: Ali, both parents, Anas (15), Layla (11), a brother away in Amsterdam who returns later, and the cook. Each evening the family picks lunch and dinner for the next day from a two-week shortlist. At 23:00 the app settles each meal to at most two dishes, and the cook opens a Darija-only view at 06:30 with the day's orders, headcount and recipes. Breakfast is not voted: each person picks their own and the cook sees the list. A grocery list for the two-week cycle is shown to the grocery account and can be copied as Darija text to WhatsApp.

## Critical Decisions
- **The cook curates a daily pool (decided 2026-09-14).** The day before, the cook picks about 5 lunches and 5 dinners from the library based on what the kitchen has, capped at 10 dishes total. The family votes only from that pool.
- **Simple daily loop while the family travels (decided 2026-09-20, supersedes voting for now).** The cook shortlists up to 5 dishes per meal for tomorrow, including breakfast. Ali taps one per meal. At 20:00 Africa/Casablanca tomorrow is settled and the cook's screen is final; choices reopen at midnight for the next day. If nobody chose by 20:00 the cook takes whichever of her own five she prefers - the app never picks for her. The lock is a clock comparison on each screen, so no cron or scheduled job exists. The voting rules below stay written down for when the family is home again.
- **Voting (deferred): pick one, add a backup.** First pick 2 points, backup 1 point. Top two dishes per meal at 23:00, chosen from the pool. Ties: more first picks, then least recently cooked, then random. A dish that won yesterday cannot win today. Admins can override with a visible "changed by" label.
- **Breakfast is individual.** Each person picks their own breakfast the evening before. No vote, no two-dish limit. The cook sees a per-person list.
- **Headcount.** Anyone eating at home marks it the day before by voting. No vote means not eating at home. The cook always cooks for at least three.
- **Cycle: two weeks.** Shortlist of 10 lunches and 10 dinners plus a breakfast set. One big shop at cycle start, one fresh top-up list generated on day 7 from actual orders. Grocery quantities assume each shortlisted dish is cooked about twice.
- **Grocery list goes out through the cook.** One button copies the list as Darija text. She can paste it to the grocery person on WhatsApp. No notifications or reminders anywhere in the app.
- **Identity: the device is the person (decided 2026-09-14).** Tap your name once and that phone is locked to you. No switching, no logging out. Ali's account can switch to anyone, but only from his master device: the first device that ever taps "Ali" becomes the master. Extra devices claiming Ali are ordinary until promoted. Ali releases or promotes devices from the People screen.
- **Roles.** Family, cook, or grocery. The grocery account (never called driver) is for the person who shops. It sees only the shopping list. Admins: Ali and both parents. Admins curate the shortlist together, manage people and can override results.
- **Children's views.** Anas and Layla never see macros or calories. Layla's interface is photo-first with almost no reading. Adults see everything, labelled as estimates.
- **Personal dislikes are per person, not global.** Ali's filter: no peppers, no fresh or raw onions, cooked-down onions fine. The library stays complete for everyone else. Filters hide dishes from that person's view and recommendations only.
- **Main menu is international only; Moroccan food lives in its own menu, split Healthy/Rich (decided 2026-09-15, supersedes the earlier "lean Moroccan in main menu" rule).** Every Moroccan dish, however light or heavy, moves to the Moroccan menu — nothing Moroccan stays in the default view. Inside the Moroccan menu, a toggle splits the list into Healthy and Rich (unhealthy) halves, using the same hand-picked list in `data/lean-moroccan.json` that used to gate the main menu. The main/default menu becomes international-only, and that library is being expanded well past the first 60 dishes with widely recognised dishes families actually crave: pasta and pizza variants, chicken-and-rice bowls, tacos, curries, stir-fries — each still written as a lean, high-protein home version.
- **Each dish can carry a YouTube cooking video.** Optional `video_url` field, shown as a "Watch how it's made" link on the dish page; admins can set or clear it from the same panel used to edit the recipe. Only full `watch?v=` or `youtu.be` links are accepted, not Shorts.
- **Photo quality bar raised (decided 2026-09-15).** Stock photos should look appetising enough to crave, not just correctly labelled — sharp, well-lit, close-up. A second harvest pass pulls up to 8 higher-quality Flickr/Wikimedia candidates per dish and swaps in a clearly better one where found.
- **Search and filters run on the phone.** One load, then meal switching, text search and filters (light, balanced, hearty, high protein, high fibre, under 30 min, vegetarian, fish, chicken, red meat) are instant.
- **Speed rule.** The app runs in Dublin next to the database. Every screen has a loading skeleton. Grids use 420px thumbnails.
- **The Moroccan menu is stocked from the pre-NHS library (decided 2026-09-20).** The NHS switch archived the whole hand-written library, which emptied the Moroccan tab. The 68 Moroccan dishes from that library are restored and live in `data/dishes/moroccan-*.json`; the rest of the archive stays archived. The main menu stays NHS-sourced and international.
- **Library built like a nutritionist would.** Genuinely healthy and tasty, adequate protein and carbs across the day for the whole family, halal, everything sourced in Morocco. 180 dishes: 120 Moroccan-and-classic plus 60 international high-protein dishes (fat under 35% of calories, protein 20 to 45 g per serving, vegetables in every dish), generated with Claude, Darija reviewed by the family before going live.
- **Library and menu are two layers (decided 2026-09-20, supersedes the Removed library).** The library holds every dish ever added (355 today). The menu is the hand-picked subset the family and the cook actually see, about 30 per meal, ticked on and off from the Library screen, which shows a per-meal count against that target, filters, protein sorting and a clear-this-meal button. Taking a dish off the menu leaves it in the library and drops it from shortlists and choices. Bulk imports land in the library only (`on_menu: false`); a re-seed never touches `on_menu`, so nothing chosen is ever undone by a deploy. Delete for good exists only for dishes already off the menu.
- **Laptop layout (2026-09-20).** Below `lg` the phone layout is unchanged. From `lg` the bottom bar becomes a left sidebar, the page fills the width up to 6xl and dish grids go to three to five columns.
- **Thumbnails are mandatory (2026-09-20).** Grids load `public/dishes/thumb/`; a dish without one showed a blank tile until opened. `scripts/make-thumbs.sh` regenerates any missing, and the grid image falls back to the full photo if a thumbnail is absent.
- **Next library source: USDA MyPlate Kitchen (researched and first batch taken 2026-09-20).** 1,072 recipes, preserved at myplate.food after USDA retired myplate.gov in January 2026. Every recipe page carries schema.org JSON-LD with ingredients, steps, servings and full per-serving nutrition including protein grams, and each carries the Creative Commons Public Domain Mark with a link to its original myplate.gov URL. The recipe text and nutrition are US federal works, public domain, commercial use included, no permission needed. That site's own remastered photographs and translations are NOT public domain and need a licence for app use, so photos would be sourced separately from Wikimedia/Openverse with the existing script. All 1,072 were read and filtered at 20 g protein or more per serving, fat under 35% of calories, and no pork, bacon, ham or alcohol: 119 qualify. The 30 strongest are in (6 breakfast, 12 lunch, 12 dinner, averaging 31 g protein), leaving about 89 more if the trial goes well. Breakfast is the weak spot there - only one recipe clears 20 g - so a second source for high-protein breakfasts is still to be found.
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
  - [x] 🟩 International library expansion, round 1: 60 more high-protein dishes (20 per meal), 180 dishes total
  - [x] 🟩 Photos for the round-1 dishes, checked by eye: 170 of 180 dishes have one; 10 show a plain tile until the cook photographs them
  - [x] 🟩 Per-person dislikes: settings in Me, filter applied to that person's views
  - [x] 🟩 Add your own dish: name plus photo link, ready at once, admins add the recipe later
  - [x] 🟩 MyPlate high-protein set complete (2026-09-20): all 145 USDA recipes clearing 20 g protein, fat under 35% of calories and no pork/alcohol - 30 on the menu, 86 more in the library. 73 of the 86 have a reviewed free-licence photo; 13 show a letter tile until they are put on the menu and photographed. Catalog is 355 dishes.
  - [x] 🟩 Library screen (2026-09-20): every dish, tick on/off the menu, per-meal count against a target of 30, filters, protein sort, clear-this-meal
  - [x] 🟩 Macros hidden for children, labelled estimates for adults
  - [x] 🟩 Moroccan menu restructure: every Moroccan dish moved there, Healthy/Rich toggle inside it; main menu is international only
  - [x] 🟩 Video link field on each dish, admin-editable, shown as a "watch how it's made" button
  - [x] 🟩 International library expansion, round 2: 80 more well-known dishes (pasta, pizza, tacos, chicken-and-rice, curries — 40 lunch, 40 dinner), 10 more breakfasts written, validated, deployed
  - [x] 🟩 Photo quality pass: up to 8 higher-quality candidates harvested per dish from Flickr/Wikimedia; 68 of 180 dishes improved, visual review by AI agents, applied and live
  - [x] 🟩 Photo links repaired (2026-09-20): the halal rewrite renamed 86 dishes and their photos stopped matching, so half the catalog showed a plain letter tile. photos.json re-keyed to the current names and the seed now falls back to the source recipe slug, so a rename cannot break the link again. 239 of 239 dishes have a photo.
  - [x] 🟩 Wrong-meat photos replaced (2026-09-20): three beef/turkey dishes were still illustrated with the pork version of the NHS recipe and the chicken stir-fry with the Quorn one. Replaced with free-licence photos whose source title confirms the meat.
  - [x] 🟩 Moroccan menu restocked (2026-09-20): the 68 Moroccan dishes archived in the NHS switch are back in the catalog (20 breakfast, 26 lunch, 22 dinner) with photos, Darija recipes and en/fr/ar ingredients. Healthy/Rich splits 43/25. Catalog is now 239 dishes.
  - [x] 🟩 Ingredient languages verified (2026-09-20): all 2,521 ingredient lines carry English, French and Darija; the dish page already shows them in the reader's own language.
  - [🟨] Cooking videos matched per dish from YouTube: breakfast 54 of 70 found; lunch and dinner passes partial (hit org spend limit, pending resolution)

- [ ] 🟥 **Step 3: Two-week cycle and grocery list** (starts once the production database is confirmed)
  - [ ] 🟥 Admins create a cycle: dates, 10 lunches, 10 dinners, breakfast set
  - [ ] 🟥 Grocery list: aggregate ingredients assuming each dish cooked about twice, grouped dry vs fresh, units normalised
  - [ ] 🟥 Grocery account: third role, its own sign-in tile, one screen with the current list and tick-off boxes, Darija by default
  - [ ] 🟥 Product catalogue: map each ingredient to a real product as sold at Marjane and Carrefour Morocco (name as on the shelf, usual pack size, approximate price in dirhams). Research the common products first. See notes on prices and images.
  - [ ] 🟥 Cook's "Copy list" button producing Darija text for WhatsApp, kept as the fallback
  - [ ] 🟥 Day 7 fresh top-up list from actual orders and remaining days

- [ ] 🟨 **Step 4: Daily picks and the cook's morning view**
  - [x] 🟩 Cook's shortlist screen: up to 5 dishes per meal for tomorrow, with search and instant taps
  - [x] 🟩 Family Today shows tomorrow's shortlist and what has been chosen
  - [x] 🟩 Tomorrow screen: tap one dish per meal from the shortlist, tap again to undo, dislikes filtered out
  - [x] 🟩 20:00 settle, no scheduled job: every screen compares the Morocco clock, choices reopen at midnight
  - [x] 🟩 Nobody chose by 20:00: the cook's screen tells her to cook whichever of her five she prefers
  - [ ] 🟥 Full family voting (first pick plus backup, points, top two, tie-breaks) - deferred until the family is home
  - [ ] 🟥 Result screen: who is eating what, "changed by" label on override
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
