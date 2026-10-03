/**
 * Knowledge search words (Ali 2026-10-03: "tag every entry with hidden keywords so search finds
 * it by related words, not just the title · 'Cruise discount hack' is findable by cruise, trip,
 * travel") · server only.
 *
 * `tagKnowledge(userId)` takes every Knowledge entry without words (or all of them with
 * `all: true`), sends them to the writer (Gemini first, Haiku second · summarize.ts askAI) ten at
 * a time, and stores 8-14 related words per entry in `todos.keywords`, comma-separated and never
 * shown. Passwords and birthdays are not to-dos, so they are never touched. A changed title or
 * text clears the words (todos route), so the next run tags the entry again.
 *
 * When: the Sunday 19:00 UTC cron (checklist suggestions) and `POST /api/todos/keywords`.
 */

import { db } from "@/db";
import { todos } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { askAI, lastAiError } from "@/lib/news/summarize";
import { ensureTodoColumns } from "@/lib/db/ensureColumns";

export async function tagKnowledge(userId: string, opts: { all?: boolean; limit?: number } = {}): Promise<{ tagged: number; pending: number; error: string | null }> {
  await ensureTodoColumns();
  const where = opts.all
    ? and(eq(todos.userId, userId), eq(todos.area, "list"), eq(todos.deleted, false))
    : and(eq(todos.userId, userId), eq(todos.area, "list"), eq(todos.deleted, false), isNull(todos.keywords));
  const rows = await db.select({ id: todos.id, title: todos.title, notes: todos.notes }).from(todos).where(where).limit(opts.limit ?? 60);
  let tagged = 0;
  let error: string | null = null;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const list = batch.map((r, k) => `[${k}] ${r.title}${r.notes ? `\n${r.notes.replace(/\s+/g, " ").slice(0, 300)}` : ""}`).join("\n\n");
    const prompt = `These are entries from a personal knowledge list (notes, lists, links, checklists). For EACH entry, give 8 to 14 search words a person might type later to find it: synonyms, the broader topic, the category, related things, the place or brand when there is one, in English and, when the entry is in French, French too. Lowercase, single words or two-word phrases, no duplicates of the title's own words, no punctuation.

Output ONLY a JSON object mapping the entry index (as a string) to an array of words, like {"0":["cruise","trip","travel"],"1":[...]}.

ENTRIES:
${list}`;
    const out = await askAI(prompt, 2500);
    if (!out) { error = lastAiError ?? "no answer"; break; }
    let map: Record<string, unknown>;
    try { map = JSON.parse(out.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")); } catch { error = "unreadable answer"; continue; }
    for (let k = 0; k < batch.length; k++) {
      const words = map[String(k)];
      if (!Array.isArray(words)) continue;
      const clean = Array.from(new Set(words.filter((w): w is string => typeof w === "string").map((w) => w.toLowerCase().replace(/[^\p{L}\p{N} '-]/gu, "").trim()).filter((w) => w && w.length <= 32))).slice(0, 16);
      if (!clean.length) continue;
      await db.update(todos).set({ keywords: clean.join(", ") }).where(eq(todos.id, batch[k].id));
      tagged += 1;
    }
  }
  const left = await db.select({ id: todos.id }).from(todos).where(and(eq(todos.userId, userId), eq(todos.area, "list"), eq(todos.deleted, false), isNull(todos.keywords)));
  return { tagged, pending: left.length, error };
}
