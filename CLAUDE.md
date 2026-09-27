# Ali's workspace — how every project is run

One git repository (`alielar/claude-workspace`, branch `main`), one folder per project under
`projects/`. The map of what exists, where it runs and which keys it uses is
`projects/README.md`. Read it when you start in a project you do not know. Each project has its
own `CLAUDE.md` with the details; this file holds the rules that apply everywhere.

## Talking to Ali

Plain language, short. Ali is a product person, not an engineer: say what a thing does, not how
it is built. Lead with the result. Numbers in a table or on their own line.

## The one routine, after every verified change

1. Verify it works (run it, open it, read the log).
2. `git add <the files you changed>` then `git commit` with a plain-language message.
3. `git push` (the nightly cron at 23:47 pushes too, but do not rely on it).
4. Deploy with the project's own command (in its `CLAUDE.md`), then check the live address.
5. Tell Ali in two lines what changed and where to look. If a step failed, say so, with the output.

## Hard limits

- **Never send a message to a lead or a student without Ali's explicit instruction in the same
  conversation.** That covers `send.mjs`, `send-feedback-call.mjs`, any call to Wati's send
  endpoints, and any script that wraps them. Drafting is fine; sending needs his word each time.
- Never run a paid API or launch subagents without asking first (Ali's weekly credits).
- Never invent a price, a rule or a date for a lead; ask.
- Secrets live in each project's `.env` / `.env.local`, are git-ignored, and are never printed
  or pasted into a message.
- Background jobs on the Mac are listed in `projects/README.md`; do not add, stop or change one
  without saying so in the reply.
- `_archive/` is history: read it, never run from it.

## Starting a new project

1. A folder under `projects/`, named plainly.
2. A `CLAUDE.md` inside with four sections: what it is, where it runs, how to deploy, what is
   forbidden.
3. One row in `projects/README.md`.
4. Secrets in a git-ignored `.env`; a `.gitignore` for `node_modules`, `data`, `logs`.
