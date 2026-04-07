// POST /api/pitches
// Accepts a multipart form with a PDF file.
// Saves PDF to /public/uploads/, extracts text, saves pitch record,
// then triggers completeness analysis.

import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"
// Import directly from the lib file to avoid pdf-parse's module-level test file read
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

// Uploads go into public/uploads/ so Next.js serves them statically
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract raw text from PDF using pdf-parse v1
    let rawText: string
    try {
      const parsed = await pdfParse(buffer)
      rawText = parsed.text.trim()
    } catch {
      return NextResponse.json(
        { error: "Could not extract text from PDF. Ensure the file contains selectable text." },
        { status: 422 }
      )
    }

    if (!rawText || rawText.length < 50) {
      return NextResponse.json(
        { error: "PDF appears to be empty or image-only (no extractable text)." },
        { status: 422 }
      )
    }

    // Save PDF to local filesystem
    await mkdir(UPLOADS_DIR, { recursive: true })
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
    await writeFile(path.join(UPLOADS_DIR, fileName), buffer)

    // pdfPath is the public URL path (served by Next.js from /public/)
    const pdfPath = `/uploads/${fileName}`

    const pitch = await prisma.pitch.create({
      data: {
        title: title || file.name.replace(".pdf", ""),
        pdfPath,
        rawText,
        status: "UPLOADED",
      },
    })

    return NextResponse.json({ pitch }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/pitches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET /api/pitches — all pitches, newest first
export async function GET() {
  try {
    const pitches = await prisma.pitch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        acDocument: { select: { id: true, createdAt: true, linearPushedAt: true } },
      },
    })
    return NextResponse.json({ pitches })
  } catch (err) {
    console.error("[GET /api/pitches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
