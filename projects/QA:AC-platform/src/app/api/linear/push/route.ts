// POST /api/linear/push
// Pushes an AC document to Linear as a new project.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pushAcsToLinear } from "@/lib/linear"

export async function POST(req: NextRequest) {
  try {
    const { pitchId, teamId, cycleId, projectName, figmaUrl } = await req.json()

    if (!pitchId || !teamId || !projectName) {
      return NextResponse.json(
        { error: "pitchId, teamId, and projectName are required" },
        { status: 400 }
      )
    }

    const acDocument = await prisma.acDocument.findUnique({ where: { pitchId } })
    if (!acDocument) {
      return NextResponse.json({ error: "No AC document found for this pitch" }, { status: 404 })
    }

    // Fetch stored Linear API key if configured
    const config = await prisma.linearConfig.findFirst()
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY

    const { projectId, projectUrl } = await pushAcsToLinear({
      teamId,
      cycleId,
      projectName,
      acMarkdown: acDocument.contentMarkdown,
      figmaUrl,
      apiKey,
    })

    // Record that this AC was pushed
    await prisma.acDocument.update({
      where: { pitchId },
      data: {
        linearPushedAt: new Date(),
        linearProjectId: projectId,
      },
    })

    return NextResponse.json({ projectId, projectUrl })
  } catch (err) {
    console.error("[POST /api/linear/push]", err)
    return NextResponse.json({ error: "Failed to push to Linear" }, { status: 500 })
  }
}
