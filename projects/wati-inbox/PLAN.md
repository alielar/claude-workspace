# Feature Implementation Plan — Wati Inbox (France Sales), self-hosted on the Mac

**Overall Progress:** `80%`

## TLDR
A small web app that runs **on Ali's Mac** (no Vercel, no Turso, no external provider) and that Ali adds to his phone's home screen and keeps open on his laptop. It:
1. notifies phone + laptop the moment a lead writes on the **France Sales** number (+33673555977) — TM number ignored;
2. lists the leads still waiting for a reply and shows the full thread;
3. lets Ali reply from the app: free text while the 24h window is open, a **French-templates-only** picker when it is closed;
4. shows reply suggestions drafted by **Claude in this workspace** (same playbook, same quality as here) — tap to fill the composer, edit, send.

## Critical Decisions
- **Everything runs on the Mac.** One Node process (`server.mjs`), SQLite via Node's built-in `node:sqlite` (Node 24 is installed), no framework, no cloud account. Started at login by launchd so it survives reboots. Data lives in `projects/wati-inbox/data/inbox.sqlite`.
- **Polling instead of a webhook.** A webhook needs a public address; we don't have one. Instead the app reads the threads active in the last 24 h every 45 s, the 1–14-day-old ones every 5 min, and contacts page 1 for brand-new leads (verified 2026-09-24: Wati's contact `lastUpdated` moves only when a chat opens, not per message). Delay ≤ 1 min. Nothing to register in Wati.
- **Push notifications, no provider.** Web Push with a VAPID key pair generated once on the Mac. Delivery to the iPhone goes through Apple's own push relay (built into iOS, no account, no cost — this is the one hop that physically cannot be avoided; same on Mac for Safari/Chrome).
- **HTTPS with a certificate made on the Mac.** iOS only installs a web app and only receives push from an HTTPS address. `mkcert` creates a local certificate authority; Ali installs its profile on the iPhone once. No domain, no Let's Encrypt.
- **Reach:** laptop → `https://localhost:8443`. Phone → `https://<mac-name>.local:8443` on the **home Wi-Fi**. Away from home, notifications still arrive but tapping them cannot open the app (the Mac isn't reachable). The only fix would be a VPN such as Tailscale (free, but an external provider) — **off unless Ali says yes**.
- **The Mac must stay awake**: plugged in, lid open, screen may turn off. A sleeping Mac = no polling, no notifications.
- **Replies:** window open → `sendSessionMessage`, one call per bubble in order. Window closed → picker of approved **French** templates from Wati (same filter as `check-templates.mjs`), name pre-filled, sent with `sendTemplateMessages` like `send.mjs`. Every send logged.
- **Suggestions come from Claude Code on the same Mac, no API spend.** The app writes pending leads to its database; `watch-pending.mjs` prints one line per lead waiting; a Claude Code session in `Wati outreach` sits on it with the Monitor tool, wakes only when there is something to draft, drafts per the playbook, and `suggest.mjs` writes the options into the database. Phone gets a push "Suggestions prêtes". Idle = zero credits. Suggestions only arrive while Claude Code is open on the Mac; typing `c` also posts drafts.
- **Secrets:** `.env` in `wati-inbox` (Wati keys copied from `Wati outreach/.env`, `APP_PASSWORD`, VAPID keys). Git-ignored.

## Tasks:

- [x] 🟩 **Step 1: Server skeleton** (`projects/wati-inbox`)
  - [x] 🟩 `server.mjs` — HTTPS server, static files, JSON API, password login (cookie), SQLite tables: `threads`, `messages`, `suggestions`, `push_subscriptions`, `sends`
  - [x] 🟩 `wati.mjs` — `getThread(waId)`, `sendText`, `listFrenchTemplates`, `sendTemplate` (ported from `lead.mjs` / `send.mjs` / `check-templates.mjs`)
  - [x] 🟩 local CA + certificate made with openssl (no mkcert on this Mac) for `localhost` and `<mac-name>.local`
  - [x] 🟩 launchd plist: start at login, restart on crash, log to `logs/`

- [ ] 🟨 **Step 2: Poll → push**
  - [x] 🟩 `poll.mjs` (inside the server): every 45 s, fetch threads of active leads, detect new lead messages, mark thread pending, store
  - [x] 🟩 Web Push: VAPID keys generated once, `push` + `notificationclick` in the service worker, notification = lead name + text, tap opens `/t/<waId>`
  - [x] 🟩 Settings page: "Activer les notifications" (phone must be installed on the home screen first)
  - [ ] 🟨 **Ali (phone must be on the home Wi-Fi, and Node allowed through the Mac firewall):** install the certificate profile on the iPhone, open `https://<mac-name>.local:8443` on home Wi-Fi, add to home screen, enable notifications; same on the laptop browser

- [x] 🟩 **Step 3: Inbox + thread**
  - [x] 🟩 `/` — pending leads first (name, number, last message, "il y a X min"), then recently handled
  - [x] 🟩 `/t/<waId>` — thread (lead left / us right, Madrid time), window badge (OUVERTE + time left / FERMÉE), templates already sent listed at the top like `lead.mjs`
  - [x] 🟩 Composer (window open): multi-bubble text, "Envoyer" sends bubble by bubble; thread marked handled
  - [x] 🟩 Template picker (window closed): approved French templates, name pre-filled, preview, send; thread marked handled

- [x] 🟩 **Step 4: Suggestions from Claude**
  - [x] 🟩 `suggestions` table + push "Suggestions prêtes · <name>" when a row lands
  - [x] 🟩 Thread page shows suggestion cards; tap = fills the composer (editable), "Pourquoi" folded under each
  - [x] 🟩 `Wati outreach/watch-pending.mjs` — reads the SQLite file every 30 s, prints `PENDING <waId> <name>` for leads without a fresh suggestion
  - [ ] 🟥 `Wati outreach/suggest.mjs <waId>` — writes a drafted set of options into the database
  - [x] 🟩 `Wati outreach/CLAUDE.md` — new signal `veille` (run the watcher under Monitor; on each PENDING line: `lead.mjs`, quick card, draft, `suggest.mjs`); `c` also posts its drafts

- [ ] 🟨 **Step 5: Verify**
  - [ ] 🟥 Real lead end-to-end: message → push on phone + laptop within a minute → `veille` wakes → suggestions push → tap → edit → send → visible in Wati
  - [ ] 🟥 Closed-window path: template picker → send → visible in Wati
  - [x] 🟩 Reboot the Mac: server comes back by itself, polling resumes
  - [x] 🟩 README in `wati-inbox` (setup, phone install steps, Mac-must-stay-awake note) + one line in `Wati outreach/CLAUDE.md`
