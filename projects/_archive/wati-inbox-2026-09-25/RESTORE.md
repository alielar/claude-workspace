# Wati Inbox — archived 2026-09-25 (full app: inbox, replies, templates, Claude suggestions, veille)

Ali kept only the notification part running (`projects/wati-inbox`, mode NOTIFY_ONLY). To bring the
full app back (≈10 minutes):

1. `cp -R _archive/wati-inbox-2026-09-25/app/* projects/wati-inbox/` (keeps the live `.env`, `certs/`, `data/`).
2. In `projects/wati-inbox/.env` remove the line `NOTIFY_ONLY=1`.
3. `cd projects/wati-inbox && npm install && launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox`.
4. Copy `wati-outreach-veille/*.mjs`, `veille.sh`, `veille-terminal.command` back into `projects/Wati outreach/`,
   `claude-settings.json` → `.claude/settings.json`, and append `CLAUDE-section.md` to that folder's `CLAUDE.md`.
5. Daily 09:00 Morocco veille session: recreate `~/Library/LaunchAgents/com.ali.wati-veille.plist`
   (hourly 08–11 Mac time → `veille.sh`; see `app/README.md`), `launchctl bootstrap gui/$(id -u) <plist>`.
6. Phone: the home-screen app and its push subscription survive; if Tailscale was turned off, turn it back on
   on both devices (address `https://alis-macbook-pro.tail7ec20e.ts.net:8443`).

Everything else (Tailscale cert renewal, lessons loop, template sending, search by number) is documented in
`app/README.md` and `app/PLAN.md`.
