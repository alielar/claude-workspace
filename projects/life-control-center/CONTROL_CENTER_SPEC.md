# A L I (formerly Control Center) — Rebuild Spec

> **How to use this file:** put it in the repo root as `CONTROL_CENTER_SPEC.md`.
> Then open Claude Code in the repo and paste the short kickoff prompt in section 0.
> Do **not** paste this whole file into the chat — Claude Code reads it from disk.

---

## 0. Kickoff prompt (paste this into Claude Code)

```
Read CONTROL_CENTER_SPEC.md in full before doing anything.

Then, in this order:
1. Audit the current codebase against section 3 of the spec. Tell me what exists,
   what is dead code, what is slow, and what breaks on mobile.
2. Ask me the open questions in section 8 that you cannot answer from the code itself.
3. Propose the phase plan from section 7 with your own corrections, and wait for my go.

Do not write any feature code until I approve the plan. Audit and questions first.
```

---

## 1. Role

You are the sole engineer and product designer of my personal Control Center — a
private daily dashboard used by one user (me) on a phone, every day, for years.

You are not a code generator waiting for instructions. You own the UX. Where this
spec says "your call", decide it yourself and tell me what you decided and why in
one line. Only ask me when the answer is a personal fact you cannot infer.

---

## 2. Task

Rebuild the Control Center so that I actually use it daily.

Context you need: **I stopped using the previous version.** Not because features were
missing — because it was inconvenient. Slow to load, not built for the phone, useless
without connection, too many sections. The rebuild is a convenience problem first and
a feature problem second. If a feature makes the app slower or heavier on mobile, cut
the feature.

---

## 3. Hard constraints (non-negotiable — treat these as acceptance gates)

Every phase must still pass all of these when it ships. If a phase breaks one, the
phase is not done.

1. **Phone first.** Designed for a phone screen, then adapted up to desktop. Not the
   reverse. Thumb-reachable primary actions.
2. **Installable and offline.** Ships as an installable PWA (home-screen icon, no
   browser chrome). Everything that does not strictly require the network — routines,
   workouts, checklist, streaks, to-dos, supplements, reading list — must work fully
   offline and sync later. Only news requires connection, and it must fail gracefully
   with the last cached version, never a blank screen or a spinner that hangs.
3. **Fast.** Cold open to usable screen under ~1.5 seconds on a phone. No full-screen
   loading state on open — render the shell and the local data instantly, hydrate
   network data after.
4. **Dark and light mode.** Follows the system setting by default, with a manual
   override. Dark must be genuinely dark for night use.
5. **Simple.** Fewer sections than before. If I have to think about where something
   lives, the navigation is wrong.
6. **Links open externally.** Any link (e.g. YouTube) opens the real app/page on tap.
   Keep this behaviour — it exists today and it works.

---

## 4. Daily structure (this is what the app has to serve)

### 4.1 Morning routine — on waking, in this order

**a) Stretching** — 16 movements, **30 seconds work, 10 seconds rest** between each.
Needs a guided timer: current movement, next movement, countdown, audio or vibration
cue on each change, pause/skip, and it must keep running with the screen locked or the
phone in my pocket. Order:

1. Bouncing on Toes
2. Torso Rotations
3. Hip Circles
4. Lateral Arm Swings
5. Alternating Windmills
6. Alternating Cossack Squats
7. Walk Outs
8. Down Dog Calf Stretch
9. Cat Cow
10. Push Up +
11. Bootstrapper Squats
12. World's Greatest Stretch — Left Leg Forward
13. Around the World
14. World's Greatest Stretch — Right Leg Forward
15. 90/90
16. Hindu Squats

**b) Wim Hof breathing** — straight after stretching. For now I follow this video:
`https://youtu.be/tybOi4hjZFQ?si=sFm7xUpv-9VcY--k`

The link must be one tap away in the routine. But design it knowing the link is
temporary: it is 30 breaths and I already know the pattern — once I stop needing the
video, I need a built-in round counter/breath pacer instead. Build the video link as
the default now and make the swap to a built-in pacer easy later (or offer both).

**c) Supplements**
- Morning: zinc, omega-3, creatine
- Night: magnesium

Tickable, part of the streak system, night dose surfaced in the evening, not the morning.

### 4.2 Workouts — kettlebell era

I no longer train on gym machines. Everything is kettlebell + dumbbell.
**Current kettlebell: 12 kg.** I stay at 12 kg until I master every movement, then move
to 16 kg. Build the weight as a variable, not a hard-coded number, and make the future
jump to 16 kg a setting.

**Rep counts must be editable by me**, like today — but find a *simpler* way to edit them
than the current one. Inline editing on the exercise itself, no separate settings page.
The numbers below are my starting values.

**WORKOUT 1 — 12 kg kettlebell — twice a week — AMRAP 30 minutes**

One round =
- 5 snatches per side
- 5 thrusters per side
- 5 high pulls per side
- 5 presses per side
- 5 swings per side
- 5 squats per side

As many rounds as possible in 30 minutes. **Every week I try to beat my best round count
from the previous week.**

This is the section where I want you to be genuinely creative. Make it feel like a game:
a live round counter I can tap without breaking rhythm, the number to beat visible while
I train, pace feedback, a record-broken moment, a history of my weekly bests. Your call
on the exact mechanic — but it must be operable with sweaty hands, mid-set, in one tap.

**WORKOUT 2 — 12 kg kettlebell + dumbbells — twice a week — straight sets**

- Kettlebell triceps overhead press — 12 × 3 sets
- Kettlebell halos — 12 × 3 sets
- Kettlebell pullovers — 12 × 3 sets
- Kettlebell helicopters — 12 × 3 sets
- Dumbbell incline chest press — 20 × 3 sets
- Biceps curls — 12 × 3 sets per arm
- Wrist curls — 15 × 3 sets per arm

Needs set-by-set tracking and a rest timer. Different feel from Workout 1: Workout 1 is a
race, Workout 2 is a checklist.

**Old gym/machine workout page:** do not delete it. Archive it behind a flag or a folder,
out of the navigation. I may ask you to restore it.

### 4.3 Reading — replace the current section

I now read **physical books**, not on a screen. So:

- **Scrap the current reading page** as a daily section.
- Replace it with a **book waiting list**: cover image, title, author, a short
  "what this book covers", and "what I'll get out of it".
- Research each book properly to get the right edition, author, and cover.

The list:
1. *Stop Letting Everything Affect You* — Daniel Chidiac
2. *How AI Thinks* — Nigel Toon
3. *The Diary of a CEO* — **Steven Bartlett** (I wrote Nigel Toon by mistake in my brief; verify and use the correct author)
4. *12 Rules for Life* — Jordan Peterson
5. *Atomic Habits* — James Clear

- Reading before sleep becomes a **habit to build**, not a content section (see 4.4).
- The existing note-taking / knowledge-capture system is good. **Keep the code, hide the
  UI.** Reachable but not in the main navigation. I may want it back for physical-book notes.
- Where the waiting list lives is your call — its own light page, or a card on the home screen.

### 4.4 Habits to build

A section for habits I want to add but haven't locked in yet — separate from the daily
routine I already do. First entry: **reading before sleep**. Design it so a habit can be
promoted from "building" to "part of my daily routine" once it sticks.

### 4.5 To-do list

Currently missing. I want one, and I want it to be surprisingly good.

- Simple by default, deeply personalisable when I want it.
- Reminders.
- I structure it as I wish (your call on the mechanic: projects, tags, sections).
- Research how Notion, Things, Todoist and TickTick handle quick capture, scheduling and
  reminders on mobile, then take the two or three ideas that fit a one-person daily app
  and ignore the rest. Do not clone Notion — I want convenience, not a database.
- Must work offline.

### 4.6 News

Keep it, but upgrade it.

- **Remove the "Morocco and the World Cup" interest** — no longer relevant.
- For my remaining interests: make more of them. Highlight standout items rather than
  showing a flat list — for example surfacing relevant YouTube videos, not only articles.
  Your call on the treatment (featured card, "worth your time" flag, grouping by interest).
- Cached: last fetched version shows instantly and offline; refresh happens in background.

### 4.7 Keep as-is (they work)

- **Checklist** — editable/adjustable. Keep.
- **Streak system** — keep, and extend it to the new routines (stretching, breathing,
  supplements, workouts, habits).
- **Tappable external links** — keep.

### 4.8 Removed for now

- **Well-being section — remove.** Not deleted from my plans, just off the app.
  It comes back in a later phase as **Apple Watch integration**: sleep and workout data,
  health metrics. Plan the data model so this can slot in without a rewrite, but build
  none of it now.

---

## 5. Codebase hygiene

- Delete dead code that no longer serves the current spec. This is explicitly authorised.
- "Archive" (old gym workouts, reading notes system) means: keep in the repo, out of the
  navigation, restorable in one step. Tell me exactly how to restore each one.
- Reduce bundle size and load time as part of the work, not as an afterthought.

---

## 6. Reasoning — how to think about this

- **Convenience beats completeness.** Every added screen is a tax on daily use.
- **Coherence.** The morning routine, workouts, habits, to-dos and streaks are one system,
  not five widgets. The home screen should tell me what to do *right now* based on the time
  of day, and let me reach everything else in one tap.
- **My day is the spine:** wake → stretch → breathe → supplements → work/to-dos → workout
  (4 days a week) → evening → night supplement → reading habit. Let that shape the design.
- Everything in this spec is deliberate. Nothing here is filler — if something seems
  unimportant, ask instead of dropping it.

---

## 7. Proposed phase plan (correct it before we start)

Each phase ships working on my phone before the next one begins.

- **Phase 0 — Audit.** Map the current codebase. List dead code, slow paths, mobile
  breakages. No feature work. Output: a short written audit + your corrections to this plan.
- **Phase 1 — Foundation.** PWA shell, offline storage, dark/light, navigation, home
  screen, performance budget met. All existing kept features migrated, nothing new.
- **Phase 2 — Morning routine.** Stretching timer, breathing link, supplements, streaks.
- **Phase 3 — Workouts.** Workout 2 first (simpler), then Workout 1 with the AMRAP game.
  Old gym page archived.
- **Phase 4 — To-do list.**
- **Phase 5 — Reading list + habits to build.** Old reading section stripped, notes hidden.
- **Phase 6 — News upgrade.**
- **Phase 7 — Next steps / enhancements** (after the main rebuild, in this order unless told otherwise):
  - Google sign-in / login (app is deliberately open until then — only Ali has the URL)
  - Phone notifications for to-do reminders (needs server-side scheduling; iOS 26 supports web push)
  - Apple Watch sync + a working sleep-data solution (current Shortcut is unreliable)
  - Fixed workout day scheduling (optional — data model must allow it from Phase 3)
  - Word bank / spaced repetition revival (optional — words are archived, never deleted)

### 7a. Corrected order agreed after the Phase 0 audit (2026-08-29)

1. Foundation (archive/remove first, migrate only Checklist + streaks + News cache, PWA, offline layer, dark/light, nav, home screen) — **built 2026-08-30**
2. Routine engine (stretching, breathing, supplements, **habits-to-build**, streaks) — **built 2026-08-30**
3. Workouts (Workout 2, then Workout 1 AMRAP game; gym page archived) — **built 2026-08-30**
4. Reading list (moved earlier — small, unblocks the evening reading-habit card) — **built 2026-08-30**
5. To-do list — **built 2026-08-30**
6. News upgrade — **built 2026-08-30**
7. Next steps — see **§7c Deferred list** (the authoritative version, kept current)

### 7c. Deferred list (recorded 2026-08-30 — build later, in this order unless told otherwise)

Any future session picks these up from here; Ali should not have to repeat them.

0. ~~**Stretch player — verify first.**~~ Done 2026-08-30. The `/stretch` player was live but
   unreachable once the Stretching row was ticked (the ▶ Start button vanished with it).
   Fixed: the button stays as a quiet "▶ Again" after ticking, and Settings has a permanent
   "Stretching › Open" card. Player = 16 moves from §4.1, 30 s / 10 s, big current move, next
   move visible, beep + vibration + spoken name on every change, screen kept awake.
1. ~~**App name.**~~ Picked 2026-08-30: **A L I** (spaced). Manifest, iOS title and icon updated —
   icon is a white A on the dark ground, the crossbar a horizon with the violet sun rising
   behind it. ("Helm" was tried first the same day and replaced.) "Control Center" truncated under the home-screen icon.
   Reinstall the PWA (or Settings → Update app) to see the new name and icon.
1b. ~~**Home-screen widget (2×2, in the Notion slot).**~~ Done 2026-08-30, as far as iOS allows:
   a PWA cannot provide a widget (WidgetKit is native-only), so `/api/widget` + `public/widget.js`
   drive a **Scriptable** widget (free app) in the app's look — progress, next steps, to-dos due;
   tap opens `/today`. Instructions in Settings. A real native widget would need a Capacitor
   wrapper + Apple developer account (€99/yr) — not worth it for one tile.
2. **Google sign-in / login.** The app is currently open to anyone with the URL.
3. **Phone notifications for to-do reminders.** Ali wants a notification that stays visible
   until dismissed by hand — not one that disappears on unlock. **Before building, report
   honestly what iOS actually allows a web app (PWA) to do**; if a truly persistent
   notification is not possible, describe the closest alternative and what it costs
   (time, money, a native wrapper, etc.). Needs server-side scheduling.
   **Honest report (2026-08-30):** a web app on iPhone *can* send push notifications (iOS 16.4+,
   only when installed on the home screen, after Ali taps "Allow" once inside the app). What no
   app can do — web *or* native — is a notification that stays on screen until dismissed: iOS
   moves every notification to Notification Center on unlock; only Apple-approved "Critical
   Alerts" (medical/safety entitlement) break through, and web push cannot use "Time Sensitive".
   Closest thing: **nag until done** — the server re-sends the reminder every 30 min until the
   task is ticked, plus the home-screen badge (built) and the widget (built) which keep the count
   visible. Cost: web-push library + VAPID keys = free; scheduling = Vercel Hobby crons run at
   most once a day, so a minute-level scheduler needs either Vercel Pro (~$20/month) or a free
   external pinger (e.g. cron-job.org hitting `/api/reminders/tick` every 5 min). Recommended:
   free external pinger. Awaiting Ali's go.
4. ~~**To-do split: WORK and PERSONAL.**~~ Built 2026-08-30: Personal · Work switch at the top of
   To-do (remembered on the phone), each with its own due count; same quick add in both; area chips
   in the task sheet; Today tags work tasks "· Work"; widget shows "N due · n work". Per-area
   *notifications* wait for item 3.
5. **Apple Watch sync — sleep and workout data.** The old Apple Shortcut posting sleep data
   was unreliable; needs a new approach (`/api/sleep/ingest` still accepts it, don't trust it).
6. ~~**Fixed workout day scheduling.**~~ Built 2026-08-30, **opt-in**: Settings → Training days
   (Mon–Sun per workout; a day belongs to one workout). Off = the old "4 a week, any days,
   alternating". On = Today shows the planned workout or a quiet "Rest day · next: …" row, Train
   says "Up next · Tuesday", weekly target = number of planned days.
7. **Word bank / spaced repetition revival.** Archived at `/wordbank`, restorable in one line
   (see CLAUDE.md §4).

## 7b. Stop conditions

Stop and come back to me when:
- The audit is done (before any feature code).
- A phase is finished and passes all constraints in section 3.
- A decision would change how I *use* the app daily, not just how it looks.
- Something in this spec turns out to conflict with something else in it.
- You are about to delete anything I asked to archive.

Do not stop to ask me about styling, layout, naming, library choice, or animation. Decide.

---

## 8. Questions to ask me (answer these before Phase 1)

Ask only what you cannot answer by reading the code:
- Anything about my habits, schedule, or how I want to use a feature.
- Anything where two of my requirements pull in opposite directions.

Write your questions in plain, simple language — short sentences, no jargon, one question
at a time where possible. I need to understand the question to give you a useful answer.

---

## 8a. Answers given (2026-08-29) — treat as facts

- **Login:** none for now. Open app, single URL known only to Ali. Google sign-in → Phase 7.
- **Phone:** iPhone 16, iOS 26.5.2. Installed PWA.
- **Stretching timer:** screen stays awake (dimmed) for the ~11 min, sound + vibration on each change, used face-up on the floor. No native app.
- **Workout days:** 4 sessions a week, any days, alternating W1/W2. No fixed schedule, but the data model must allow assigning days later.
- **Day clock:** wake 07:30 weekdays / 10:00 weekends; evening (magnesium) from 21:00; sleep ~23:30.
- **Word bank + Knowledge:** archive (hidden, restorable, data kept).
- **Journal + Mood:** archive with well-being.
- **Football news:** keep Real Madrid + Moroccan national team. Remove World Cup coverage.
- **YouTube channels:** Claude picks per topic, shows the list once for adjustment.
- **To-do reminders:** home-screen badge only. Push notifications → Phase 7.
- **Sleep webhook:** keep `/api/sleep/ingest` running silently; incoming data is not reliable.

## 9. Output format for every reply

- Lead with the deliverable or the decision, not with preamble.
- Plain language. Short sentences.
- When you disagree with me, say so directly and give the alternative and the risk.
- Tell me what you decided on your own, in one line each, so I can veto it.
