# Agents Hub — Implementation Plan

**Overall Progress:** `0%`

## TLDR
One private page (laptop + phone) that shows every Claude session running on the Mac — VS Code
windows, terminals, background workers — with their project, status (working / waiting for Ali /
done) and last message. From the same page Ali can start a new session, send it to the
background, read its log, message it, stop it, resume it, or delete it. Same idea as
`agent-office`, without the 3D office, GitHub boards, voice, multi-user or cloud hosting.

## Critical Decisions
- **Build our own thin page, don't install agent-office** — agent-office is a game, multi-user
  and cloud-hosted, and warns of breaking changes; Ali only wants overview + control.
- **Drive Claude Code's own commands, no custom agent runner** — Claude Code 2.1 already has
  `claude --bg`, `claude agents --json`, `attach`, `logs`, `stop`, `rm`, and writes a live
  status file per session in `~/.claude/sessions/`. The hub is a window onto these.
- **"Pause" = stop + resume later** — Claude Code has no true pause; stopping keeps the
  conversation, `claude --bg --resume <id>` picks it up again.
- **Runs on the Mac, like Wati Inbox** — one launchd job serving a local page, reached from the
  phone through the existing Tailscale tunnel. Sessions live on the Mac, so the hub must too.
- **No paid API, no AI calls of its own** — it only lists and controls sessions; the work done
  by sessions it starts is on Ali's normal Claude plan.
- **Leads safety stays intact** — new sessions start with the same permission mode as today; the
  hub never bypasses the "no sending to leads without Ali's word" rule.
- **English UI, plain text, no emojis, no filler sentences** — same rules as the other apps.

## Tasks:

- [ ] 🟥 **Step 1: Project setup**
  - [ ] 🟥 `CLAUDE.md` (what it is, where it runs, how to deploy, what is forbidden)
  - [ ] 🟥 Row in `projects/README.md` (project + background job)
  - [ ] 🟥 `.gitignore` (`node_modules`, `data`, `logs`) and `.env` (app password)

- [ ] 🟥 **Step 2: Read all sessions**
  - [ ] 🟥 Merge `claude agents --json --all` with `~/.claude/sessions/*.json` into one list
  - [ ] 🟥 Per session: name, project folder, where it runs (VS Code / terminal / background),
        status, started, last activity, last message
  - [ ] 🟥 Drop dead entries (process gone) so the list matches reality

- [ ] 🟥 **Step 3: Control actions**
  - [ ] 🟥 New session: pick project + type the task → starts in the background
  - [ ] 🟥 Stop, resume, delete, read log
  - [ ] 🟥 Send a message to a running session
  - [ ] 🟥 "Open on Mac": a copyable `claude attach <id>` command for taking over in a terminal

- [ ] 🟥 **Step 4: The page**
  - [ ] 🟥 One screen grouped by project, "needs Ali" sessions on top
  - [ ] 🟥 Session detail: live log + the action buttons
  - [ ] 🟥 Works on phone width and laptop

- [ ] 🟥 **Step 5: Alerts**
  - [ ] 🟥 Phone push when a session waits for input or finishes (reuse Wati Inbox push setup)

- [ ] 🟥 **Step 6: Run it for real**
  - [ ] 🟥 launchd job `com.ali.agents-hub` (always on, restarts on crash), password-protected,
        Tailscale address
  - [ ] 🟥 Test with Ali's real sessions: start one, stop it, resume it, get the alert
  - [ ] 🟥 Commit, push, tell Ali the address
