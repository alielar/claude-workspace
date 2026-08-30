/**
 * AI-enhanced news summaries via Google Gemini (free tier).
 *
 * Batches stories by category and asks Gemini to produce concise summaries
 * and key bullet points. Falls back to raw RSS descriptions if no API key
 * is configured or if the request fails.
 */

import type { NewsStory } from "../news-brief";

let genAI: InstanceType<typeof import("@google/generative-ai").GoogleGenerativeAI> | null = null;

async function getModel() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
}

/** One prompt → text, Gemini first (free), Claude Haiku second. Null when neither is configured or both fail. */
async function askAI(prompt: string, maxTokens = 4000): Promise<string | null> {
  const model = await getModel();
  if (model) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch { /* fall through to Haiku */ }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return (message.content[0] as { type: string; text: string }).text?.trim() ?? null;
    } catch { /* give up quietly */ }
  }
  return null;
}

function parseJson<T>(text: string): T {
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")) as T;
}

/**
 * Enhance a batch of stories with AI-generated summaries and key points.
 * Mutates the stories in place. Falls back silently on failure.
 */
export async function enhanceStoriesWithAI(stories: NewsStory[]): Promise<void> {
  if (stories.length === 0) return;

  // Batch all stories into one prompt to minimize API calls
  const storyList = stories
    .map((s, i) => `[${i}] HEADLINE: ${s.headline}\nDESCRIPTION: ${s.summary}`)
    .join("\n\n");

  const prompt = `You are a concise news editor. For each story below, write:
1. A sharp 1-2 sentence summary that captures the key facts (not just repeating the headline)
2. 2-3 bullet key points — short, factual, no filler

Return ONLY valid JSON — an array of objects with "index" (number), "summary" (string), and "keyPoints" (string array).
No markdown fences, no extra text.

Stories:
${storyList}`;

  try {
    const text = await askAI(prompt);
    if (!text) return;
    const parsed = parseJson<{ index: number; summary: string; keyPoints: string[] }[]>(text);

    for (const item of parsed) {
      const story = stories[item.index];
      if (story && item.summary) {
        story.summary = item.summary;
        story.keyPoints = item.keyPoints ?? [];
      }
    }
  } catch {
    // Silently fall back to RSS descriptions
  }
}

/**
/**
 * Batch-generate the deep analysis for all stories in ONE call (Gemini free tier → Claude Haiku).
 * Mutates stories in place, adding deepDive. Stored with the brief, so it works offline.
 */
export async function generateDeepDives(stories: NewsStory[]): Promise<void> {
  if (stories.length === 0) return;

  const storyList = stories
    .map((s, i) => `[${i}] ${s.headline}\n${s.summary}`)
    .join("\n\n");

  // One batched call for all stories — the same call that has always run, asked for more depth.
  const prompt = `You are a senior news analyst writing for one busy reader who wants to genuinely understand each story, not skim it. For each story write five parts, each 2-3 full sentences, plain direct language, specific facts (names, numbers, places) — never vague filler, never repeat the headline:
1. WHAT HAPPENED — the core event, who did what, when, and the key numbers.
2. WHY IT MATTERS — who is affected and what actually changes for them.
3. CONTEXT — the background that explains it: what led here, the relevant history or trend.
4. IMPLICATIONS — the knock-on effects: who gains, who loses, what this makes more or less likely; where relevant, what it means for Europe, Morocco / MENA, markets, or the AI industry.
5. WHATS NEXT — concrete things to watch for, with dates or triggers when known.

Return ONLY valid JSON — an array of objects with "index" (number), "whatHappened", "whyItMatters", "context", "implications", "whatsNext" (all strings).
No markdown fences, no extra text.

Stories:
${storyList}`;

  type Item = { index: number; whatHappened: string; whyItMatters: string; context: string; implications?: string; whatsNext: string };
  try {
    const text = await askAI(prompt, 12000);
    if (!text) return;
    const parsed = parseJson<Item[]>(text);
    for (const item of parsed) {
      const story = stories[item.index];
      if (story && item.whatHappened) {
        story.deepDive = {
          whatHappened: item.whatHappened,
          whyItMatters: item.whyItMatters ?? "",
          context: item.context ?? "",
          implications: item.implications ?? "",
          whatsNext: item.whatsNext ?? "",
        };
      }
    }
  } catch {
    // Silently skip deep dives — the brief still ships with summaries
  }
}
