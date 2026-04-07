// GET /api/pitches/[id]/download?format=md|pdf
// Downloads the AC document as markdown or PDF.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const format = req.nextUrl.searchParams.get("format") ?? "md"

  try {
    const pitch = await prisma.pitch.findUnique({ where: { id } })
    const acDocument = await prisma.acDocument.findUnique({ where: { pitchId: id } })

    if (!acDocument || !pitch) {
      return NextResponse.json({ error: "AC document not found" }, { status: 404 })
    }

    const safeName = pitch.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")

    if (format === "md") {
      return new Response(acDocument.contentMarkdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}-ACs.md"`,
        },
      })
    }

    // PDF: convert markdown to basic HTML, then return as a printable HTML page
    // (Full PDF generation with puppeteer requires a server environment;
    //  for V1 we return a styled HTML page the browser can print-to-PDF natively)
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${pitch.title} — Acceptance Criteria</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 1.8rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
    h2 { font-size: 1.3rem; color: #2d3748; margin-top: 2rem; }
    h3 { font-size: 1rem; color: #4a5568; }
    code { background: #f7fafc; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    pre { background: #f7fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
    blockquote { border-left: 4px solid #e2e8f0; margin: 0; padding-left: 16px; color: #718096; }
    ul, ol { padding-left: 24px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${pitch.title} — Acceptance Criteria</h1>
  <p style="color:#718096;font-size:0.9rem">Generated ${new Date(acDocument.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
  <hr />
  <pre style="white-space:pre-wrap;font-family:inherit">${acDocument.contentMarkdown.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`

    return new Response(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${safeName}-ACs.html"`,
      },
    })
  } catch (err) {
    console.error("[GET /api/pitches/[id]/download]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
