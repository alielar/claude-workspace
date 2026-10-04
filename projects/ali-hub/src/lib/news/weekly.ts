/**
 * The WEEKLY BRIEF (Ali 2026-10-03: "replaces the daily written news · Tech & AI, Business,
 * Geopolitics · the top developments of the previous week, readable in 10-15 minutes, same
 * format as now, more in depth · also as a weekly podcast") · server only.
 *
 * Raw material: the daily briefs of the week (Monday to Sunday · RSS stories only since
 * 2026-10-04, the daily AI summaries are gone), collected at 06:00 each day. One Haiku call per topic picks the
 * four or five developments that mattered and writes each one up in depth (what happened, why it
 * matters, context, who gains and loses, what to watch) with the sources it drew on. Football is
 * never part of it. Stored once per week in `weekly_briefs` (JSON), the podcast beside it in
 * `podcast_episodes` under the week key ("2026-W40", see podcast/generate.ts).
 *
 * When (Ali 2026-10-04: "on Sunday, on what happened during the week"): the podcast cron
 * (06:30 UTC, after the day's news cron) builds THIS week's brief and its podcast on SUNDAY ·
 * `briefWeek` in week.ts says which week counts on any day · the reminders tick finishes a
 * missing one from 09:00 Madrid, and `GET /api/news/weekly?make=1` does it on demand.
 */

import { db } from "@/db";
import { newsBriefs, weeklyBriefs } from "@/db/schema";
import { and, between, desc, eq, sql } from "drizzle-orm";
import { noDash } from "@/lib/utils";
import type { NewsBrief, NewsStory } from "@/lib/news-brief";
import { askAI } from "@/lib/news/summarize";

export type WeeklySection = { key: "tech" | "business" | "geopolitics"; label: string; color: string; stories: NewsStory[] };
export type WeeklyBrief = {
  week: string;          // "2026-W40"
  from: string;          // Monday YYYY-MM-DD
  to: string;            // Sunday YYYY-MM-DD
  generatedAt: string;
  sections: WeeklySection[];
  /** Reading time at ~220 words a minute. */
  readMinutes: number;
};

export const WEEKLY_SECTIONS: { key: WeeklySection["key"]; label: string; color: string; categories: string[] }[] = [
  { key: "tech",        label: "Tech & AI",   color: "#2E9E8F", categories: ["tech", "ai"] },
  { key: "business",    label: "Business",    color: "#3E9A63", categories: ["business"] },
  { key: "geopolitics", label: "Geopolitics", color: "#D05A5A", categories: ["geopolitics"] },
];

// ─── Weeks ────────────────────────────────────────────────────────────────────
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(new Date(`${s}T12:00:00Z`).getTime() + n * 86400_000));

export { weekKeyOf, isWeekKey, briefWeekKey } from "@/lib/news/week";
import { weekKeyOf, isWeekKey, briefWeekKey } from "@/lib/news/week";

/** The week the brief covers today: Sunday → this week · otherwise the previous one (week.ts). */
export function briefWeek(todayYmd: string): { week: string; from: string; to: string } {
  const week = briefWeekKey(todayYmd);
  return { week, ...weekRange(week) };
}

/** The previous full week (Monday to Sunday) relative to a date. */
export function previousWeek(todayYmd: string): { week: string; from: string; to: string } {
  const d = new Date(`${todayYmd}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  const thisMonday = addDays(todayYmd, -day);
  const from = addDays(thisMonday, -7);
  const to = addDays(from, 6);
  return { week: weekKeyOf(from), from, to };
}
/** Monday and Sunday of a week key. */
export function weekRange(week: string): { from: string; to: string } {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400_000 + (w - 1) * 7 * 86400_000);
  const from = ymd(monday);
  return { from, to: addDays(from, 6) };
}
const prettyRange = (from: string, to: string) => {
  const f = new Date(`${from}T12:00:00Z`), t = new Date(`${to}T12:00:00Z`);
  const fmt = (d: Date, m: boolean) => new Intl.DateTimeFormat("en-GB", { day: "numeric", ...(m ? { month: "long" } : {}), timeZone: "UTC" }).format(d);
  return `${fmt(f, f.getUTCMonth() !== t.getUTCMonth())} to ${fmt(t, true)}`;
};

// ─── Storage ──────────────────────────────────────────────────────────────────
async function ensureTable() {
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS weekly_briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, week TEXT NOT NULL, content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`));
    await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ux_weekly_brief ON weekly_briefs(user_id, week)`));
  } catch { /* exists */ }
}

export async function getWeeklyBrief(userId: string, week: string): Promise<WeeklyBrief | null> {
  await ensureTable();
  const [row] = await db.select({ content: weeklyBriefs.content }).from(weeklyBriefs).where(and(eq(weeklyBriefs.userId, userId), eq(weeklyBriefs.week, week)));
  if (!row) return null;
  try { return JSON.parse(row.content) as WeeklyBrief; } catch { return null; }
}
export async function latestWeeklyBrief(userId: string): Promise<WeeklyBrief | null> {
  await ensureTable();
  const [row] = await db.select({ content: weeklyBriefs.content }).from(weeklyBriefs).where(eq(weeklyBriefs.userId, userId)).orderBy(desc(weeklyBriefs.week)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.content) as WeeklyBrief; } catch { return null; }
}
export async function listWeeks(userId: string, n = 12): Promise<{ week: string; from: string; to: string; label: string }[]> {
  await ensureTable();
  const rows = await db.select({ week: weeklyBriefs.week }).from(weeklyBriefs).where(eq(weeklyBriefs.userId, userId)).orderBy(desc(weeklyBriefs.week)).limit(n);
  return rows.map((r) => { const { from, to } = weekRange(r.week); return { week: r.week, from, to, label: prettyRange(from, to) }; });
}

// ─── Writing ──────────────────────────────────────────────────────────────────
/** Gemini (free) first, Haiku second · see summarize.ts askAI. */
const haiku = (prompt: string, maxTokens: number) => askAI(prompt, maxTokens);
const parseJson = <T,>(text: string): T | null => {
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")) as T; } catch { return null; }
};

type Written = { headline: string; summary: string; whatHappened: string; whyItMatters: string; context: string; implications: string; whatsNext: string; sources?: string[] };

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The week's raw stories for one topic, as the writer sees them. */
function materials(stories: NewsStory[], dates: Map<NewsStory, string>): string {
  return stories.map((s, i) => {
    const d = s.deepDive;
    return `[${i}] ${dates.get(s) ?? ""} · ${s.headline}\n${s.summary}${s.keyPoints?.length ? `\n${s.keyPoints.join(" · ")}` : ""}${d ? `\nWhat happened: ${d.whatHappened}\nWhy it matters: ${d.whyItMatters}\nContext: ${d.context}${d.implications ? `\nImplications: ${d.implications}` : ""}\nWhat's next: ${d.whatsNext}` : ""}${s.source ? `\nSource: ${s.source}` : ""}`;
  }).join("\n\n");
}

async function writeSection(label: string, stories: NewsStory[], dates: Map<NewsStory, string>, from: string, to: string): Promise<NewsStory[]> {
  if (!stories.length) return [];
  const prompt = `You are writing Ali's WEEKLY brief, the "${label}" section, for the week of ${prettyRange(from, to)}. He reads it once, on Monday, in 10 to 15 minutes for the whole brief, so this section must be worth about four minutes of careful reading. He is a product person, not an engineer: plain words, no jargon, no em dashes anywhere (use a comma, a period or " · ").

From the week's stories below, choose the THREE developments that genuinely mattered this week (merge stories about the same development · prefer the week's arc over a single day's headline · skip anything trivial, promotional or repetitive). HARD LIMIT: at most 330 words per development, about 1000 words for the section · the whole brief must read in 12 minutes, so every sentence earns its place. For each development write, in this order:
- headline: one line, specific, no clickbait
- summary: 2-3 sentences · what happened this week, in plain words, with the key numbers
- whatHappened: the facts, 3-4 sentences, with the days of the week when they matter
- whyItMatters: 2-3 sentences · for someone who builds with AI, runs a small online company, follows business and geopolitics, is Moroccan and lives in Spain · only mention him when it is real
- context: 2-3 sentences · the background a smart reader may not have
- implications: 2-3 sentences · who gains, who loses, what changes next
- whatsNext: 1-2 sentences · what to watch in the coming weeks, with dates when known
- sources: the article URLs you drew on (from the material · never invent one)

Never invent facts, numbers, names or outcomes that are not in the material. If the material is thin on something, say less rather than guess.

Output ONLY a JSON array of objects with exactly these keys: headline, summary, whatHappened, whyItMatters, context, implications, whatsNext, sources (array of strings).

THE WEEK'S STORIES:
${materials(stories, dates)}`;
  const out = await haiku(prompt, 4000);
  let items = out ? parseJson<Written[]>(out) : null;
  if (!items || !Array.isArray(items)) return [];
  items = items.filter((w) => w && typeof w.headline === "string").slice(0, 3);
  // Haiku overshoots the word cap · one compress pass when the section runs long (over ~1150 words).
  const fields: (keyof Written)[] = ["summary", "whatHappened", "whyItMatters", "context", "implications", "whatsNext"];
  const words = items.reduce((n, w) => n + wordCount(fields.map((f) => String(w[f] ?? "")).join(" ")), 0);
  if (words > 1150) {
    const tight = await haiku(`Shorten this JSON array of news write-ups to about 950 words in total (at most 320 words per item), keeping every item, every key, the facts, the numbers and the plain-words tone. Cut repetition and the least important sentences; never add anything. No em dashes. Output ONLY the JSON array, same keys.

${JSON.stringify(items)}`, 3200);
    const t = tight ? parseJson<Written[]>(tight) : null;
    if (t && Array.isArray(t) && t.length === items.length && t.every((w) => w && typeof w.headline === "string")) items = t;
  }
  return items.map((w) => ({
    headline: noDash(w.headline), summary: noDash(w.summary ?? ""), keyPoints: [],
    category: label === "Tech & AI" ? "tech" : label === "Business" ? "business" : "geopolitics",
    source: Array.isArray(w.sources) && typeof w.sources[0] === "string" ? w.sources[0] : undefined,
    deepDive: { whatHappened: noDash(w.whatHappened ?? ""), whyItMatters: noDash(w.whyItMatters ?? ""), context: noDash(w.context ?? ""), implications: noDash(w.implications ?? ""), whatsNext: noDash(w.whatsNext ?? "") },
  }));
}

/** Build (once) the brief of the previous full week · returns the stored one when it exists. */
export async function ensureWeeklyBrief(userId: string, opts: { week?: string; force?: boolean } = {}): Promise<WeeklyBrief | null> {
  await ensureTable();
  const today = new Date().toISOString().slice(0, 10);
  const target = opts.week && isWeekKey(opts.week) ? { week: opts.week, ...weekRange(opts.week) } : briefWeek(today);
  if (!opts.force) {
    const have = await getWeeklyBrief(userId, target.week);
    if (have) return have;
  }
  const rows = await db.select({ date: newsBriefs.date, content: newsBriefs.content }).from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), between(newsBriefs.date, target.from, target.to)));
  if (!rows.length) return null;
  const dates = new Map<NewsStory, string>();
  const all: NewsStory[] = [];
  for (const r of rows) {
    try {
      const b = JSON.parse(r.content) as NewsBrief;
      const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${r.date}T12:00:00Z`));
      for (const s of b.stories ?? []) { if (s.category === "football") continue; dates.set(s, dayName); all.push(s); }
    } catch { /* skip a broken day */ }
  }
  const sections: WeeklySection[] = [];
  const written = await Promise.all(WEEKLY_SECTIONS.map((sec) => writeSection(sec.label, all.filter((s) => sec.categories.includes(s.category)), dates, target.from, target.to)));
  WEEKLY_SECTIONS.forEach((sec, i) => { if (written[i].length) sections.push({ key: sec.key, label: sec.label, color: sec.color, stories: written[i] }); });
  if (!sections.length) return null;
  const words = sections.flatMap((s) => s.stories).reduce((n, s) => n + wordCount([s.summary, s.deepDive?.whatHappened, s.deepDive?.whyItMatters, s.deepDive?.context, s.deepDive?.implications, s.deepDive?.whatsNext].filter(Boolean).join(" ")), 0);
  const brief: WeeklyBrief = { week: target.week, from: target.from, to: target.to, generatedAt: new Date().toISOString(), sections, readMinutes: Math.max(1, Math.round(words / 220)) };
  const content = JSON.stringify(brief);
  await db.insert(weeklyBriefs).values({ userId, week: target.week, content })
    .onConflictDoUpdate({ target: [weeklyBriefs.userId, weeklyBriefs.week], set: { content } })
    .catch(async () => { await db.update(weeklyBriefs).set({ content }).where(and(eq(weeklyBriefs.userId, userId), eq(weeklyBriefs.week, target.week))); });
  return brief;
}

/** The brief as the podcast writer reads it · one block per topic, the in-depth text included. */
export function weeklyMaterials(brief: WeeklyBrief): string {
  return brief.sections.map((sec) => `## ${sec.label}\n\n` + sec.stories.map((s) => {
    const d = s.deepDive;
    return `${s.headline}\n${s.summary}${d ? `\nWhat happened: ${d.whatHappened}\nWhy it matters: ${d.whyItMatters}\nContext: ${d.context}${d.implications ? `\nImplications: ${d.implications}` : ""}\nWhat's next: ${d.whatsNext}` : ""}`;
  }).join("\n\n")).join("\n\n");
}
export { prettyRange };
