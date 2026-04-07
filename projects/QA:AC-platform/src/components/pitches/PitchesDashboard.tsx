"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, CheckCircle, Clock, AlertCircle, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Pitch = {
  id: string
  title: string
  status: string
  createdAt: string | Date
  acDocument: { id: string; createdAt: string | Date; linearPushedAt: string | Date | null } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  UPLOADED:     { label: "Uploaded",     color: "bg-slate-100 text-slate-700",   icon: <Clock className="w-3 h-3" /> },
  ANALYZING:    { label: "Analyzing",    color: "bg-blue-100 text-blue-700",     icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  CLARIFYING:   { label: "Needs input",  color: "bg-amber-100 text-amber-700",   icon: <AlertCircle className="w-3 h-3" /> },
  COMPLETE:     { label: "Ready",        color: "bg-green-100 text-green-700",   icon: <CheckCircle className="w-3 h-3" /> },
  AC_GENERATED: { label: "ACs done",     color: "bg-indigo-100 text-indigo-700", icon: <CheckCircle className="w-3 h-3" /> },
}

export default function PitchesDashboard({ initialPitches }: { initialPitches: Pitch[] }) {
  const router = useRouter()
  const [pitches, setPitches] = useState<Pitch[]>(initialPitches)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleUpload(file: File) {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", file.name.replace(".pdf", ""))

    try {
      const res = await fetch("/api/pitches", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Upload failed")
        return
      }
      const { pitch } = await res.json()

      // Immediately trigger analysis
      await fetch(`/api/pitches/${pitch.id}/analyze`, { method: "POST" })

      // Navigate to the pitch detail page
      router.push(`/pitches/${pitch.id}`)
    } catch {
      alert("Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = "" // reset input
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pitches</h1>
          <p className="text-sm text-slate-500 mt-1">Upload a pitch PDF to generate Acceptance Criteria</p>
        </div>
        <label>
          <input type="file" accept=".pdf" className="hidden" onChange={onFileInput} disabled={uploading} />
          <Button className="cursor-pointer" disabled={uploading} asChild>
            <span>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Upload pitch
            </span>
          </Button>
        </label>
      </div>

      {/* Drop zone (shown when no pitches or as CTA) */}
      {pitches.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
            dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
          }`}
        >
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Drop a pitch PDF here</p>
          <p className="text-slate-400 text-sm mt-1">or use the Upload button above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pitches.map((pitch) => {
            const config = STATUS_CONFIG[pitch.status] ?? STATUS_CONFIG.UPLOADED
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
                        {new Date(pitch.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric"
                        })}
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
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
