/**
 * POST /api/news/deep-dive — AI-powered deep analysis of a news story.
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

Write a deep analysis in this exact format:

WHAT HAPPENED
2-3 sentences explaining the core event or announcement in plain language.

WHY IT MATTERS
2-3 sentences on the broader significance — who is affected, what changes, why people should care.

CONTEXT
2-3 sentences of background — what led to this, relevant history, how it connects to bigger trends.

WHAT'S NEXT
1-2 sentences on likely next steps or what to watch for.

Rules:
- Write in plain, direct language — no jargon
- Be factual and specific, not vague
- Each section should add NEW information, don't repeat yourself
- Total length: 150-250 words
- Do NOT include any headers or labels — just the text for each section separated by a blank line`;

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
      max_tokens: 500,
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
    // Split into 4 paragraphs
    const paragraphs = analysis.split(/\n\s*\n/).filter(Boolean);
    return NextResponse.json({
      whatHappened: paragraphs[0] ?? "",
      whyItMatters: paragraphs[1] ?? "",
      context: paragraphs[2] ?? "",
      whatsNext: paragraphs[3] ?? "",
      raw: analysis,
    });
  } catch (err) {
    console.error("[deep-dive] Failed:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
