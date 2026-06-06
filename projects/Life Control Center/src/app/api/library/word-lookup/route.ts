/**
 * POST /api/library/word-lookup
 * Look up a word using AI (Gemini free tier → Anthropic Haiku fallback).
 * Returns: definition, etymology, example sentence.
 * Optionally saves to the Word Bank.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

const LOOKUP_PROMPT = (word: string) => `Define the word "${word}" concisely. Return a JSON object with:
{
  "word": "${word}",
  "definition": "clear, concise definition (1-2 sentences)",
  "etymology": "brief origin/root (1 sentence)",
  "exampleSentence": "a natural example sentence using the word"
}
Return only the JSON, no other text.`;

/** Try Gemini first (free), fall back to Anthropic Haiku */
async function lookupWord(word: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(LOOKUP_PROMPT(word));
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.error("[word-lookup] Gemini failed:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: LOOKUP_PROMPT(word) }],
    });
    return message.content[0].type === "text" ? message.content[0].text : "";
  }

  throw new Error("No AI provider available");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { word, bookId, saveToWordBank } = await req.json();

  if (!word?.trim()) {
    return NextResponse.json({ error: "No word provided" }, { status: 400 });
  }

  let text: string;
  try {
    text = await lookupWord(word.trim());
  } catch (err) {
    console.error("[word-lookup] AI failed:", err);
    return NextResponse.json({ error: "AI lookup failed", detail: String(err) }, { status: 502 });
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse response" }, { status: 500 });
  }

  let result: { word: string; definition: string; etymology?: string; exampleSentence?: string };
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Invalid JSON from AI" }, { status: 500 });
  }

  // Save to Word Bank if requested
  if (saveToWordBank) {
    try {
      const today = todayMadrid();
      await db.insert(wordBankEntries).values({
        userId: session.user.id,
        word: result.word ?? word.trim(),
        definition: result.definition ?? "No definition available",
        etymology: result.etymology ?? null,
        exampleSentence: result.exampleSentence ?? null,
        bookId: bookId ?? null,
        nextReviewDate: today,
      });
    } catch (err) {
      console.error("[word-lookup] DB save failed:", err);
    }
  }

  return NextResponse.json(result);
}
