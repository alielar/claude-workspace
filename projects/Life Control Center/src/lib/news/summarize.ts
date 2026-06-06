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
