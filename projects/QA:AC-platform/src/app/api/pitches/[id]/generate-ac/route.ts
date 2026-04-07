// POST /api/pitches/[id]/generate-ac
// Generates Acceptance Criteria for a COMPLETE pitch using Claude.
// Streams the response to the client for fast perceived performance.
// Saves the full output to AcDocument on completion.

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { AC_GENERATION_SYSTEM_PROMPT, buildAcGenerationPrompt } from "@/lib/prompts"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const pitch = await prisma.pitch.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        acDocument: true,
      },
    })

    if (!pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 })
    }
    if (pitch.status !== "COMPLETE" && pitch.status !== "AC_GENERATED") {
      return NextResponse.json(
        { error: "Pitch must be COMPLETE before generating ACs" },
        { status: 409 }
      )
    }

    const conversationHistory = pitch.messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    // Stream Claude's AC generation response
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AC_GENERATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildAcGenerationPrompt(pitch.rawText, conversationHistory),
        },
      ],
    })

    // Build a ReadableStream to pipe to the client
    const encoder = new TextEncoder()
    let fullContent = ""

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text
            fullContent += text
            // Stream each chunk as a Server-Sent Event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }

        // Save the complete AC document to the database
        await prisma.acDocument.upsert({
          where: { pitchId: id },
          create: { pitchId: id, contentMarkdown: fullContent },
          update: { contentMarkdown: fullContent, updatedAt: new Date() },
        })

        // Update pitch status
        await prisma.pitch.update({
          where: { id },
          data: { status: "AC_GENERATED" },
        })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("[POST /api/pitches/[id]/generate-ac]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET /api/pitches/[id]/generate-ac
// Returns the saved AC document for a pitch (if it exists).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const acDocument = await prisma.acDocument.findUnique({
      where: { pitchId: id },
    })
    if (!acDocument) {
      return NextResponse.json({ error: "No AC document found" }, { status: 404 })
    }
    return NextResponse.json({ acDocument })
  } catch (err) {
    console.error("[GET /api/pitches/[id]/generate-ac]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
