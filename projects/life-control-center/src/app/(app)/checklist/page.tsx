"use client";

/**
 * /checklist — Daily recurring checklist. V2 Ambient Futurism.
 *
 * Items grouped by time-of-day: Morning → Afternoon → Evening → Anytime.
 * Each item has: emoji, color accent, streak badge, optional notes, auto-source badge.
 * Drawer: emoji picker, color swatches, notes, time-of-day, manual/auto-tracked type.
 * Left: progress hero + grouped list.
 * Right: last-7-days grid (real data) + month heatmap + 30-day stats + AI suggestions + weekly review.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { ensureMigrate } from "@/lib/ensureMigrate";
import { sendOrQueue } from "@/lib/local/outbox";
import WeeklyReviews from "@/components/checklist/WeeklyReviews";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
type AutoSource = "workout" | "reading" | "words" | "journal" | "mood" | null;
type ItemKind = "routine" | "habit" | "manual";

type Item = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  timeOfDay: TimeOfDay;
  kind: ItemKind;
  routineKey: string | null;
  completedToday: boolean;
  streak: number;
  last7: boolean[];
  source: "manual" | "workout";
  autoSource: AutoSource;
  color: string;
  notes: string | null;
};

type ChecklistData = {
  items: Item[];
  overallStreak: number;
  monthlyPct: { date: string; pct: number }[];
  thirtyDayAvg: number;
  bestStreak30: number;
};

type Suggestion = {
  id: number;
  title: string;
  rationale: string;
  emoji: string | null;
  weekStart: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_SECTIONS: { key: TimeOfDay; label: string; color: string }[] = [
  { key: "morning",   label: "Morning",   color: "var(--warn)"   },
  { key: "afternoon", label: "Afternoon", color: "var(--cyan)"   },
  { key: "evening",   label: "Evening",   color: "var(--violet)" },
  { key: "anytime",   label: "Anytime",   color: "var(--ink-3)"  },
];

const ITEM_COLORS = [
  { id: "violet", hex: "#7C5CFF" },
  { id: "cyan",   hex: "#64FFDA" },
  { id: "green",  hex: "#6FD49A" },
  { id: "amber",  hex: "#F59E0B" },
  { id: "red",    hex: "#FF8A8A" },
  { id: "pink",   hex: "#F472B6" },
];

const KIND_OPTIONS: { id: ItemKind; label: string; hint: string }[] = [
  { id: "routine", label: "Daily routine", hint: "Counts toward the day's streak" },
  { id: "habit",   label: "Habit I'm building", hint: "Own streak, doesn't count yet" },
  { id: "manual",  label: "Regular item", hint: "Counts toward the day" },
];

const AUTO_SOURCE_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "workout", label: "Workout",   emoji: "🏋️" },
  { id: "reading", label: "Reading",   emoji: "📚" },
  { id: "words",   label: "Word Bank", emoji: "📖" },
  { id: "journal", label: "Journal",   emoji: "✍️" },
  { id: "mood",    label: "Mood",      emoji: "😌" },
];

const QUICK_EMOJIS = [
  "🏋️","🏃","🚴","🧘","💪","🤸","🏊","🥊","🧗","🎯",
  "💧","🍎","🥗","🥦","💊","😴","🦷","❤️","🫁","🩺",
  "📚","✍️","🧠","💡","📝","🎓","💻","📖","🔖","🎨",
  "🌅","🌿","🌱","☀️","🌙","⭐","🌊","🍃","🌸","🔥",
  "✅","🏆","🥇","💰","🔑","💎","🎁","📅","⏰","🔔",
  "🍵","☕","🍌","🥑","🍇","🍓","🥥","🍫","🍯","🥛",
  "⚽","🏀","🎾","🏐","🏓","⛳","🎮","🎵","🎭","🌍",
  "✨","💫","⚡","🌈","🔮","🚀","🌻","🦋","🐾","🫖",
];

function colorHex(id: string): string {
  return ITEM_COLORS.find((c) => c.id === id)?.hex ?? "#7C5CFF";
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 52, height: 44, textAlign: "center", fontSize: 22,
          background: "var(--bg-input)", border: `1px solid ${open ? "var(--violet)" : "var(--line-hi)"}`,
          borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.15s",
        }}
      >
        {value || <span style={{ fontSize: 18, opacity: 0.3 }}>＋</span>}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
          background: "#0e0e1a", border: "1px solid var(--line-hi)", borderRadius: 12,
          padding: 10, width: 280, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 2 }}>
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => { onChange(em); setOpen(false); }}
                style={{
                  background: value === em ? "rgba(124,92,255,0.25)" : "none",
                  border: value === em ? "1px solid rgba(124,92,255,0.5)" : "1px solid transparent",
                  borderRadius: 6, fontSize: 17, cursor: "pointer", padding: "4px 2px",
                  lineHeight: 1, transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = value === em ? "rgba(124,92,255,0.25)" : "none"; }}
              >
                {em}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                marginTop: 8, width: "100%", fontSize: 11, color: "var(--ink-4)",
                background: "none", border: "1px solid var(--line)", borderRadius: 6,
                cursor: "pointer", padding: "4px 0",
              }}
            >
              Clear emoji
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onSave: (data: {
    title: string; emoji: string; timeOfDay: TimeOfDay;
    color: string; notes: string; autoSource: string | null; kind: ItemKind;
  }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function Drawer({ open, item, onClose, onSave, onDelete }: DrawerProps) {
  const [title, setTitle]       = useState("");
  const [emoji, setEmoji]       = useState("");
  const [tod, setTod]           = useState<TimeOfDay>("anytime");
  const [color, setColor]       = useState("violet");
  const [notes, setNotes]       = useState("");
  const [kind, setKind]         = useState<ItemKind>("manual");
  const [isAuto, setIsAuto]     = useState(false);
  const [autoSource, setAutoSource] = useState<string>("workout");
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const isVirtualWorkout = item?.source === "workout";
  const isExistingAuto   = !!item && item.source !== "workout" && item.autoSource !== null;

  useEffect(() => {
    if (open) {
      setTitle(item?.title ?? "");
      setEmoji(item?.emoji ?? "");
      setTod(item?.timeOfDay ?? "anytime");
      setColor(item?.color ?? "violet");
      setNotes(item?.notes ?? "");
      setKind(item?.kind ?? "manual");
      const src = item?.autoSource ?? null;
      setIsAuto(src !== null);
      setAutoSource(src ?? "workout");
      setSaving(false);
      setDeleting(false);
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open, item]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), emoji: emoji.trim(), timeOfDay: tod, color, notes: notes.trim(), autoSource: isAuto ? autoSource : null, kind });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    await onDelete(item.id);
    setDeleting(false);
  };

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            animation: "fadeIn 0.15s ease",
          }}
        />
      )}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(380px, 100vw)", zIndex: 50,
        background: "var(--bg-chrome)", backdropFilter: "blur(24px)",
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
        borderLeft: "1px solid var(--line-hi)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.24s var(--easeOut)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
            {item ? "Edit item" : "New item"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Item</label>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <EmojiPicker value={emoji} onChange={setEmoji} />
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="e.g. Drink 2L water"
                style={{
                  flex: 1, fontSize: 14,
                  background: "var(--bg-input)", border: "1px solid var(--line-hi)",
                  borderRadius: 10, padding: "10px 14px", color: "var(--ink)", outline: "none",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Color</label>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {ITEM_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  style={{
                    width: 24, height: 24, borderRadius: "50%", background: c.hex,
                    boxShadow: color === c.id ? `0 0 0 2px #0e0e1a, 0 0 0 4px ${c.hex}` : "none",
                    border: "none", cursor: "pointer", flexShrink: 0, transition: "box-shadow 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Time of day</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 8 }}>
              {TIME_SECTIONS.map(({ key, label, color: sc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTod(key)}
                  style={{
                    padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${tod === key ? sc : "var(--line)"}`,
                    background: tod === key ? `${sc}18` : "rgba(255,255,255,0.02)",
                    color: tod === key ? sc : "var(--ink-3)",
                    fontSize: 13, fontWeight: 450, cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: tod === key ? sc : "var(--ink-4)",
                    boxShadow: tod === key ? `0 0 6px ${sc}` : "none",
                    flexShrink: 0,
                  }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>What is it</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {KIND_OPTIONS.map((k) => {
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    style={{
                      minHeight: 44, padding: "9px 14px", borderRadius: 10, textAlign: "left",
                      border: `1px solid ${active ? "var(--violet)" : "var(--line)"}`,
                      background: active ? "rgba(124,92,255,0.12)" : "var(--fill-1)",
                      color: active ? "var(--ink)" : "var(--ink-3)",
                      fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    }}
                  >
                    <span>{k.label}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{k.hint}</span>
                  </button>
                );
              })}
            </div>
            {item?.kind === "habit" && kind === "routine" && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--pos)" }}>Promoting this habit to your daily routine. Its streak carries over.</div>
            )}
          </div>

          {!isVirtualWorkout && (
            <div>
              <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Type</label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {["Manual", "Auto-tracked"].map((type) => {
                  const active = type === "Auto-tracked" ? isAuto : !isAuto;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => !isExistingAuto && setIsAuto(type === "Auto-tracked")}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 10,
                        border: `1px solid ${active ? "var(--violet)" : "var(--line)"}`,
                        background: active ? "rgba(124,92,255,0.12)" : "rgba(255,255,255,0.02)",
                        color: active ? "var(--violet)" : "var(--ink-3)",
                        fontSize: 13, cursor: isExistingAuto ? "default" : "pointer",
                        transition: "all 0.15s", opacity: isExistingAuto && !active ? 0.4 : 1,
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>

              {isAuto && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "block", marginBottom: 8 }}>
                    Source module
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {AUTO_SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => !isExistingAuto && setAutoSource(opt.id)}
                        style={{
                          padding: "9px 14px", borderRadius: 10, textAlign: "left",
                          border: `1px solid ${autoSource === opt.id ? "var(--cyan)" : "var(--line)"}`,
                          background: autoSource === opt.id ? "rgba(100,255,218,0.08)" : "rgba(255,255,255,0.02)",
                          color: autoSource === opt.id ? "var(--cyan)" : "var(--ink-3)",
                          fontSize: 13, cursor: isExistingAuto ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 10,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {(opt.id === "journal" || opt.id === "mood") && (
                          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.1em" }}>SOON</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
              Notes <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, opacity: 0.6 }}>(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Read 30 min · current book: Meditations"
              rows={3}
              style={{
                width: "100%", marginTop: 8, fontSize: 13,
                background: "var(--bg-input)", border: "1px solid var(--line-hi)",
                borderRadius: 10, padding: "10px 14px", color: "var(--ink)", outline: "none",
                resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="cc-btn cc-btn-primary"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            style={{ width: "100%", justifyContent: "center", opacity: (!title.trim() || saving) ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : item ? "Save changes" : "Add item"}
          </button>
          {item && !isVirtualWorkout && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                width: "100%", padding: "10px", borderRadius: 10,
                background: "none", border: "1px solid rgba(255,138,138,0.20)",
                color: "var(--neg)", fontSize: 13, cursor: "pointer",
                opacity: deleting ? 0.5 : 1, transition: "all 0.15s",
              }}
            >
              {deleting ? "Deleting…" : "Delete item"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Streak badge ─────────────────────────────────────────────────────────────

function StreakBadge({ count, accentHex }: { count: number; accentHex: string }) {
  if (count === 0) return null;
  const glow = count >= 30
    ? `drop-shadow(0 0 6px ${accentHex}) drop-shadow(0 0 12px ${accentHex})`
    : count >= 7
    ? `drop-shadow(0 0 4px ${accentHex})`
    : "none";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10.5, fontFamily: "var(--f-mono)", letterSpacing: "0.06em",
      color: accentHex, filter: glow, flexShrink: 0,
    }}>
      🔥{count}
    </span>
  );
}

// ─── Check row ────────────────────────────────────────────────────────────────

/** Split a notes string into text segments and URL segments for inline rendering. */
function parseNotesWithLinks(text: string): Array<{ type: "text" | "url"; value: string }> {
  const urlRe = /https?:\/\/[^\s]+/g;
  const parts: Array<{ type: "text" | "url"; value: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    parts.push({ type: "url", value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function CkRow({ item, onToggle, onEdit }: {
  item: Item;
  onToggle: (id: number) => void;
  onEdit: (item: Item) => void;
}) {
  const isVirtualWorkout = item.source === "workout";
  const isAutoTracked    = !isVirtualWorkout && item.autoSource !== null;
  const isAnyAuto        = isVirtualWorkout || isAutoTracked;
  const done             = item.completedToday;
  const accent           = colorHex(item.color ?? "violet");

  const autoLabel = isVirtualWorkout
    ? "AUTO"
    : AUTO_SOURCE_OPTIONS.find((o) => o.id === item.autoSource)?.label.toUpperCase() ?? "AUTO";

  // Parse notes: URLs become clickable links; text is truncated if no URL present
  const noteParts = item.notes ? parseNotesWithLinks(item.notes) : null;
  const hasUrl    = noteParts?.some((p) => p.type === "url") ?? false;
  // Plain-text truncation only when there are no URLs (URLs must show in full)
  const truncatedNotes = !hasUrl && item.notes
    ? item.notes.length > 60 ? item.notes.slice(0, 60) + "…" : item.notes
    : null;

  return (
    <div
      // The whole row is the tap target (≥44px tall); the small box is just the visual.
      role={isAnyAuto ? undefined : "checkbox"}
      aria-checked={isAnyAuto ? undefined : done}
      onClick={() => !isAnyAuto && onToggle(item.id)}
      style={{
        display: "grid",
        gridTemplateColumns: "2px 22px 1fr auto",
        gap: "0 12px",
        alignItems: "center",
        padding: "11px 0",
        minHeight: 48,
        borderBottom: "1px solid var(--line)",
        cursor: isAnyAuto ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
      }}>
      <div style={{
        alignSelf: "stretch",
        background: accent,
        borderRadius: 2,
        opacity: done ? 0.25 : 0.6,
        transition: "opacity 0.2s",
      }} />

      <span
        aria-hidden
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22,
          borderRadius: isVirtualWorkout ? 99 : 6,
          border: `1.5px solid ${
            done ? "transparent"
            : isVirtualWorkout ? "rgba(100,255,218,0.30)"
            : isAutoTracked ? `${accent}60`
            : "var(--line-hi)"
          }`,
          borderStyle: isVirtualWorkout ? "dashed" : "solid",
          background: done
            ? isVirtualWorkout ? "rgba(100,255,218,0.20)" : accent + "33"
            : "transparent",
          boxShadow: done && !isVirtualWorkout ? `0 0 10px ${accent}66` : "none",
          flexShrink: 0,
          cursor: isAnyAuto ? "default" : "pointer",
          transition: "all 0.15s",
        }}
      >
        {done && !isVirtualWorkout && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        {done && isVirtualWorkout && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {item.emoji && <span style={{ flexShrink: 0 }}>{item.emoji}</span>}
          <span style={{
            fontSize: 14, letterSpacing: "-0.005em",
            color: done ? "var(--ink-3)" : "var(--ink)",
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: "var(--ink-5)",
            textDecorationThickness: 1,
            transition: "color 0.2s",
          }}>
            {item.title}
          </span>
          {item.streak > 0 && <StreakBadge count={item.streak} accentHex={accent} />}
          {isAnyAuto && (
            <span style={{
              fontFamily: "var(--f-mono)", fontSize: 8.5, letterSpacing: "0.18em",
              color: isVirtualWorkout ? "var(--cyan)" : accent,
              padding: "2px 6px", borderRadius: 99,
              background: isVirtualWorkout ? "rgba(100,255,218,0.10)" : `${accent}18`,
              border: `1px solid ${isVirtualWorkout ? "rgba(100,255,218,0.25)" : `${accent}40`}`,
              textTransform: "uppercase", flexShrink: 0,
            }}>
              {autoLabel}
            </span>
          )}
        </div>
        {/* Notes: plain text truncated, or inline-linked when a URL is detected */}
        {hasUrl && noteParts && (
          <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 3, lineHeight: 1.6 }}>
            {noteParts.map((part, i) =>
              part.type === "url" ? (
                <a
                  key={i}
                  href={part.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: "var(--cyan)", textDecoration: "none", wordBreak: "break-all" }}
                >
                  {part.value}
                </a>
              ) : (
                <span key={i} style={{ fontStyle: "italic" }}>{part.value}</span>
              )
            )}
          </div>
        )}
        {!hasUrl && truncatedNotes && (
          <div style={{ fontSize: 11.5, color: "var(--ink-4)", fontStyle: "italic", marginTop: 3, lineHeight: 1.4 }}>
            {truncatedNotes}
          </div>
        )}
      </div>

      {!isVirtualWorkout ? (
        <button
          aria-label={`Edit ${item.title}`}
          onClick={(e) => { e.stopPropagation(); onEdit(item); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-3)", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
            width: 44, height: 44, marginRight: -12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      ) : <div />}
    </div>
  );
}

// ─── Monthly heatmap ──────────────────────────────────────────────────────────

function MonthlyHeatmap({ monthlyPct, todayStr }: { monthlyPct: { date: string; pct: number }[]; todayStr: string }) {
  if (monthlyPct.length === 0) return (
    <div style={{ fontSize: 11, color: "var(--ink-4)", textAlign: "center", padding: "10px 0" }}>
      No data yet this month
    </div>
  );

  const firstDate  = new Date(monthlyPct[0].date + "T12:00:00");
  const firstDow   = firstDate.getDay(); // 0=Sun
  const offset     = (firstDow + 6) % 7; // Monday-first
  const dayLetters = ["M","T","W","T","F","S","S"];

  function pctToStyle(pct: number, isToday: boolean) {
    const bg = pct === 100
      ? "rgba(124,77,255,0.65)"
      : pct >= 50
      ? "rgba(124,77,255,0.35)"
      : pct > 0
      ? "rgba(124,77,255,0.15)"
      : "rgba(255,255,255,0.02)";

    return {
      aspectRatio: "1/1",
      borderRadius: 3,
      background: bg,
      border: isToday
        ? "1px solid rgba(100,255,218,0.55)"
        : pct === 100
        ? "1px solid rgba(124,77,255,0.40)"
        : "1px solid transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 8,
      color: pct > 0 ? "var(--ink-2)" : "var(--ink-5)",
      fontFamily: "var(--f-mono)",
      boxShadow: pct === 100 ? "0 0 6px rgba(124,77,255,0.30)" : "none",
    };
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
        {dayLetters.map((l, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 8.5, color: "var(--ink-4)", letterSpacing: "0.06em" }}>{l}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: offset }, (_, i) => <div key={`off-${i}`} />)}
        {monthlyPct.map(({ date, pct }) => {
          const day = parseInt(date.split("-")[2]);
          const isToday = date === todayStr;
          return (
            <div key={date} title={`${pct}%`} style={pctToStyle(pct, isToday)}>
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChecklistPage() {
  const [items, setItems]               = useState<Item[]>([]);
  const [loading, setLoading]           = useState(true);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<Item | null>(null);
  const [overallStreak, setOverallStreak] = useState(0);
  const [monthlyPct, setMonthlyPct]     = useState<{ date: string; pct: number }[]>([]);
  const [thirtyDayAvg, setThirtyDayAvg] = useState(0);
  const [bestStreak30, setBestStreak30] = useState(0);
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [weeklyReview, setWeeklyReview] = useState<string | null>(null);
  const [loadingSug, setLoadingSug]     = useState(true);

  // Grace period: before 4 AM Madrid, treat it as still yesterday
  const _now = new Date();
  const _madridHour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "numeric", hour12: false }).format(_now)
  );
  const _adjusted = _madridHour < 4 ? new Date(_now.getTime() - 86400000) : _now;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(_adjusted);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist");
      if (res.ok) {
        const data: ChecklistData = await res.json();
        setItems(data.items);
        setOverallStreak(data.overallStreak);
        setMonthlyPct(data.monthlyPct);
        setThirtyDayAvg(data.thirtyDayAvg);
        setBestStreak30(data.bestStreak30);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSuggestions = useCallback(async () => {
    setLoadingSug(true);
    try {
      const res = await fetch("/api/checklist/suggestions");
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setWeeklyReview(data.weeklyReview ?? null);
      }
    } catch { /* ignore */ }
    setLoadingSug(false);
  }, []);

  useEffect(() => {
    (async () => {
      ensureMigrate();
      await Promise.all([load(), loadSuggestions()]);
    })();
  }, [load, loadSuggestions]);

  // ── Toggle (idempotent + offline-queued, same as the Today screen) ──
  const toggle = async (id: number) => {
    const current = items.find((it) => it.id === id);
    if (!current) return;
    const next = !current.completedToday;
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, completedToday: next } : it));
    try {
      await sendOrQueue({
        url: "/api/checklist/toggle",
        method: "POST",
        body: { itemId: id, completed: next, date: todayStr },
        dedupeKey: `toggle:${id}:${todayStr}`,
      });
    } catch {
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, completedToday: !next } : it));
    }
  };

  // ── Drawer save ──
  const handleSave = async (data: {
    title: string; emoji: string; timeOfDay: TimeOfDay;
    color: string; notes: string; autoSource: string | null; kind: ItemKind;
  }) => {
    if (editTarget) {
      await fetch(`/api/checklist/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setDrawerOpen(false);
    await load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/checklist/${id}`, { method: "DELETE" });
    setDrawerOpen(false);
    await load();
  };

  // ── Suggestion actions ──
  const handleSuggestion = async (id: number, action: "accept" | "dismiss") => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/checklist/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (action === "accept") await load();
  };

  const openNew  = () => { setEditTarget(null);  setDrawerOpen(true); };
  const openEdit = (item: Item) => { setEditTarget(item); setDrawerOpen(true); };

  // ── Derived ──
  const completed = items.filter((i) => i.completedToday).length;
  const total     = items.length;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone   = total > 0 && completed === total;

  const grouped = TIME_SECTIONS.map(({ key, label, color }) => ({
    key, label, color,
    items: items.filter((i) => (i.timeOfDay ?? "anytime") === key),
  })).filter((g) => g.items.length > 0);

  const now        = new Date();
  const dayNames   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Build last-7 date labels
  const last7Labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d.getDate();
  });

  const manualItems = items.filter((i) => i.source !== "workout");

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Today<span className="grad-text">.</span></h1>
          <div className="sub">
            {dayNames[now.getDay()]}, {monthNames[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
            {" · "}{total} daily non-negotiables
          </div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={openNew} style={{ fontSize: 12 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add item
        </button>
      </div>

      {/* 8fr / 4fr on desktop, single column on the phone (see .ck-grid in globals.css) */}
      <div className="ck-grid" style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────────────── */}
        <div>
          {/* Progress hero */}
          <div className="cc-card" style={{
            marginBottom: 14, padding: "28px 32px",
            background: `
              radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.14), transparent 60%),
              radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.10), transparent 60%),
              var(--bg-card)`,
          }}>
            <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
              Today&rsquo;s completion
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginTop: 6 }}>
              <div style={{
                fontSize: 88, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 0.9,
                background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent",
                filter: allDone ? "drop-shadow(0 0 28px rgba(124,77,255,0.55))" : "drop-shadow(0 0 24px rgba(124,77,255,0.20))",
                transition: "filter 0.6s ease",
                animation: allDone ? "celebPulse 2.4s ease-in-out infinite" : "none",
              }}>
                {loading ? "-" : pct}<span style={{ fontSize: 24, WebkitTextFillColor: "var(--ink-3)" }}>%</span>
              </div>
              <div style={{ textAlign: "right" }}>
                {allDone && (
                  <div style={{ fontSize: 12, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em", marginBottom: 4 }}>
                    ✓ ALL DONE
                  </div>
                )}
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <b style={{ color: "var(--ink)" }}>{completed} of {total}</b> done
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                  <b style={{ color: "var(--ink)" }}>{total - completed}</b> remaining
                </div>
                {overallStreak > 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--violet)", fontFamily: "var(--f-mono)", marginTop: 6, letterSpacing: "0.04em" }}>
                    🔥 {overallStreak}d streak
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 99, marginTop: 18, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, background: "var(--grad)", borderRadius: 99,
                boxShadow: pct > 0 ? "0 0 14px rgba(124,77,255,0.40)" : "none",
                transition: "width 0.5s var(--easeOut)",
              }} />
            </div>
          </div>

          {/* Items grouped by time of day */}
          <div className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
            {loading && (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: "40px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 12 }}>No items yet.</div>
                <button className="cc-btn cc-btn-primary" onClick={openNew} style={{ margin: "0 auto" }}>
                  Add your first item
                </button>
              </div>
            )}
            {!loading && grouped.map((group, gi) => (
              <div key={group.key}>
                <div style={{
                  padding: "10px 20px 8px",
                  borderBottom: "1px solid var(--line)",
                  borderTop: gi > 0 ? "1px solid var(--line-strong)" : "none",
                  display: "flex", alignItems: "center", gap: 7,
                  background: "rgba(255,255,255,0.015)",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: group.color, boxShadow: `0 0 5px ${group.color}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: group.color }}>
                    {group.label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginLeft: "auto" }}>
                    {group.items.filter((i) => i.completedToday).length}/{group.items.length}
                  </span>
                </div>
                <div style={{ padding: "0 20px" }}>
                  {group.items.map((item) => (
                    <CkRow key={item.id} item={item} onToggle={toggle} onEdit={openEdit} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Last 7 days grid — real historical data */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Last 7 days</div>
              <div className="tail">{monthNames[now.getMonth()]} {last7Labels[0]}–{last7Labels[6]}</div>
            </div>
            <div style={{ padding: "4px 16px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, marginBottom: 4 }}>
                <div />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                  {last7Labels.map((d, i) => (
                    <div key={i} style={{ fontSize: 9, color: i === 6 ? "var(--cyan)" : "var(--ink-4)", letterSpacing: "0.10em", textAlign: "center" }}>
                      {i === 6 ? "TDY" : d}
                    </div>
                  ))}
                </div>
              </div>

              {manualItems.slice(0, 8).map((item) => {
                const accent = colorHex(item.color ?? "violet");
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <div style={{ fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.emoji ? `${item.emoji} ` : ""}{item.title}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                      {(item.last7 ?? Array(7).fill(false)).map((done: boolean, i: number) => {
                        const isToday = i === 6;
                        return (
                          <div key={i} style={{
                            aspectRatio: "1/1", borderRadius: 4,
                            border: `1px solid ${done ? `${accent}60` : isToday ? "rgba(100,255,218,0.20)" : "var(--line)"}`,
                            borderStyle: (!done && !isToday) ? "dashed" : "solid",
                            background: done ? `${accent}33` : "transparent",
                            boxShadow: done ? `inset 0 0 8px ${accent}33` : "none",
                            outline: isToday ? "1px dashed rgba(100,255,218,0.40)" : "none",
                            outlineOffset: 1,
                          }} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month at a glance — streak stats + heatmap */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Month at a glance</div>
              <div className="tail">{monthNames[now.getMonth()]}</div>
            </div>
            <div style={{ padding: "4px 16px 14px" }}>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 14 }}>
                <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Today</div>
                  <div className="num grad-text" style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 4 }}>
                    {loading ? "-" : pct}<span style={{ fontSize: 13, WebkitTextFillColor: "var(--ink-4)", color: "var(--ink-4)" }}>%</span>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Streak</div>
                  <div className="num" style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 4 }}>
                    {overallStreak}<span style={{ color: "var(--ink-3)", fontSize: 13 }}> days</span>
                  </div>
                </div>
              </div>

              {/* Monthly heatmap */}
              <MonthlyHeatmap monthlyPct={monthlyPct} todayStr={todayStr} />

              {/* 30-day stats */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 3 }}>30-day avg</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 500, color: thirtyDayAvg >= 70 ? "var(--pos)" : thirtyDayAvg >= 40 ? "var(--warn)" : "var(--neg)" }}>
                    {loading ? "-" : `${thirtyDayAvg}%`}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 3 }}>Best streak</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-2)" }}>
                    {loading ? "-" : `${bestStreak30}d`}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 3 }}>Total items</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-2)" }}>
                    {total}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI habit suggestions */}
          {!loadingSug && (suggestions.length > 0 || weeklyReview) && (
            <>
              {suggestions.length > 0 && (
                <div className="cc-card">
                  <div className="cc-card-head">
                    <div className="title">This week&rsquo;s habits</div>
                    <div className="tail" style={{ color: "var(--violet)", fontSize: 10 }}>AI</div>
                  </div>
                  <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {suggestions.map((s) => (
                      <div key={s.id} style={{
                        padding: "12px 14px", borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "rgba(124,77,255,0.04)",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                          {s.emoji && <span style={{ fontSize: 18, flexShrink: 0 }}>{s.emoji}</span>}
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>
                            {s.title}
                          </div>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4, marginBottom: 10 }}>
                          {s.rationale}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleSuggestion(s.id, "accept")}
                            style={{
                              flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 500,
                              background: "rgba(124,77,255,0.14)", border: "1px solid rgba(124,77,255,0.35)",
                              color: "var(--violet)", cursor: "pointer", transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,77,255,0.22)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,77,255,0.14)"; }}
                          >
                            Add this
                          </button>
                          <button
                            onClick={() => handleSuggestion(s.id, "dismiss")}
                            style={{
                              padding: "7px 10px", borderRadius: 8, fontSize: 11.5,
                              background: "none", border: "1px solid var(--line)",
                              color: "var(--ink-4)", cursor: "pointer", transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-2)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-4)"; }}
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {weeklyReview && (
                <div className="cc-card">
                  <div className="cc-card-head">
                    <div className="title">Weekly insight</div>
                    <div className="tail" style={{ color: "var(--cyan)", fontSize: 10 }}>AI</div>
                  </div>
                  <div style={{ padding: "4px 16px 14px" }}>
                    <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                      {weeklyReview}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <WeeklyReviews />
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        item={editTarget}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes celebPulse {
          0%, 100% { filter: drop-shadow(0 0 24px rgba(124,77,255,0.40)); }
          50% { filter: drop-shadow(0 0 40px rgba(124,77,255,0.70)) drop-shadow(0 0 80px rgba(100,255,218,0.30)); }
        }
      `}</style>
    </div>
  );
}
