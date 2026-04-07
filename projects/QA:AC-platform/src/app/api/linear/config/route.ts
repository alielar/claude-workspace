// GET /api/linear/config — returns current Linear config (key masked)
// POST /api/linear/config — saves or updates Linear API key + defaults

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTeams } from "@/lib/linear"

export async function GET() {
  try {
    const config = await prisma.linearConfig.findFirst()
    if (!config) return NextResponse.json({ configured: false })

    return NextResponse.json({
      configured: true,
      // Mask key for display: show last 4 chars only
      apiKeyPreview: `••••••••${config.apiKey.slice(-4)}`,
      defaultTeamId: config.defaultTeamId,
      defaultCycleId: config.defaultCycleId,
    })
  } catch (err) {
    console.error("[GET /api/linear/config]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { apiKey, defaultTeamId, defaultCycleId } = await req.json()

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 })
    }

    // Validate the key works by fetching teams
    try {
      await getTeams(apiKey)
    } catch {
      return NextResponse.json(
        { error: "Invalid Linear API key — could not connect to workspace" },
        { status: 422 }
      )
    }

    const existing = await prisma.linearConfig.findFirst()

    if (existing) {
      await prisma.linearConfig.update({
        where: { id: existing.id },
        data: { apiKey, defaultTeamId, defaultCycleId },
      })
    } else {
      await prisma.linearConfig.create({
        data: { apiKey, defaultTeamId, defaultCycleId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[POST /api/linear/config]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
