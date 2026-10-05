# Wati Inbox — what the app does, screen by screen

*State of the app on 5 October 2026. Written for anyone who wants to understand or use Ali's closing assistant for the French market.*

---

## 1. In one paragraph

Wati Inbox is a private phone app that sits between Ali and the **France Sales** WhatsApp number (+33 6 73 55 59 77). It tells him when a French lead writes, shows the whole conversation, writes a reply draft in his own style and commercial logic, lets him send it (or a WhatsApp template when the free-text window is closed), schedules follow-ups the Mac sends for him, mirrors what the Sales Hub automation is about to do for each lead and tells him when a human action is needed, and learns from every message he sends. It runs on Ali's Mac only. Nothing is paid per use: the drafts come from his Claude Code subscription, the dictation runs on the Mac, and the phone reaches the Mac through Tailscale, a free private VPN between his own devices.

---

## 2. How it runs

| Piece | What it is |
|---|---|
| Where | One Node process on Ali's Mac, started at login and restarted on crash (launchd job `com.ali.wati-inbox`). One SQLite file holds everything. |
| Phone | The app is added to the iPhone home screen from `https://alis-macbook-pro.tail7ec20e.ts.net:8443` (Tailscale address). It works on Wi-Fi and 4G as long as Tailscale is on on both devices. |
| Laptop | `https://localhost:8443` on the Mac itself. |
| Login | One password. Notifications are enabled once per device from the bottom of the home screen. |
| Reading Wati | No webhook (the Mac has no public address). The app polls Wati: threads active in the last 24 h every 45 s, older ones every 5 min, every known thread at least every 30 min, plus every 2 min for a lead the Sales Hub just moved. Delay to see a message: under a minute. |
| Writing to Wati | Only when Ali taps in the app or when a send he scheduled comes due. No script ever sends on its own. |
| AI | `claude -p` with the Sonnet model, run headless on the Mac inside the `Wati outreach` folder, so the full closing playbook (prices, ladder, learned rules, Ali's style) applies to every draft. |
| Sales Hub | Read-only API from Mateo (token in `.env`). The app can see the automation state of each French lead; it can never pause, skip or change a status. |
| Must stay | The Mac awake (plugged in, lid open, screen may lock) and Tailscale on. A sleeping Mac means no polling, no notifications, no scheduled sends. |

---

## 3. The life of one lead message

1. A lead writes on the France Sales number. The poller sees it within about 45 s and stores it.
2. **60 s after the lead's last bubble**, a draft starts by itself (cap: 60 automatic drafts a day; never for Ali's own test number). Claude reads the whole thread, the CRM card, the initial offer typed for that lead, the quick card, the consolidated learned rules and the day's journal, and chooses one of three outcomes:
   - **A draft**: one set of 2–4 bubbles, plus, for an "administration" two-step, a second block to send 5–10 minutes later.
   - **A question for Ali** ("Claude needs one detail"): for example the initial offer before a downsell, or what was said on the call. Ali answers in the app (typed or dictated) and the draft follows.
   - **Nothing to answer**: the message needs no reply (an "ok", a thanks). No push.
3. **One notification per lead message**: the phone is pushed when the draft is ready, not when the message arrives. The push carries the lead's text; the reply is on screen when Ali opens it. If no draft came within 5 min (window closed, cap reached, error), the plain message is pushed instead.
4. Ali opens the thread, reads, then **sends as is, edits, or steers** (ticks the moves the reply must make, adds an instruction, taps "Rédiger la réponse"). Everything that reaches a lead takes **two taps** (the first arms the button).
5. **Bubbles leave one by one** from the Mac: the first at once, each next one 5–10 s later (5 s plus 20 ms per character), so the phone can lock. The thread shows "Sending 2/3…" and refuses a second send for that lead until the queue is done. If the app restarts mid-send, the remaining bubbles resume at the next start; a send that could not leave is marked "NOT sent", pushed, and shown as a red card. Nothing is lost silently.
6. The draft disappears once as many human messages as it has bubbles have left (Ali sometimes copies and sends them one by one from Wati), or when Ali taps **Handled**.
7. **One minute after any manual message from Ali** (sent from the app, a template, or typed in Wati itself), the day plan judges that lead again and tells him the Sales Hub action, if any.
8. **45 s of quiet after the last bubble**, the learning engine compares the draft, the moves Ali chose and what he really sent, and writes the lesson to the playbook journal (see section 9).

---

## 4. The screens

### 4.1 Home (the inbox)

- **Search box**: name or number. A pasted number that is not in the list opens that conversation anyway (template if the window is closed).
- **Today card**: one line with how many Sales Hub actions are waiting and how many follow-ups are planned, tap to open the day plan (section 8).
- **To answer**: only conversations whose **24 h free-text window is open** and where the lead wrote last. Red dot, name, CHF pill for Swiss leads, "draft ready" / "question for you" pill, how long ago the lead wrote.
- **Answered**: the other open-window conversations. Closed conversations are never listed (Ali's rule, 2026-09-29): a pasted number still opens them.
- Header links: **Rules** (rule conflicts to decide, with a count) and **France TM** (booking-bot flags, with a count of unseen ones). Refresh button.
- Footer: enable notifications on this device, theme (auto / light / dark).
- The list refreshes itself every 60 s while the screen is visible and never while Ali is typing.

### 4.2 Thread (one conversation)

From top to bottom:

- **Header**: name, number, the **window badge** (open with time left, or closed), the CRM context line, **Handled** and **Mute**.
- **Sales Hub line and card**: the automation state mirrored from the Hub (paused or not, next template and its local time, CITF moment), and the day-plan card for this lead if there is one (section 8).
- **Templates already sent** to this lead, with dates, the same list `lead.mjs` prints.
- **The conversation**: lead on the left, us on the right, Madrid time, automated Sales Hub templates included. Opening is instant (stored copy first, Wati re-read in the background) and lands on the newest message. A redraw keeps the scroll and never happens while Ali is typing.
- **Initial offer** line: format, target level, hours per week, months. Typed once per lead ("Renseigner" / "Modifier"), stored, injected in every prompt, and the base every downsell is computed from.
- **Claude's state**, one card at a time:
  - *Drafting…*
  - *A question for Ali* with a text box, a Dictate button and, when the missing piece is the offer, the offer box.
  - *Nothing to answer*, with an emoji row: one tap (armed) sends that emoji as a plain message (Wati's API has no reaction endpoint).
  - *The draft*: the bubbles, the moves that produced it, "À savoir" (what Claude wants Ali to check), "Pourquoi" folded under. Buttons: **Send as is** (two taps), **Edit**, **Schedule** (turns it into a follow-up at a chosen time, section 7). For an administration two-step, a second card "In 5–10 min" with **Schedule in 7 min** (the Mac sends it, a countdown with Cancel), **Send now** and **Edit**.
  - *Edit mode*: each bubble its own box, an emoji row (inserted at the cursor of the last bubble touched), "+ bubble", "×", **Save** and **Send these bubbles**. A saved edit is shown and sent on every device, tagged "edited by you", with a "Claude's version" button to go back. Claude's original is kept so the learning still compares it with what left.
  - After a send, one line says what the app learned ("validé tel quel", "lesson noted — …").
- **Composer** (window open): free text, one bubble per paragraph, Send (two taps).
- **Folded panel "Refaire le brouillon"**: the steering panel (section 5).
- **Folded panel "Send a template"** (always available, the only option when the window is closed): approved French templates from Wati, filter, name pre-filled, preview, send. Templates Meta refused are hidden.
- **Scheduled follow-ups** for this lead: time, bubbles or template, edit, cancel; a form to add one (section 7).
- The thread refreshes quietly every 8 s while a send is running, otherwise every 32 s.

### 4.3 Today (the day plan)

One card per lead that matters today, sorted by urgency (section 8). Sections: **Now**, **Scheduled follow-ups**, **Later today**, **Waiting**, **Tomorrow**, **Later**, then folded **Older**, **Templates that fit** and **Done**. Header: date, the Sales Hub read time, how many judgements were used today, and a **Replan** button (Claude reviews every lead, 2 to 5 min). Refreshes every 45 s.

### 4.4 Rules (rule conflicts)

Where a gesture Ali made ("I did it differently") contradicts a written rule. Each card shows the situation, what the card said, what Ali did, **rule A** (the written one, with its source) and **rule B** (his gesture as a rule), a context box with dictation, and three verdicts: **B replaces A**, **A in general, B in this context**, **Keep A, one-off**. Decided conflicts are folded underneath. No push for a conflict: Ali comes here when he wants.

### 4.5 France TM (the booking bot)

Flags Claude raised on the telemarketing number's booking bot (+33 6 71 28 37 78): **Error** or **Improvement**, number, what happened, the quoted message. Buttons: View conversation, Seen, **Not an error** (stored, and the last 40 such cases are shown to every later review so they are not flagged again), Review now.

---

## 5. Steering a draft: the moves

The panel "Refaire le brouillon" lets Ali say what the reply must do. Moves are combinable; nothing ticked means a plain answer to the lead's message. They were chosen from the count of Ali's own moves in 1 882 of his messages.

| Move | What Claude does |
|---|---|
| **Administration (2 steps)** | Ali's reference script: now, "je vérifie avec l'administration, je reviens vers vous très vite"; 5–10 min later, "bonne nouvelle, ils ont prolongé votre délai jusqu'à …". Always "ils ont prolongé", never "je vous ai étendu". |
| **Downsell** → 90h / 96h / 48h / 24h / fewer hours | A smaller format presented as the one that fits the lead's situation, never as a discount. Computed from the initial offer: same hours per week, level one jump lower, months recomputed, new price and 10-times monthly against the original, guarantee kept or lost. Prices: 270h 2 700 €, 180h 1 800 €, 90h 990 € with guarantee, 96h 990 € without, 48h 583, 24h 294 (CHF for Swiss leads). |
| **Extend the deadline** → until when | Free, always through the administration, dated and bounded. Weekend script (sessions grouped, one more day). |
| **Deposit** → 196 / 96 | Hold the place, never the price. 196 € first, 96 € as a second concession or when timing is the blocker. Two-step structure with the waiting-list consequence. |
| **Payment** | Instalments (Alma 3/4 free, 6 with credit card, 10 times) or unblocking a failed payment: technical answer, no sales argument. Swiss leads: HeyLight, CHF. |
| **Start later** | Register now, choose the start date after. Never quote a start date on Claude's own. |
| **Follow-up** | Silent lead: never a reproach, something new, one question, one pressure message a day. Deadline-day rhythm built in. |
| **Low pressure** | The lead asked for time: remove the pressure, no closing question, no deadline. |
| **Close** | Two refusals or "leave me alone": stop selling, warm close, "plein succès". |

Plus a free instruction box (typed or dictated). The drafts follow the house style measured on Ali's conversations: about 100 characters a bubble, vouvoiement, no first name ever, one question in the last bubble, one emoji at most and never on money, every link followed by "Est-ce qu'il fonctionne bien ?".

**Speed**: the prompt is self-contained (thread, CRM card, quick card, rules and principles injected), so a draft takes under a minute. Drafts run in their own lane; learning, Sales Hub and consolidation runs queue behind each other in a background lane and never delay a draft.

---

## 6. Sending

- **Window open** (the lead wrote in the last 24 h): free text. The badge shows the time left.
- **Window closed**: only an approved French WhatsApp template can go out; the picker is the only send option.
- **Two taps** for anything that reaches a lead.
- **Bubbles one by one** from the Mac, 5–10 s apart, so it reads like a human typing.
- **Handled**: closes the thread in the list without sending; **Mute**: no more pushes for this lead.
- **What the app never does**: send on its own, send from a script or a test, claim a Sales Hub step is paused, bring a closed conversation back into the list.

---

## 7. Scheduled follow-ups (since 4 October 2026)

Ali can plan a message for later and let the Mac send it.

- **From a draft**: "Schedule" on the draft card, pick the time; the draft becomes the follow-up.
- **From the thread**: a form with the time and the text (one bubble per paragraph), or "Claude drafts it" (a short, direct follow-up drawn from the thread, one question).
- **From a day-plan card**: "Schedule for 14:05" on a follow-up card, or "Schedule template for 14:05" when the window will be closed by then (the template is sent with the lead's first name).
- **From a Claude Code chat**: a draft given in the chat can be posted to the phone for a given time; it appears in the thread at once, a card goes on the Today screen, the push comes 15 min before and a reminder 10 min before.
- Several follow-ups per lead are allowed. They appear in the thread (edit, cancel) and on the Today screen under "Scheduled follow-ups".

**Hard rules the Mac applies at send time**

| Situation | What happens |
|---|---|
| The lead wrote after the follow-up was scheduled | Cancelled at once, push "X replied · 14:05 follow-up NOT sent", Ali adapts. |
| The 24 h window closed in between (free text planned) | Not sent, push, red card in the thread. |
| A Sales Hub template is due within an hour of the chosen time and the lead is not paused | Scheduling is refused; the app asks "schedule anyway?". |
| The welcome message went out (the lead bought) | Follow-up cancelled, push "X registered · follow-up cancelled"; the lead's plan cards are over. |
| The Mac was restarting at that minute | Marked missed, pushed, red card "Not sent" in the thread with a Dismiss button. |
| Right before sending | The conversation is re-read from Wati itself, not from the copy on disk. |

The second block of an administration two-step ("bonne nouvelle") uses the same mechanism, 7 min later by default, editable until it leaves.

---

## 8. The Sales Hub mirror and the day plan

### What is mirrored

Every minute the app copies the French leads of the Hub's **WATI Automations** tab (cadence status, paused or not, last event, next template and when, call-in-the-future plan) and, every hour, the cadence steps with the text WATI really sends. The app reads only this copy; a screen never calls the Hub. The old guessed TBC schedule is off while the token is present.

### Who gets a card

One card per lead and per day, for every lead that matters today: paused (a human follow-up is due), next template within 24 h, stuck (next template in the past), finished sequence (72 h to 6 days after the last template without the Hub's own move to OR), CITF leads the Hub resumes today, a "wait" card whose time has come, and any lead Ali wrote to by hand (re-judged one minute later). **Since 5 October 2026, conversations the Hub does not know** (an old student on an upsell, a lead the Hub dropped) are judged too, as long as the lead wrote in the last 72 h: no Hub action exists for them, so the card can only be a follow-up, a wait or OK.

### What a card says

Judged by one Sonnet run per batch of 6, with the conversation, the Hub state, the template text and the learned rules.

| Kind | Meaning |
|---|---|
| **Full pause** / **Untick n template(s)** | The next template contradicts the thread. Says which mechanism: pause the whole cadence, or untick a named step. Suggests a status (OR after two refusals, CITF with a reason and a date when the lead gave one). A Hub action is "to do now" whatever the template's hour. |
| **Follow-up** | A time (never on a round minute, so it does not look automated) and a draft or a template, with the Schedule button. |
| **Wait** | Until when, and why. |
| **Resume** | Next morning after a manual follow-up on a paused lead: lift the pause, untick the steps already past or contradicted, keep the first still-true step. |
| **Fix** | A data problem (wrong number, missing meeting, template Meta refused…). |
| **OK** | The templates fit as they are. Folded. |

Fixed rules checked in code win over the model: a template that repeats Ali's own question, a reminder after the blocker was already named, a "place released" template after a manual extension, a recovery offer after a deposit, all force "pause next".

**The closing window** (Ali's logic): when a lead's 24 h window shuts within 4 h and the lead stayed silent since Ali's manual message of the day (sent at least 2 h ago), one more low-pressure follow-up card appears 30–45 min before the window closes, with no new concession unless Ali already started that mechanism.

### Rhythm and limits

- Morning run at 08:30 Madrid (before the 09:00 CITF resumes), then every 5 min for what moved. Cap: 80 judgements a day. A batch that times out is retried in two halves; the morning push says how many leads are still unjudged.
- Cards close by themselves: the lead wrote → "lead replied"; Ali sent → follow-up done; midnight → expired; a newer judgement → replaced.
- Buttons on a card: **Done**, **I did it differently** (opens a note box with dictation inside the card; the note is required and is what the app learns from), **Copy number**, **Sales Hub ↗**, **Open** the thread. "No more cards for this lead" removes a lead from the plan for good (two taps).
- Pushes: the morning summary, a new pause or fix card at once (8h–22h), a reminder 10 min before a follow-up.
- The welcome template "Bienvenue chez easypeasy !" means the lead bought: every card and scheduled follow-up for that lead is closed.

---

## 9. How the app learns

Everything learned lands in the closing playbook (`Wati outreach/playbook`), which every draft reads.

1. **After every send from the app** (45 s of quiet after the last bubble): sent exactly as drafted → one line "validé tel quel", no AI run; edited or free text → one short Sonnet run compares the chain of drafts, Ali's instructions and what he sent, and writes a titled lesson or a one-line "retouche" under `## <date> — Appris dans l'app` in the journal `04-CAS-APPRIS.md`. Emoji replies and one-bubble scheduled follow-ups are handled too. Cap: 40 runs a day.
2. **"I did it differently"** on a plan card: the note goes through its own prompt and becomes a lesson block "plan du jour : Ali a fait autrement". When the gesture contradicts a written rule, the conflict appears on the Rules page; Ali's verdict and context go to the journal word for word ("RÈGLE REMPLACÉE", "RÈGLE PRÉCISÉE", "cas particulier"). The plan prompt reads the last 15 raw notes and the consolidated rules.
3. **Every evening at 22:15 Madrid**, when the journal moved, one run rebuilds `06-REGLES-APPRISES.md`: every rule exactly once, grouped by theme, latest decision wins, validated scripts copied verbatim, 150–250 lines. A marker is appended to the journal; drafts read 06 in full plus the journal tail after the marker. The file is validated (size, sections) before it replaces the old one.
4. **Every draft is saved** to `Wati outreach/data/suggestions/<date>.md` with its moves, for the nightly review that compares drafts with what Ali really sent.
5. **"Pas d'accord" / "Not an error"** notes on plan cards and TM flags are read by every later judgement.

---

## 10. France TM: the booking-bot monitor

The telemarketing number cannot be read through Wati's API, so its conversations arrive through a webhook. Up to 3 times a day between 9h and 21h, and only when at least 3 conversations moved, the app pulls both sides of those conversations and asks Claude (up to 25 conversations per run) what the booking bot got wrong or could do better. Flags land on the France TM screen with a count in the home header. "Review now" always runs.

---

## 11. Dictation

A **Dictate** button sits next to every box meant for Claude (the instruction, the "Claude needs one detail" answer, the "I did it differently" note, the rule-conflict context). Tap to start (red, pulsing, elapsed time), tap again to stop. The text appears while Ali speaks: the browser cuts speech at pauses, a fast model gives a provisional text every 0.9 s, a larger model gives the final text at each pause. French or English, detected on the first piece. Everything runs locally on the Mac (Whisper on Apple silicon), free, no audio leaves the machine. Guards: silence is not decoded; segments that are mostly digits or repeat one token are dropped; the recorder stops by itself after 90 s without a voice or 10 min in all.

---

## 12. Notifications (what the phone receives)

| Push | When |
|---|---|
| Lead's name + text, "draft ready" | A draft is ready (one push per lead message), or the plain message after 5 min without a draft. |
| "Claude needs one detail" | A draft is waiting for Ali's answer. |
| "Step 2 still to send" | A lead wrote while the second block of a two-step is pending; no automatic draft. |
| Morning summary | After the 08:30 plan run. |
| "Pause Sales Hub · name", "Untick #n · name", fix cards | At once, 8h–22h. |
| "Follow-up 14:05 · name" | 10 min before a scheduled follow-up (15 min before for one planned from a chat). |
| "name replied · follow-up NOT sent", "registered · follow-up cancelled", "Part 2 NOT sent", "Template failed", "bubble(s) NOT sent" | Whenever a planned send could not or should not leave. |
| "Le template est parti quand même" | A Hub template landed although a pause was recommended. |

Two devices are registered (iPhone and laptop); each push gets up to 3 tries per device.

---

## 13. Safety rules built in

- The app sends only when Ali taps or when a send he scheduled comes due. No script, no test, no AI run can send.
- Nothing is written to the Sales Hub. The app never says a step is paused unless the Hub says so.
- Ali's own number is the test thread and is never drafted automatically.
- Prices, discounts, deadlines and guarantees come from the playbook, never invented; when something is missing, Claude asks instead of drafting.
- Closed conversations stay out of the list.
- The learned-rules file is never edited by hand; new cases go to the journal.
- Daily caps: 60 automatic drafts, 40 learning runs, 80 plan judgements, 3 TM reviews, 20 TBC fit checks.
- Secrets (Wati keys, Hub token, app password, push keys) live in a git-ignored `.env`.

---

## 14. Daily care

- Keep the Mac awake and plugged in; keep Tailscale on on the Mac and the phone.
- `claude` must be logged in on the Mac for drafts to run.
- Restart after a code change: `node --check server.mjs && launchctl kickstart -k gui/$(id -u)/com.ali.wati-inbox`.
- Logs: `logs/server.log` (the app), `logs/suggest.log` (every AI run).
- Terminal checks: `node --env-file=.env suggest-engine.mjs <number>` drafts one lead; `plan-engine.mjs` lists candidates, `--run` judges now; `hub.mjs +33…` reads one lead from the Hub; `tm-monitor.mjs` reviews the bot; `consolidate-engine.mjs --force` rebuilds the rules.

---

## 15. Files, for the curious

| File | Role |
|---|---|
| `server.mjs` | HTTPS server, the API, the scheduled sends, the background lanes |
| `poll.mjs` | Reads Wati, detects new messages, triggers drafts and pushes |
| `suggest-engine.mjs`, `suggest-prompt.md`, `directions.mjs` | The drafts, the moves and their guidance, the downsell maths |
| `learn-engine.mjs`, `learn-prompt.md`, `learn-plan-prompt.md` | Learning after a send and from "I did it differently" |
| `consolidate-engine.mjs`, `consolidate-prompt.md` | The nightly rebuild of the learned rules |
| `hub.mjs`, `hub-sync.mjs` | Sales Hub client and mirror |
| `plan-engine.mjs`, `plan-prompt.md` | The day plan |
| `tbc-watch.mjs`, `tbc-fit-prompt.md` | The older TBC watch (off while the Hub token is present) |
| `tm-monitor.mjs`, `tm-review-prompt.md` | The booking-bot monitor |
| `transcribe.mjs`, `transcribe-worker.py` | Dictation |
| `push.mjs` | Web push to the phone and laptop |
| `db.mjs` | The SQLite schema and queries |
| `public/` | The app itself: plain HTML and JavaScript, service worker, icon |
| `../Wati outreach/playbook/` | The closing playbook every draft reads: quick card, principles, numbers, objections, learned rules, journal |
