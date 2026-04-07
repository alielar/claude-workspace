"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Download, Loader2, SendHorizontal,
  CheckCircle, AlertCircle, ExternalLink
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import LinearPushDialog from "@/components/linear/LinearPushDialog"
import MarkdownRenderer from "@/components/shared/MarkdownRenderer"

type Message = { id: string; role: string; content: string; createdAt: string | Date }
type AcDocument = { id: string; contentMarkdown: string; linearPushedAt?: string | Date | null; linearProjectId?: string | null }
type Pitch = {
  id: string
  title: string
  status: string
  pdfUrl: string
  messages: Message[]
  acDocument: AcDocument | null
}

export default function PitchDetail({ pitch: initialPitch }: { pitch: Pitch }) {
  const router = useRouter()
  const [pitch, setPitch] = useState(initialPitch)
  const [messages, setMessages] = useState<Message[]>(initialPitch.messages)
  const [acContent, setAcContent] = useState(initialPitch.acDocument?.contentMarkdown ?? "")
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showLinearDialog, setShowLinearDialog] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendReply() {
    if (!reply.trim() || sending) return
    setSending(true)

    const userMsg = reply.trim()
    setReply("")

    // Optimistically add user message to UI
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: userMsg, createdAt: new Date() },
    ])

    try {
      const res = await fetch(`/api/pitches/${pitch.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      })
      const data = await res.json()

      if (data.complete) {
        setPitch((p) => ({ ...p, status: "COMPLETE" }))
      } else if (data.questions?.length) {
        // Add Claude's follow-up questions
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n"),
            createdAt: new Date(),
          },
        ])
      }
    } catch {
      alert("Failed to send reply.")
    } finally {
      setSending(false)
    }
  }

  async function generateACs() {
    setGenerating(true)
    setAcContent("")

    try {
      const res = await fetch(`/api/pitches/${pitch.id}/generate-ac`, { method: "POST" })
      if (!res.body) throw new Error("No stream")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.text) setAcContent((prev) => prev + json.text)
            if (json.done) setPitch((p) => ({ ...p, status: "AC_GENERATED" }))
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch {
      alert("AC generation failed. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  const isComplete = pitch.status === "COMPLETE" || pitch.status === "AC_GENERATED"
  const hasAC = pitch.status === "AC_GENERATED" || !!acContent

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <h1 className="text-xl font-semibold text-slate-900 flex-1 truncate">{pitch.title}</h1>
        <StatusBadge status={pitch.status} />
      </div>

      {/* Clarification chat — shown when pitch needs input */}
      {(pitch.status === "CLARIFYING" || messages.length > 0) && !hasAC && (
        <div className="bg-white rounded-xl border border-slate-200 mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                The pitch needs a few clarifications before generating ACs
              </p>
            </div>
          </div>

          {/* Message thread */}
          <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xl px-4 py-3 rounded-xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          {pitch.status === "CLARIFYING" && (
            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Answer the questions above..."
                className="flex-1 min-h-[72px] resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendReply()
                  }
                }}
              />
              <Button onClick={sendReply} disabled={sending || !reply.trim()} className="self-end">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Ready to generate — CTA */}
      {isComplete && !hasAC && (
        <div className="bg-white rounded-xl border border-green-200 p-6 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-slate-900">Pitch is complete</p>
              <p className="text-sm text-slate-500">All information gathered — ready to generate ACs</p>
            </div>
          </div>
          <Button onClick={generateACs} disabled={generating}>
            {generating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Generate ACs
          </Button>
        </div>
      )}

      {/* AC output */}
      {hasAC && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* AC toolbar */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Acceptance Criteria</p>
            <div className="flex items-center gap-2">
              {pitch.acDocument?.linearPushedAt && (
                <Badge variant="outline" className="text-indigo-600 border-indigo-200 text-xs">
                  In Linear
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/pitches/${pitch.id}/download?format=md`, "_blank")}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                .md
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/pitches/${pitch.id}/download?format=pdf`, "_blank")}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
              <Button size="sm" onClick={() => setShowLinearDialog(true)}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Push to Linear
              </Button>
            </div>
          </div>

          {/* Streaming / rendered ACs */}
          <div className="p-6">
            {generating && !acContent && (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Acceptance Criteria…
              </div>
            )}
            {acContent && <MarkdownRenderer content={acContent} />}
          </div>
        </div>
      )}

      {/* Linear push dialog */}
      {showLinearDialog && (
        <LinearPushDialog
          pitchId={pitch.id}
          pitchTitle={pitch.title}
          onClose={() => setShowLinearDialog(false)}
          onSuccess={() => {
            setPitch((p) => ({ ...p, acDocument: { ...p.acDocument!, linearPushedAt: new Date() } }))
            setShowLinearDialog(false)
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    UPLOADED:     { label: "Uploaded",    className: "bg-slate-100 text-slate-600" },
    ANALYZING:    { label: "Analyzing",   className: "bg-blue-100 text-blue-700" },
    CLARIFYING:   { label: "Needs input", className: "bg-amber-100 text-amber-700" },
    COMPLETE:     { label: "Ready",       className: "bg-green-100 text-green-700" },
    AC_GENERATED: { label: "ACs done",    className: "bg-indigo-100 text-indigo-700" },
  }
  const config = map[status] ?? map.UPLOADED
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.className}`}>
      {config.label}
    </span>
  )
}
