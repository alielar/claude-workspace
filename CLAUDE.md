# Claude Workspace

This is Ali's master project folder. Every project lives in `projects/`.

## Who I am
- Technical PM who builds production apps with AI assistance
- Strong fundamentals, learning as I build
- I work across Claude Code (terminal/Cursor) and Cowork (desktop)

## Workflow I follow for every project

1. `/explore` — understand the codebase fully before touching anything
2. `/create-plan` — produce a structured markdown plan
3. `/execute` — implement precisely as planned
4. `/review` — code review after implementation
5. `/document` — update docs after changes

Use `/create-issue` to quickly capture bugs or ideas mid-development without breaking flow.
Use `/learning-opportunity` when I want to understand something deeply instead of just shipping it.
Use `/peer-review` when external feedback has been given on the code.

## Project structure
Each project in `projects/` has its own `CLAUDE.md` with project-specific context.
Always read the project's `CLAUDE.md` before starting work on it.

## Communication rules
- **Plain language only.** Ali is not a developer. Explain everything in simple, everyday words — no jargon, no code terminology, no internal names. Describe what things do in terms of what the user sees, not how the code works.
- **Be independent.** Don't ask Ali to check environment variables, look at logs, or do technical steps. Figure it out yourself, or give step-by-step instructions so simple a non-technical person can follow them.
- **Report clearly.** When summarising changes, exploring a problem, or presenting a plan, write it so someone with zero coding knowledge can understand what's happening, what changed, and why.

## Development rules
- **Challenge the direction.** If there's a faster, smarter, or more effective path to reach the goal, suggest it. Don't just execute — push back when it makes sense.
- **Test before you respond.** After making code changes, run the build or relevant tests to check for errors before saying "done." Never claim something is finished if it's untested.
- **Reduce complexity.** Always look for ways to simplify. Remove files that are redundant or unnecessary. If something can work the same way with less code, optimise it.
- **Quality gate.** Don't ship broken or half-finished features. If something isn't working properly, fix it before moving on.

## General preferences
- Be concise and direct — no filler
- Always think before acting: explore first, plan second, execute third
- When unsure, ask one focused question rather than guessing
- Prefer small, reviewable commits over large changes
