# Sales Hub — read-only access for Ali's closing assistant (French market)

**From:** Ali El Araki · **For:** Mateo · **Date:** 2026-09-30

## 1. What this is for

Ali runs a small self-hosted assistant for his French closings (a Node app on his Mac that reads the
France Sales WhatsApp number through the Wati API and drafts his replies with Claude). Today that app
has to *guess* what the Sales Hub will do next: it re-derives the TBC schedule from the templates it
sees landing in Wati, and it cannot see whether a lead is paused, skipped, set to CITF, or which
variant of a step will go out.

With read access to the Sales Hub it can show, for each French lead, the exact next automated
template and its time, know when Ali already paused something, and tell him precisely when an
automated message would contradict the conversation (for example a "your spot was released" template
right after he asked the lead what is blocking them). Nothing is written back: Ali keeps pausing,
skipping and setting CITF by hand in the Hub.

**Scope:** French market only (French templates, Ali's leads). **Read-only.** No sending, no
pausing, no status changes through this access.

## 2. Preferred shape

An HTTPS JSON API with a personal, revocable token, sent as `Authorization: Bearer <token>`, scoped
to read + market `fr` (or to Ali's leads as owner). The Mac has no fixed IP (home network and
Tailscale), so token auth rather than IP allow-listing.

Polling is fine, no webhook needed (the Mac has no public URL). Expected rhythm:

| Call | Frequency |
|---|---|
| leads list for market fr, changed since last poll | every 60 s |
| one lead by phone | on demand, when Ali opens a conversation |
| sequences and templates definitions | once an hour |

Volume: roughly 100–150 TBC leads in the French market, so about 1 500 small requests a day.

If an API is more than you want to build now, a JSON export regenerated every minute at a private
URL (same token) covering the same fields would work too.

## 3. Endpoints and fields

Names are suggestions; what matters is the content.

### 3.1 `GET /leads?market=fr&status=TBC,OR,IITF,CITF&updated_since=<ISO>&page=<n>`

One row per lead, paginated. Fields:

| Field | Meaning |
|---|---|
| `id` | stable Sales Hub id |
| `name`, `first_name`, `last_name` | as in the Hub |
| `phone` | WhatsApp number. Either E.164 (`+33612345678`) or digits only (`33612345678`), just say which — it is our join key with Wati |
| `owner` | e.g. `Ali E.` |
| `market` | `fr` |
| `status` | `TBC`, `OR`, `IITF`, `CITF`, and any other value that exists |
| `meeting_date` | ISO, with timezone |
| `sequence` | which sequence the lead is in (e.g. `tbc`, `offer_rejected`) |
| `day0` / `anchor_at` | the instant the sequence is counted from (the Hub's "Day 0") |
| `current_step` | step number reached |
| `paused` | boolean, plus `paused_at` and `paused_by` if stored |
| `skip_next` | boolean (the "Skip next" button), and which step it applies to |
| `citf_at` | the contact-in-the-future date when status is `CITF` |
| `last_reason` | the text shown in the "Last reason" column, e.g. `Active, last sent OK`, and its state (ok / error) |
| `reply_state` | what the engine believes about the conversation: `no_reply`, `replied_today`, `agent_wrote_last`, or whatever the gating uses |
| `next_template` | object: `step`, `template_id`, `wati_name` (e.g. `tbc_reminder_2_v2_fr`), `scheduled_at` (ISO), `phase` (payment window / recovery week / …), `gate` (always / no reply / replied earlier today) |
| `upcoming_templates` | the rest of the queue, same shape, in order, with the per-step checkbox state |
| `sent_history` | list of `{ step, template_id, wati_name, sent_at, meta_status, result }` for this lead |
| `updated_at` | ISO, so `updated_since` works |

### 3.2 `GET /leads/{phone}`

Same object for one lead, looked up by phone.

### 3.3 `GET /sequences?market=fr`

The definitions behind the "TO BE CONVERTED", "OFFER REJECTED", IITF and CITF sections:

| Field | Meaning |
|---|---|
| `id`, `name`, `description` | e.g. `tbc`, "Runs while the lead is TBC…" |
| `market`, `active` | the per-market activation switch (payment-cadence activation, closingLoop flag) |
| `timezone` | e.g. `Europe/Paris` |
| `steps[]` | `n`, `phase` (payment window / recovery week / silence / …), `day_offset`, `time` (`HH:MM`), `trigger` (always / no reply / replied earlier today / re-arm on reply), `variants[]` each with `template_id`, `wati_name`, `condition`, `meta_status` (live / not live / approved / pending), `note` |

### 3.4 `GET /templates?market=fr`

| Field | Meaning |
|---|---|
| `id`, `wati_name` | the Wati element name we see in the conversation |
| `language`, `category` (marketing / utility), `meta_status` |
| `live` | whether Wati sends this version or an older text ("what WATI actually sends") |
| `hub_text` | the Hub's draft text with `{name}` / `{owner}` placeholders |
| `wati_text` | the text Wati really sends, with `{{1}}` / `{{2}}` |
| `variables` | ordered list |
| `note` | the note column |

### 3.5 Optional: `GET /events?market=fr&since=<ISO>`

A log of what the engine did: `{ at, phone, kind (sent / skipped / paused / unpaused / skip_next / status_change / citf_set), step, template_id, result, actor }`. Useful to confirm a pause was really applied and to reconcile with what we see in Wati.

## 4. Formats

- JSON, UTF-8. Dates in ISO 8601 with offset (or UTC plus the sequence timezone).
- Phones in one consistent format across all endpoints.
- Stable ids for leads, sequences, steps and templates.
- Pagination with `page` / `page_size` or a cursor, plus `updated_since` on the leads list.
- Rate limit that allows one leads call per minute plus a few on-demand reads.

## 5. Example: one lead

```json
{
  "id": "lead_8f3a",
  "name": "Sarah Tadjerouni",
  "phone": "33674996065",
  "owner": "Ali E.",
  "market": "fr",
  "status": "TBC",
  "meeting_date": "2026-09-29T14:00:00+02:00",
  "sequence": "tbc",
  "anchor_at": "2026-09-29T20:20:00+02:00",
  "current_step": 2,
  "paused": false,
  "skip_next": false,
  "citf_at": null,
  "last_reason": { "text": "Active, last sent OK", "state": "ok" },
  "reply_state": "agent_wrote_last",
  "next_template": {
    "step": 3, "template_id": "tpl_412", "wati_name": "tbc_reminder_2_v2_fr",
    "scheduled_at": "2026-09-30T17:00:00+02:00", "phase": "payment_window", "gate": "no_reply"
  },
  "upcoming_templates": [
    { "step": 4, "wati_name": "tbc_reminder_3_v2_fr", "scheduled_at": "2026-09-30T19:00:00+02:00", "gate": "no_reply", "enabled": true },
    { "step": 5, "wati_name": "tbc_recovery_release_v2_fr", "scheduled_at": "2026-10-01T15:00:00+02:00", "gate": "no_reply", "enabled": true }
  ],
  "sent_history": [
    { "step": 1, "wati_name": "tbc_preadmission_v2_fr", "sent_at": "2026-09-29T20:20:31+02:00", "meta_status": "delivered", "result": "ok" },
    { "step": 2, "wati_name": "tbc_reminder_1_v2_fr", "sent_at": "2026-09-30T14:00:12+02:00", "meta_status": "read", "result": "ok" }
  ],
  "updated_at": "2026-09-30T14:00:12+02:00"
}
```

## 6. Questions that decide how we read the data

1. Base URL and how the token is issued and revoked.
2. How Day 0 is anchored: the meeting time, the moment the results email goes out, or the preadmission send?
3. Which timezone the step times are stored in (the UI says "Paris").
4. How the "no reply" gate is evaluated: lead wrote last since the previous step, since the agent's last message, or since a fixed time? And what "replied earlier today" means for the Day 1 19:00 variant.
5. The complete list of `status` and `last_reason` values.
6. Whether a pause is per lead for the whole sequence or per step, and whether "Skip next" is one-shot.
7. When a lead leaves TBC (sale, offer rejected, CITF), does the record keep its history?

## 7. Explicitly out of scope for now

- Any write: sending, pausing, skipping, setting CITF, changing status. Ali does these in the Hub.
- Other markets.
- An MCP server. That would be a good next step for the team and this read model would be a natural base for it, but the assistant only needs the reads above today.

## 8. Contact

Ali El Araki · the assistant runs on his Mac (`projects/wati-inbox`) and reads the Hub every minute with this token only.
