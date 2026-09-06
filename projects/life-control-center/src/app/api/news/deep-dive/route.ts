/**
 * POST /api/news/deep-dive · AI-powered deep analysis of a news story.
 * Uses Gemini (free) → Haiku fallback.
 * Body: { headline, summary, source }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

async function generateDeepDive(headline: string, summary: string, source: string): Promise<string> {
  const prompt = `You are a senior news analyst. A reader wants to fully understand this story without reading the full article.

HEADLINE: ${headline}
SUMMARY: ${summary}
SOURCE: ${source}

Write a deep analysis with five parts, each separated by a blank line, no headers or labels:
1. What happened · 2-3 sentences on the core event, who did what, when, key numbers.
2. Why it matters · 2-3 sentences on who is affected and what changes for them.
3. Context · 2-3 sentences of background: what led here, relevant history or trend.
4. Implications · 2-3 sentences on knock-on effects: who gains, who loses, what becomes more or less likely.
5. What's next · 1-2 sentences on what to watch for, with dates or triggers when known.

LANGUAGE RULES (important):
- Simple, everyday English (CEFR B1-B2). Short sentences. Common words.
- Keep ALL the information · simplify the wording, never the content. Keep every name, number and fact.
- Whenever an advanced (C1/C2) word would have been the natural choice, use a simpler word instead.
- After the five parts, add a final block starting with the exact line "VOCAB:" followed by 3-6 lines, each "advanced word = simple word you used instead". Only real, useful C1/C2 words.
- Each section adds NEW information, no repetition. Total 200-320 words before the VOCAB block.`;

  // Try Gemini first (free)
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.error("[deep-dive] Gemini failed:", err);
    }
  }

  // Fallback to Haiku
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    });
    return (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
  }

  throw new Error("No AI provider available");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { headline, summary, source } = await req.json();
  if (!headline) {
    return NextResponse.json({ error: "headline required" }, { status: 400 });
  }

  try {
    const analysis = await generateDeepDive(headline, summary ?? "", source ?? "");
    // The VOCAB block at the end becomes the advanced-word → simple-word list.
    const [body, vocabBlock] = analysis.split(/\nVOCAB:\s*\n?/);
    const vocabulary = (vocabBlock ?? "")
      .split("\n")
      .map((l) => l.replace(/^[-·*\s]+/, "").split(/\s*=\s*/))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .slice(0, 6)
      .map(([advanced, simple]) => ({ advanced, simple }));
    const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
    return NextResponse.json({
      whatHappened: paragraphs[0] ?? "",
      whyItMatters: paragraphs[1] ?? "",
      context: paragraphs[2] ?? "",
      implications: paragraphs[3] ?? "",
      whatsNext: paragraphs[4] ?? "",
      vocabulary,
      raw: analysis,
    });
  } catch (err) {
    console.error("[deep-dive] Failed:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
