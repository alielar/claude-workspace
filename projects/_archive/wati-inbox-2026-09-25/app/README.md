# Wati Inbox

Self-hosted app (runs on Ali's Mac) that notifies phone + laptop when a lead writes on the
**France Sales** WhatsApp number, shows the thread, and lets Ali reply — free text while the
24h window is open, French templates when it is closed. Reply suggestions are written by
Claude Code in the `Wati outreach` folder (signal `veille`), never by another model.

One Node process, one SQLite file. The only outside piece is **Tailscale** (free private VPN
between Ali's own devices) so the phone reaches the Mac on 4G and gets a real HTTPS certificate.

## How it works
- `server.mjs` — HTTPS on port 8443, the app, its API, and the poller.
- `poll.mjs` — every 45 s reads the threads active in the last 24 h directly (Wati's contact
  timestamp does not move on messages), older ones every 5 min, and checks contacts page 1
  for brand-new leads; pushes a notification for every new lead message.
- `db.mjs` — `data/inbox.sqlite` (threads, messages, suggestions, push subscriptions, sends).
- `wati.mjs` — the Wati calls (ported from `lead.mjs`, `send.mjs`, `check-templates.mjs`).
- `public/` — the app (plain HTML/JS), service worker, manifest, icon.
- `../Wati outreach/watch-pending.mjs` + `suggest.mjs` — Claude's side of the suggestions.

## Setup (done once)
1. `npm install`, `node setup-keys.mjs` → writes `.env` (Wati keys copied from
   `../Wati outreach/.env`, app password, push key pair). The password is printed.
2. `sh certs/make-certs.sh` → local certificate authority + server certificate.
3. `sh launchd/install.sh` → starts at login, restarts on crash. Log: `logs/server.log`.
4. Tailscale (personal account `ali.t.elaraki@gmail.com`, network `tail7ec20e`): app installed on
   the Mac ("Launch at login" ticked) and on the iPhone, HTTPS certificates enabled in the admin
   console. The server fetches/renews the certificate for `TS_HOST` (in `.env`) from the Tailscale
   app's local API at start and daily — `certs/ts.pem` + `ts.key`.
5. Laptop: https://localhost:8443 (local CA trusted in the login keychain), log in, tap
   "Activer les notifications".
6. iPhone (Tailscale on): Safari → https://alis-macbook-pro.tail7ec20e.ts.net:8443 → log in →
   Share → Add to Home Screen → open from the home screen → "Activer les notifications" → Allow.

## Daily
- **The Mac must stay awake** (plugged in, lid open; the screen may turn off).
- Phone reaches the app anywhere (Wi-Fi or 4G) as long as Tailscale is on on both devices.
- Suggestions appear only while a Claude Code session in `Wati outreach` is in `veille`.

## Useful
- Restart: `launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox`
- Stop: `launchctl bootout gui/$(id -u)/com.ali.wati-inbox`
- Password: `APP_PASSWORD` in `.env` (change it, then restart).
- Local certificate (localhost / .local, every ~2 years): `sh certs/make-certs.sh` + restart.
- Tailscale certificate: automatic; `grep tailscale logs/server.log` shows the last attempt.

## Suggestions (Claude) — daily session
`../Wati outreach/veille.sh` is called by launchd (`com.ali.wati-veille`, hourly 08–11 Mac time) and
opens a Terminal with `claude --model claude-sonnet-5 veille` at 09:00 Morocco time if none is running.
`sh veille.sh --now` starts one immediately. The session watches the app (PENDING / REQUESTED /
LESSON events), drafts suggestions, and logs lessons to `playbook/04-CAS-APPRIS.md` when Ali
answers differently from a suggestion. Stops re-arming at 21:00 Madrid.
Certificate: `node --env-file=.env renew-ts-cert.mjs` (run by veille-terminal.command every morning).
