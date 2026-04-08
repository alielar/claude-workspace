"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Zap, FileText, Download, AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import MarkdownRenderer from "@/components/shared/MarkdownRenderer"

// ─────────────────────────────────────────
// Types (mirroring Prisma output)
// ─────────────────────────────────────────
interface AcDoc { id: string; contentMarkdown: string }
interface Pitch {
  id: string
  title: string
  status: string
  acDocument: AcDoc | null
}
interface Batch {
  id: string
  name: string
  status: string
  totalPitches: number
  doneCount: number
  createdAt: string | Date
  pitches: Pitch[]
}

// ─────────────────────────────────────────
// Per-pitch streaming state
// ─────────────────────────────────────────
interface PitchState {
  status: "idle" | "generating" | "done" | "error"
  markdown: string
  error?: string
}

export default function CycleBatchDetail({ batch: initialBatch }: { batch: Batch }) {
  const router = useRouter()
  const [batch, setBatch] = useState<Batch>(initialBatch)
  const [pitchStates, setPitchStates] = useState<Record<string, PitchState>>(() => {
    // Initialise from server data — pitches that already have ACs are "done"
    const map: Record<string, PitchState> = {}
    for (const p of initialBatch.pitches) {
      map[p.id] = {
        status: p.acDocument ? "done" : "idle",
        markdown: p.acDocument?.contentMarkdown ?? "",
      }
    }
    return map
  })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [allDone, setAllDone] = useState(
    initialBatch.pitches.every((p) => !!p.acDocument)
  )
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)

  const remaining = batch.pitches.filter((p) => !pitchStates[p.id]?.markdown).length

  // ─────────────────────────────────────────
  // Start streaming generation for all pitches
  // ─────────────────────────────────────────
  async function generateAll() {
    setGenerating(true)

    const res = await fetch(`/api/cycle-batches/${batch.id}/generate-all`, { method: "POST" })
    if (!res.ok || !res.body) {
      setGenerating(false)
      return
    }

    const reader = res.body.getReader()
    readerRef.current = reader
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleSSEEvent(event)
          } catch { /* skip malformed */ }
        }
      }
    } finally {
      setGenerating(false)
    }
  }

  function handleSSEEvent(event: {
    type: string
    pitchId?: string
    text?: string
    title?: string
    index?: number
    total?: number
    message?: string
  }) {
    switch (event.type) {
      case "start":
        if (event.pitchId) {
          setPitchStates((prev) => ({
            ...prev,
            [event.pitchId!]: { status: "generating", markdown: "" },
          }))
          // Auto-expand the pitch being generated
          setExpanded((prev) => ({ ...prev, [event.pitchId!]: true }))
        }
        break

      case "chunk":
        if (event.pitchId && event.text) {
          setPitchStates((prev) => ({
            ...prev,
            [event.pitchId!]: {
              ...prev[event.pitchId!],
              status: "generating",
              markdown: (prev[event.pitchId!]?.markdown ?? "") + event.text,
            },
          }))
        }
        break

      case "pitch_done":
        if (event.pitchId) {
          setPitchStates((prev) => ({
            ...prev,
            [event.pitchId!]: { ...prev[event.pitchId!], status: "done" },
          }))
          setBatch((prev) => ({ ...prev, doneCount: prev.doneCount + 1 }))
        }
        break

      case "error":
        if (event.pitchId) {
          setPitchStates((prev) => ({
            ...prev,
            [event.pitchId!]: { ...prev[event.pitchId!], status: "error", error: event.message },
          }))
        }
        break

      case "batch_done":
        setAllDone(true)
        setGenerating(false)
        router.refresh()
        break
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function downloadAc(pitch: Pitch, state: PitchState) {
    const content = state.markdown || pitch.acDocument?.contentMarkdown || ""
    const blob = new Blob([content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${pitch.title.replace(/[^a-z0-9]/gi, "-")}-ACs.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doneCount = Object.values(pitchStates).filter((s) => s.status === "done").length
  const totalCount = batch.pitches.length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/")}
          className="text-xs text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1"
        >
          ← Back to AC Generator
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{batch.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {totalCount} feature{totalCount !== 1 ? "s" : ""} · uploaded{" "}
              {new Date(batch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>

          {/* Generate all button */}
          {!allDone && (
            <Button onClick={generateAll} disabled={generating} className="gap-2">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Zap className="w-4 h-4" /> Generate all ACs</>
              }
            </Button>
          )}
          {allDone && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> All ACs generated
            </span>
          )}
        </div>

        {/* Progress bar */}
        {(generating || doneCount > 0) && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{doneCount} of {totalCount} done</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Pitch list */}
      <div className="space-y-3">
        {batch.pitches.map((pitch, index) => {
          const state = pitchStates[pitch.id] ?? { status: "idle", markdown: "" }
          const isOpen = expanded[pitch.id] ?? false
          const content = state.markdown || pitch.acDocument?.contentMarkdown || ""

          return (
            <Card key={pitch.id} className="bg-white overflow-hidden">
              {/* Pitch header row */}
              <button
                onClick={() => toggle(pitch.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                {/* Status icon */}
                <span className="flex-shrink-0">
                  {state.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {state.status === "generating" && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                  {state.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                  {state.status === "idle" && <Circle className="w-4 h-4 text-slate-300" />}
                </span>

                <span className="text-xs text-slate-400 flex-shrink-0 w-5">{index + 1}</span>

                <span className="flex-1 font-medium text-slate-900 text-sm">{pitch.title}</span>

                {/* Download button — only when AC exists */}
                {content && (
                  <span
                    onClick={(e) => { e.stopPropagation(); downloadAc(pitch, state) }}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Download ACs as markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </span>
                )}

                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                }
              </button>

              {/* AC content — expanded */}
              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-4">
                  {state.status === "idle" && !content && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                      <FileText className="w-4 h-4" />
                      <span>ACs not generated yet. Click &ldquo;Generate all ACs&rdquo; above.</span>
                    </div>
                  )}
                  {state.status === "error" && (
                    <div className="flex items-center gap-2 text-red-600 text-sm py-4">
                      <AlertCircle className="w-4 h-4" />
                      <span>{state.error || "Generation failed for this feature."}</span>
                    </div>
                  )}
                  {content && (
                    <div className="prose prose-sm max-w-none">
                      <MarkdownRenderer content={content} />
                    </div>
                  )}
                  {state.status === "generating" && !content && (
                    <div className="flex items-center gap-2 text-indigo-600 text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating ACs…</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Empty state */}
      {batch.pitches.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No features were extracted from this cycle PDF.</p>
        </div>
      )}
    </div>
  )
}
