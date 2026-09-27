# Wati Inbox

## What it is
The phone app Ali uses to answer French leads: a notification for every message on the France
Sales WhatsApp number, the thread, a reply box (free text while the 24h window is open, French
templates when it is closed), and reply suggestions written by Claude with the closing playbook
in `../Wati outreach`. Details and setup in `README.md`; history and decisions in `PLAN.md`.

## Where it runs
On the Mac only, as the launchd job `com.ali.wati-inbox` (one Node process, `server.mjs`, port
8443, SQLite in `data/inbox.sqlite`). The phone reaches it through Tailscale at
`https://alis-macbook-pro.tail7ec20e.ts.net:8443`. Suggestions are made by `suggest-engine.mjs`,
which runs `claude -p --model claude-sonnet-5` headless inside `../Wati outreach`; no API key,
no open session. Logs: `logs/server.log`, `logs/suggest.log`.

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
- Never change the suggestion prompt's rules without reading `../Wati outreach/CLAUDE.md`; the
  playbook there is the source of truth.
- Headless runs load user, project and local settings (global file cleaned on 2026-09-27).
- `.env`, `data/`, `logs/`, `certs/*.pem|key` are git-ignored; keep them so.
