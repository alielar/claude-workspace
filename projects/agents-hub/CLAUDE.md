# Agents Hub

## What it is
One private page (laptop and phone) listing every Claude Code session on this Mac: Cursor panels,
terminals, scripts, background sessions. Grouped by what needs Ali: Needs you, Working, Done
(unread), Open, Paused, Older (idle over 24 h, "Close all"). Filter by project. Opening a session
shows its conversation (Claude's answers in full, tool calls folded to one line).

Chatting (2026-10-11): every session can be chatted with from the hub, approvals and questions
included, the way Cursor's panel does it.
- **Hub sessions** (`live.mjs`): the hub holds the Claude process itself through Anthropic's Agent SDK
  (`@anthropic-ai/claude-agent-sdk`, the toolkit the Cursor extension is built on), with Ali's own
  `claude` program and login (no API key, `ANTHROPIC_API_KEY` stripped), settings sources
  user/project/local like Cursor. Claude's answer streams in (page polls every 0.7 s while it works).
  Approvals, AskUserQuestion and ExitPlanMode arrive through `canUseTool` and show as cards (Allow /
  Always allow / Decline with a note, option tiles, Approve plan / Keep planning). Stop button =
  `interrupt()`. `data/live.json` remembers hub sessions; Pause or a hub restart lets the process go,
  the next message wakes it (same session id).
- **Cursor / terminal / background sessions**: sending a message takes the session over: its process is
  ended (SIGTERM, or `claude stop` for background), then the hub resumes the same conversation. If
  Claude is mid-turn there, the message is queued and the takeover happens when the turn ends.
  "Open in Cursor" hands a hub session back (the hub lets go first, then
  `cursor://anthropic.claude-code/open?session=<id>`), so only one window writes a conversation.
- **New session**: project, task, Here (hub) or In Cursor (Mac only), model Default / Sonnet / Haiku.
- **Dictation**: mic button in every box, same engine as Wati Inbox (local Whisper). The hub forwards
  `/api/transcribe` to Wati Inbox on localhost:8443 with its cookie (same password), so one model sits
  in memory. Cursor's own dictation uses Ali's private login token on Anthropic's speech service; not copied.
- Messaging Cursor panels in place is impossible from outside (keyed sockets in `/tmp/cc-socks`); the
  takeover is the replacement.

Alerts: phone push when a session starts waiting for Ali, or finishes a background turn or any turn
longer than 45 s. Turned on per device with "Turn on alerts" (on iPhone, from the Home Screen app).

Everything comes from Claude Code itself: `claude agents --json --all`, `~/.claude/sessions/<pid>.json`
(status, waiting reason, Remote Control id), `~/.claude/projects/<cwd>/<sessionId>.jsonl` (the
conversation, read from its last 3 MB). No AI calls of its own beyond the sessions Ali starts or chats with.

## Where it runs
On the Mac only, as the launchd job `com.ali.agents-hub` (one Node process, `server.mjs`, port 8450).
Mac: https://localhost:8450 (no password). Phone: https://alis-macbook-pro.tail7ec20e.ts.net:8450
(Tailscale, password = Wati Inbox's `APP_PASSWORD`). Certificates are read from
`../wati-inbox/certs` (renewed there). State in `data/` (git-ignored): `seen.json` (read marks),
`subscriptions.json`, `queue.json`, `prefs.json`, `live.json` (hub sessions). Log: `logs/server.log`.

Files: `sessions.mjs` (reading and acting on sessions), `live.mjs` (hub-held sessions), `server.mjs`
(API, polling, push, dictation proxy), `public/` (the page, plain JS, no build; `dictation.js`).
Design: Geist font, warm Claude accent, project monograms (two letters, unique), status pills, follows
A L I's rules (44 px targets on the phone, no all-caps labels, no filler text, no emojis).

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
