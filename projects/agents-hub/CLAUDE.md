# Agents Hub

## What it is
One private page (laptop and phone) listing every Claude Code session on this Mac: Cursor panels,
terminals, scripts, background sessions. Grouped by what needs Ali: Needs you, Working, Done
(unread), Open, Paused, Older (idle over 24 h, "Close all"). Filter by project. Opening a session
shows its conversation (Claude's answers in full, tool calls folded to one line).

What each kind of session can do from here:
- **Background** (started here or with `claude --bg`): new, message, pause, resume, delete, open
  in Terminal. A message sent while Claude is working is queued and leaves when the turn ends.
  A message is sent as `claude stop` then `claude --bg --resume <id> "<text>"` (resuming a running
  session would make a copy).
- **Cursor / terminal**: open in Cursor (`cursor://anthropic.claude-code/open?session=<id>`),
  reply in the Claude app (Remote Control link `https://claude.ai/code/session_…`), close
  (SIGTERM to its process; the conversation stays, `/resume` finds it). Messaging them directly is
  not possible: Claude Code's session sockets are locked with per-process keys.
- **New session**: project, task, Background or Cursor (Cursor only from the Mac), model Default /
  Sonnet / Haiku. Project and model are remembered.

Alerts: phone push when a session starts waiting for Ali, or finishes a background turn or any turn
longer than 45 s. Turned on per device with "Turn on alerts" (on iPhone, from the Home Screen app).

Everything comes from Claude Code itself: `claude agents --json --all`, `~/.claude/sessions/<pid>.json`
(status, waiting reason, Remote Control id), `~/.claude/projects/<cwd>/<sessionId>.jsonl` (the
conversation, read from its last 3 MB). No AI calls of its own, no API key.

## Where it runs
On the Mac only, as the launchd job `com.ali.agents-hub` (one Node process, `server.mjs`, port 8450).
Mac: https://localhost:8450 (no password). Phone: https://alis-macbook-pro.tail7ec20e.ts.net:8450
(Tailscale, password = Wati Inbox's `APP_PASSWORD`). Certificates are read from
`../wati-inbox/certs` (renewed there). State in `data/` (git-ignored): `seen.json` (read marks),
`subscriptions.json`, `queue.json`, `prefs.json`. Log: `logs/server.log`.

Files: `sessions.mjs` (reading and acting on sessions), `server.mjs` (API, polling, push),
`public/` (the page, plain JS, no build).

## How to deploy
There is no deploy. After a change:
```
node --check server.mjs && launchctl kickstart -k gui/$(id -u)/com.ali.agents-hub && tail -3 logs/server.log
```
First install or after moving the folder: `sh launchd/install.sh`. Then commit and push.

## What is forbidden
- Starting a session that sends to a lead or a student: the hub starts sessions with Ali's normal
  permissions, the workspace rule (no send without Ali's word in the same conversation) still holds.
- Talking to session sockets in `/tmp/cc-socks` (private protocol with keys); use Claude Code's commands.
- Closing or deleting a session Ali did not ask to close, outside the "Close all" he taps.
- Printing `.env` values.
