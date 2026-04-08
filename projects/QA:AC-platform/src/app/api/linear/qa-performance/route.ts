// GET /api/linear/qa-performance
// Query params:
//   from: ISO date string (default: 90 days ago)
//   to:   ISO date string (default: now)
//
// Returns { data: { mahnoor, iehtanab }, cycle, dateRange }

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchQAPerformance } from "@/lib/qa-performance"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") ?? undefined
    const to = searchParams.get("to") ?? undefined

    // Get stored Linear API key
    const config = await prisma.linearConfig.findFirst()
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "Linear API key not configured. Go to Settings to connect." },
        { status: 503 }
      )
    }

    const dateRange = from && to ? { from, to } : undefined
    const { cycle, ...engineerData } = await fetchQAPerformance(apiKey, dateRange)

    // Return the resolved date range so the UI can display it
    const resolvedFrom = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const resolvedTo = to ?? new Date().toISOString()

    return NextResponse.json({
      data: engineerData,
      cycle,
      dateRange: { from: resolvedFrom, to: resolvedTo },
    })
  } catch (err) {
    console.error("[GET /api/linear/qa-performance]", err)
    return NextResponse.json({ error: "Failed to fetch QA performance data" }, { status: 500 })
  }
}
