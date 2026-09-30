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
  by itself** (since 2026-09-29): Ali opens the thread, ticks the **moves** the reply must make
  (combinable: Administration (2 temps), Downsell → 90h/96h/48h/24h/moins d'heures, Prolonger le
  délai → until when, Acompte → 196/96, Paiement, Démarrage plus tard, Relance, Basse pression,
  Clôture — chosen from the count of his own moves in 1 882 messages), adds a free consigne if
  needed, and taps "Rédiger la réponse". The **initial offer** (format, target level, hours/week,
  months — typed once per lead in the "Offre initiale" box, stored in `threads.offer`) goes into
  every prompt, and every downsell is computed from it (`downsellFrom`: same hours/week, level one
  jump lower, months recomputed, price and 10x monthly against the original). The app runs
  `claude -p --model claude-sonnet-5` in `../Wati outreach` (its CLAUDE.md, `lead.mjs`, the
  playbook), parses the structured answer (`bubbles` = the block to send now, `later` = the
  "bonne nouvelle" block of an administration two-step, why, note), stores it with the moves as
  `instruction` (and `parent_id` if a draft was already on screen), pushes "Brouillon prêt", and
  appends the draft to `../Wati outreach/data/suggestions/<date>.md`. One run at a time, 6-minute
  timeout. Labels and guidance per move live in `directions.mjs`; keep them in step with the playbook.
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
- `tbc-watch.mjs` + `tbc-fit-prompt.md` — the Sales Hub automation watch (2026-09-30). The TBC sequence
  (Day 0 20:20 preadmission · Day 1 14:00 / 17:00 / 19:00 reminders · Day 2 15:00 / 18:00 and Day 3 16:00
  recovery · Day 6 14:30 / Day 7 17:30 reactivation, Madrid time, Day 0 = the day the preadmission template
  landed) is sent by the Sales Hub, skips a "no reply" step while the lead wrote last, and fires as soon as
  Ali wrote last. Every minute the app checks each lead inside the sequence: **timing** alert when Ali
  replied less than `TBC_TIMING_BEFORE_MIN` (180) min before the next step and the lead is silent;
  **fit** check (recovery steps only, up to `TBC_FIT_LEAD_MIN` = 240 min before the step, max
  `TBC_FIT_MAX_PER_DAY` = 20 Sonnet runs) when Ali's last burst asks a question the lead has not answered:
  Claude says whether the template still makes sense and, if not, drafts the manual follow-up (the line
  Ali approved: "j'aurais besoin d'un retour aujourd'hui, même rapide, pour savoir où vous en êtes" +
  the unanswered question). Alerts: push (8h–22h) + section on the inbox + card on the thread with two
  steps — "J'ai mis en pause dans le Sales Hub" (Ali's word, never assumed) then the draft (copy / send /
  edit), locked until the pause is confirmed; a send from that card is refused otherwise. Alerts close
  when the lead replies, when the step time passes, or when the template lands anyway (then Ali is told).
  `SALES_HUB_URL` in `.env` adds a link. Dry run: `node --env-file=.env tbc-watch.mjs`.
- `db.mjs` — `data/inbox.sqlite` (threads, messages, suggestions, lessons, tm_messages, tm_flags,
  tbc_alerts, push subscriptions, sends, state).
- `wati.mjs` — the Wati calls (ported from `lead.mjs`, `send.mjs`, `check-templates.mjs`).
- `public/` — the app (plain HTML/JS), service worker, manifest, icon.
- `../Wati outreach/suggest.mjs` — posts a draft written in a Claude Code chat to the phone.

## The phone screen
Inbox: **only conversations whose 24h window is open** — leads waiting first, then the ones
already answered; a pasted number still opens any conversation (template if closed). "France TM"
link in the header with the count of new flags. Thread: the conversation, the window badge, the
**Offre initiale** line (Renseigner / Modifier: format, level, h/sem, months), then the **moves
panel** ("Que fait la réponse ?": tick several, the downsell target or the acompte or the deadline
appear when relevant, a free consigne, **Rédiger la réponse**; nothing ticked = a plain answer to
the lead's message), then the draft: a "Maintenant" card (one set of bubbles) — each bubble has
**Copier**, the card has **Envoyer telle quelle** (two taps), **Modifier avant envoi** and **Tout
copier** — and, for an administration two-step, a "Dans 5-10 min" card with **Programmer dans 7
min** (the Mac sends it by itself, a line shows the countdown with **Annuler**), **Envoyer
maintenant** and **Modifier**. "Pourquoi" is folded under the card; "À savoir" above carries what
Claude wants Ali to check; the moves that produced the draft are shown above it. The panel stays
under the draft to redo it. After a send, a line says what the app
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
