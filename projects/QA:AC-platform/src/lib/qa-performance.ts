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
  commentCount: number    // total comments on this issue
}

export interface QASummary {
  total: number
  closed: number
  open: number
  inProgress: number
  cycleWork: number
  liveBugs: number
  commentCount: number    // total comments across all issues
  urgent: number          // issues with priority === 1
  high: number            // issues with priority === 2
}

export interface EngineerData {
  name: string
  email: string
  summary: QASummary
  issues: QAIssue[]       // all issues flat — UI sorts/filters client-side
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
// Single GraphQL query — fetches all issue fields at once.
// Filters by team to limit scope. Assignee filtering is done client-side.
// comments.totalCount gives us QA engagement without fetching comment bodies.
// ─────────────────────────────────────────
const ISSUES_QUERY = `
  query QAIssues($teamId: ID!, $after: String) {
    issues(
      first: 250
      after: $after
      filter: { team: { id: { eq: $teamId } } }
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
// Main fetch — returns ALL issues for QA engineers, no time filter
// ─────────────────────────────────────────
export async function fetchQAPerformance(
  apiKey?: string
): Promise<{ mahnoor: EngineerData; iehtanab: EngineerData; cycle: CycleInfo | null }> {
  const client = getLinearClient(apiKey)

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
        { teamId: team.id, after: cursor }
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

  // Batch classify all issues (uses cycle project membership + cache + Claude)
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
  const issues: QAIssue[] = rawIssues.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.state?.name ?? "Unknown",
    statusCategory: mapStateCategory(i.state?.type),
    classification: classificationMap[i.id] ?? "unknown",
    projectName: i.project?.name ?? null,
    projectId: i.project?.id ?? null,
    url: i.url,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    completedAt: i.completedAt,
    priority: i.priority,
    labelNames: i.labels.nodes.map((l) => l.name),
    teamName: i.team?.name ?? "Unknown",
    commentCount: 0, // Linear API doesn't expose comment totalCount in this version
  }))

  // Newest first
  issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

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
  }

  return { name: engineer.name, email: engineer.email, summary, issues }
}
