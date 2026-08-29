/**
 * AI-enhanced news summaries via Google Gemini (free tier).
 *
 * Batches stories by category and asks Gemini to produce concise summaries
 * and key bullet points. Falls back to raw RSS descriptions if no API key
 * is configured or if the request fails.
 */

import type { NewsStory, DeepDive } from "../news-brief";

let genAI: InstanceType<typeof import("@google/generative-ai").GoogleGenerativeAI> | null = null;

async function getModel() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
}

/**
 * Enhance a batch of stories with AI-generated summaries and key points.
 * Mutates the stories in place. Falls back silently on failure.
 */
export async function enhanceStoriesWithAI(stories: NewsStory[]): Promise<void> {
  const model = await getModel();
  if (!model || stories.length === 0) return;

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
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const parsed: { index: number; summary: string; keyPoints: string[] }[] = JSON.parse(jsonStr);

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
 * Batch-generate deep dive analyses for all stories.
 * Uses Gemini (free) → Haiku fallback. One API call for all stories.
 * Mutates stories in place, adding deepDive field.
 */
export async function generateDeepDives(stories: NewsStory[]): Promise<void> {
  if (stories.length === 0) return;

  const storyList = stories
    .map((s, i) => `[${i}] ${s.headline}\n${s.summary}`)
    .join("\n\n");

  const prompt = `You are a senior news analyst. For each story, write a brief deep analysis with 4 parts:
1. WHAT HAPPENED — 1-2 sentences, the core event in plain language
2. WHY IT MATTERS — 1-2 sentences, broader significance
3. CONTEXT — 1-2 sentences, background and how it connects to bigger trends
4. WHATS NEXT — 1 sentence, what to watch for

Return ONLY valid JSON — an array of objects with "index" (number), "whatHappened" (string), "whyItMatters" (string), "context" (string), "whatsNext" (string).
No markdown fences, no extra text. Be concise — each field should be 1-2 sentences max.

Stories:
${storyList}`;

  // Try Gemini first (free)
  const model = await getModel();
  if (model) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      const parsed: { index: number; whatHappened: string; whyItMatters: string; context: string; whatsNext: string }[] = JSON.parse(jsonStr);
      for (const item of parsed) {
        const story = stories[item.index];
        if (story && item.whatHappened) {
          story.deepDive = {
            whatHappened: item.whatHappened,
            whyItMatters: item.whyItMatters ?? "",
            context: item.context ?? "",
            whatsNext: item.whatsNext ?? "",
          };
        }
      }
      return;
    } catch {
      // Fall through to Haiku
    }
  }

  // Haiku fallback
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
      const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      const parsed: { index: number; whatHappened: string; whyItMatters: string; context: string; whatsNext: string }[] = JSON.parse(jsonStr);
      for (const item of parsed) {
        const story = stories[item.index];
        if (story && item.whatHappened) {
          story.deepDive = {
            whatHappened: item.whatHappened,
            whyItMatters: item.whyItMatters ?? "",
            context: item.context ?? "",
            whatsNext: item.whatsNext ?? "",
          };
        }
      }
    } catch {
      // Silently skip deep dives
    }
  }
}
