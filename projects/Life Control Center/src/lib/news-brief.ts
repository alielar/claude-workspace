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
  /** 3-4 sentence factual summary: who/what/where/when. No opinion or implications. */
  summary: string;
  /** 2-3 factual bullet points: key facts, numbers, quotes. Empty array if none. */
  keyPoints: string[];
  category: NewsCategory | "other";
  /** Optional source URL from web search */
  source?: string;
  /** @deprecated Kept for backward compat with briefs generated before 2026-05-19 */
  whyItMatters?: string;
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
    ? "\n⚽ WORLD CUP 2026 IS ACTIVE — include all 5 football stories focused on FIFA World Cup 2026 (results, standout moments, key team updates).\n"
    : "";

  return `Today is ${date}. Search the web and return exactly 20 news stories organized into 4 groups of 5:

**Group 1 — Football (5 stories, category: "football")**
KACM (Kawkab Athletic Club Marrakech), Morocco national team (Atlas Lions), World Cup 2026, Champions League, top European leagues
${wcRule}
**Group 2 — Geopolitics (5 stories, category: "geopolitics")**
REQUIRED: AT LEAST 1 of these 5 stories must cover Morocco-specific political or geopolitical news — government decisions, foreign policy, regional affairs, diplomatic moves, Moroccan-MENA relations.
Preferred sources for Morocco news: hespress.com, moroccoworldnews.com, le360.ma, yabiladi.com, africanews.com
FALLBACK: If no significant Morocco political news exists today, include a MENA-region story that involves or significantly affects Morocco.
Remaining 4 stories: major international events, conflicts, diplomacy, elections from anywhere in the world.

**Group 3 — Business (5 stories, category: "business")**
Markets, major company news, economic indicators, mergers, earnings

**Group 4 — Tech & AI (5 stories total, mix of category: "tech" and "ai" freely)**
Tech: product launches, industry shifts, regulation
AI: research breakthroughs, product releases, policy, safety

Rules:
- Return exactly 5 stories per group (20 total)
- Within each group, rank stories #1–5 by significance
- Facts only, no editorial opinion, no clickbait headlines
- Prefer stories with verifiable sources

For each story return:
- "headline": concise news headline (≤ 12 words)
- "summary": 3–4 sentences covering the WHAT of the story — who, what, where, when, key facts. No opinion, no implications, no "why this matters". Pure factual content as if summarizing a Reuters dispatch.
- "keyPoints": array of 2–3 short strings with the most important facts, numbers, or direct quotes from the story. Use an empty array [] if no discrete factual nuggets stand out.
- "category": one of [football, geopolitics, business, tech, ai]
- "source": source URL if available

Return ONLY a JSON object in this exact shape — no markdown fences, no extra text:
{
  "stories": [
    { "headline": "...", "summary": "...", "keyPoints": ["...", "..."], "category": "...", "source": "..." },
    ...
  ]
}

Return exactly 20 stories in this order: 5 football, then 5 geopolitics, then 5 business, then 5 tech/AI.`;
}

/** Generate a daily news brief using Claude with live web search */
export async function generateNewsBrief(date: string): Promise<NewsBrief> {
  // Web search is a beta feature — must use client.beta.messages.create() with the
  // matching beta header, otherwise the tool is silently ignored and returns no stories.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (client.beta.messages as any).create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    betas: ["web-search-2025-03-05"],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: buildUserPrompt(date),
      },
    ],
  });

  // Extract text from the final assistant message (after tool use rounds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBlocks = (message.content as any[]).filter(
    (b) => b.type === "text"
  );
  const raw = textBlocks.map((b: { text: string }) => b.text).join("\n");

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
    stories: (parsed.stories ?? []).map((s: NewsStory) => ({
      ...s,
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
    })),
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
