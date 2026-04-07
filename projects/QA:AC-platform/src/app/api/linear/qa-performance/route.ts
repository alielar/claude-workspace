// GET /api/linear/qa-performance
// Fetches ALL issues for QA engineers (Mahnoor & Iehtanab) with no time filter.
// Returns issues classified as cycle_work or live_bug.

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchQAPerformance } from "@/lib/qa-performance"

export async function GET() {
  try {
    // Get stored Linear API key
    const config = await prisma.linearConfig.findFirst()
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "Linear API key not configured. Go to Settings to connect." },
        { status: 503 }
      )
    }

    const { cycle, ...engineerData } = await fetchQAPerformance(apiKey)

    return NextResponse.json({ data: engineerData, cycle })
  } catch (err) {
    console.error("[GET /api/linear/qa-performance]", err)
    return NextResponse.json({ error: "Failed to fetch QA performance data" }, { status: 500 })
  }
}
