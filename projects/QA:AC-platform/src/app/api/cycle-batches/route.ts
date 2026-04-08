// POST /api/cycle-batches
// Uploads a cycle PDF, uses Claude to split it into individual feature pitches,
// creates a CycleBatch record + one Pitch per feature (status: COMPLETE, no clarification needed).
// Returns { batchId } immediately — AC generation is triggered separately.
//
// GET /api/cycle-batches — list all batches newest first

import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { CYCLE_SPLIT_SYSTEM_PROMPT, buildCycleSplitPrompt } from "@/lib/prompts"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const name = (formData.get("name") as string | null) ?? "Unnamed Cycle"

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.type !== "application/pdf") return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // Extract text from PDF
    let rawText: string
    try {
      const parsed = await pdfParse(buffer)
      rawText = parsed.text.trim()
    } catch {
      return NextResponse.json({ error: "Could not extract text from PDF." }, { status: 422 })
    }

    if (!rawText || rawText.length < 50) {
      return NextResponse.json({ error: "PDF appears to be empty or image-only." }, { status: 422 })
    }

    // Save PDF to disk
    await mkdir(UPLOADS_DIR, { recursive: true })
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
    await writeFile(path.join(UPLOADS_DIR, fileName), buffer)
    const pdfPath = `/uploads/${fileName}`

    // Ask Claude to split the PDF into individual features
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: CYCLE_SPLIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCycleSplitPrompt(rawText) }],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text.trim() : "[]"
    let features: Array<{ title: string; text: string }> = []
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim()
      features = JSON.parse(cleaned)
      if (!Array.isArray(features)) features = []
    } catch {
      return NextResponse.json({ error: "Failed to parse features from PDF. Try again." }, { status: 500 })
    }

    if (features.length === 0) {
      return NextResponse.json({ error: "No features found in this PDF." }, { status: 422 })
    }

    // Create the batch and all pitch records in one transaction
    const batch = await prisma.cycleBatch.create({
      data: {
        name,
        pdfPath,
        status: "PROCESSING",
        totalPitches: features.length,
        doneCount: 0,
        pitches: {
          create: features.map((f) => ({
            title: f.title,
            pdfPath,          // whole-doc path — individual pitch text is in rawText
            rawText: f.text,
            status: "COMPLETE", // skip clarification for cycle pitches — they're pre-planned
          })),
        },
      },
      include: { pitches: { select: { id: true, title: true } } },
    })

    return NextResponse.json({ batchId: batch.id, pitchCount: features.length, pitches: batch.pitches }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/cycle-batches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const batches = await prisma.cycleBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        pitches: {
          select: { id: true, title: true, status: true, acDocument: { select: { id: true } } },
        },
      },
    })
    return NextResponse.json({ batches })
  } catch (err) {
    console.error("[GET /api/cycle-batches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
