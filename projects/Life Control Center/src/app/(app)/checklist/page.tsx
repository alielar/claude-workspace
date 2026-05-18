"use client";

/**
 * /checklist — Daily recurring checklist. V2 Ambient Futurism.
 *
 * Items grouped by time-of-day tag: Morning → Afternoon → Evening → Anytime.
 * Slide-in edit drawer for adding/editing items (emoji, title, timeOfDay).
 * No per-item streak badges. Subtle all-done celebration.
 * Left: progress hero + grouped list. Right: last-7-days grid + month stats.
 */

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

type Item = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  timeOfDay: TimeOfDay;
  completedToday: boolean;
  streak: number;
  source: "manual" | "workout";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_SECTIONS: { key: TimeOfDay; label: string; color: string }[] = [
  { key: "morning",   label: "Morning",   color: "var(--warn)"   },
  { key: "afternoon", label: "Afternoon", color: "var(--cyan)"   },
  { key: "evening",   label: "Evening",   color: "var(--violet)" },
  { key: "anytime",   label: "Anytime",   color: "var(--ink-3)"  },
];

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  item: Item | null;      // null = new item
  onClose: () => void;
  onSave: (data: { title: string; emoji: string; timeOfDay: TimeOfDay }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function Drawer({ open, item, onClose, onSave, onDelete }: DrawerProps) {
  const [title, setTitle]       = useState("");
  const [emoji, setEmoji]       = useState("");
  const [tod, setTod]           = useState<TimeOfDay>("anytime");
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Sync state when the target item changes
  useEffect(() => {
    if (open) {
      setTitle(item?.title ?? "");
      setEmoji(item?.emoji ?? "");
      setTod(item?.timeOfDay ?? "anytime");
      setSaving(false);
      setDeleting(false);
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open, item]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), emoji: emoji.trim(), timeOfDay: tod });
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
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            animation: "fadeIn 0.15s ease",
          }}
        />
      )}

      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 360,
        zIndex: 50,
        background: "rgba(12,12,22,0.97)",
        backdropFilter: "blur(24px)",
        borderLeft: "1px solid var(--line-hi)",
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.24s var(--easeOut)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            {item ? "Edit item" : "New item"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

          {/* Emoji + Title row */}
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Item</label>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🔥"
                maxLength={4}
                style={{
                  width: 52, textAlign: "center", fontSize: 20,
                  background: "var(--bg-input)", border: "1px solid var(--line-hi)",
                  borderRadius: 10, padding: "10px 8px", color: "var(--ink)", outline: "none",
                  flexShrink: 0,
                }}
              />
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

          {/* Time-of-day selector */}
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Time of day</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 8 }}>
              {TIME_SECTIONS.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setTod(key)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${tod === key ? color : "var(--line)"}`,
                    background: tod === key ? `${color}18` : "rgba(255,255,255,0.02)",
                    color: tod === key ? color : "var(--ink-3)",
                    fontSize: 13,
                    fontWeight: 450,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: tod === key ? color : "var(--ink-4)",
                    boxShadow: tod === key ? `0 0 6px ${color}` : "none",
                    flexShrink: 0,
                  }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="cc-btn cc-btn-primary"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            style={{ width: "100%", justifyContent: "center", opacity: (!title.trim() || saving) ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : item ? "Save changes" : "Add item"}
          </button>
          {item && item.source !== "workout" && (
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

// ─── Check row ────────────────────────────────────────────────────────────────

function CkRow({ item, onToggle, onEdit }: {
  item: Item;
  onToggle: (id: number) => void;
  onEdit: (item: Item) => void;
}) {
  const isWorkout = item.source === "workout";
  const done = item.completedToday;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "22px 1fr auto",
      gap: 14,
      alignItems: "center",
      padding: "11px 0",
      borderBottom: "1px solid var(--line)",
    }}>
      {/* Checkbox */}
      <span
        onClick={() => !isWorkout && onToggle(item.id)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 20, height: 20, borderRadius: isWorkout ? 99 : 6,
          border: `1.5px solid ${done ? "transparent" : isWorkout ? "rgba(126,231,255,0.30)" : "var(--line-hi)"}`,
          borderStyle: isWorkout ? "dashed" : "solid",
          background: done
            ? isWorkout ? "rgba(126,231,255,0.20)" : "var(--grad)"
            : isWorkout ? "rgba(126,231,255,0.04)" : "transparent",
          boxShadow: done && !isWorkout ? "0 0 10px rgba(179,136,255,0.40)" : "none",
          flexShrink: 0,
          cursor: isWorkout ? "default" : "pointer",
          transition: "all 0.15s",
        }}
      >
        {done && !isWorkout && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A0A14" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        {done && isWorkout && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        )}
      </span>

      {/* Label */}
      <div>
        <div style={{
          fontSize: 14, letterSpacing: "-0.005em",
          color: done ? "var(--ink-3)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: "var(--ink-5)",
          textDecorationThickness: 1,
          display: "flex", alignItems: "center", gap: 7,
          transition: "color 0.2s",
        }}>
          {item.emoji && <span>{item.emoji}</span>}
          {item.title}
          {isWorkout && (
            <span style={{
              fontFamily: "var(--f-mono)", fontSize: 8.5, letterSpacing: "0.18em",
              color: "var(--cyan)", padding: "2px 6px", borderRadius: 99,
              background: "rgba(126,231,255,0.10)", border: "1px solid rgba(126,231,255,0.25)",
              textTransform: "uppercase",
            }}>auto</span>
          )}
        </div>
      </div>

      {/* Edit button (manual items only) */}
      {!isWorkout && (
        <button
          onClick={() => onEdit(item)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-4)", padding: 4, display: "flex",
            opacity: 0.6, transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChecklistPage() {
  const [items, setItems]       = useState<Item[]>([]);
  const [loading, setLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Item | null>(null);

  // Run migration + load on mount
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
    // Optimistic
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, completedToday: !it.completedToday } : it));
    await fetch("/api/checklist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
  };

  // ── Drawer save (create or update) ──
  const handleSave = async (data: { title: string; emoji: string; timeOfDay: TimeOfDay }) => {
    if (editTarget) {
      // Update
      await fetch(`/api/checklist/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      // Create
      await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setDrawerOpen(false);
    await load();
  };

  // ── Drawer delete ──
  const handleDelete = async (id: number) => {
    await fetch(`/api/checklist/${id}`, { method: "DELETE" });
    setDrawerOpen(false);
    await load();
  };

  const openNew  = () => { setEditTarget(null);  setDrawerOpen(true); };
  const openEdit = (item: Item) => { setEditTarget(item); setDrawerOpen(true); };

  // ── Derived stats ──
  const manualItems = items.filter((i) => i.source !== "workout");
  const completed   = items.filter((i) => i.completedToday).length;
  const total       = items.length;
  const pct         = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone     = total > 0 && completed === total;

  // Group by time-of-day, preserving section order
  const grouped = TIME_SECTIONS.map(({ key, label, color }) => ({
    key, label, color,
    items: items.filter((i) => (i.timeOfDay ?? "anytime") === key),
  })).filter((g) => g.items.length > 0);

  // Last 7 days
  const now = new Date();
  const dayNames   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d.getDate();
  });

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
              {/* Big % */}
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
                {allDone ? (
                  <div style={{ fontSize: 12, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em", marginBottom: 4 }}>
                    ✓ ALL DONE
                  </div>
                ) : null}
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <b style={{ color: "var(--ink)" }}>{completed} of {total}</b> done
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                  <b style={{ color: "var(--ink)" }}>{total - completed}</b> remaining
                </div>
              </div>
            </div>
            {/* Progress bar */}
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
                {/* Section header */}
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

                {/* Items in section */}
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

            {/* Day headers */}
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

            {/* One row per manual item (max 8 for height) */}
            {manualItems.slice(0, 8).map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <div style={{ fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.emoji ? `${item.emoji} ` : ""}{item.title}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                  {Array.from({ length: 7 }, (_, i) => {
                    // We only know today's state; fill the rest as unknown
                    const isToday = i === 6;
                    const state = isToday ? (item.completedToday ? "done" : "pending") : "unknown";
                    return (
                      <div key={i} style={{
                        aspectRatio: "1/1", borderRadius: 4,
                        border: `1px solid ${state === "done" ? "rgba(179,136,255,0.40)" : state === "pending" ? "rgba(126,231,255,0.20)" : "var(--line)"}`,
                        borderStyle: state === "unknown" ? "dashed" : "solid",
                        background: state === "done" ? "linear-gradient(135deg, rgba(179,136,255,0.40), rgba(126,231,255,0.20))" : "transparent",
                        boxShadow: state === "done" ? "inset 0 0 8px rgba(179,136,255,0.20)" : "none",
                        outline: isToday ? "1px dashed rgba(126,231,255,0.40)" : "none",
                        outlineOffset: 1,
                      }} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Month stats */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Month at a glance</div>
              <div className="tail">{monthNames[now.getMonth()]}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
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

      {/* Edit/Add drawer */}
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
