// GET /api/linear/teams
// Returns all Linear teams for the configured workspace.
// Used to populate team + cycle selectors in the UI.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTeams, getCycles } from "@/lib/linear"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const teamId = searchParams.get("teamId") // if provided, return cycles for that team

    const config = await prisma.linearConfig.findFirst()
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY

    if (teamId) {
      const cycles = await getCycles(teamId, apiKey)
      return NextResponse.json({ cycles })
    }

    const teams = await getTeams(apiKey)
    return NextResponse.json({ teams })
  } catch (err) {
    console.error("[GET /api/linear/teams]", err)
    return NextResponse.json({ error: "Failed to fetch Linear teams" }, { status: 500 })
  }
}
