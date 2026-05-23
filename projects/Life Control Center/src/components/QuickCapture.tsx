"use client";

/**
 * <QuickCapture /> — floating action button + quick-entry modal.
 *
 * FAB (bottom-right, desktop only — mobile uses MobileNav "More").
 * Opens a modal with 4 tabs:
 *   Word · Mood · Journal · Checklist
 *
 * Each tab is a minimal inline form that POSTs to the respective API.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Icon } from "@/components/Icon";

type Tab = "word" | "mood" | "journal" | "checklist";

const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
  { id: "word",      label: "Word",      icon: "words",     color: "#B388FF" },
  { id: "mood",      label: "Mood",      icon: "mood",      color: "#FFC15C" },
  { id: "journal",   label: "Journal",   icon: "journal",   color: "#FB923C" },
  { id: "checklist", label: "Checklist", icon: "checklist", color: "#6FD49A" },
];

const MOOD_OPTIONS = [
  { value: 5, emoji: "😄", label: "Great" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 1, emoji: "😞", label: "Bad" },
];

interface QuickCaptureProps {
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

export function QuickCapture({ open, initialTab = "word", onClose }: QuickCaptureProps) {
  const [tab, setTab]       = useState<Tab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  // Reset on open
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setStatus("idle");
    }
  }, [open, initialTab]);

  const showStatus = (ok: boolean) => {
    setStatus(ok ? "ok" : "err");
    setTimeout(() => setStatus("idle"), 2000);
  };

  // ── Word capture ──
  const [word, setWord] = useState("");
  const saveWord = async () => {
    if (!word.trim()) return;
    setSaving(true);
    const res = await fetch("/api/wordbank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: word.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setWord(""); showStatus(true); }
    else showStatus(false);
  };

  // ── Mood capture ──
  const [moodScore, setMoodScore]   = useState(3);
  const [moodNote, setMoodNote]     = useState("");
  const saveMood = async () => {
    setSaving(true);
    const res = await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: moodScore, note: moodNote.trim() || null }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setMoodNote(""); showStatus(true); }
    else showStatus(false);
  };

  // ── Journal capture ──
  const [journalText, setJournalText] = useState("");
  const saveJournal = async () => {
    if (!journalText.trim()) return;
    setSaving(true);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: journalText.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setJournalText(""); showStatus(true); }
    else showStatus(false);
  };

  // ── Checklist capture ──
  const [checklistText, setChecklistText] = useState("");
  const saveChecklist = async () => {
    if (!checklistText.trim()) return;
    setSaving(true);
    const res = await fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: checklistText.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { setChecklistText(""); showStatus(true); }
    else showStatus(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[80]"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="cc-qc-modal"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label="Quick capture"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="cc-qc-header">
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Quick Capture</p>
              <button className="cc-icon-btn" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div className="cc-qc-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`cc-qc-tab${tab === t.id ? " active" : ""}`}
                  style={tab === t.id ? ({ "--qc-color": t.color } as React.CSSProperties) : undefined}
                  onClick={() => { setTab(t.id); setStatus("idle"); }}
                >
                  <Icon name={t.icon} size={13} strokeWidth={1.8} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab body */}
            <div className="cc-qc-body">
              {tab === "word" && (
                <div className="space-y-3">
                  <input
                    className="cc-input"
                    placeholder="Word or phrase…"
                    value={word}
                    onChange={(e) => setWord(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveWord()}
                    autoFocus
                  />
                  <button className="cc-btn cc-btn-primary w-full" onClick={saveWord} disabled={saving || !word.trim()}>
                    {saving ? "Saving…" : "Add Word"}
                  </button>
                </div>
              )}

              {tab === "mood" && (
                <div className="space-y-4">
                  <div className="flex justify-between gap-2">
                    {MOOD_OPTIONS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setMoodScore(m.value)}
                        className="flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-colors"
                        style={{
                          background: moodScore === m.value ? "rgba(179,136,255,0.18)" : "var(--bg-card)",
                          border: `1px solid ${moodScore === m.value ? "rgba(179,136,255,0.4)" : "var(--border)"}`,
                        }}
                      >
                        <span className="text-xl">{m.emoji}</span>
                        <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    className="cc-input"
                    placeholder="Optional note…"
                    value={moodNote}
                    onChange={(e) => setMoodNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveMood()}
                  />
                  <button className="cc-btn cc-btn-primary w-full" onClick={saveMood} disabled={saving}>
                    {saving ? "Saving…" : "Log Mood"}
                  </button>
                </div>
              )}

              {tab === "journal" && (
                <div className="space-y-3">
                  <textarea
                    className="cc-input"
                    placeholder="What's on your mind?"
                    rows={4}
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    style={{ resize: "none" }}
                    autoFocus
                  />
                  <button className="cc-btn cc-btn-primary w-full" onClick={saveJournal} disabled={saving || !journalText.trim()}>
                    {saving ? "Saving…" : "Save Entry"}
                  </button>
                </div>
              )}

              {tab === "checklist" && (
                <div className="space-y-3">
                  <input
                    className="cc-input"
                    placeholder="Task or item…"
                    value={checklistText}
                    onChange={(e) => setChecklistText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveChecklist()}
                    autoFocus
                  />
                  <button className="cc-btn cc-btn-primary w-full" onClick={saveChecklist} disabled={saving || !checklistText.trim()}>
                    {saving ? "Saving…" : "Add Item"}
                  </button>
                </div>
              )}

              {/* Status */}
              <AnimatePresence>
                {status !== "idle" && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-xs mt-2"
                    style={{ color: status === "ok" ? "var(--pos)" : "var(--neg)" }}
                  >
                    {status === "ok" ? "Saved!" : "Failed, try again"}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

interface QuickCaptureFABProps {
  onClick: () => void;
}

export function QuickCaptureFAB({ onClick }: QuickCaptureFABProps) {
  return (
    <button
      className="cc-fab"
      onClick={onClick}
      aria-label="Quick capture"
      title="Quick capture"
    >
      <Plus size={20} strokeWidth={2} />
    </button>
  );
}
