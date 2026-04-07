// POST /api/pitches/[id]/analyze
// Runs Claude completeness check on the pitch.
// If complete → marks pitch COMPLETE and returns { complete: true }
// If incomplete → saves Claude's questions as an assistant message, marks CLARIFYING,
//                 returns { complete: false, questions: string[] }

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import {
  COMPLETENESS_SYSTEM_PROMPT,
  buildCompletenessPrompt,
} from "@/lib/prompts"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const pitch = await prisma.pitch.findUnique({ where: { id } })
    if (!pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 })
    }

    // Mark as ANALYZING
    await prisma.pitch.update({ where: { id }, data: { status: "ANALYZING" } })

    // Ask Claude to evaluate completeness
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: COMPLETENESS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCompletenessPrompt(pitch.rawText) }],
    })

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : ""

    // Parse Claude's JSON response
    let result: { complete: boolean; questions: string[] }
    try {
      // Strip any accidental markdown code fences
      const cleaned = responseText.replace(/```json|```/g, "").trim()
      result = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Claude response", raw: responseText },
        { status: 500 }
      )
    }

    if (result.complete) {
      // Pitch has everything needed — ready to generate ACs
      await prisma.pitch.update({ where: { id }, data: { status: "COMPLETE" } })
      return NextResponse.json({ complete: true, questions: [] })
    } else {
      // Save Claude's questions as the first assistant message in the conversation
      const questionsText = result.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")

      await prisma.$transaction([
        prisma.message.create({
          data: { pitchId: id, role: "assistant", content: questionsText },
        }),
        prisma.pitch.update({ where: { id }, data: { status: "CLARIFYING" } }),
      ])

      return NextResponse.json({ complete: false, questions: result.questions })
    }
  } catch (err) {
    console.error("[POST /api/pitches/[id]/analyze]", err)
    // Reset status on failure
    await prisma.pitch.update({ where: { id }, data: { status: "UPLOADED" } }).catch(() => {})
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
