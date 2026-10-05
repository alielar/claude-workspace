# Sales Hub read API: quickstart (from Mateo, received 2026-10-05)

Checked on 2026-10-05 with the app's token "ali-fr-closing": the guide at the base URL lists exactly the three reads
the app already uses (`/automations/leads`, `/automations/leads/{leadId}/upcoming`, `/automations/templates`), market FR,
cached 60 s. Nothing to change in `hub.mjs`. The spec is at `/openapi.json`; the guide at the base URL is always current.

---

You received a token (it starts with `hubr_`). It lets you, your script, your dashboard or your AI agent
**read** Sales Hub data: calling performance, the lead pool, no-shows, confirmations, sales metrics, WhatsApp
automations and more, limited to what and which markets your token was given. It can never change anything.

## 1. Ask the API what you can read

```bash
curl -H "Authorization: Bearer hubr_YOUR_TOKEN" https://hub.easypeasyfluent.com/api/ext/v1
```

The answer is a guide written for your token: every read you can use, its parameters, an example call for
each, time zones, limits and what each error means. It is always up to date, so it is the only manual you
need.

- Same guide as JSON: add `?format=json`.
- Machine-readable spec (OpenAPI 3.1, for code generators, dashboards and GPT Actions):
  `https://hub.easypeasyfluent.com/api/ext/v1/openapi.json`.

## 2. Using it with an AI agent

Give the agent the token as a secret (an environment variable such as `HUB_TOKEN`, never pasted into a
prompt that gets shared) and tell it:

> The Sales Hub read API is at https://hub.easypeasyfluent.com/api/ext/v1. Call it with the header
> `Authorization: Bearer $HUB_TOKEN`. Start with GET on that base URL: it returns the guide with every read
> available and how to call it. Only use GET.

## 3. Good to know

- Send the token only in the `Authorization` header, never in a URL. Treat it like a password.
- Limits: 30 requests per minute and 600 per hour. Data is cached for a short time (stated per read), so
  polling faster than that returns the same answer.
- If you get `429` or `503`, wait the seconds in the `Retry-After` header and try again.
- Errors explain themselves: the `detail` field says what went wrong and what to do.
- New reads appear over time; ignore fields you do not know.
- Token stopped working? It expired or was revoked. Ask the Sales Hub admin for a new one.
