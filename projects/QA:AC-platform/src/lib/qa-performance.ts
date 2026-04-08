// QA Performance data fetcher
// Uses a single raw GraphQL query to fetch all issue data in one request —
// avoids the N+1 problem of the Linear SDK's lazy relation resolution.

import { QA_ENGINEERS, classifyBatch, type Classification } from "./qa-classification"
import { getCurrentCycle, type CycleInfo } from "./cycle-detection"
import { getLinearClient } from "./linear"

// ─────────────────────────────────────────
// Public types
// ─────────────────────────────────────────
export interface QAIssue {
  id: string
  title: string
  status: string
  statusCategory: "todo" | "in_progress" | "done" | "cancelled"
  classification: Classification
  projectName: string | null
  projectId: string | null
  url: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  priority: number        // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  labelNames: string[]
  teamName: string
  impactScore: number     // 0–100, see computeImpactScore()
}

export interface QASummary {
  total: number
  closed: number
  open: number
  inProgress: number
  cycleWork: number
  liveBugs: number
  commentCount: number    // placeholder — Linear API doesn't expose comment count in this version
  urgent: number
  high: number
  avgImpactScore: number  // average impact score across all issues
}

export interface EngineerData {
  name: string
  email: string
  summary: QASummary
  issues: QAIssue[]       // all issues flat — UI sorts/filters client-side
}

export interface DateRange {
  from: string  // ISO date string
  to: string    // ISO date string
}

// ─────────────────────────────────────────
// Raw GraphQL response shapes
// ─────────────────────────────────────────
interface GQLIssue {
  id: string
  title: string
  description: string | null
  url: string
  priority: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  assignee: { id: string; email: string; name: string } | null
  state: { name: string; type: string } | null
  project: { id: string; name: string } | null
  team: { id: string; name: string } | null
  labels: { nodes: { name: string }[] }
}

interface GQLResponse {
  issues: {
    nodes: GQLIssue[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

// ─────────────────────────────────────────
// GraphQL query — fetches all issue fields at once.
// Uses DateTimeOrDuration scalar for the date range filter.
// ─────────────────────────────────────────
const ISSUES_QUERY = `
  query QAIssues($teamId: ID!, $after: String, $from: DateTimeOrDuration!, $to: DateTimeOrDuration!) {
    issues(
      first: 250
      after: $after
      filter: {
        team: { id: { eq: $teamId } }
        updatedAt: { gte: $from, lte: $to }
      }
      orderBy: updatedAt
    ) {
      nodes {
        id
        title
        description
        url
        priority
        createdAt
        updatedAt
        completedAt
        assignee { id email name }
        state { name type }
        project { id name }
        team { id name }
        labels { nodes { name } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

// ─────────────────────────────────────────
// Main fetch — returns issues for QA engineers within the given date range.
// Defaults to the last 90 days if no range is provided.
// ─────────────────────────────────────────
export async function fetchQAPerformance(
  apiKey?: string,
  dateRange?: DateRange
): Promise<{ mahnoor: EngineerData; iehtanab: EngineerData; cycle: CycleInfo | null }> {
  const client = getLinearClient(apiKey)

  // Date range defaults to last 90 days
  const to = dateRange?.to ?? new Date().toISOString()
  const from = dateRange?.from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Detect current cycle (cached for 1 hour)
  const cycle = await getCurrentCycle(client)

  // Fetch all teams, prefer Planning and Tech
  const teamsResponse = await client.teams()
  const targetTeams = teamsResponse.nodes.filter((t) =>
    ["planning", "tech"].includes(t.name.toLowerCase())
  )
  const teamsToQuery = targetTeams.length > 0 ? targetTeams : teamsResponse.nodes

  const qaEmails = QA_ENGINEERS.map((e) => e.email)
  const rawIssues: GQLIssue[] = []

  // One paginated GraphQL request per team — all fields in a single round-trip
  for (const team of teamsToQuery) {
    let cursor: string | null = null

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (client as any).client.rawRequest(
        ISSUES_QUERY,
        { teamId: team.id, after: cursor, from, to }
      ) as { data: GQLResponse }

      const page = result.data.issues
      // Keep only issues assigned to our QA engineers
      const qaIssues = page.nodes.filter(
        (i) => i.assignee && qaEmails.includes(i.assignee.email)
      )
      rawIssues.push(...qaIssues)

      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (cursor)
  }

  // Batch classify all issues (Quality Assurance project → live_bug, cycle projects → cycle_work, rest via Claude)
  const classificationMap = await classifyBatch(
    rawIssues.map((i) => ({
      issueId: i.id,
      projectId: i.project?.id ?? null,
      projectName: i.project?.name ?? null,
      title: i.title,
      description: i.description,
    })),
    cycle
  )

  // Split by engineer
  const mahnoorIssues = rawIssues.filter((i) => i.assignee?.email === "mahnoorismail8@gmail.com")
  const iehtanabIssues = rawIssues.filter((i) => i.assignee?.email === "iehtanab555@gmail.com")

  return {
    mahnoor: buildEngineerData({ name: "Mahnoor", email: "mahnoorismail8@gmail.com" }, mahnoorIssues, classificationMap),
    iehtanab: buildEngineerData({ name: "Iehtanab", email: "iehtanab555@gmail.com" }, iehtanabIssues, classificationMap),
    cycle,
  }
}

// ─────────────────────────────────────────
// Impact score — a 0–100 measure of how meaningful an issue is.
//
// Scoring breakdown:
//   Priority  (0–40): Urgent=40, High=30, Medium=20, Low=10, None=5
//   Type      (0–25): live_bug=25, cycle_work=15, unknown=5
//             (finding production bugs is the core QA value)
//   Completion(0–25): done=25, in_progress=12, todo=5, cancelled=0
//   Detail    (0–10): description quality — well-documented issues score higher
//
// Maximum: 100 (urgent live bug, done, well-described)
// ─────────────────────────────────────────
function computeImpactScore(
  priority: number,
  classification: Classification,
  statusCategory: QAIssue["statusCategory"],
  description: string | null
): number {
  const priorityScore =
    priority === 1 ? 40 :
    priority === 2 ? 30 :
    priority === 3 ? 20 :
    priority === 4 ? 10 : 5

  const typeScore =
    classification === "live_bug"   ? 25 :
    classification === "cycle_work" ? 15 : 5

  const completionScore =
    statusCategory === "done"        ? 25 :
    statusCategory === "in_progress" ? 12 :
    statusCategory === "todo"        ?  5 : 0

  const detailScore =
    !description                      ?  0 :
    description.length > 200         ? 10 :
    description.length > 50          ?  6 : 3

  return Math.min(100, priorityScore + typeScore + completionScore + detailScore)
}

// ─────────────────────────────────────────
// Map Linear state type → UI status category
// ─────────────────────────────────────────
function mapStateCategory(stateType: string | undefined): QAIssue["statusCategory"] {
  switch (stateType) {
    case "completed": return "done"
    case "cancelled": return "cancelled"
    case "started":   return "in_progress"
    default:          return "todo"
  }
}

// ─────────────────────────────────────────
// Build EngineerData from raw GQL issues
// ─────────────────────────────────────────
function buildEngineerData(
  engineer: { name: string; email: string },
  rawIssues: GQLIssue[],
  classificationMap: Record<string, Classification>
): EngineerData {
  const issues: QAIssue[] = rawIssues.map((i) => {
    const statusCategory = mapStateCategory(i.state?.type)
    const classification = classificationMap[i.id] ?? "unknown"
    return {
      id: i.id,
      title: i.title,
      status: i.state?.name ?? "Unknown",
      statusCategory,
      classification,
      projectName: i.project?.name ?? null,
      projectId: i.project?.id ?? null,
      url: i.url,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      completedAt: i.completedAt,
      priority: i.priority,
      labelNames: i.labels.nodes.map((l) => l.name),
      teamName: i.team?.name ?? "Unknown",
      impactScore: computeImpactScore(i.priority, classification, statusCategory, i.description),
    }
  })

  // Newest first
  issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const avgImpactScore = issues.length > 0
    ? Math.round(issues.reduce((sum, i) => sum + i.impactScore, 0) / issues.length)
    : 0

  const summary: QASummary = {
    total: issues.length,
    closed: issues.filter((i) => i.statusCategory === "done" || i.statusCategory === "cancelled").length,
    open: issues.filter((i) => i.statusCategory === "todo").length,
    inProgress: issues.filter((i) => i.statusCategory === "in_progress").length,
    cycleWork: issues.filter((i) => i.classification === "cycle_work").length,
    liveBugs: issues.filter((i) => i.classification === "live_bug").length,
    commentCount: 0,
    urgent: issues.filter((i) => i.priority === 1).length,
    high: issues.filter((i) => i.priority === 2).length,
    avgImpactScore,
  }

  return { name: engineer.name, email: engineer.email, summary, issues }
}
