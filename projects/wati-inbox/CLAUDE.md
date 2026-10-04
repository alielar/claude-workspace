# Wati Inbox

## What it is
The phone app Ali uses to answer French leads: a notification for every message on the France
Sales WhatsApp number, the thread, a reply box (free text while the 24h window is open, French
templates when it is closed), and reply suggestions written by Claude with the closing playbook
in `../Wati outreach`. Details and setup in `README.md`; history and decisions in `PLAN.md`.

## Where it runs
On the Mac only, as the launchd job `com.ali.wati-inbox` (one Node process, `server.mjs`, port
8443, SQLite in `data/inbox.sqlite`). The phone reaches it through Tailscale at
`https://alis-macbook-pro.tail7ec20e.ts.net:8443`. Since 2026-09-30 a draft starts **by itself**
`AUTO_DELAY_MS` (60 s) after a lead's last bubble (`suggest-engine.mjs`, `scheduleAutoDraft`): Claude
picks the moves from `directions.mjs` (administration two-step, downsell from the stored initial offer,
délai, acompte, paiement, démarrage, relance, basse pression, clôture), or asks Ali for the one thing
it needs (`kind = needs`, e.g. the initial offer before a downsell), or says the message needs no reply
(`kind = skip`). Ali can still steer (folded "Refaire le brouillon" panel: offer, moves, consigne); one
set of bubbles per draft plus a `later` block for the administration two-step, editable in the app
before the Mac sends it 7 min later (bubbles spaced 5-10 s like any send); **One notification per lead message** (2026-09-30): the phone is not pushed when the message arrives but when the draft is ready
(`poll.mjs`, `deferNotification`); the push carries the lead's text, the reply is on screen when Ali opens it. If no draft came
within 5 min (window closed, cap, error) the plain message is pushed. Every send marks the thread as treated; the Traité button sits in the header. A draft disappears (list pill and thread box, no push) once as many human messages as it has bubbles have left after it (Ali copies and sends them one by one, 2026-10-01), from the app or from Wati, or when Ali tapped Handled — except the second part of a two-step draft still to send (`suggestionVisible` in `db.mjs`). Lessons by `learn-engine.mjs` after every
send (written to `../Wati outreach/playbook/04-CAS-APPRIS.md`); the France TM booking bot is
reviewed by `tm-monitor.mjs` (capped: 3 reviews a day, 9h–21h, only when ≥ 3 conversations moved) (webhook events → `tm_messages` → flags in `tm_flags`; « Pas une erreur » on a flag stores `verdict = not_issue` and the last 40 such cases are injected into every review prompt so they are not flagged again, 2026-10-01);
the Sales Hub "to be converted" sequence is watched by `tbc-watch.mjs` (2026-09-30): it knows the fixed schedule
(Day 0 20:20 … Day 7 17:30, counted from the preadmission template) and, from the recovery week on, asks Sonnet
whether the next template still makes sense when Ali's diagnostic question (what really blocks you?) went
unanswered — the only case Ali wants flagged; enrolled leads and "solution proposed, no answer" cases are left to
the templates (`fit`); if it does not fit, a push + a card in the thread: 1. pause it in the Sales
Hub (Ali confirms, the app never claims it), 2. the manual follow-up, unlocked only after that confirmation.
Rows in `tbc_alerts`; `SALES_HUB_URL` in `.env` adds a link. Terminal dry run: `node --env-file=.env tbc-watch.mjs`.
**Sales Hub mirror and the day plan** (2026-10-01, Mateo's read-only API, token `SALES_HUB_TOKEN` in `.env`, client `hub.mjs`):
`hub-sync.mjs` copies the FR automations into `hub_leads` every minute and the cadence steps with their real WATI text
into `hub_templates` every hour (limits 30/min, 600/h; a 429 or 5xx backs off). `plan-engine.mjs` writes **one card per
lead and per day** (`plan_items`) for every lead that matters today — paused (a human follow-up is due), next template
within 24 h, stuck (`next` in the past) or finished sequence — judged by one Sonnet run per batch of 6 with the
conversation, the Hub state and the template text (`plan-prompt.md`). Kinds: `pause` (template contradicts the thread → pause
in the Hub, status OR/CITF suggested), `followup` (time + draft, inserted as a normal suggestion `source = plan`), `wait`,
`fix` (data issues), `ok`. Morning run at `PLAN_AT` (08:30 since 2026-10-04, before the 09:00 CITF resumes), then every 5 min for what moved; cap `PLAN_MAX_CALLS` (80/day). A batch that times out is retried once in two halves; the summary push says how many leads are still unjudged.
Cards close by themselves (lead wrote → replied; Ali sent → followup done; midnight → expired); Ali taps « Fait » or
« Pas d'accord » with a note that every later judgement reads. Screens: home card « Aujourd'hui » → `/plan`; the Sales
Hub line and the card at the top of each thread. Pushes: morning summary, new pause/fix cards at once (8h–22h), a reminder
10 min before a follow-up. After a manual follow-up on a paused lead with no reply (Ali's logic, 2026-10-01): same day nothing more, except the **closing window** (Ali, 2026-10-01 afternoon): when the lead's 24h free-text window shuts within `PLAN_CLOSING_H` (4 h) and the lead stayed silent since Ali's manual message of the day (sent ≥ `PLAN_CLOSING_GAP_H`, 2 h, ago), the lead becomes a `closing` candidate and gets one more card (own signature `…|closing`, so it follows a done card), judged as a low-pressure `followup` 30–45 min before the window closes, no new concession unless Ali already started that mechanism in the thread; next morning a `resume` card (lift the pause, untick the steps already past or contradicted by what Ali did by hand, leave the first still-true step and the following ones); a lead-given date → CITF; two refusals → OR. A pause card says which mechanism: pause complète, or décocher a named step (#n from `/leads/{id}/upcoming`, fetched at judgement time; the API does not expose which steps Ali unticked, asked Mateo on 2026-10-01). Rules from Ali (2026-10-01): the templates are built to push even after a « pas intéressé », so a single refusal is `ok`; IITF is retired, a lead who comes back later is CITF with a reason (`payment`, `payment_month`, `more_time`, `general_later`) and a date. The guessed schedule in `tbc-watch.mjs` is off while the token is present. Terminal:
`node --env-file=.env plan-engine.mjs` (candidates) / `--run` (judge now) / `hub-sync.mjs` / `hub.mjs [+33…]`.
**After every manual message from Ali** (app send, template send, or a reply typed in Wati itself, seen by the poller):
`afterAliMessage(waId)` judges that one lead again `PLAN_SENT_DELAY_MIN` (1) minute later (debounced per lead, skipped if
the lead answered in between) with reason `sent`: the card names the Hub action now (wait until when, pause/skip a
template that contradicts what he wrote, resume, OR/CITF, or a follow-up only under the closing-window / lead-given-time
rules). Prompt section « Après un message manuel d'Ali ». Cap raised to `PLAN_MAX_CALLS` 30/day (Ali, 2026-10-01).
The learned cases are consolidated by `consolidate-engine.mjs` (2026-09-30): every evening at `CONSOLIDATE_AT` (22:15
Madrid), when the raw journal `../Wati outreach/playbook/04-CAS-APPRIS.md` moved, one Sonnet run rebuilds
`../Wati outreach/playbook/06-REGLES-APPRISES.md` (every rule once, latest decision wins, scripts verbatim, 150–250
lines) and appends a `<!-- consolidé jusqu'ici · … -->` marker to the journal. Every draft reads 06 in full plus the
journal tail after that marker (injected in the prompt). Terminal: `node --env-file=.env consolidate-engine.mjs [--force]`.
All run `claude -p --model claude-sonnet-5` headless inside `../Wati outreach` — drafts in their own lane with a
self-contained prompt (thread, CRM card, quick card, consolidated rules and principles injected; no tool turns; target
under a minute), the other runs queued behind each other in a background lane; no API key, no open session. Logs: `logs/server.log`, `logs/suggest.log`.

## How to deploy
There is no deploy. After a code change:
```
node --check server.mjs && launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox && tail -5 logs/server.log
```
Then commit and push. Test a draft from the terminal with
`node --env-file=.env suggest-engine.mjs <waId>`.

- **Two-step administration draft** (Ali, 2026-10-01): while its step 2 ("bonne nouvelle") is still to send, the draft stays on
  screen whatever the lead writes in between (`suggestionVisible`), no automatic draft answers that reply (the push says
  "step 2 still to send"), and a plan card keeps its bubbles without replacing the draft (`laterPending` in `db.mjs`).
  Ali can still ask for a draft by hand if the lead asked something real.

- **Editing a draft** (Ali, 2026-10-01): in edit mode the card has an emoji row (into the bubble last touched, at the cursor),
  « + bubble », « × », **Save** and « Send these bubbles ». Save posts `/api/thread/<waId>/edit` and the edit is stored in
  `suggestions.edited` ({bubbles, later}): the card shows and sends it on every device, tagged « edited by you », with a
  « Claude's version » button to go back. `options` keeps Claude's original, so the learning (learn-engine) still compares
  the original with what left. Nothing goes through the composer below any more.

- **Emoji reply on « nothing to answer »** (Ali, 2026-10-01): the skip card has a row of emojis; one tap (armed) sends that
  emoji as a plain message. Wati's API has no WhatsApp *reaction* endpoint (its web inbox reacts through the agent
  session, not the API token), so this is a message, not a reaction. `meta.reaction` skips the learning run.

- **Which threads the poller reads** (poll.mjs `tick`, 2026-10-01): new French-prefix contacts from Wati's page 1; known
  threads every 45 s while active in the last 24 h and every 5 min up to 14 days; **plus** every 2 min when the Sales Hub
  moved the lead in the last 24 h (`hub_leads.last_reason_at` / a passed `next_at`: a template just left), and every 30 min
  for every other known thread (6 per tick, oldest check first). Before this, a lead silent for 15+ days who wrote back
  (Hajar El Rhomri, 2026-10-01 20:10, after a Hub template at 16:05) was never read: no draft, no push.

- **Pushes** (push.mjs, 2026-10-01): two devices registered (Google FCM and Apple). Each push gets up to 3 tries per device (2 s, then 6 s apart); a 404/410 removes the device; every failure logs the device host, the try and the detail. The blank `push failed` lines before this were network drops with no retry.

- **End of a TBC sequence** (Mateo, Hub developer, 2026-10-01): 48 h after the last TBC template (day 7) with no reply, the Hub moves the lead to OR by itself and the OR cadence starts; the Hub shows no planned template during those 48 h. No card for that gap: `finished` candidates only exist 72 h to 6 days after the last template (the automatic move did not happen). Moving to OR by hand earlier is harmless, the OR cadence just starts sooner.
- **« I did it differently » learns** (Ali, 2026-10-04, evening): the note dictated on a plan card goes through `learnFromPlanNote` in
  learn-engine.mjs (prompt `learn-plan-prompt.md`, background lane, same 40/day cap): one lesson block « plan du jour : Ali a fait
  autrement » in 04-CAS-APPRIS.md, consolidated into 06 every evening; the plan prompt now reads 06 + the journal tail (`{{rules}}`)
  like every draft, and only the last 15 raw notes. When the gesture contradicts a written rule (plan-prompt.md or 06) the card shows
  both with « Make it the rule » / « One-off, keep the rule » (`/api/plan/<id>/rule`, `plan_items.lesson`), and a push says so; the
  verdict is written to the journal (« RÈGLE REMPLACÉE » or « cas particulier »). One-bubble scheduled follow-ups are learned from too.
- **Dictation guards** (Ali, 2026-10-04: numbers popping up): a piece too quiet to be speech is not decoded; segments that are mostly
  digits, repeat one token, or that Whisper flags (compression ratio > 2.4, low confidence on doubtful speech) are dropped; the
  previous text passed as context loses its digits (`transcribe-worker.py`).
- **Audit fixes of 2026-10-04** (plan + scheduling): the delayed step-2 send counts as a manual message (re-judges the plan, closes the due card); a paused lead is a plan candidate whatever its status when the thread moved in the last 72 h (OR + paused Joanna was invisible); scheduling a follow-up within an hour of a Hub template for a lead not paused is refused with a 409 unless `force` (the app asks « schedule anyway? »); templates Meta refused with #132001 (`failedTemplates` in db.mjs) are hidden from the picker and the plan prompt; for paused/CITF leads « next » comes from the upcoming list (`effectiveNext` in hub-sync.mjs, refreshed when the thread opens); fixed pre-checks (`preChecks` in plan-engine.mjs: reminder_3 after a named blocker or Ali's diagnostic, recovery_release after a manual extension, recovery_offer after a deposit) force `pause next` even when the model says ok/wait; CITF cases `company` and `general` added; every draft prompt carries the window close time and the school link.
- **Buttons removed** (Ali, 2026-10-01): the old Sales Hub alert card in a thread, Copy / Copy all on drafts, Clear under the composer, ↻ in a thread, Stop notifying, Stop planning. Kept on purpose: Reopen, Retry.

## Language
Everything Ali reads in the app is in English (Ali, 2026-10-01): navigation, buttons, section titles, badges, toasts, error messages, push titles, plan-card `title`/`why`/`action`, France TM flags. Only what is written to a lead stays French: drafts, bubbles, templates, and the consignes Claude receives.

## What is forbidden
- Never call `sendText` / `sendTemplate` from a script or a test: the app sends only when Ali taps
  in it. Ali's own number `34695064884` is the test thread.
- Ali's own number `34695064884` is never drafted by itself. `SUGGEST_MAX_PER_DAY` (60) caps automatic drafts.
- Never change the suggestion prompt's rules or the cap guidance in `directions.mjs` without
  reading `../Wati outreach/CLAUDE.md` and `playbook/00-QUICK.md`; the playbook is the source of truth.
- The inbox lists only open 24h windows; do not bring closed conversations back (Ali, 2026-09-29).
- The app cannot pause the Sales Hub automation or change a status (the API is read-only) and must never say a step is paused unless the Hub says so; the day plan only tells Ali what to do. Never call the Hub from a screen: read the mirror (`hub_leads`).
- Never edit `06-REGLES-APPRISES.md` by hand (rebuilt nightly); new cases go into `04-CAS-APPRIS.md`.
- Headless runs load user, project and local settings (global file cleaned on 2026-09-27).
- `.env`, `data/`, `logs/`, `certs/*.pem|key` are git-ignored; keep them so.

**Dictation** (Ali, 2026-10-01): a `Dictate` button next to each note-for-Claude field (the steer panel's note and the
"Claude needs one detail" answer). Tap the microphone to start (red, pulsing, elapsed time), tap again to stop; on the laptop the
recording goes on while another window has the focus (the phone stops it when the app goes to the background, iOS
rule). The text appears while Ali speaks: the browser cuts the speech at pauses (≈0.7 s silence, pieces of 0.8–15 s),
sends each piece, and meanwhile re-sends the piece being spoken every 0.9 s for a provisional text replaced at the
pause; the previous pieces go along as `prompt` for context. Two models stay resident in the worker (patched
`ModelHolder`, else mlx-whisper reloads from disk on every switch): `WHISPER_FAST` (whisper-small-mlx, ~0.3 s) for the
provisional text, `WHISPER_MODEL` (large-v3-turbo, ~1.1 s) for the final text; `temperature=0`, no fallback decodes.
Language is French or English only (Ali, 2026-10-01): the small model picks the likelier of the two on the first
piece, the client passes it for the rest of the dictation. Harness: `scratchpad/mic-harness.mjs` feeds a WAV through
the real pipeline against the live server. The browser records 16 kHz mono
WAV itself (`toWav16k` in `public/app.js`, no codec, no ffmpeg) and POSTs it to `/api/transcribe`; `transcribe.mjs` hands
it to one long-lived Python worker (`transcribe-worker.py`, Whisper large-v3-turbo on Apple MLX, local and free, model
cached under `~/.cache/huggingface`, ~1.6 GB) that starts on the first dictation and is let go after `DICTATION_IDLE_MIN`
(20) minutes without a request. Python lives in `.venv` (git-ignored): `python3 -m venv .venv && .venv/bin/pip install
mlx-whisper`; `PYTHON` in `.env` overrides the interpreter. Homebrew has no bottles for this macOS (27), hence no
whisper.cpp/ffmpeg; the scipy wheels for Python 3.10 do not load here either, so the worker stubs `scipy.signal`, which
mlx-whisper only needs for word timestamps. `GET /api/transcribe` shows the worker state. Log tag `dictation`.
