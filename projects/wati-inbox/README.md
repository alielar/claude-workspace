# Wati Inbox

Self-hosted app (runs on Ali's Mac) that notifies phone + laptop when a lead writes on the
**France Sales** WhatsApp number, shows the thread, lets Ali reply — free text while the 24h
window is open, French templates when it is closed — shows the reply suggestion written by
Claude Code (Sonnet) with the closing playbook in `../Wati outreach`, takes Ali's instruction for
a redraft, and learns from every message he sends.

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
  CLAUDE.md, `lead.mjs`, the playbook), parses the structured answer (**one** set of 2–3
  bubbles + why + a note), stores it, pushes "Suggestions prêtes", and appends the draft to
  `../Wati outreach/data/suggestions/<date>.md` for the evening review. One run at a time,
  6-minute timeout, at most `SUGGEST_MAX_PER_DAY` automatic drafts a day (default 40).
  "Demander une suggestion" in the app drafts immediately, even when auto is off. The box under
  the suggestion ("Refaire avec cette consigne") sends Ali's words to Claude with the refused draft;
  the redraft is stored with its `instruction` and `parent_id`.
- `learn-engine.mjs` + `learn-prompt.md` — the learning loop. After every send from the app (once
  the last bubble is out, 45 s of quiet so two batches merge): sent exactly as drafted → one line
  "validé tel quel" appended to `../Wati outreach/playbook/04-CAS-APPRIS.md`, no Claude run;
  edited or free text → one short `claude -p` run (context, the chain of drafts with Ali's
  consignes, what he sent) whose JSON answer becomes a titled lesson block, a one-line
  "retouche", or nothing. All under `## <date> — Appris dans l'app`; every draft reads that tail
  first. `lessons` table keeps what was learned. Cap `LEARN_MAX_PER_DAY` runs (default 40).
- `db.mjs` — `data/inbox.sqlite` (threads, messages, suggestions, push subscriptions, sends, state).
- `wati.mjs` — the Wati calls (ported from `lead.mjs`, `send.mjs`, `check-templates.mjs`).
- `public/` — the app (plain HTML/JS), service worker, manifest, icon.
- `../Wati outreach/suggest.mjs` — posts a draft written in a Claude Code chat to the phone.

## The phone screen
Inbox: leads waiting first, "brouillon prêt" / "Claude rédige…" pills, the "Suggestions auto :
ON/OFF" switch. Thread: the conversation, the window badge, then the suggestion card (one set of
bubbles) — each bubble has **Copier**, the card has **Envoyer telle quelle** (two taps),
**Modifier avant envoi** (fills the composer) and **Tout copier**. "Pourquoi" is folded under it;
"À savoir" above carries what Claude wants Ali to check (window closed, a number to confirm).
Under the card, a text box: Ali writes what is wrong, taps **Refaire avec cette consigne**, and a
new draft replaces the old one (the consigne is shown above it). After a send, a line says what
the app learned ("brouillon validé tel quel", "leçon notée — …").

Opening a conversation is instant (stored copy first, Wati re-read in the background) and lands
on the newest message; a redraw keeps the scroll and never happens while Ali is typing.
**Bubbles go out one by one**: the first at once, each next one 5–10 s later (5 s + 20 ms per
character), from the Mac, so the phone can lock. The thread shows "Envoi 2/3…" meanwhile and
refuses a second send for that lead until the queue is done.

## Addresses
- On the Mac itself: https://localhost:8443
- Any device on Tailscale (phone, another laptop): https://alis-macbook-pro.tail7ec20e.ts.net:8443
- Same Wi-Fi without Tailscale: https://alis-macbook-pro.local:8443 (needs the local CA trusted)

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
- `.env` knobs: `SUGGEST_MODEL` (claude-sonnet-5), `SUGGEST_MAX_PER_DAY` (40), `SUGGEST_DEBOUNCE_MS` (90000), `LEARN_MAX_PER_DAY` (40), `LEARN_QUIET_MS` (45000).
- Local certificate (localhost / .local, every ~2 years): `sh certs/make-certs.sh` + restart.
- Tailscale certificate: `grep tailscale logs/server.log` shows the last attempt.
- Headless runs skip `~/.claude/settings.json` (`--setting-sources project,local`) because a
  malformed grep rule there makes every tool call fail in unattended mode.
