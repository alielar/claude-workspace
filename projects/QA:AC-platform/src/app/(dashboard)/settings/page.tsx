// Settings page — configure Linear API key and defaults

"use client"

import { useState, useEffect } from "react"
import { Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("")
  const [currentKeyPreview, setCurrentKeyPreview] = useState("")
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    fetch("/api/linear/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setConfigured(true)
          setCurrentKeyPreview(data.apiKeyPreview)
        }
      })
      .catch(() => {})
  }, [])

  async function saveConfig() {
    if (!apiKey.trim()) return
    setSaving(true)
    setStatus("idle")
    setErrorMsg("")

    try {
      const res = await fetch("/api/linear/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus("error")
        setErrorMsg(data.error || "Failed to save")
      } else {
        setStatus("success")
        setConfigured(true)
        setCurrentKeyPreview(`••••••••${apiKey.trim().slice(-4)}`)
        setApiKey("")
      }
    } catch {
      setStatus("error")
      setErrorMsg("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Settings</h1>
      <p className="text-sm text-slate-500 mb-8">Configure integrations for the QA Platform</p>

      <Card className="p-6 bg-white">
        <h2 className="font-semibold text-slate-900 mb-1">Linear Integration</h2>
        <p className="text-sm text-slate-500 mb-5">
          Connect your Linear workspace to push ACs as projects and track QA performance.
          Generate a personal API key from{" "}
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline"
          >
            linear.app/settings/api
          </a>
          .
        </p>

        {configured && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">
            <CheckCircle className="w-4 h-4" />
            Connected · API key ending in {currentKeyPreview.slice(-4)}
          </div>
        )}

        <Separator className="my-4" />

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">
              {configured ? "Replace API key" : "API key"}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="lin_api_xxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />
          </div>

          {status === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4" />
              {errorMsg}
            </div>
          )}
          {status === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4" />
              Linear connected successfully
            </div>
          )}

          <Button onClick={saveConfig} disabled={saving || !apiKey.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {configured ? "Update API key" : "Connect Linear"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
