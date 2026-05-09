/**
 * POST /api/library/word-lookup
 * Look up a word using Claude API.
 * Returns: definition, etymology, example sentence.
 * Optionally saves to the Word Bank.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";
import Anthropic from "@anthropic-ai/sdk";
import { format, addDays } from "date-fns";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { word, bookId, saveToWordBank } = await req.json();

  if (!word?.trim()) {
    return NextResponse.json({ error: "No word provided" }, { status: 400 });
  }

  // Ask Claude for definition, etymology, and example
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001", // Fast model for lookups
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Define the word "${word}" concisely. Return a JSON object with:
{
  "word": "${word}",
  "definition": "clear, concise definition (1-2 sentences)",
  "etymology": "brief origin/root (1 sentence)",
  "exampleSentence": "a natural example sentence using the word"
}
Return only the JSON, no other text.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse response" }, { status: 500 });
  }

  const result = JSON.parse(jsonMatch[0]);

  // Save to Word Bank if requested
  if (saveToWordBank) {
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    await db.insert(wordBankEntries).values({
      userId: session.user.id,
      word: result.word,
      definition: result.definition,
      etymology: result.etymology,
      exampleSentence: result.exampleSentence,
      bookId: bookId ?? null,
      nextReviewDate: tomorrow,
    });
  }

  return NextResponse.json(result);
}
