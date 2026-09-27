# Wati Inbox

Self-hosted app (runs on Ali's Mac) that notifies phone + laptop when a lead writes on the
**France Sales** WhatsApp number, shows the thread, lets Ali reply — free text while the 24h
window is open, French templates when it is closed — and shows reply suggestions written by
Claude Code (Sonnet) with the closing playbook in `../Wati outreach`.

One Node process, one SQLite file. The only outside piece is **Tailscale** (free private VPN
between Ali's own devices) so the phone reaches the Mac on 4G and gets a real HTTPS certificate.
Nothing is paid per use: suggestions run through the Claude Code subscription, headless.

## How it works
- `server.mjs` — HTTPS on port 8443, the app, its API, and the poller.
- `poll.mjs` — every 45 s reads the threads active in the last 24 h directly (Wati's contact
  timestamp does not move on messages), older ones every 5 min, and checks contacts page 1
  for brand-new leads; pushes a notification for every new lead message.
- `suggest-engine.mjs` + `suggest-prompt.md` — the suggestions. A lead writes → 90 s after the
  last bubble the app runs `claude -p --model claude-sonnet-5` in `../Wati outreach` (its
  CLAUDE.md, `lead.mjs`, the playbook), parses the structured answer (2–3 options, each 2–3
  bubbles + why + a note), stores it, pushes "Suggestions prêtes", and appends the draft to
  `../Wati outreach/data/suggestions/<date>.md` for the evening review. One run at a time,
  6-minute timeout, at most `SUGGEST_MAX_PER_DAY` automatic drafts a day (default 40).
  "Demander une suggestion" in the app drafts immediately, even when auto is off.
- `db.mjs` — `data/inbox.sqlite` (threads, messages, suggestions, push subscriptions, sends, state).
- `wati.mjs` — the Wati calls (ported from `lead.mjs`, `send.mjs`, `check-templates.mjs`).
- `public/` — the app (plain HTML/JS), service worker, manifest, icon.
- `../Wati outreach/suggest.mjs` — posts a draft written in a Claude Code chat to the phone.

## The phone screen
Inbox: leads waiting first, "brouillon prêt" / "Claude rédige…" pills, the "Suggestions auto :
ON/OFF" switch. Thread: the conversation, the window badge, then the suggestion cards — each
bubble has **Copier**, each option has **Envoyer telle quelle** (two taps), **Modifier avant
envoi** (fills the composer) and **Tout copier**. "Pourquoi" is folded under each option; "À
savoir" above them carries what Claude wants Ali to check (window closed, a number to confirm).

## Setup (done once)
1. `npm install`, `node setup-keys.mjs` → writes `.env` (Wati keys copied from
   `../Wati outreach/.env`, app password, push key pair). The password is printed.
2. `sh certs/make-certs.sh` → local certificate authority + server certificate.
3. `sh launchd/install.sh` → starts at login, restarts on crash. Log: `logs/server.log`.
4. Tailscale (personal account, network `tail7ec20e`): app installed on the Mac ("Launch at
   login" ticked) and on the iPhone, HTTPS certificates enabled in the admin console.
   `node --env-file=.env renew-ts-cert.mjs` fetches/renews the certificate (`certs/ts.pem` + `ts.key`).
5. Laptop: https://localhost:8443 (local CA trusted in the login keychain), log in, tap
   "Activer les notifications".
6. iPhone (Tailscale on): Safari → https://alis-macbook-pro.tail7ec20e.ts.net:8443 → log in →
   Share → Add to Home Screen → open from the home screen → "Activer les notifications" → Allow.

## Daily
- **The Mac must stay awake** (plugged in, lid open; the screen may lock).
- Phone reaches the app anywhere (Wi-Fi or 4G) as long as Tailscale is on on both devices.
- Suggestions need `claude` logged in on the Mac (`~/.nvm/versions/node/v24.14.0/bin/claude`).

## Useful
- Restart: `launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox`
- Stop: `launchctl bootout gui/$(id -u)/com.ali.wati-inbox`
- Draft one lead from the terminal: `node --env-file=.env suggest-engine.mjs 33612345678`
- Password: `APP_PASSWORD` in `.env` (change it, then restart).
- `.env` knobs: `SUGGEST_MODEL` (claude-sonnet-5), `SUGGEST_MAX_PER_DAY` (40), `SUGGEST_DEBOUNCE_MS` (90000).
- Local certificate (localhost / .local, every ~2 years): `sh certs/make-certs.sh` + restart.
- Tailscale certificate: `grep tailscale logs/server.log` shows the last attempt.
- Headless runs skip `~/.claude/settings.json` (`--setting-sources project,local`) because a
  malformed grep rule there makes every tool call fail in unattended mode.
