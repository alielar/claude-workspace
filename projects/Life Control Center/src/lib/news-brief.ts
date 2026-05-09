/**
 * News Brief Generator
 *
 * Uses Claude API to generate a personalized daily news brief covering:
 * - Football: KACM (Marrakesh), Morocco national team, World Cup 2026
 * - Geopolitics, business, tech, AI
 *
 * Each story includes:
 * - Headline
 * - 2–3 sentence summary
 * - "Why it matters" explanation
 * - Unbiased framing (facts only, no editorial opinion)
 * - Category tag
 */

import Anthropic from "@anthropic-ai/sdk";

export type NewsStory = {
  headline: string;
  summary: string;
  whyItMatters: string;
  category: "football" | "geopolitics" | "business" | "tech" | "ai" | "other";
  source?: string;
};

export type NewsBrief = {
  date: string;
  stories: NewsStory[];
  generatedAt: string;
};

const client = new Anthropic();

const TOPICS_PROMPT = `
You are a news curator for a personal dashboard. Generate a structured daily news brief covering the following topics:

**Sports / Football:**
- KACM (Kawkab Athletic Club Marrakech) — Moroccan football club in Marrakesh
- Morocco national football team (الأسود — the Atlas Lions)
- FIFA World Cup 2026 (hosted in USA, Canada, Mexico — preparations, qualifications, news)

**General Interest:**
- Geopolitics: major international events, conflicts, diplomacy
- Business: significant market moves, company news, economic indicators
- Tech: major product launches, industry shifts, regulatory news
- AI: research breakthroughs, product releases, policy discussions

**Instructions:**
1. Generate 6–8 stories total, covering a mix of the topics above.
2. For EACH story, provide:
   - "headline": concise news headline
   - "summary": 2–3 sentences, factual only, no opinion
   - "whyItMatters": 1–2 sentences explaining the significance to the reader
   - "category": one of ["football", "geopolitics", "business", "tech", "ai", "other"]
3. Be UNBIASED — present facts and let the reader form their own opinion.
4. Focus on genuinely important or interesting stories, not clickbait.
5. If a topic has no significant news today, skip it.
6. Today's date: {{DATE}}

Return a JSON object with this structure:
{
  "stories": [
    {
      "headline": "...",
      "summary": "...",
      "whyItMatters": "...",
      "category": "..."
    }
  ]
}
`;

/** Generate a daily news brief using Claude */
export async function generateNewsBrief(date: string): Promise<NewsBrief> {
  const prompt = TOPICS_PROMPT.replace("{{DATE}}", date);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // Extract the JSON from Claude's response
  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Find JSON block in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON for news brief");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { stories: NewsStory[] };

  return {
    date,
    stories: parsed.stories,
    generatedAt: new Date().toISOString(),
  };
}

/** Format a news brief as HTML for email */
export function formatBriefAsEmail(brief: NewsBrief): string {
  const CATEGORY_COLORS: Record<string, string> = {
    football:   "#f59e0b",
    geopolitics:"#f87171",
    business:   "#34d399",
    tech:       "#60a5fa",
    ai:         "#a78bfa",
    other:      "#94a3b8",
  };

  const CATEGORY_LABELS: Record<string, string> = {
    football:   "⚽ Football",
    geopolitics:"🌍 Geopolitics",
    business:   "📈 Business",
    tech:       "💻 Tech",
    ai:         "🤖 AI",
    other:      "📰 News",
  };

  const storiesHtml = brief.stories
    .map(
      (s) => `
    <div style="margin-bottom:24px;padding:16px;background:#1a1a24;border-radius:12px;border-left:3px solid ${CATEGORY_COLORS[s.category] ?? "#6366f1"}">
      <div style="color:${CATEGORY_COLORS[s.category] ?? "#6366f1"};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
        ${CATEGORY_LABELS[s.category] ?? "📰 News"}
      </div>
      <h2 style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0 0 8px 0;line-height:1.4">
        ${s.headline}
      </h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 10px 0;line-height:1.6">
        ${s.summary}
      </p>
      <div style="background:#111118;border-radius:8px;padding:10px 12px">
        <span style="color:#6366f1;font-size:12px;font-weight:600">Why it matters: </span>
        <span style="color:#94a3b8;font-size:13px">${s.whyItMatters}</span>
      </div>
    </div>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="margin-bottom:24px">
      <div style="display:inline-block;background:#6366f1;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:8px">
        DAILY BRIEF
      </div>
      <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0">
        ${new Date(brief.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </h1>
      <p style="color:#475569;font-size:13px;margin:4px 0 0 0">${brief.stories.length} stories · Unbiased · No opinion</p>
    </div>

    <!-- Stories -->
    ${storiesHtml}

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(255,255,255,0.07)">
      <p style="color:#334155;font-size:12px">Life Control Center · Daily Brief</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
