# Wati Inbox

## What it is
The phone app Ali uses to answer French leads: a notification for every message on the France
Sales WhatsApp number, the thread, a reply box (free text while the 24h window is open, French
templates when it is closed), and reply suggestions written by Claude with the closing playbook
in `../Wati outreach`. Details and setup in `README.md`; history and decisions in `PLAN.md`.

## Where it runs
On the Mac only, as the launchd job `com.ali.wati-inbox` (one Node process, `server.mjs`, port
8443, SQLite in `data/inbox.sqlite`). The phone reaches it through Tailscale at
`https://alis-macbook-pro.tail7ec20e.ts.net:8443`. Since 2026-09-30 a draft starts **by itself**
`AUTO_DELAY_MS` (60 s) after a lead's last bubble (`suggest-engine.mjs`, `scheduleAutoDraft`): Claude
picks the moves from `directions.mjs` (administration two-step, downsell from the stored initial offer,
délai, acompte, paiement, démarrage, relance, basse pression, clôture), or asks Ali for the one thing
it needs (`kind = needs`, e.g. the initial offer before a downsell), or says the message needs no reply
(`kind = skip`). Ali can still steer (folded "Refaire le brouillon" panel: offer, moves, consigne); one
set of bubbles per draft plus a `later` block for the administration two-step, editable in the app
before the Mac sends it 7 min later (bubbles spaced 5-10 s like any send); lessons by `learn-engine.mjs` after every
send (written to `../Wati outreach/playbook/04-CAS-APPRIS.md`); the France TM booking bot is
reviewed by `tm-monitor.mjs` (capped: 3 reviews a day, 9h–21h, only when ≥ 3 conversations moved) (webhook events → `tm_messages` → flags in `tm_flags`);
the Sales Hub "to be converted" sequence is watched by `tbc-watch.mjs` (2026-09-30): it knows the fixed schedule
(Day 0 20:20 … Day 7 17:30, counted from the preadmission template) and, from the recovery week on, asks Sonnet
whether the next template still makes sense when Ali's diagnostic question (what really blocks you?) went
unanswered — the only case Ali wants flagged; enrolled leads and "solution proposed, no answer" cases are left to
the templates (`fit`); if it does not fit, a push + a card in the thread: 1. pause it in the Sales
Hub (Ali confirms, the app never claims it), 2. the manual follow-up, unlocked only after that confirmation.
Rows in `tbc_alerts`; `SALES_HUB_URL` in `.env` adds a link. Terminal dry run: `node --env-file=.env tbc-watch.mjs`.
The learned cases are consolidated by `consolidate-engine.mjs` (2026-09-30): every evening at `CONSOLIDATE_AT` (22:15
Madrid), when the raw journal `../Wati outreach/playbook/04-CAS-APPRIS.md` moved, one Sonnet run rebuilds
`../Wati outreach/playbook/06-REGLES-APPRISES.md` (every rule once, latest decision wins, scripts verbatim, 150–250
lines) and appends a `<!-- consolidé jusqu'ici · … -->` marker to the journal. Every draft reads 06 in full plus the
journal tail after that marker (injected in the prompt). Terminal: `node --env-file=.env consolidate-engine.mjs [--force]`.
All run `claude -p --model claude-sonnet-5` headless inside `../Wati outreach` — drafts in their own lane with a
self-contained prompt (thread, CRM card, quick card, consolidated rules and principles injected; no tool turns; target
under a minute), the other runs queued behind each other in a background lane; no API key, no open session. Logs: `logs/server.log`, `logs/suggest.log`.

## How to deploy
There is no deploy. After a code change:
```
node --check server.mjs && launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox && tail -5 logs/server.log
```
Then commit and push. Test a draft from the terminal with
`node --env-file=.env suggest-engine.mjs <waId>`.

## What is forbidden
- Never call `sendText` / `sendTemplate` from a script or a test: the app sends only when Ali taps
  in it. Ali's own number `34695064884` is the test thread.
- Ali's own number `34695064884` is never drafted by itself. `SUGGEST_MAX_PER_DAY` (60) caps automatic drafts.
- Never change the suggestion prompt's rules or the cap guidance in `directions.mjs` without
  reading `../Wati outreach/CLAUDE.md` and `playbook/00-QUICK.md`; the playbook is the source of truth.
- The inbox lists only open 24h windows; do not bring closed conversations back (Ali, 2026-09-29).
- The app cannot pause the Sales Hub automation and must never say a step is paused unless Ali tapped the confirmation; a template that lands after his confirmation is reported back to him.
- Never edit `06-REGLES-APPRISES.md` by hand (rebuilt nightly); new cases go into `04-CAS-APPRIS.md`.
- Headless runs load user, project and local settings (global file cleaned on 2026-09-27).
- `.env`, `data/`, `logs/`, `certs/*.pem|key` are git-ignored; keep them so.
