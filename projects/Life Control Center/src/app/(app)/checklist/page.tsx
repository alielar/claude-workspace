"use client";

/**
 * /checklist — Daily recurring checklist. V2 Ambient Futurism.
 *
 * Items grouped by time-of-day: Morning → Afternoon → Evening → Anytime.
 * Each item has: emoji, color accent, streak badge, optional notes, auto-source badge.
 * Drawer: emoji picker, color swatches, notes, time-of-day, manual/auto-tracked type.
 * Left: progress hero + grouped list. Right: last-7-days grid + month stats.
 */

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
type AutoSource = "workout" | "reading" | "words" | "journal" | "mood" | null;

type Item = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  timeOfDay: TimeOfDay;
  completedToday: boolean;
  streak: number;
  source: "manual" | "workout";
  autoSource: AutoSource;
  color: string;
  notes: string | null;
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
  { id: "cyan",   hex: "#7EE7FF" },
  { id: "green",  hex: "#6FD49A" },
  { id: "amber",  hex: "#F59E0B" },
  { id: "red",    hex: "#FF8A8A" },
  { id: "pink",   hex: "#F472B6" },
];

const AUTO_SOURCE_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "workout", label: "Workout",  emoji: "🏋️" },
  { id: "reading", label: "Reading",  emoji: "📚" },
  { id: "words",   label: "Word Bank", emoji: "📖" },
  { id: "journal", label: "Journal",  emoji: "✍️" },
  { id: "mood",    label: "Mood",     emoji: "😌" },
];

// 80 curated emojis in 8 rows of 10
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
    title: string;
    emoji: string;
    timeOfDay: TimeOfDay;
    color: string;
    notes: string;
    autoSource: string | null;
  }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function Drawer({ open, item, onClose, onSave, onDelete }: DrawerProps) {
  const [title, setTitle]       = useState("");
  const [emoji, setEmoji]       = useState("");
  const [tod, setTod]           = useState<TimeOfDay>("anytime");
  const [color, setColor]       = useState("violet");
  const [notes, setNotes]       = useState("");
  const [isAuto, setIsAuto]     = useState(false);
  const [autoSource, setAutoSource] = useState<string>("workout");
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Is this item a virtual workout (no DB row)? Can't delete or change source.
  const isVirtualWorkout = item?.source === "workout";
  // Is this an existing auto-tracked DB item? Can't change auto_source once set.
  const isExistingAuto = !!item && item.source !== "workout" && item.autoSource !== null;

  useEffect(() => {
    if (open) {
      setTitle(item?.title ?? "");
      setEmoji(item?.emoji ?? "");
      setTod(item?.timeOfDay ?? "anytime");
      setColor(item?.color ?? "violet");
      setNotes(item?.notes ?? "");
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
    await onSave({
      title: title.trim(),
      emoji: emoji.trim(),
      timeOfDay: tod,
      color,
      notes: notes.trim(),
      autoSource: isAuto ? autoSource : null,
    });
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
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 380, zIndex: 50,
        background: "rgba(12,12,22,0.98)", backdropFilter: "blur(24px)",
        borderLeft: "1px solid var(--line-hi)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.24s var(--easeOut)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            {item ? "Edit item" : "New item"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

          {/* Emoji + Title */}
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

          {/* Color swatches */}
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Color</label>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {ITEM_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: c.hex,
                    boxShadow: color === c.id ? `0 0 0 2px #0e0e1a, 0 0 0 4px ${c.hex}` : "none",
                    border: "none", cursor: "pointer", flexShrink: 0,
                    transition: "box-shadow 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Time of day */}
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Time of day</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 8 }}>
              {TIME_SECTIONS.map(({ key, label, color: sectionColor }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTod(key)}
                  style={{
                    padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${tod === key ? sectionColor : "var(--line)"}`,
                    background: tod === key ? `${sectionColor}18` : "rgba(255,255,255,0.02)",
                    color: tod === key ? sectionColor : "var(--ink-3)",
                    fontSize: 13, fontWeight: 450, cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: tod === key ? sectionColor : "var(--ink-4)",
                    boxShadow: tod === key ? `0 0 6px ${sectionColor}` : "none",
                    flexShrink: 0,
                  }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Type selector — hidden for virtual workout item */}
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
                          background: autoSource === opt.id ? "rgba(126,231,255,0.08)" : "rgba(255,255,255,0.02)",
                          color: autoSource === opt.id ? "var(--cyan)" : "var(--ink-3)",
                          fontSize: 13, cursor: isExistingAuto ? "default" : "pointer",
                          display: "flex", alignItems: "center", gap: 10,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {opt.id === "journal" || opt.id === "mood" ? (
                          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.1em" }}>SOON</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Notes <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Read 30 min · current book: Meditations"
              rows={3}
              style={{
                width: "100%", marginTop: 8, fontSize: 13,
                background: "var(--bg-input)", border: "1px solid var(--line-hi)",
                borderRadius: 10, padding: "10px 14px", color: "var(--ink)", outline: "none",
                resize: "vertical", fontFamily: "inherit", lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Footer */}
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

// ─── Flame streak badge ───────────────────────────────────────────────────────

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

  // Label for auto badge
  const autoLabel = isVirtualWorkout
    ? "AUTO"
    : AUTO_SOURCE_OPTIONS.find((o) => o.id === item.autoSource)?.label.toUpperCase() ?? "AUTO";

  const truncatedNotes = item.notes
    ? item.notes.length > 60 ? item.notes.slice(0, 60) + "…" : item.notes
    : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "2px 22px 1fr auto",
      gap: "0 12px",
      alignItems: "center",
      padding: "11px 0",
      borderBottom: "1px solid var(--line)",
    }}>
      {/* Color accent stripe */}
      <div style={{
        alignSelf: "stretch",
        background: accent,
        borderRadius: 2,
        opacity: done ? 0.25 : 0.6,
        transition: "opacity 0.2s",
      }} />

      {/* Checkbox */}
      <span
        onClick={() => !isAnyAuto && onToggle(item.id)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20,
          borderRadius: isVirtualWorkout ? 99 : 6,
          border: `1.5px solid ${
            done
              ? "transparent"
              : isVirtualWorkout ? "rgba(126,231,255,0.30)"
              : isAutoTracked ? `${accent}60`
              : "var(--line-hi)"
          }`,
          borderStyle: isVirtualWorkout ? "dashed" : "solid",
          background: done
            ? isVirtualWorkout ? "rgba(126,231,255,0.20)" : accent + "33"
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

      {/* Label + notes */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
        }}>
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
              background: isVirtualWorkout ? "rgba(126,231,255,0.10)" : `${accent}18`,
              border: `1px solid ${isVirtualWorkout ? "rgba(126,231,255,0.25)" : `${accent}40`}`,
              textTransform: "uppercase", flexShrink: 0,
            }}>
              {autoLabel}
            </span>
          )}
        </div>
        {truncatedNotes && (
          <div style={{
            fontSize: 11.5, color: "var(--ink-4)", fontStyle: "italic",
            marginTop: 3, lineHeight: 1.4,
          }}>
            {truncatedNotes}
          </div>
        )}
      </div>

      {/* Edit button — all DB items (not virtual workout) */}
      {!isVirtualWorkout && (
        <button
          onClick={() => onEdit(item)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-4)", padding: 4, display: "flex",
            opacity: 0.6, transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.6")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}
      {isVirtualWorkout && <div />}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChecklistPage() {
  const [items, setItems]           = useState<Item[]>([]);
  const [loading, setLoading]       = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Item | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist");
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await fetch("/api/admin/migrate", { method: "POST" });
      await load();
    })();
  }, [load]);

  // ── Toggle completion ──
  const toggle = async (id: number) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, completedToday: !it.completedToday } : it));
    const res = await fetch("/api/checklist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
    if (!res.ok) {
      // Rollback on error
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, completedToday: !it.completedToday } : it));
    }
  };

  // ── Drawer save ──
  const handleSave = async (data: {
    title: string; emoji: string; timeOfDay: TimeOfDay;
    color: string; notes: string; autoSource: string | null;
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

  const openNew  = () => { setEditTarget(null);  setDrawerOpen(true); };
  const openEdit = (item: Item) => { setEditTarget(item); setDrawerOpen(true); };

  // ── Derived stats ──
  const completed = items.filter((i) => i.completedToday).length;
  const total     = items.length;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone   = total > 0 && completed === total;

  const grouped = TIME_SECTIONS.map(({ key, label, color }) => ({
    key, label, color,
    items: items.filter((i) => (i.timeOfDay ?? "anytime") === key),
  })).filter((g) => g.items.length > 0);

  // Last 7 days helpers
  const now       = new Date();
  const dayNames  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const last7 = Array.from({ length: 7 }, (_, i) => {
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

      {/* 8fr / 4fr layout */}
      <div style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────────────── */}
        <div>
          {/* Progress hero */}
          <div className="cc-card" style={{
            marginBottom: 14, padding: "28px 32px",
            background: `
              radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.14), transparent 60%),
              radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.10), transparent 60%),
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
                filter: allDone ? "drop-shadow(0 0 28px rgba(179,136,255,0.55))" : "drop-shadow(0 0 24px rgba(179,136,255,0.20))",
                transition: "filter 0.6s ease",
                animation: allDone ? "celebPulse 2.4s ease-in-out infinite" : "none",
              }}>
                {loading ? "—" : pct}<span style={{ fontSize: 24, WebkitTextFillColor: "var(--ink-3)" }}>%</span>
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
              </div>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 99, marginTop: 18, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, background: "var(--grad)", borderRadius: 99,
                boxShadow: pct > 0 ? "0 0 14px rgba(179,136,255,0.40)" : "none",
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
        <div>
          {/* Last 7 days grid */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">Last 7 days</div>
              <div className="tail">{monthNames[now.getMonth()]} {last7[0]}–{last7[6]}</div>
            </div>

            {/* padded wrapper so grid cells don't sit flush against card border */}
            <div style={{ padding: "12px 16px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, marginBottom: 4 }}>
                <div />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                  {last7.map((d, i) => (
                    <div key={i} style={{ fontSize: 9, color: i === 6 ? "var(--cyan)" : "var(--ink-4)", letterSpacing: "0.10em", textAlign: "center" }}>
                      {i === 6 ? "TDY" : d}
                    </div>
                  ))}
                </div>
              </div>

              {manualItems.slice(0, 8).map((item) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.emoji ? `${item.emoji} ` : ""}{item.title}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const isToday = i === 6;
                      const state = isToday ? (item.completedToday ? "done" : "pending") : "unknown";
                      const accent = colorHex(item.color ?? "violet");
                      return (
                        <div key={i} style={{
                          aspectRatio: "1/1", borderRadius: 4,
                          border: `1px solid ${state === "done" ? `${accent}60` : state === "pending" ? "rgba(126,231,255,0.20)" : "var(--line)"}`,
                          borderStyle: state === "unknown" ? "dashed" : "solid",
                          background: state === "done" ? `${accent}33` : "transparent",
                          boxShadow: state === "done" ? `inset 0 0 8px ${accent}33` : "none",
                          outline: isToday ? "1px dashed rgba(126,231,255,0.40)" : "none",
                          outlineOffset: 1,
                        }} />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Month stats */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Month at a glance</div>
              <div className="tail">{monthNames[now.getMonth()]}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, padding: 14 }}>
              <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Today</div>
                <div className="num grad-text" style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 4 }}>
                  {loading ? "—" : pct}<span style={{ fontSize: 14, WebkitTextFillColor: "var(--ink-4)", color: "var(--ink-4)" }}>%</span>
                </div>
              </div>
              <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Items</div>
                <div className="num" style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 4 }}>
                  {total}<span style={{ color: "var(--ink-3)", fontSize: 14 }}> total</span>
                </div>
              </div>
            </div>
          </div>
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
          0%, 100% { filter: drop-shadow(0 0 24px rgba(179,136,255,0.40)); }
          50% { filter: drop-shadow(0 0 40px rgba(179,136,255,0.70)) drop-shadow(0 0 80px rgba(126,231,255,0.30)); }
        }
      `}</style>
    </div>
  );
}
