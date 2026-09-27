# Claude workspace

Everything Ali builds with Claude Code lives here, in one git repository.

- `CLAUDE.md` — the rules that apply to every project (the routine after a change, the hard limits, how to start a project).
- `projects/README.md` — the map: every project, where it runs, its address, how to deploy it, which keys it uses, the background jobs on the Mac.
- `projects/<name>/CLAUDE.md` — the guide of one project.
- `skills/`, `templates/` — reusable pieces.

A nightly cron job (23:47) commits and pushes the whole folder to GitHub as a backup.

*Last updated: 2026-09-27*
