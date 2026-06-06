/**
 * GET /api/wordbank
 *   ?due=true   → only words where nextReviewDate <= today
 *   ?lang=fr    → filter by language
 *   ?q=search   → search word/definition
 *
 * POST /api/wordbank
 *   Body: { word: string, bookId?: number }
 *   Claude auto-generates: definition, partOfSpeech, exampleSentence, language
 *   Returns the created entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";
import { eq, and, lte, like, or } from "drizzle-orm";
import { format } from "date-fns";
// Anthropic client lazily imported (Gemini free tier is tried first)

/** "Today" in Europe/Madrid timezone as YYYY-MM-DD */
function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const params = req.nextUrl.searchParams;
  const due = params.get("due") === "true";
  const lang = params.get("lang");
  const q = params.get("q");
  const today = todayMadrid();

  // Build filter conditions
  const conditions = [eq(wordBankEntries.userId, userId)];
  if (due) conditions.push(lte(wordBankEntries.nextReviewDate, today));
  if (lang) conditions.push(eq(wordBankEntries.language, lang));

  let words = await db
    .select()
    .from(wordBankEntries)
    .where(and(...conditions))
    .orderBy(wordBankEntries.nextReviewDate, wordBankEntries.createdAt);

  // Client-side search filter (SQLite LIKE is case-sensitive, and/or chain would get verbose)
  if (q) {
    const lower = q.toLowerCase();
    words = words.filter(
      (w) =>
        w.word.toLowerCase().includes(lower) ||
        w.definition.toLowerCase().includes(lower)
    );
  }

  return NextResponse.json(words);
}

const WORD_PROMPT = (word: string) => `Analyze the word or phrase: "${word}"

Return a JSON object with exactly these fields:
{
  "word": "the word exactly as given",
  "definition": "clear, concise definition (1-2 sentences)",
  "partOfSpeech": "noun | verb | adjective | adverb | phrase | idiom | expression",
  "exampleSentence": "a natural example sentence using this word/phrase",
  "language": "en | fr | darija"
}

Detect language: "en" for English, "fr" for French, "darija" for Moroccan Arabic/Darija.
Return only the JSON object, no markdown or other text.`;

/** Try Gemini first (free), fall back to Anthropic Haiku */
async function generateWordDefinition(word: string): Promise<string> {
  const errors: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(WORD_PROMPT(word));
      const text = result.response.text().trim();
      if (text) return text;
      errors.push("Gemini returned empty response");
    } catch (err) {
      errors.push(`Gemini: ${String(err)}`);
      console.error("[wordbank] Gemini failed:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: WORD_PROMPT(word) }],
      });
      return message.content[0].type === "text" ? message.content[0].text : "";
    } catch (err) {
      errors.push(`Anthropic: ${String(err)}`);
      console.error("[wordbank] Anthropic failed:", err);
    }
  }

  throw new Error(`All AI providers failed: ${errors.join("; ")}`);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { word, bookId } = await req.json();
  if (!word?.trim()) {
    return NextResponse.json({ error: "word required" }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await generateWordDefinition(word.trim());
  } catch (err) {
    console.error("[wordbank] AI generation failed:", err);
    return NextResponse.json({ error: "AI generation failed", detail: String(err) }, { status: 502 });
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }

  let generated: {
    word: string;
    definition: string;
    partOfSpeech: string;
    exampleSentence: string;
    language: string;
  };

  try {
    generated = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Invalid JSON from AI", raw }, { status: 500 });
  }

  const today = todayMadrid();

  try {
    const [entry] = await db
      .insert(wordBankEntries)
      .values({
        userId,
        word: generated.word ?? word.trim(),
        definition: generated.definition ?? "No definition available",
        partOfSpeech: generated.partOfSpeech ?? null,
        exampleSentence: generated.exampleSentence ?? null,
        language: ["en", "fr", "darija"].includes(generated.language)
          ? generated.language
          : "en",
        bookId: bookId ?? null,
        interval: 0,
        streak: 0,
        nextReviewDate: today,
        masteryStatus: "new",
      })
      .returning();

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("[wordbank] DB insert failed:", err);
    return NextResponse.json({ error: "Failed to save word", detail: String(err) }, { status: 500 });
  }
}
