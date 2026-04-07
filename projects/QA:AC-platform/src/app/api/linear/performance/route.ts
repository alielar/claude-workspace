// GET /api/linear/performance?teamId=xxx
// Returns QA performance data for all assignees in a team.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getQaPerformance } from "@/lib/linear"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const teamId = searchParams.get("teamId")

    if (!teamId) {
      return NextResponse.json({ error: "teamId query param is required" }, { status: 400 })
    }

    const config = await prisma.linearConfig.findFirst()
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY

    const performance = await getQaPerformance(teamId, apiKey)
    return NextResponse.json({ performance })
  } catch (err) {
    console.error("[GET /api/linear/performance]", err)
    return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 })
  }
}
