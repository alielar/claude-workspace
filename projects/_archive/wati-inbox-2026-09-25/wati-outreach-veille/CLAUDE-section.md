## Wati Inbox (the phone app) — `veille`, suggestions, and learning

`../wati-inbox` is the self-hosted app that notifies Ali's phone and laptop when a lead
writes on the France Sales number, and lets him reply from there. Suggestions shown in
that app are written **by this session**, never by another model. Ali wants them written
by **Sonnet** — the daily session is launched with `--model claude-sonnet-5`; if `veille`
is typed in a session running another model, say so once and continue.

- **Signal: `veille`** (alone, as the whole message): run `node watch-pending.mjs` under
  the Monitor tool (30-minute arms, re-arm on expiry) and stay on it. Each line is an event:
  - `PENDING <waId> <name> — …` — a lead waiting for a reply, no suggestion yet.
  - `REQUESTED <waId> <name> — …` — Ali tapped "Demander une suggestion" in the app (draft
    even if the lead isn't pending, or draft a fresh set).
  - For both: `node --env-file=.env lead.mjs <waId>`, quick card (playbook only if needed),
    draft 2–3 options, then `node suggest.mjs <waId> '<json>'` with
    `[{bubbles:[…], why:"…"}, …]` — bubbles in the exact house format (2–3 short bubbles,
    question last), `why` = the two "Pourquoi" lines. One line in the chat per lead, no
    need to repeat the drafts.
  - `LESSON <waId> <name> — …` — Ali answered differently from the suggestion (edited it in
    the app, wrote his own text, or replied from Wati). Run `node compare-sent.mjs <waId>`,
    work out **why** his version is better or what rule it reveals (tone, timing, a number,
    a concession, a case the card doesn't cover), and append the case to
    `playbook/04-CAS-APPRIS.md` in that file's format — **silently**: no question, no
    summary in the chat beyond one line ("leçon notée : …"). If the difference is only
    wording with no rule behind it, note nothing. This is the self-improvement loop Ali
    asked for; it runs on every deviation, always.
  - The watch ends at **21:00 Madrid**: don't re-arm after that, say "veille terminée".
- **`c` / `C`** also posts its drafts to the app with `suggest.mjs`, in addition to
  showing them in the chat.
- The watcher reads the app's SQLite file directly; the app must be running
  (launchd job `com.ali.wati-inbox`, log in `../wati-inbox/logs/server.log`). Every day at
  09:00 Morocco time a Terminal window opens by itself with `claude --model claude-sonnet-5
  veille` (`veille.sh` + launchd job `com.ali.wati-veille`).
