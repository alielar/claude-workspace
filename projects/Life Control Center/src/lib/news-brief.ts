/**
 * News Brief Generator — real web search via Claude's web_search tool.
 *
 * Uses claude-sonnet-4-6 with the web_search_20250305 built-in tool.
 * Claude searches the web autonomously and returns structured JSON with
 * 5 stories per category across 5 topic pillars.
 *
 * Categories:  football · geopolitics · business · tech · ai
 *
 * Each story:  headline · summary (2–3 sentences) · whyItMatters · source URL
 */

import Anthropic from "@anthropic-ai/sdk";

export type NewsCategory = "football" | "geopolitics" | "business" | "tech" | "ai";

export type NewsStory = {
  headline: string;
  summary: string;
  whyItMatters: string;
  category: NewsCategory | "other";
  /** Optional source URL from web search */
  source?: string;
};

export type NewsBrief = {
  date: string;
  stories: NewsStory[];
  generatedAt: string;
};

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a news curator for a personal dashboard.
Search the web to find today's most significant real news stories.
Be unbiased — facts only, no editorial opinion. No clickbait.`;

function buildUserPrompt(date: string): string {
  // World Cup 2026 runs June 11 – July 19, 2026
  const d = new Date(date + "T12:00:00Z");
  const wc2026Start = new Date("2026-06-11T00:00:00Z");
  const wc2026End   = new Date("2026-07-19T23:59:59Z");
  const inWorldCup  = d >= wc2026Start && d <= wc2026End;
  const wcRule = inWorldCup
    ? "\n⚽ WORLD CUP 2026 IS ACTIVE — include AT LEAST 2 football stories (FIFA World Cup 2026 results, standout moments, key team updates).\n"
    : "";

  return `Today is ${date}. Search the web and return a ranked list of today's 10 most significant real news stories across these categories:

- **football** — KACM (Kawkab Athletic Club Marrakech), Morocco national team (Atlas Lions), World Cup 2026
- **geopolitics** — major international events, conflicts, diplomacy, elections
- **business** — markets, major company news, economic indicators
- **tech** — product launches, industry shifts, regulation
- **ai** — research breakthroughs, product releases, policy
${wcRule}
Rules:
- Rank stories #1–10 by global significance and reader interest
- Mix categories — no more than 3 stories from one category
- Facts only, no editorial opinion, no clickbait headlines
- Prefer stories with verifiable sources

For each story return:
- "headline": concise news headline (≤ 12 words)
- "summary": 2–3 sentences, facts only, no opinion
- "whyItMatters": 1–2 sentences of significance
- "category": one of [football, geopolitics, business, tech, ai]
- "source": source URL if available

Return ONLY a JSON object in this exact shape — no markdown fences, no extra text:
{
  "stories": [
    { "headline": "...", "summary": "...", "whyItMatters": "...", "category": "...", "source": "..." },
    ...
  ]
}

Return exactly 10 stories, ordered #1 (most significant) to #10.`;
}

/** Generate a daily news brief using Claude with live web search */
export async function generateNewsBrief(date: string): Promise<NewsBrief> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    // Built-in web search tool (Anthropic beta, available on claude-sonnet-4-6+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [
      {
        role: "user",
        content: buildUserPrompt(date),
      },
    ],
  });

  // Extract text from the final assistant message (after tool use rounds)
  const textBlocks = message.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const raw = textBlocks.map((b) => b.text).join("\n");

  // Find the JSON object in the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Claude news response (no JSON found):", raw.slice(0, 500));
    // Fallback: return empty brief rather than crash
    return { date, stories: [], generatedAt: new Date().toISOString() };
  }

  let parsed: { stories: NewsStory[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { date, stories: [], generatedAt: new Date().toISOString() };
  }

  return {
    date,
    stories: parsed.stories ?? [],
    generatedAt: new Date().toISOString(),
  };
}

/** Format a news brief as HTML email */
export function formatBriefAsEmail(brief: NewsBrief): string {
  const CAT_COLORS: Record<string, string> = {
    football:    "#F97316",
    geopolitics: "#F87171",
    business:    "#34D399",
    tech:        "#22D3EE",
    ai:          "#A78BFA",
    other:       "#94A3B8",
  };
  const CAT_LABELS: Record<string, string> = {
    football:    "⚽ Football",
    geopolitics: "🌍 Geopolitics",
    business:    "📈 Business",
    tech:        "💻 Tech",
    ai:          "🤖 AI",
    other:       "📰 News",
  };

  const storiesHtml = brief.stories
    .map((s) => {
      const color = CAT_COLORS[s.category] ?? CAT_COLORS.other;
      const label = CAT_LABELS[s.category] ?? CAT_LABELS.other;
      return `
    <div style="margin-bottom:20px;padding:16px;background:#1a1a24;border-radius:12px;border-left:3px solid ${color}">
      <div style="color:${color};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
        ${label}
      </div>
      <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 8px 0;line-height:1.4">${s.headline}</h2>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 10px 0;line-height:1.6">${s.summary}</p>
      <div style="background:#111118;border-radius:8px;padding:10px 12px">
        <span style="color:#7C5CFF;font-size:12px;font-weight:600">Why it matters: </span>
        <span style="color:#94a3b8;font-size:13px">${s.whyItMatters}</span>
      </div>
      ${s.source ? `<div style="margin-top:8px"><a href="${s.source}" style="color:#475569;font-size:11px">${s.source}</a></div>` : ""}
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="margin-bottom:24px">
      <div style="display:inline-block;background:#7C5CFF;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:8px">DAILY BRIEF</div>
      <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0">
        ${new Date(brief.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </h1>
      <p style="color:#475569;font-size:13px;margin:4px 0 0 0">${brief.stories.length} stories · Live web search · No opinion</p>
    </div>
    ${storiesHtml}
    <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(255,255,255,0.07)">
      <p style="color:#334155;font-size:12px">Life Control Center · Daily Brief</p>
    </div>
  </div>
</body>
</html>`;
}
