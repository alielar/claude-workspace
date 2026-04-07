"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Loader2, RefreshCw, AlertCircle, Bug, Layers,
  CheckCircle2, Clock, Circle, TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { EngineerData, QAIssue } from "@/lib/qa-performance"
import type { CycleInfo } from "@/lib/cycle-detection"

const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// ─────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────
export default function QADashboard() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<{ mahnoor: EngineerData; iehtanab: EngineerData } | null>(null)
  const [cycle, setCycle] = useState<CycleInfo | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/linear/qa-performance")
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Failed to load data")
        return
      }
      setData(json.data)
      setCycle(json.cycle ?? null)
      setLastRefreshed(new Date())
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QA Performance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mahnoor & Iehtanab · all issues from Linear
            {cycle && (
              <span className="ml-2 text-indigo-500 font-medium">
                · {cycle.name} (
                {new Date(cycle.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {" – "}
                {new Date(cycle.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                )
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-slate-400">
              Updated {lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-32 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-4 bg-slate-100 rounded w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data */}
      {data && (
        <div className="space-y-8">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SummaryCard engineer={data.mahnoor} />
            <SummaryCard engineer={data.iehtanab} />
          </div>

          {/* Issue logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <IssueLog engineer={data.mahnoor} />
            <IssueLog engineer={data.iehtanab} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// Summary card per engineer
// ─────────────────────────────────────────
function SummaryCard({ engineer }: { engineer: EngineerData }) {
  const { summary } = engineer
  const unknown = summary.total - summary.cycleWork - summary.liveBugs
  const completionPct = summary.total > 0
    ? Math.round((summary.closed / summary.total) * 100)
    : 0

  return (
    <Card className="p-6 bg-white">
      {/* Top row: name + total */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="font-semibold text-slate-900 text-lg">{engineer.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{engineer.email}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-indigo-600">{summary.total}</p>
          <p className="text-xs text-slate-400">total issues</p>
        </div>
      </div>

      {/* Hero: live bugs + cycle work */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-red-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Bug className="w-3.5 h-3.5 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Live bugs</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{summary.liveBugs}</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Cycle work</p>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{summary.cycleWork}</p>
        </div>
      </div>

      {/* Completion bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Completion
          </span>
          <span className="text-xs font-semibold text-slate-700">{completionPct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-slate-400">{summary.closed} closed</span>
          <span className="text-xs text-slate-400">{summary.open} open · {summary.inProgress} in progress</span>
        </div>
      </div>

      {/* Status + activity row */}
      <div className="grid grid-cols-2 gap-2 mb-4 pb-4 border-b border-slate-100">
        <MetricItem icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />} label="Closed" value={summary.closed} color="text-green-600" />
        <MetricItem icon={<Clock className="w-3.5 h-3.5 text-blue-500" />} label="In progress" value={summary.inProgress} color="text-blue-600" />
      </div>

      {/* Classification + priority */}
      <div className="flex flex-wrap gap-2">
        {summary.liveBugs > 0 && (
          <ClassificationPill label="Live bugs" count={summary.liveBugs} color="bg-red-100 text-red-700" icon={<Bug className="w-3 h-3" />} />
        )}
        {summary.cycleWork > 0 && (
          <ClassificationPill label="Cycle" count={summary.cycleWork} color="bg-indigo-100 text-indigo-700" icon={<Layers className="w-3 h-3" />} />
        )}
        {unknown > 0 && (
          <ClassificationPill label="Unclassified" count={unknown} color="bg-slate-100 text-slate-500" icon={<Circle className="w-3 h-3" />} />
        )}
        {summary.urgent > 0 && (
          <ClassificationPill label="Urgent" count={summary.urgent} color="bg-rose-100 text-rose-700" icon={<AlertCircle className="w-3 h-3" />} />
        )}
        {summary.high > 0 && (
          <ClassificationPill label="High" count={summary.high} color="bg-orange-100 text-orange-700" icon={<AlertCircle className="w-3 h-3" />} />
        )}
      </div>
    </Card>
  )
}

function MetricItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <div>
        <p className={`text-sm font-semibold ${color}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function ClassificationPill({ label, count, color, icon }: { label: string; count: number; color: string; icon: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      {icon}
      {count} {label}
    </span>
  )
}

// ─────────────────────────────────────────
// Issue log per engineer — filterable
// ─────────────────────────────────────────
type ClassificationFilter = "all" | "cycle_work" | "live_bug" | "unknown"
type StatusFilter = "all" | "todo" | "in_progress" | "done"
type SortBy = "updated" | "priority" | "status"

function IssueLog({ engineer }: { engineer: EngineerData }) {
  const [classification, setClassification] = useState<ClassificationFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sortBy, setSortBy] = useState<SortBy>("updated")
  const [search, setSearch] = useState("")

  const filtered = engineer.issues
    .filter((i) => {
      if (classification !== "all" && i.classification !== classification) return false
      if (status === "done" && i.statusCategory !== "done" && i.statusCategory !== "cancelled") return false
      if (status !== "all" && status !== "done" && i.statusCategory !== status) return false
      if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        // Lower number = higher priority. 0 (no priority) sorts last.
        const pa = a.priority === 0 ? 99 : a.priority
        const pb = b.priority === 0 ? 99 : b.priority
        return pa - pb
      }
      if (sortBy === "status") {
        const order = { in_progress: 0, todo: 1, done: 2, cancelled: 3 }
        return (order[a.statusCategory] ?? 9) - (order[b.statusCategory] ?? 9)
      }
      // default: updated desc
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  return (
    <Card className="p-6 bg-white">
      <p className="font-semibold text-slate-900 mb-4">{engineer.name} — Issues</p>

      {/* Filters row 1: classification */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-2">
        {(["all", "cycle_work", "live_bug", "unknown"] as const).map((t) => {
          const counts = {
            all: engineer.issues.length,
            cycle_work: engineer.issues.filter((i) => i.classification === "cycle_work").length,
            live_bug: engineer.issues.filter((i) => i.classification === "live_bug").length,
            unknown: engineer.issues.filter((i) => i.classification === "unknown").length,
          }
          const labels = { all: "All", cycle_work: "Cycle", live_bug: "Live bugs", unknown: "?" }
          return (
            <button
              key={t}
              onClick={() => setClassification(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                classification === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {labels[t]} <span className="opacity-60">{counts[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Filters row 2: status + sort */}
      <div className="flex items-center gap-2 mb-4">
        {/* Status */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {(["all", "todo", "in_progress", "done"] as const).map((s) => {
            const labels = { all: "Any status", todo: "Open", in_progress: "In progress", done: "Closed" }
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {labels[s]}
              </button>
            )
          })}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="ml-auto text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
        >
          <option value="updated">Sort: Recent</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search issues…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 mb-4 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />

      {/* Issue list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No issues match this filter</p>
      ) : (
        <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
          {filtered.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}

      {filtered.length < engineer.issues.length && (
        <p className="text-xs text-slate-400 mt-3 text-right">
          Showing {filtered.length} of {engineer.issues.length}
        </p>
      )}
    </Card>
  )
}

function IssueRow({ issue }: { issue: QAIssue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
    >
      {/* Status dot */}
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusColor(issue.statusCategory)}`} />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
          {issue.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-400">{issue.status}</span>
          {issue.projectName && (
            <span className="text-xs text-slate-300">· {issue.projectName}</span>
          )}
          <span className="text-xs text-slate-300">
            · {new Date(issue.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Priority badge — only show urgent/high */}
        {(issue.priority === 1 || issue.priority === 2) && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(issue.priority)}`}>
            {issue.priority === 1 ? "Urgent" : "High"}
          </span>
        )}
        {/* Classification badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classificationColor(issue.classification)}`}>
          {issue.classification === "cycle_work" ? "Cycle" : issue.classification === "live_bug" ? "Bug" : "?"}
        </span>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function statusColor(category: string): string {
  switch (category) {
    case "done":        return "bg-green-400"
    case "in_progress": return "bg-blue-400"
    case "cancelled":   return "bg-slate-300"
    default:            return "bg-slate-200"
  }
}

function classificationColor(cls: string): string {
  switch (cls) {
    case "cycle_work": return "bg-indigo-100 text-indigo-700"
    case "live_bug":   return "bg-red-100 text-red-700"
    default:           return "bg-slate-100 text-slate-400"
  }
}

function priorityColor(priority: number): string {
  switch (priority) {
    case 1: return "bg-rose-100 text-rose-700"
    case 2: return "bg-orange-100 text-orange-700"
    default: return "bg-slate-100 text-slate-400"
  }
}
