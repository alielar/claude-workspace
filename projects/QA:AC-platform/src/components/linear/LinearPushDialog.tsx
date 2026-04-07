"use client"

import { useState, useEffect } from "react"
import { Loader2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

type Team = { id: string; name: string; key: string }
type Cycle = { id: string; name: string; number: number }

export default function LinearPushDialog({
  pitchId,
  pitchTitle,
  onClose,
  onSuccess,
}: {
  pitchId: string
  pitchTitle: string
  onClose: () => void
  onSuccess: (projectUrl: string) => void
}) {
  const [teams, setTeams] = useState<Team[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [selectedTeam, setSelectedTeam] = useState("")
  const [selectedCycle, setSelectedCycle] = useState("")
  const [projectName, setProjectName] = useState(pitchTitle)
  const [figmaUrl, setFigmaUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState("")

  // Load teams on mount
  useEffect(() => {
    fetch("/api/linear/teams")
      .then((r) => r.json())
      .then(({ teams }) => {
        setTeams(teams ?? [])
        if (teams?.length === 1) setSelectedTeam(teams[0].id)
      })
      .catch(() => setError("Failed to load Linear teams. Check your API key in Settings."))
      .finally(() => setLoading(false))
  }, [])

  // Load cycles when team changes
  useEffect(() => {
    if (!selectedTeam) return
    fetch(`/api/linear/teams?teamId=${selectedTeam}`)
      .then((r) => r.json())
      .then(({ cycles }) => setCycles(cycles ?? []))
      .catch(() => setCycles([]))
  }, [selectedTeam])

  async function handlePush() {
    if (!selectedTeam || !projectName.trim()) return
    setPushing(true)
    setError("")

    try {
      const res = await fetch("/api/linear/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitchId,
          teamId: selectedTeam,
          cycleId: selectedCycle || undefined,
          projectName: projectName.trim(),
          figmaUrl: figmaUrl.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Push failed")
        return
      }

      onSuccess(data.projectUrl)
    } catch {
      setError("Push failed. Please try again.")
    } finally {
      setPushing(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push ACs to Linear</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Project name */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                Project name
              </label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. News Page — Notifications & Alerts"
              />
            </div>

            {/* Team selector */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.key})</option>
                ))}
              </select>
            </div>

            {/* Cycle selector */}
            {cycles.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Cycle <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  value={selectedCycle}
                  onChange={(e) => setSelectedCycle(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No cycle</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>Cycle {c.number} — {c.name || "Unnamed"}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Figma URL */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                Figma link <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://figma.com/file/..."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pushing}>Cancel</Button>
          <Button
            onClick={handlePush}
            disabled={pushing || !selectedTeam || !projectName.trim()}
          >
            {pushing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pushing…</>
            ) : (
              <><ExternalLink className="w-4 h-4 mr-2" />Push to Linear</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
