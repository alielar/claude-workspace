"use client";

/**
 * /checklist — edit the daily list. Deliberately small.
 *
 *   list grouped by time of day (Morning · Afternoon · Evening · Anytime)
 *   + Add: name, emoji, time of day, optional link. That's it.
 *   tap an item → same sheet, plus "habit I'm building" switch and Delete
 *
 * Ticking happens on Today; streak stats live there too. Nothing here needs the
 * network to render (phone copy first), edits go through the outbox.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ensureMigrate } from "@/lib/ensureMigrate";
import type { ChecklistData, ChecklistItem, ItemKind, TimeOfDay } from "@/lib/checklist/types";

const TIMES: { key: TimeOfDay; label: string; hint: string }[] = [
  { key: "morning",   label: "Morning",   hint: "04–12" },
  { key: "afternoon", label: "Afternoon", hint: "12–21" },
  { key: "evening",   label: "Evening",   hint: "21–04" },
  { key: "anytime",   label: "Anytime",   hint: "" },
];

const EMOJIS = ["🤸","🫁","💊","🌙","📚","💧","☀️","🧘","💪","🏃","🥗","☕","🦷","✍️","🧠","📝","🎯","🌿","😴","🔥","⭐","✅"];

const URL_RE = /https?:\/\/\S+/;

function linkOf(item: ChecklistItem | null): string {
  return item?.notes?.match(URL_RE)?.[0] ?? "";
}

type Draft = { title: string; emoji: string; timeOfDay: TimeOfDay; link: string; habit: boolean };

function Sheet({ item, onClose, onSave, onDelete }: {
  item: ChecklistItem | null;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<Draft>({
    title: item?.title ?? "", emoji: item?.emoji ?? "", timeOfDay: item?.timeOfDay ?? "anytime",
    link: linkOf(item), habit: item?.kind === "habit",
  });
  const builtIn = item?.routineKey !== null && item?.routineKey !== undefined;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const save = () => { if (d.title.trim()) { onSave({ ...d, title: d.title.trim(), link: d.link.trim() }); onClose(); } };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label={item ? "Edit item" : "New item"} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "14px 18px calc(env(safe-area-inset-bottom) + 14px)", display: "grid", gap: 14, maxWidth: 560, margin: "0 auto", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{item ? "Edit" : "New item"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10 }}>
          <input className="cc-input" value={d.emoji} onChange={(e) => set({ emoji: [...e.target.value].slice(-1).join("") })} placeholder="🙂" aria-label="Emoji" style={{ fontSize: 22, textAlign: "center", minHeight: 48, padding: 0 }} />
          <input className="cc-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="What do you do?" autoFocus={!item} onKeyDown={(e) => e.key === "Enter" && save()} style={{ fontSize: 17, minHeight: 48 }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => set({ emoji: e })} aria-label={e} style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20, border: `1px solid ${d.emoji === e ? "var(--violet)" : "var(--line)"}`, background: d.emoji === e ? "var(--accent-soft)" : "var(--fill-1)", cursor: "pointer" }}>{e}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {TIMES.map((t) => {
            const on = d.timeOfDay === t.key;
            return (
              <button key={t.key} onClick={() => set({ timeOfDay: t.key })} style={{ minHeight: 46, borderRadius: 12, font: "inherit", fontSize: 15, cursor: "pointer", border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)" }}>
                {t.label}
              </button>
            );
          })}
        </div>

        <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Link (optional — a video, a page; opens with one tap on Today)
          <input className="cc-input" type="url" inputMode="url" value={d.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" style={{ fontSize: 17, minHeight: 46 }} />
        </label>

        {item && !builtIn && (
          <button onClick={() => set({ habit: !d.habit })} role="switch" aria-checked={d.habit} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, padding: "0 2px", background: "transparent", border: "none", color: "var(--ink)", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span>
              <span style={{ display: "block", fontSize: 16 }}>Habit I&rsquo;m building</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>Own streak · not counted in the day until you switch this off</span>
            </span>
            <span aria-hidden style={{ width: 44, height: 26, borderRadius: 99, position: "relative", flexShrink: 0, background: d.habit ? "var(--violet)" : "var(--fill-3)", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 3, left: d.habit ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left .15s" }} />
            </span>
          </button>
        )}
        {item && builtIn && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Part of the built-in routine — you can rename it or move it, not delete it.</div>}

        <div style={{ display: "grid", gridTemplateColumns: item && !builtIn ? "1fr auto" : "1fr", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={save} disabled={!d.title.trim()} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{item ? "Save" : "Add"}</button>
          {item && !builtIn && <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Delete “${item.title}”?`)) { onDelete(); onClose(); } }} style={{ minHeight: 50, minWidth: 50, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Delete">✕</button>}
        </div>
      </div>
    </>
  );
}

export default function ChecklistPage() {
  const { data, loading, setData, refresh } = useCached<ChecklistData>("checklist", () => fetchJson<ChecklistData>("/api/checklist"));
  useEffect(() => { ensureMigrate(); }, []);
  const [sheet, setSheet] = useState<{ open: boolean; item: ChecklistItem | null }>({ open: false, item: null });

  const items = useMemo(() => (data?.items ?? []).filter((i) => i.source !== "workout"), [data]);
  const groups = TIMES.map((t) => ({ ...t, items: items.filter((i) => i.timeOfDay === t.key) })).filter((g) => g.items.length > 0);

  const save = async (d: Draft) => {
    const body = { title: d.title, emoji: d.emoji || null, timeOfDay: d.timeOfDay, notes: d.link || null, kind: d.habit ? "habit" : undefined as ItemKind | undefined };
    if (sheet.item) {
      const id = sheet.item.id;
      const wasHabit = sheet.item.kind === "habit";
      const kind: ItemKind | undefined = sheet.item.routineKey ? undefined : d.habit ? "habit" : wasHabit ? "routine" : undefined;
      setData((prev) => prev ? { ...prev, items: prev.items.map((i) => i.id === id ? { ...i, title: d.title, emoji: d.emoji || null, timeOfDay: d.timeOfDay, notes: d.link || null, kind: kind ?? i.kind } : i) } : prev!);
      try { await sendOrQueue({ url: `/api/checklist/${id}`, method: "PATCH", body: { ...body, kind }, dedupeKey: `item:${id}` }); } catch { /* refresh shows truth */ }
    } else {
      try { const ok = await sendOrQueue({ url: "/api/checklist", method: "POST", body: { ...body, kind: "manual" } }); if (ok) refresh(); } catch { /* ignore */ }
    }
    refresh();
  };
  const remove = async () => {
    if (!sheet.item) return;
    const id = sheet.item.id;
    setData((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev!);
    try { await sendOrQueue({ url: `/api/checklist/${id}`, method: "DELETE", dedupeKey: `item:${id}:delete` }); } catch { /* ignore */ }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Edit list</h1>
          <div className="sub">{items.length} items · tap one to change it</div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => setSheet({ open: true, item: null })} style={{ minHeight: 44, borderRadius: 12 }}>+ Add</button>
      </div>

      {loading && !data && <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div>}

      {groups.map((g) => (
        <section key={g.key} className="cc-card">
          <div className="cc-card-head"><span className="title">{g.label}</span><span className="tail">{g.hint}</span></div>
          <div style={{ padding: "0 14px" }}>
            {g.items.map((i, idx) => {
              const link = linkOf(i);
              return (
                <button key={i.id} onClick={() => setSheet({ open: true, item: i })} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "center", width: "100%", minHeight: 54, padding: "8px 2px", background: "transparent", border: "none", borderBottom: idx < g.items.length - 1 ? "1px solid var(--line)" : "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ fontSize: 22, textAlign: "center" }}>{i.emoji ?? "•"}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17 }}>{i.title}</span>
                    <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {i.kind === "habit" ? "habit I'm building" : i.routineKey ? "routine" : "daily"}{link ? ` · ${link.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0]} link` : ""}
                    </span>
                  </span>
                  <span style={{ color: "var(--ink-4)" }}>›</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>

      {sheet.open && <Sheet item={sheet.item} onClose={() => setSheet({ open: false, item: null })} onSave={save} onDelete={remove} />}
    </div>
  );
}
