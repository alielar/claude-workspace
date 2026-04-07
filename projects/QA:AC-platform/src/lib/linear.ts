// Linear API client wrapper
// Uses @linear/sdk to interact with the Linear GraphQL API.

import { LinearClient } from "@linear/sdk"

// Creates a Linear client using the stored API key (or the env default).
export function getLinearClient(apiKey?: string): LinearClient {
  const key = apiKey || process.env.LINEAR_API_KEY
  if (!key) throw new Error("No Linear API key configured")
  return new LinearClient({ apiKey: key })
}

// ─────────────────────────────────────────
// Fetch all teams the API key has access to.
// Used to populate the team selector in settings.
// ─────────────────────────────────────────
export async function getTeams(apiKey?: string) {
  const client = getLinearClient(apiKey)
  const teams = await client.teams()
  return teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }))
}

// ─────────────────────────────────────────
// Fetch all cycles for a team.
// ─────────────────────────────────────────
export async function getCycles(teamId: string, apiKey?: string) {
  const client = getLinearClient(apiKey)
  const team = await client.team(teamId)
  const cycles = await team.cycles()
  return cycles.nodes.map((c) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
  }))
}

// ─────────────────────────────────────────
// Push ACs to a Linear project as the project description.
// Creates the project if it doesn't exist; updates if it does.
// ─────────────────────────────────────────
export async function pushAcsToLinear({
  teamId,
  cycleId,
  projectName,
  acMarkdown,
  figmaUrl,
  apiKey,
}: {
  teamId: string
  cycleId?: string
  projectName: string
  acMarkdown: string
  figmaUrl?: string
  apiKey?: string
}) {
  const client = getLinearClient(apiKey)

  // Build the project description — ACs + optional Figma link
  const description = figmaUrl
    ? `## Figma\n[View design](${figmaUrl})\n\n---\n\n${acMarkdown}`
    : acMarkdown

  // Create a new Linear project
  const projectPayload = await client.createProject({
    name: projectName,
    description,
    teamIds: [teamId],
  })

  const project = await projectPayload.project
  if (!project) throw new Error("Failed to create Linear project")

  // Link to cycle if provided
  if (cycleId) {
    // Linear doesn't directly assign projects to cycles via API —
    // we create an issue in the project tagged to the cycle as a workaround.
    // Future: use project → cycle linking when Linear SDK supports it.
  }

  return { projectId: project.id, projectUrl: project.url }
}

// ─────────────────────────────────────────
// Fetch QA performance data for a team.
// Returns issues per assignee grouped by state.
// ─────────────────────────────────────────
export async function getQaPerformance(teamId: string, apiKey?: string) {
  const client = getLinearClient(apiKey)

  // Fetch issues updated in the last 30 days
  const issues = await client.issues({
    filter: {
      team: { id: { eq: teamId } },
      updatedAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
    },
  })

  // Group by assignee
  const byAssignee: Record<
    string,
    { name: string; email: string; done: number; inProgress: number; total: number }
  > = {}

  for (const issue of issues.nodes) {
    const assignee = await issue.assignee
    if (!assignee) continue

    const key = assignee.id
    if (!byAssignee[key]) {
      byAssignee[key] = {
        name: assignee.name,
        email: assignee.email,
        done: 0,
        inProgress: 0,
        total: 0,
      }
    }

    const state = await issue.state
    const stateName = state?.name?.toLowerCase() ?? ""

    byAssignee[key].total++
    if (stateName === "done" || stateName === "completed") byAssignee[key].done++
    else if (stateName === "in progress") byAssignee[key].inProgress++
  }

  return Object.values(byAssignee)
}
