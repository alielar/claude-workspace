# The map — every project, service, job and key (updated 2026-09-27)

## Projects

| Project | What it is | Runs where | Live address | Deploy | Data | Keys | Guide |
|---|---|---|---|---|---|---|---|
| `ali-hub` | A L I, Ali's private daily dashboard (phone app) | Vercel | https://ali-hub.vercel.app | `cd projects/ali-hub && npx vercel --prod --yes`, then open `/api/admin/migrate` | Turso (cloud database) | `.env.local` + Vercel env vars | `ali-hub/CLAUDE.md`, `ALI_SPEC.md` |
| `Home Food MGMT/bsaha` | Bsaha, the family meal app | Vercel | https://bsaha-pink.vercel.app | `cd "projects/Home Food MGMT/bsaha" && npx vercel --prod --yes` | Turso (cloud) + `local.db` for dev | `.env.local` + Vercel env vars | `bsaha/CLAUDE.md`, `../PLAN.md` |
| `Wati outreach` | Closing assistant for French leads: drafts, campaigns, playbook | Mac (scripts run by hand or by the nightly job) | none | nothing to deploy | `data/` (git-tracked exports), playbook in `playbook/` | `.env` (Wati key), `.wati-webhook-secret` | `Wati outreach/CLAUDE.md` |
| `wati-inbox` | Phone app: lead notifications, replies, Claude suggestions | Mac, background job, reached through Tailscale | https://alis-macbook-pro.tail7ec20e.ts.net:8443 (phone), https://localhost:8443 (Mac) | `launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox` | `data/inbox.sqlite` (git-ignored) | `.env` (Wati key, app password, push keys) | `wati-inbox/CLAUDE.md`, `README.md` |
| `_archive` | Frozen copies (Wati Inbox of 2026-09-25) | nowhere | none | never | none | none | `RESTORE.md` inside |

## Background jobs on the Mac

| Job | When | What it does | Log |
|---|---|---|---|
| `com.ali.wati-inbox` (launchd) | always, restarts on crash | Reads Wati every 45 s, notifies the phone, serves the app, drafts suggestions with headless Claude | `projects/wati-inbox/logs/server.log`, `logs/suggest.log` |
| `com.ali.wati-nightly-review` (launchd) | 21:03 every day | Headless Claude compares the day's drafts with what Ali sent, logs lessons in the playbook | `projects/Wati outreach/logs/nightly-<date>.log` |
| `com.ali.ali-hub-fix-worker` (launchd) | always, restarts on crash | Every 30 s asks ali-hub for queued Fix-chat requests; when there are some, runs Claude Code headless in `projects/ali-hub`, ships, reports back (one batch at a time) | `projects/ali-hub/fix-worker/logs/launchd.log`, `logs/batch-<id>.log` |
| `auto-save.sh` (cron) | 23:47 every day | Commits and pushes everything in the workspace to GitHub | `.auto-save.log` at the workspace root |

The Mac must stay awake (lid open, screen may lock) for the first two.

## Services and what they hold

| Service | Role | Account / where |
|---|---|---|
| GitHub | Backup and history of this whole folder. Nothing runs from it. | `alielar/claude-workspace`, branch `main` |
| Vercel | Hosts A L I and Bsaha. Deploys are uploaded from the Mac, not from GitHub. | team `team_YpCsjVr9RMjzKKXToILEb0LI`, projects `ali-hub`, `bsaha` |
| Turso | Cloud databases for A L I and Bsaha | keys in each app's `.env.local` |
| Tailscale | Private tunnel phone ↔ Mac, only Ali's devices, only used by Wati Inbox | personal account, network `tail7ec20e` |
| Wati | WhatsApp API for the France Sales number (+33673555977). The telemarketing number is write-only. | key in `Wati outreach/.env` and `wati-inbox/.env` |
| Claude Code | Runs on the Mac as Ali's user, from Cursor or the terminal. Headless runs (`claude -p`) power the suggestions and the nightly review through the subscription, no API key. | `~/.claude/settings.json` |

## What Claude can reach on this Mac, in one paragraph

Claude Code runs under Ali's own user account, so it can read and change any file that account
can, run any program, and see system settings. The permission mode ("auto") lets routine work
through and a safety filter stops risky actions (it refuses to edit its own settings file and
to force-push). Sending messages to leads is gated by the rule in the workspace `CLAUDE.md` and
by an "ask" rule in the settings, so it always needs Ali's tap. macOS once asked "node would
like to access data from other apps": that is the system's own privacy prompt for programs
started by node (the scripts here); it can be revoked in System Settings → Privacy & Security.
