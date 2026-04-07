// Cycle detection — finds the current "Cycle X" project in Linear
// and determines which other projects are related to it.
// Results are cached to avoid repeated API + Claude calls.

import Anthropic from "@anthropic-ai/sdk"
import { readFile, writeFile } from "fs/promises"
import path from "path"
import type { LinearClient } from "@linear/sdk"

const CYCLE_CACHE_PATH = path.join(process.cwd(), "prisma", "cycle-cache.json")

// ─────────────────────────────────────────
// Shape of the cached cycle info
// ─────────────────────────────────────────
export interface CycleInfo {
  name: string           // e.g. "Cycle 1"
  projectId: string      // Linear project ID of the Cycle X project itself
  startDate: string      // ISO date string
  endDate: string        // ISO date string (startDate + 6 weeks)
  relatedProjectIds: string[] // IDs of projects Claude determined are part of this cycle
  relatedProjectNames: string[]
  cachedAt: string       // ISO — cache expires after 1 hour
}

// ─────────────────────────────────────────
// Load from cache (expires after 1h)
// ─────────────────────────────────────────
async function loadCycleCache(): Promise<CycleInfo | null> {
  try {
    const raw = await readFile(CYCLE_CACHE_PATH, "utf-8")
    const cached: CycleInfo = JSON.parse(raw)
    const age = Date.now() - new Date(cached.cachedAt).getTime()
    if (age < 60 * 60 * 1000) return cached // fresh
    return null
  } catch {
    return null
  }
}

async function saveCycleCache(info: CycleInfo) {
  await writeFile(CYCLE_CACHE_PATH, JSON.stringify(info, null, 2), "utf-8")
}

// ─────────────────────────────────────────
// Main: detect current cycle from Linear projects
// ─────────────────────────────────────────
export async function getCurrentCycle(client: LinearClient): Promise<CycleInfo | null> {
  // Check cache first
  const cached = await loadCycleCache()
  if (cached) return cached

  // Fetch all projects from the workspace
  const projectsResponse = await client.projects({ first: 100 })
  const allProjects = projectsResponse.nodes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    startDate: p.startDate ?? null,
    targetDate: p.targetDate ?? null,
  }))

  // Find projects matching "Cycle N" pattern — pick the most recent (highest N)
  const cycleProjects = allProjects
    .filter((p) => /^cycle\s*\d+/i.test(p.name))
    .sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+/)?.[0] ?? "0")
      const numB = parseInt(b.name.match(/\d+/)?.[0] ?? "0")
      return numB - numA // descending — highest cycle number = current
    })

  if (cycleProjects.length === 0) return null

  const currentCycleProject = cycleProjects[0]

  // Determine date range: use project's actual dates if set, else start = project created, end = start + 6 weeks
  const startDate = currentCycleProject.startDate
    ? new Date(currentCycleProject.startDate)
    : new Date()
  const endDate = currentCycleProject.targetDate
    ? new Date(currentCycleProject.targetDate)
    : new Date(startDate.getTime() + 42 * 24 * 60 * 60 * 1000) // +6 weeks

  // Ask Claude which OTHER projects are related to this cycle
  const otherProjects = allProjects.filter((p) => p.id !== currentCycleProject.id)
  const relatedProjects = await identifyCycleProjects(currentCycleProject, otherProjects)

  const info: CycleInfo = {
    name: currentCycleProject.name,
    projectId: currentCycleProject.id,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    relatedProjectIds: [currentCycleProject.id, ...relatedProjects.map((p) => p.id)],
    relatedProjectNames: [currentCycleProject.name, ...relatedProjects.map((p) => p.name)],
    cachedAt: new Date().toISOString(),
  }

  await saveCycleCache(info)
  return info
}

// ─────────────────────────────────────────
// Ask Claude which projects belong to the current cycle
// ─────────────────────────────────────────
async function identifyCycleProjects(
  cycleProject: { id: string; name: string; description: string | null },
  otherProjects: Array<{ id: string; name: string; description: string | null }>
): Promise<Array<{ id: string; name: string }>> {
  if (otherProjects.length === 0) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const projectList = otherProjects
    .map((p) => `- ID:${p.id} | Name: ${p.name}${p.description ? ` | Description: ${p.description.slice(0, 100)}` : ""}`)
    .join("\n")

  const prompt = `You are helping identify which Linear projects belong to a product cycle at an online language-learning academy.

The current cycle project is: "${cycleProject.name}"
${cycleProject.description ? `Description: ${cycleProject.description}` : ""}

Below are all other projects in the workspace. Identify which ones are part of this cycle — meaning they are features, updates, or tasks being built as part of this cycle's scope.

Other projects:
${projectList}

Respond with ONLY a JSON array of IDs that belong to this cycle. Example: ["id1", "id2"]
If none belong, respond with: []`

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    })
    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]"
    const cleaned = text.replace(/```json|```/g, "").trim()
    const ids: string[] = JSON.parse(cleaned)
    return otherProjects.filter((p) => ids.includes(p.id))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────
// Check if a project ID or name belongs to the current cycle
// ─────────────────────────────────────────
export function isProjectInCycle(
  projectId: string | null,
  projectName: string | null,
  cycle: CycleInfo | null
): boolean {
  if (!cycle) return false
  if (projectId && cycle.relatedProjectIds.includes(projectId)) return true
  // Fallback: name regex match for "Cycle X" pattern
  if (projectName && /^cycle\s*\d+/i.test(projectName)) return true
  return false
}
