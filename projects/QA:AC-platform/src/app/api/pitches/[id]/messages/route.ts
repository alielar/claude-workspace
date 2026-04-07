// POST /api/pitches/[id]/messages
// Handles a PM's answer during the clarification chat.
// Saves the user message, asks Claude if all gaps are resolved,
// saves Claude's follow-up (if any), and returns the updated state.

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import {
  CLARIFICATION_SYSTEM_PROMPT,
  buildClarificationPrompt,
} from "@/lib/prompts"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { content } = await req.json()

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 })
    }

    const pitch = await prisma.pitch.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })

    if (!pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 })
    }
    if (pitch.status !== "CLARIFYING") {
      return NextResponse.json(
        { error: "Pitch is not in clarification state" },
        { status: 409 }
      )
    }

    // Save the PM's answer
    await prisma.message.create({
      data: { pitchId: id, role: "user", content: content.trim() },
    })

    // Build full conversation history including the new message
    const history = [
      ...pitch.messages.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: content.trim() },
    ]

    // Ask Claude if all gaps are now resolved
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: CLARIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildClarificationPrompt(pitch.rawText, history),
        },
      ],
    })

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : ""

    let result: { complete: boolean; questions: string[] }
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim()
      result = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Claude response", raw: responseText },
        { status: 500 }
      )
    }

    if (result.complete) {
      // All gaps resolved — mark pitch as COMPLETE
      await prisma.pitch.update({ where: { id }, data: { status: "COMPLETE" } })
      return NextResponse.json({ complete: true, questions: [] })
    } else {
      // Save Claude's follow-up questions
      const questionsText = result.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")

      await prisma.message.create({
        data: { pitchId: id, role: "assistant", content: questionsText },
      })

      return NextResponse.json({ complete: false, questions: result.questions })
    }
  } catch (err) {
    console.error("[POST /api/pitches/[id]/messages]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET /api/pitches/[id]/messages
// Returns all messages for a pitch in chronological order.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const messages = await prisma.message.findMany({
      where: { pitchId: id },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({ messages })
  } catch (err) {
    console.error("[GET /api/pitches/[id]/messages]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
