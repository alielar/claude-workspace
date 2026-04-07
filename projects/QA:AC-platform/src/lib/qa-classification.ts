// QA Issue Classification Engine
// Determines whether a Linear issue is "cycle_work" or "live_bug".
// Priority: cycle project membership (from cycle-detection) → cache → Claude fallback.

import Anthropic from "@anthropic-ai/sdk"
import { readFile, writeFile } from "fs/promises"
import path from "path"
import type { CycleInfo } from "./cycle-detection"
import { isProjectInCycle } from "./cycle-detection"

// The two QA engineers — hardcoded as per product decision
export const QA_ENGINEERS = [
  { name: "Mahnoor", email: "mahnoorismail8@gmail.com" },
  { name: "Iehtanab", email: "iehtanab555@gmail.com" },
] as const

export type QAEngineerEmail = typeof QA_ENGINEERS[number]["email"]
export type Classification = "cycle_work" | "live_bug" | "unknown"

// Cache file path — avoids re-classifying the same issue twice
const CACHE_PATH = path.join(process.cwd(), "prisma", "classification-cache.json")

// ─────────────────────────────────────────
// Load classification cache from disk
// ─────────────────────────────────────────
async function loadCache(): Promise<Record<string, Classification>> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────
// Save updated cache to disk
// ─────────────────────────────────────────
async function saveCache(cache: Record<string, Classification>): Promise<void> {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8")
}

// ─────────────────────────────────────────
// Classify a single issue.
// Priority: project name regex → cache → Claude
// ─────────────────────────────────────────
export async function classifyIssue({
  issueId,
  projectName,
  title,
  description,
}: {
  issueId: string
  projectName: string | null
  title: string
  description: string | null
}): Promise<Classification> {
  // 1. Project name check — fastest, no API needed
  // Any project matching "Cycle 1", "Cycle 2", "cycle one", etc.
  if (projectName && /cycle\s*\d+/i.test(projectName)) {
    return "cycle_work"
  }

  // 2. Check cache
  const cache = await loadCache()
  if (cache[issueId]) return cache[issueId]

  // 3. Claude classification — used when project name isn't conclusive
  const classification = await classifyWithClaude({ title, description })

  // Persist to cache
  cache[issueId] = classification
  await saveCache(cache)

  return classification
}

// ─────────────────────────────────────────
// Classify a batch of issues, reusing the cache for efficiency.
// Accepts optional CycleInfo so project membership is checked first.
// ─────────────────────────────────────────
export async function classifyBatch(
  issues: Array<{
    issueId: string
    projectId: string | null
    projectName: string | null
    title: string
    description: string | null
  }>,
  cycle: CycleInfo | null = null
): Promise<Record<string, Classification>> {
  const cache = await loadCache()
  const result: Record<string, Classification> = {}
  const toClassify: typeof issues = []

  for (const issue of issues) {
    // 1. Project membership check using cycle-detection (most accurate)
    if (isProjectInCycle(issue.projectId, issue.projectName, cycle)) {
      result[issue.issueId] = "cycle_work"
      continue
    }
    // 2. Cache hit
    if (cache[issue.issueId]) {
      result[issue.issueId] = cache[issue.issueId]
      continue
    }
    // 3. Needs Claude
    toClassify.push(issue)
  }

  // Classify uncached issues in a single Claude call (batch prompt)
  if (toClassify.length > 0) {
    const batchResult = await classifyBatchWithClaude(toClassify)
    for (const [id, cls] of Object.entries(batchResult)) {
      result[id] = cls
      cache[id] = cls
    }
    await saveCache(cache)
  }

  return result
}

// ─────────────────────────────────────────
// Single-issue Claude classification
// ─────────────────────────────────────────
async function classifyWithClaude({
  title,
  description,
}: {
  title: string
  description: string | null
}): Promise<Classification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are classifying a Linear issue for a QA team at an online language-learning academy platform.

Classify this issue as exactly one of:
- "cycle_work" — planned feature work, development tasks, scheduled improvements, or anything part of a product cycle/sprint
- "live_bug" — a bug, error, or problem found on the live academy platform during daily monitoring

Issue title: ${title}
Issue description: ${description || "(no description)"}

Respond with ONLY the classification word: cycle_work OR live_bug`

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // Use Haiku for cost efficiency on bulk classification
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    })
    const text = response.content[0].type === "text" ? response.content[0].text.trim().toLowerCase() : ""
    if (text.includes("cycle_work")) return "cycle_work"
    if (text.includes("live_bug")) return "live_bug"
    return "unknown"
  } catch {
    return "unknown"
  }
}

// ─────────────────────────────────────────
// Batch Claude classification — one API call for multiple issues
// ─────────────────────────────────────────
async function classifyBatchWithClaude(
  issues: Array<{ issueId: string; title: string; description: string | null }>
): Promise<Record<string, Classification>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const issueList = issues
    .map((i, idx) => `[${idx + 1}] ID:${i.issueId} | Title: ${i.title} | Description: ${i.description?.slice(0, 200) || "none"}`)
    .join("\n")

  const prompt = `You are classifying Linear issues for a QA team at an online language-learning academy platform.

For each issue, classify as:
- "cycle_work" — planned feature work, development tasks, scheduled improvements
- "live_bug" — a bug or problem found on the live academy platform during daily monitoring

Issues:
${issueList}

Respond with ONLY a JSON object mapping each ID to its classification. Example:
{"id1": "live_bug", "id2": "cycle_work"}`

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    })
    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "{}"
    const cleaned = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(cleaned)
    // Validate each value
    const result: Record<string, Classification> = {}
    for (const [id, cls] of Object.entries(parsed)) {
      result[id] = cls === "cycle_work" ? "cycle_work" : cls === "live_bug" ? "live_bug" : "unknown"
    }
    return result
  } catch {
    // On parse failure, mark all as unknown
    return Object.fromEntries(issues.map((i) => [i.issueId, "unknown" as Classification]))
  }
}
