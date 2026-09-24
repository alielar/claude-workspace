# Wati Inbox

Self-hosted app (runs on Ali's Mac) that notifies phone + laptop when a lead writes on the
**France Sales** WhatsApp number, shows the thread, and lets Ali reply — free text while the
24h window is open, French templates when it is closed. Reply suggestions are written by
Claude Code in the `Wati outreach` folder (signal `veille`), never by another model.

No cloud, no external provider: one Node process, one SQLite file, a certificate made here.

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
4. Laptop: trust `certs/ca.pem` (done via `security add-trusted-cert`), open
   https://localhost:8443, log in, tap "Activer les notifications".
5. iPhone (home Wi-Fi):
   - Safari → https://Alis-MacBook-Pro.local:8443/ca.pem → "Allow" the profile download
   - Settings → Profile Downloaded → Install
   - Settings → General → About → Certificate Trust Settings → enable "Wati Inbox local CA"
   - Safari → https://Alis-MacBook-Pro.local:8443 → Share → Add to Home Screen
   - Open the app from the home screen → log in → "Activer les notifications" → Allow

## Daily
- **The Mac must stay awake** (plugged in, lid open; the screen may turn off).
- Phone reaches the app only on the home Wi-Fi. Notifications arrive anywhere.
- Suggestions appear only while a Claude Code session in `Wati outreach` is in `veille`.

## Useful
- Restart: `launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox`
- Stop: `launchctl bootout gui/$(id -u)/com.ali.wati-inbox`
- Password: `APP_PASSWORD` in `.env` (change it, then restart).
- Renew the certificate (every ~2 years): `sh certs/make-certs.sh` + restart.
