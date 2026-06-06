/**
 * GET /api/wordbank/suggestions
 *
 * Proactively suggests words to add from two sources:
 *   1. Today's news brief headlines (most recent)
 *   2. Current reading book (title + author as context)
 *
 * Claude haiku scans the content and picks ~6 interesting words/phrases
 * that are NOT already in the user's word bank.
 * Returns: { word, source: "news"|"library", context }[]
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries, newsBriefs, books, readingProgress } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
/** Try Gemini first (free), fall back to Anthropic Haiku */
async function generateAIText(prompt: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch {
      // Fall through to Anthropic
    }
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const today = todayMadrid();

  // Fetch in parallel: today's brief + current book + existing words
  const [brief, currentBookRow, existingWords] = await Promise.all([
    db.select().from(newsBriefs)
      .where(eq(newsBriefs.userId, userId))
      .orderBy(desc(newsBriefs.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    db.select({ id: books.id, title: books.title, author: books.author })
      .from(books)
      .innerJoin(readingProgress, eq(readingProgress.bookId, books.id))
      .where(eq(books.userId, userId))
      .orderBy(desc(readingProgress.lastReadAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    db.select({ word: wordBankEntries.word })
      .from(wordBankEntries)
      .where(eq(wordBankEntries.userId, userId)),
  ]);

  const existingSet = new Set(existingWords.map((e) => e.word.toLowerCase()));

  // Build context string for Claude
  const parts: string[] = [];

  if (brief) {
    const briefData = JSON.parse(brief.content) as { stories?: { headline: string; category: string }[] };
    const headlines = (briefData.stories ?? []).slice(0, 10).map((s) => s.headline).join("\n");
    if (headlines) {
      parts.push(`NEWS HEADLINES (${today}):\n${headlines}`);
    }
  }

  if (currentBookRow) {
    parts.push(`CURRENTLY READING: "${currentBookRow.title}" by ${currentBookRow.author}`);
  }

  if (parts.length === 0) {
    return NextResponse.json([]);
  }

  const context = parts.join("\n\n");
  const alreadyHave = existingWords.length > 0
    ? `\nAlready in word bank (DO NOT suggest these): ${existingWords.map((e) => e.word).slice(0, 50).join(", ")}`
    : "";

  let raw: string;
  try {
    raw = await generateAIText(`Given this context, suggest 6 interesting words or short phrases worth learning (English, French, or Moroccan Darija).
Prefer uncommon vocabulary, domain-specific terms, or expressive phrases.${alreadyHave}

${context}

Return ONLY a JSON array with exactly this shape — no markdown:
[
  { "word": "...", "source": "news" | "library", "context": "short quote or reason why this word is interesting (≤12 words)" },
  ...
]`);
  } catch (err) {
    console.error("[wordbank/suggestions] AI failed:", err);
    return NextResponse.json([]);
  }
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return NextResponse.json([]);

  let suggestions: { word: string; source: string; context: string }[] = [];
  try {
    suggestions = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json([]);
  }

  // Filter out words already in bank
  const filtered = suggestions.filter(
    (s) => s.word && !existingSet.has(s.word.toLowerCase())
  );

  return NextResponse.json(filtered);
}
