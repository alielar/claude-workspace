"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Upload, FileText, CheckCircle, Clock, AlertCircle,
  Loader2, Plus, Layers, ChevronRight, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
type Pitch = {
  id: string
  title: string
  status: string
  createdAt: string | Date
  acDocument: { id: string; createdAt: string | Date; linearPushedAt: string | Date | null } | null
}

type BatchPitch = { id: string; title: string; status: string; acDocument: { id: string } | null }

type CycleBatch = {
  id: string
  name: string
  status: string
  totalPitches: number
  doneCount: number
  createdAt: string | Date
  pitches: BatchPitch[]
}

const PITCH_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  UPLOADED:     { label: "Uploaded",    color: "bg-slate-100 text-slate-700",   icon: <Clock className="w-3 h-3" /> },
  ANALYZING:    { label: "Analyzing",   color: "bg-blue-100 text-blue-700",     icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  CLARIFYING:   { label: "Needs input", color: "bg-amber-100 text-amber-700",   icon: <AlertCircle className="w-3 h-3" /> },
  COMPLETE:     { label: "Ready",       color: "bg-green-100 text-green-700",   icon: <CheckCircle className="w-3 h-3" /> },
  AC_GENERATED: { label: "ACs done",    color: "bg-indigo-100 text-indigo-700", icon: <CheckCircle className="w-3 h-3" /> },
}

// ─────────────────────────────────────────
// Upload mode modal
// ─────────────────────────────────────────
type UploadMode = "single" | "cycle" | null

export default function PitchesDashboard({
  initialPitches,
  initialBatches,
}: {
  initialPitches: Pitch[]
  initialBatches: CycleBatch[]
}) {
  const router = useRouter()
  const [pitches] = useState<Pitch[]>(initialPitches)
  const [batches, setBatches] = useState<CycleBatch[]>(initialBatches)
  const [uploadMode, setUploadMode] = useState<UploadMode>(null)
  const [uploading, setUploading] = useState(false)
  const [cycleName, setCycleName] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─────────────────────────────────────────
  // Single pitch upload (existing flow)
  // ─────────────────────────────────────────
  async function handleSingleUpload(file: File) {
    if (!file || file.type !== "application/pdf") { alert("Please upload a PDF file."); return }
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", file.name.replace(".pdf", ""))

    try {
      const res = await fetch("/api/pitches", { method: "POST", body: formData })
      if (!res.ok) { alert((await res.json()).error || "Upload failed"); return }
      const { pitch } = await res.json()
      await fetch(`/api/pitches/${pitch.id}/analyze`, { method: "POST" })
      router.push(`/pitches/${pitch.id}`)
    } catch { alert("Upload failed. Please try again.") }
    finally { setUploading(false) }
  }

  // ─────────────────────────────────────────
  // Cycle batch upload (new flow)
  // ─────────────────────────────────────────
  async function handleCycleUpload(file: File) {
    if (!file || file.type !== "application/pdf") { alert("Please upload a PDF file."); return }
    setUploading(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("name", cycleName || file.name.replace(".pdf", ""))

    try {
      const res = await fetch("/api/cycle-batches", { method: "POST", body: formData })
      if (!res.ok) { alert((await res.json()).error || "Upload failed"); return }
      const { batchId } = await res.json()
      router.push(`/cycles/${batchId}`)
    } catch { alert("Upload failed. Please try again.") }
    finally { setUploading(false); setUploadMode(null); setCycleName("") }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (uploadMode === "cycle") handleCycleUpload(file)
    else handleSingleUpload(file)
    e.target.value = ""
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (uploadMode === "cycle") handleCycleUpload(file)
    else handleSingleUpload(file)
  }

  const isEmpty = pitches.length === 0 && batches.length === 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AC Generator</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload a pitch or a full cycle PDF to generate Acceptance Criteria
          </p>
        </div>

        {/* Upload buttons */}
        <div className="flex gap-2">
          {/* Single pitch */}
          <Button variant="outline" onClick={() => {
            setUploadMode("single")
            // Small delay so state updates before click
            setTimeout(() => fileInputRef.current?.click(), 0)
          }} disabled={uploading}>
            {uploading && uploadMode === "single"
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />
            }
            Single pitch
          </Button>

          {/* Cycle PDF */}
          <Button onClick={() => setUploadMode(uploadMode === "cycle" ? null : "cycle")} disabled={uploading}>
            <Layers className="w-4 h-4 mr-2" />
            Cycle PDF
          </Button>
        </div>
      </div>

      {/* Cycle PDF panel — expanded inline */}
      {uploadMode === "cycle" && (
        <Card className="p-5 mb-6 border-indigo-200 bg-indigo-50/40">
          <p className="font-medium text-slate-900 mb-1">Upload cycle PDF</p>
          <p className="text-sm text-slate-500 mb-4">
            Claude will split it into individual features and generate ACs for each automatically.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Cycle name (optional)</label>
              <input
                type="text"
                placeholder="e.g. April Cycle"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
              />
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Choose PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setUploadMode(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Hidden file input for single pitch */}
      <input
        type="file"
        accept=".pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
        disabled={uploading}
      />

      {/* Empty drop zone */}
      {isEmpty && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
            dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
          }`}
        >
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Drop a PDF here</p>
          <p className="text-slate-400 text-sm mt-1">or use the buttons above to choose upload type</p>
        </div>
      )}

      {/* ─── Cycle batches section ─── */}
      {batches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4" /> Cycle batches
          </h2>
          <div className="space-y-3">
            {batches.map((batch) => {
              const done = batch.pitches.filter((p) => !!p.acDocument).length
              const total = batch.pitches.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <Card
                  key={batch.id}
                  className="p-4 bg-white hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => router.push(`/cycles/${batch.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Layers className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{batch.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-slate-400">
                            {total} feature{total !== 1 ? "s" : ""} ·{" "}
                            {new Date(batch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {/* Mini progress bar */}
                          {total > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-400 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400">{done}/{total}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {pct === 100
                        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" /> Complete
                          </span>
                        : batch.status === "PROCESSING"
                          ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                              <Zap className="w-3 h-3" /> Ready to generate
                            </span>
                          : null
                      }
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Individual pitches section ─── */}
      {pitches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Individual pitches
          </h2>
          <div className="space-y-3">
            {pitches.map((pitch) => {
              const config = PITCH_STATUS[pitch.status] ?? PITCH_STATUS.UPLOADED
              return (
                <Card
                  key={pitch.id}
                  className="p-4 bg-white hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => router.push(`/pitches/${pitch.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{pitch.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(pitch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {pitch.acDocument?.linearPushedAt && (
                        <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-200">
                          In Linear
                        </Badge>
                      )}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
                        {config.icon}
                        {config.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
