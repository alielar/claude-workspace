/**
 * POST /api/checklist/suggestions/cron
 * Called by Vercel Cron every Sunday at 19:00 UTC.
 * Generates 2-3 AI habit suggestions + weekly pattern observation per user.
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  checklistItems,
  checklistCompletions,
  checklistSuggestions,
  weeklyReviews,
} from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { format, subDays } from "date-fns";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function currentSunday(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  return format(subDays(now, dow), "yyyy-MM-dd");
}

/** Try Gemini first (free), fall back to Anthropic Haiku */
async function generateAIText(prompt: string, system?: string): Promise<string> {
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;

  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.error("[checklist-suggestions] Gemini failed:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    return (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
  }

  throw new Error("No AI provider available");
}

async function generateForUser(userId: string): Promise<void> {
  const today = todayMadrid();
  const weekStart = currentSunday();
  const lookback = format(subDays(new Date(today + "T12:00:00"), 30), "yyyy-MM-dd");

  const [items, completions] = await Promise.all([
    db
      .select({
        id: checklistItems.id,
        title: checklistItems.title,
        emoji: checklistItems.emoji,
        autoSource: checklistItems.autoSource,
      })
      .from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true))),

    db
      .select({ date: checklistCompletions.date, itemId: checklistCompletions.itemId })
      .from(checklistCompletions)
      .where(
        and(eq(checklistCompletions.userId, userId), gte(checklistCompletions.date, lookback))
      ),
  ]);

  if (items.length === 0) return;

  // Build per-day completion map
  const byDate = new Map<string, Set<number>>();
  for (const c of completions) {
    if (!byDate.has(c.date)) byDate.set(c.date, new Set());
    byDate.get(c.date)!.add(c.itemId);
  }

  // Build 30-day stats string
  const last30: string[] = [];
  for (let i = 29; i >= 0; i--) {
    last30.push(format(subDays(new Date(today + "T12:00:00"), i), "yyyy-MM-dd"));
  }

  const statsLines = last30
    .map((date) => {
      const doneIds = byDate.get(date) ?? new Set<number>();
      const doneTitles = items.filter((i) => doneIds.has(i.id)).map((i) => i.title);
      return `${date}: ${doneIds.size}/${items.length} (${doneTitles.join(", ") || "none"})`;
    })
    .join("\n");

  const itemsList = items
    .map(
      (i) =>
        `- ${i.emoji ?? "•"} ${i.title}${i.autoSource ? ` (auto-tracked from ${i.autoSource})` : ""}`
    )
    .join("\n");

  const text = await generateAIText(
    `Current habits:\n${itemsList}\n\nLast 30 days completion log:\n${statsLines}\n\nRespond with this exact JSON:\n{\n  "suggestions": [\n    { "title": "...", "rationale": "...", "emoji": "..." },\n    { "title": "...", "rationale": "...", "emoji": "..." }\n  ],\n  "patternObservation": "2-3 sentences about patterns in their completion data."\n}\n\nRules:\n- Suggest 2-3 NEW habits not already tracked\n- Keep each rationale to 1-2 sentences\n- Pattern observation: factual and specific to their actual data`,
    "You are a personal habit coach. Analyze checklist data and respond with JSON only — no markdown, no extra text."
  );

  let parsed: {
    suggestions: { title: string; rationale: string; emoji: string }[];
    patternObservation: string;
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[suggestions-cron] Failed to parse Anthropic response:", text);
    return;
  }

  if (parsed.suggestions?.length > 0) {
    for (const s of parsed.suggestions.slice(0, 3)) {
      if (!s.title?.trim()) continue;
      await db.insert(checklistSuggestions).values({
        userId,
        weekStart,
        title: s.title,
        rationale: s.rationale ?? "",
        suggestedEmoji: s.emoji ?? null,
        status: "pending",
      });
    }
  }

  if (parsed.patternObservation?.trim()) {
    await db.insert(weeklyReviews).values({
      userId,
      weekStart,
      patternObservation: parsed.patternObservation,
    });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);
  const results = { ok: 0, failed: 0 };

  for (const user of allUsers) {
    try {
      await generateForUser(user.id);
      results.ok++;
    } catch (err) {
      console.error(`[suggestions-cron] Failed for user ${user.id}:`, err);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: results.ok, failed: results.failed });
}
