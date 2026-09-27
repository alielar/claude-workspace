# LinkedIn Posting Plan

**Overall Progress:** `32%`

## TLDR
Post a short, easy-to-read LinkedIn post twice a week (Tuesday and Thursday, 7:00) about AI, automation and how work is changing, written in Ali's voice. Claude drafts a month of posts at a time, Ali approves them, and a small script publishes them on schedule. Start posting this week by hand while the automation gets built.

## Honest take
- There is no ready-made LinkedIn connector in this setup. LinkedIn's own connector for Claude does not exist, and LinkedIn blocks reading a profile from the outside. The way I learn the account is Ali's own data export (free, takes a few hours to arrive).
- Posting by script is allowed by LinkedIn through a free developer app. The one catch: the access key expires every 60 days and only Ali can renew it, by logging in once. That is a two-minute task every two months.
- Reading likes and comments by script is locked to LinkedIn partners. Engagement is checked by eye, not by code. That is fine at this stage.
- Fastest path is two tracks at once: posts go live this week via LinkedIn's built-in scheduler, and the script takes over from post 5 or so.
- No AI cost at post time: drafting happens here in Claude Code in one batch per month, the scheduler only sends text. Nothing paid.

## Critical Decisions
- Learn the account from a LinkedIn data export, not from an integration: it is the only complete, free source (profile, past posts, comments, audience).
- Write posts in batches of 8 (one month at two per week) into plain markdown files: Ali reviews once a month, edits in place, nothing gets posted without his approval.
- Publish with a small Node script and a Mac scheduled job, same pattern as the Wati nightly review: no third-party tool, no subscription, no AI call at post time.
- Posts are in English, casual but LinkedIn-respectful, narrative style with short paragraphs (Ali's reference: Jes Black). Rules live in `voice.md`.
- Track results in one file by hand: every four days Ali drops the reaction and comment counts, and Claude uses it when drafting the next batch.

## Tasks:

- [ ] 🟥 **Step 1: Learn the account (Ali, ~10 min + waiting)**
  - [ ] 🟥 Ali requests his LinkedIn data export: Settings > Data privacy > Get a copy of your data > full archive
  - [x] 🟩 Ali answered the guided questions (audience, goal, tone, mix, format, schedule) on 2026-09-27
  - [x] 🟩 `voice.md` written from the answers
  - [ ] 🟥 Claude reads the export and refines `voice.md` with what got the most reactions before

- [ ] 🟨 **Step 2: Topics and format**
  - [x] 🟩 `topics.md` holds the spare ideas for the next batch
  - [x] 🟩 Format fixed in `voice.md`: hook, 5 to 15 short lines, question at the end, no hashtags, no emojis, picture idea per post
  - [ ] 🟥 Ali approves or cuts topics

- [ ] 🟨 **Step 3: First batch, posted by hand (this week)**
  - [x] 🟩 Claude drafted 8 posts into `posts/2026-10.md`, Tue/Thu 7:00 from 2026-09-29 to 2026-10-22, each with a picture idea and source
  - [ ] 🟥 Ali edits and marks each block `approved`
  - [ ] 🟥 Ali pastes the posts into LinkedIn's built-in scheduler (Post > clock icon), up to 3 months ahead

- [ ] 🟥 **Step 4: Connect the script to LinkedIn (Ali ~15 min, Claude the rest)**
  - [ ] 🟥 Ali creates a free app at developer.linkedin.com, adds the "Share on LinkedIn" and "Sign In with LinkedIn" products, and pastes the client id and secret into `.env` (never committed)
  - [ ] 🟥 Claude writes `auth.mjs`: opens the LinkedIn login page once, saves the 60-day access key to `.env`
  - [ ] 🟥 Claude writes `post.mjs`: reads the next approved block whose date is today, publishes it, marks it `posted` with the LinkedIn link
  - [ ] 🟥 Dry run with a test post visible only to Ali (or a post deleted right after)

- [ ] 🟥 **Step 5: Schedule it**
  - [ ] 🟥 Claude writes the Mac scheduled job (launchd, Tuesday and Thursday 07:00 Paris time; the script does nothing on days with no approved post)
  - [ ] 🟥 Ali installs the job himself, same as the nightly review
  - [ ] 🟥 `post.mjs` writes a one-line log per run to `logs/`, and sends a Mac notification when a post goes out or when the key is about to expire (7 days before)

- [ ] 🟥 **Step 6: Monthly loop**
  - [ ] 🟥 After each post Ali drops reactions and comments count into `results.md` (one line per post)
  - [ ] 🟥 Once a month Claude reads `results.md`, updates `voice.md` with what worked, drafts the next 8 posts
  - [ ] 🟥 Every 60 days Ali runs `auth.mjs` again when the expiry notification fires

## Open questions for Ali
- Personal profile only, or also the company page? (Company page needs one extra permission, easy to add later.)
