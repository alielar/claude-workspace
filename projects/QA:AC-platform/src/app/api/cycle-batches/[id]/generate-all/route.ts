// POST /api/cycle-batches/[id]/generate-all
// Streams AC generation for every pitch in a cycle batch as SSE.
// Each pitch gets its own AC generated without clarification (cycle pitches are pre-planned).
//
// SSE event types:
//   { type: "start",      pitchId, title, index, total }
//   { type: "chunk",      pitchId, text }
//   { type: "pitch_done", pitchId }
//   { type: "batch_done" }
//   { type: "error",      pitchId, message }

import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { AC_GENERATION_SYSTEM_PROMPT, buildAcGenerationPrompt } from "@/lib/prompts"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const batch = await prisma.cycleBatch.findUnique({
    where: { id },
    include: {
      pitches: {
        where: { acDocument: null }, // only pitches that don't have ACs yet
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!batch) {
    return new Response("Batch not found", { status: 404 })
  }

  const pitches = batch.pitches
  if (pitches.length === 0) {
    return new Response(
      `data: ${JSON.stringify({ type: "batch_done" })}\n\n`,
      { headers: sseHeaders() }
    )
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const stream = new ReadableStream({
    async start(controller) {
      function send(payload: object) {
        controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`)
      }

      for (let i = 0; i < pitches.length; i++) {
        const pitch = pitches[i]
        send({ type: "start", pitchId: pitch.id, title: pitch.title, index: i + 1, total: pitches.length })

        let fullText = ""
        try {
          // Stream AC generation for this pitch (no clarification messages for cycle pitches)
          const aiStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system: AC_GENERATION_SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildAcGenerationPrompt(pitch.rawText, []) }],
          })

          for await (const event of aiStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text
              send({ type: "chunk", pitchId: pitch.id, text: event.delta.text })
            }
          }

          // Save AcDocument and update pitch status
          await prisma.$transaction([
            prisma.acDocument.upsert({
              where: { pitchId: pitch.id },
              create: { pitchId: pitch.id, contentMarkdown: fullText },
              update: { contentMarkdown: fullText },
            }),
            prisma.pitch.update({
              where: { id: pitch.id },
              data: { status: "AC_GENERATED" },
            }),
            prisma.cycleBatch.update({
              where: { id: batch.id },
              data: { doneCount: { increment: 1 } },
            }),
          ])

          send({ type: "pitch_done", pitchId: pitch.id })
        } catch (err) {
          console.error(`[generate-all] pitch ${pitch.id} failed:`, err)
          send({ type: "error", pitchId: pitch.id, message: "Generation failed for this pitch" })
        }
      }

      // Mark batch complete
      await prisma.cycleBatch.update({
        where: { id: batch.id },
        data: { status: "COMPLETE" },
      })

      send({ type: "batch_done" })
      controller.close()
    },
  })

  return new Response(stream, { headers: sseHeaders() })
}

// GET — returns batch with all pitches + their ACs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const batch = await prisma.cycleBatch.findUnique({
    where: { id },
    include: {
      pitches: {
        orderBy: { createdAt: "asc" },
        include: { acDocument: true },
      },
    },
  })
  if (!batch) return new Response("Not found", { status: 404 })
  return Response.json({ batch })
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }
}
