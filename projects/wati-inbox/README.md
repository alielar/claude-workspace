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
- `suggest-engine.mjs` + `suggest-prompt.md` + `directions.mjs` — the drafts. **Nothing is drafted
  by itself** (since 2026-09-29): Ali opens the thread, picks the cap (objective such as "Isoler le
  blocage", "Downsell → 90h / 990 € avec garantie", "Prolonger le délai via l'administration",
  "Acompte → 196 €"…, a tone, an optional free consigne) and taps "Rédiger la réponse". The app
  then runs `claude -p --model claude-sonnet-5` in `../Wati outreach` (its CLAUDE.md, `lead.mjs`,
  the playbook) with the cap's guidance in the prompt, parses the structured answer (**one** set
  of 2–3 bubbles + why + a note), stores it with the cap as `instruction` (and `parent_id` if a
  draft was already on screen), pushes "Brouillon prêt", and appends the draft to
  `../Wati outreach/data/suggestions/<date>.md`. One run at a time, 6-minute timeout. The labels
  and the guidance per cap live in `directions.mjs`; keep them in step with the playbook ladder.
- `learn-engine.mjs` + `learn-prompt.md` — the learning loop. After every send from the app (once
  the last bubble is out, 45 s of quiet so two batches merge): sent exactly as drafted → one line
  "validé tel quel" appended to `../Wati outreach/playbook/04-CAS-APPRIS.md`, no Claude run;
  edited or free text → one short `claude -p` run (context, the chain of drafts with Ali's
  consignes, what he sent) whose JSON answer becomes a titled lesson block, a one-line
  "retouche", or nothing. All under `## <date> — Appris dans l'app`; every draft reads that tail
  first. `lessons` table keeps what was learned. Cap `LEARN_MAX_PER_DAY` runs (default 40).
- `tm-monitor.mjs` + `tm-review-prompt.md` — the France TM bot monitor (2026-09-29). Up to 3 times a day, between 9h and 21h Madrid, only when at least 3 conversations moved
  (`TM_REVIEW_MAX_PER_DAY`, `TM_REVIEW_FROM_H`/`TO_H`, `TM_REVIEW_MIN_THREADS`, checked every
  `TM_REVIEW_EVERY_MS` = 4 h; "Review now" in the app always runs) it pulls the webhook events of the telemarketing number (+33671283778,
  both sides: the lead's messages and the bot's, phone decoded from the WhatsApp message id),
  stores them in `tm_messages`, and asks Claude (one Sonnet run, up to `TM_REVIEW_MAX_THREADS`
  = 25 conversations) to flag what the booking bot got wrong ("erreur") or could do better
  ("amelioration"). Flags land in `tm_flags` and on the "France TM" screen. Terminal:
  `node --env-file=.env tm-monitor.mjs`. Needs `../Wati outreach/.wati-webhook-secret`.
- `db.mjs` — `data/inbox.sqlite` (threads, messages, suggestions, lessons, tm_messages, tm_flags,
  push subscriptions, sends, state).
- `wati.mjs` — the Wati calls (ported from `lead.mjs`, `send.mjs`, `check-templates.mjs`).
- `public/` — the app (plain HTML/JS), service worker, manifest, icon.
- `../Wati outreach/suggest.mjs` — posts a draft written in a Claude Code chat to the phone.

## The phone screen
Inbox: **only conversations whose 24h window is open** — leads waiting first, then the ones
already answered; a pasted number still opens any conversation (template if closed). "France TM"
link in the header with the count of new flags. Thread: the conversation, the window badge, then
the **cap panel** ("Où va la réponse ?": objective chips, the downsell or acompte level when
relevant, tone, a free consigne, **Rédiger la réponse**), then the draft card (one set of bubbles)
— each bubble has **Copier**, the card has **Envoyer telle quelle** (two taps), **Modifier avant
envoi** (fills the composer) and **Tout copier**. "Pourquoi" is folded under it; "À savoir" above
carries what Claude wants Ali to check; the cap that produced the draft is shown above it. The
panel stays under the draft to redo it with another cap. After a send, a line says what the app
learned ("brouillon validé tel quel", "leçon notée — …"). France TM screen: one card per flag
(Erreur / Amélioration, number, what happened, the quoted message), **Voir la conversation**,
**Vu**, and **Relire maintenant**.

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
- Draft one lead from the terminal: `node --env-file=.env suggest-engine.mjs 33612345678 downsell "consigne"`
- Review the TM bot now: `node --env-file=.env tm-monitor.mjs`
- Password: `APP_PASSWORD` in `.env` (change it, then restart).
- `.env` knobs: `SUGGEST_MODEL` (claude-sonnet-5), `LEARN_MAX_PER_DAY` (40), `LEARN_QUIET_MS` (45000), `TM_REVIEW_EVERY_MS` (14400000), `TM_REVIEW_MAX_PER_DAY` (3), `TM_REVIEW_MIN_THREADS` (3), `TM_REVIEW_FROM_H`/`TM_REVIEW_TO_H` (9/21), `TM_REVIEW_MAX_THREADS` (25), `WATI_HOOK_URL`, `WATI_HOOK_KEY` (defaults to the secret file in Wati outreach).
- Local certificate (localhost / .local, every ~2 years): `sh certs/make-certs.sh` + restart.
- Tailscale certificate: `grep tailscale logs/server.log` shows the last attempt.
- Headless runs skip `~/.claude/settings.json` (`--setting-sources project,local`) because a
  malformed grep rule there makes every tool call fail in unattended mode.
