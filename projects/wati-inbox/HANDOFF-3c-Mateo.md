# Personalized follow-ups in the 24h window (3c)

2026-10-09 · Ali El Araki · handoff for Mateo

## What 3c is

3c is not CITF and not the template cadence. It is a free-text follow-up, written from the conversation, scheduled at a precise hour inside the lead's 24h window, sent by the bot unless the lead writes first. Example: the lead says "je m'en occupe cet après-midi sans faute"; the cadence would send "Vous avez pu y réfléchir ?" at 17:00; 3c unticks that step and sends "Vous avez pu finaliser votre inscription ?" at 17:20 instead.

The cadence stays the backbone. 3c only replaces the steps that no longer fit the chat, and hands back to the cadence when the lead goes silent.

## Why it is worth building

The 24h window is the only moment we can write freely, and it is exactly when the lead is deciding. Templates are generic by design, so at that moment they often contradict the chat: they ask whether the lead thought about it after he said he will pay tonight, or offer to hold the place after Ali already extended it. Every such template costs trust on a lead who was about to close.

- A follow-up written from the chat answers the lead's own words (his deadline, his question, his blocker). A template cannot.
- Most closes happen inside that window; a message 1h30 before a deadline he set himself converts, a reminder two days later rarely does.
- Ali runs this by hand in his own tool since 4 October: scheduled free-text follow-ups with the guards below. The logic is already defined and tested on real leads; what is missing is having it in the Hub for everyone, at scale.

## The logic, as it runs today

One judgement per lead, re-run at four moments. The input is the full chat, the lead's cadence state (status, paused, next template and its real text, upcoming steps) and the time the window closes. The output is one JSON item per lead.

**When the bot judges a lead**

1. One minute after every manual message from the agent (debounced per lead, skipped if the lead answered in between).
2. When the lead's cadence state moves (a template left, a pause, a status change).
3. Every 5 minutes for leads whose window closes within 4h and who did not answer the agent's last message.
4. A morning pass before the first template of the day.

**What it decides**, one of: `followup` (hour + 2-3 bubbles) · `wait` (hour + what happens then) · `untick` a named step or `pause` the cadence · `ok` (templates fit). A followup always comes with the untick of the step it replaces.

**What triggers a followup** (the cases where a template never fits)

| The chat says | Follow-up |
| --- | --- |
| Lead committed to finalise or pay at a moment ("cet après-midi", "ce soir avant 22h") | At his hour, or 1h30-2h before the day's deadline: "Vous avez pu finaliser votre inscription ?". Untick any "did you think about it" step before it |
| Agent sent the payment or registration link to a lead who said yes | Same day, 19:00-19:30, soft check-in without deadline or pressure |
| Agent promised something ("je reviens vers vous lundi", a document, a confirmation) | At the promised hour, the promise kept |
| Agent extended the deadline by hand | Untick "j'ai gardé votre place un jour de plus"; first follow-up of the deadline day at 14:00 |
| Agent asked a question, no answer, window closes within 4h | One low-pressure follow-up 30-45 min before the window closes, no new concession |
| Lead gave his own date ("je reviens vers vous samedi") | No follow-up before it; CITF with that date |

**Timing rules**

- One pressure message per day per lead. The hour the lead gave himself and the closing window are the only exceptions.
- Never on a round minute (14:00 reads as automated; 14:00 becomes 14:02-14:08).
- Never within 2h of another follow-up already planned for that lead, and never within 1h of a cadence step unless that step is unticked.
- Short, from the chat, one question in the last bubble, no first name, no emoji on money or deadlines.

## Send-time guards

A scheduled follow-up is a promise made hours earlier, so the sender re-checks the lead right before it leaves. These guards are code, not AI, and they are what makes the feature safe at volume.

| Right before sending | What the sender does |
| --- | --- |
| The lead wrote after the follow-up was scheduled | Cancelled at once, not at its hour. The agent is notified to adapt |
| The 24h window closed in between | Not sent. The agent gets the message back with a template suggestion instead |
| The lead registered (welcome message went out) | Cancelled, with a notification. Every planned step for that lead is over |
| A cadence step is due within 1h and was not unticked | Refused at scheduling time; the agent decides which of the two goes |
| The agent sent a manual message in between | Re-judged; the follow-up is dropped if it now repeats or contradicts |
| The chat is read from WATI itself, not from a cached copy | A reply that arrived seconds before is seen |

Bubbles leave one by one, 5-10 s apart, so it reads like a person typing. If the process restarts mid-send, the remaining bubbles resume; a send that could not leave is flagged to the agent, never lost silently.

## Outside the window, and when to resume

When the window is closed, the same judgement picks an approved template that fits the context instead of writing free text (for example a "did the registration go through" template rather than reactivating the whole cadence). The agent schedules it like a follow-up; the same guards apply.

The cadence resumes when the custom sequence has done its job without an answer: a manual follow-up sent the day before, still no reply after 18h, no date given by the lead, no clear refusal. The resume skips the steps already past or contradicted by what the agent wrote by hand and keeps the first step that is still true. Two clear refusals go to OR; a date given by the lead goes to CITF with that date.

## Implementation in the Hub, minimal version

Four pieces. The first three are plain code; only the second calls the model.

1. **A table of scheduled sends**: lead, hour, bubbles (or template name), state (pending, sent, cancelled: replied / window closed / registered / superseded), created by (bot or agent), the cadence step it replaces.
2. **The judgement job**: the four triggers above, one model call per batch of 5-6 leads, inputs = chat + cadence state + template texts, output = the JSON item (kind, hour, bubbles, step to untick, why). The fixed cases in the table above are checked in code before the model and win over it: the model only fills the text and the hour.
3. **The sender**: runs every minute, applies the guards table, sends bubble by bubble, writes back the state.
4. **The agent view**: one card per lead with the proposed hour and bubbles, buttons Schedule, Edit (bubbles editable in place), Send now, Done, "I did it differently" with a note. The note and the edit are the learning input for 3b.

Start with the two commitment cases (lead gave an hour, payment link sent) and the closing-window case. They cover most of the value and are the easiest to verify. Keep a daily cap on model calls per market so a bug cannot run away.

## What Ali can hand over

- The judgement prompt (French, with the fixed rules and the JSON schema) and the pre-check rules as code.
- The guards and sender code (Node, about 150 lines), including the cancel-on-reply and welcome-message checks.
- The learned rules file: about 230 rules consolidated from his real conversations, the follow-up scripts verbatim.
- Real cases from the last week to replay against the bot before switching it on (Zakaria, Sefedine, Boris, Joanna).

Open question for Mateo: whether the Hub can expose which steps an agent unticked. Today the read API shows the next step but not the unticked ones, so the bot cannot tell whether its recommendation was applied.
