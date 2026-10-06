"use client";

/**
 * One Knowledge entry, laid out by its shape · the SAME view on the full page (`/todo/entry/<id>`,
 * the phone) and inside the laptop's detail pane on /knowledge (REDESIGN 2026-10-06).
 *
 *   DOCUMENT  · a page: big title, the date, the text set as reading matter (headings, bullets,
 *               numbers, tick lines, links, paragraphs), 17 px on a comfortable measure.
 *   CHECKLIST · the progress line, big tick rows (a ticked line stays, struck through), an add box.
 *   LIST      · numbered rows with an add box · reorder and remove in Edit.
 *   LINK      · the source as a hero (label, address, one big Open), the notes under it.
 * The shape is LOCKED once the entry exists. Edit opens the Knowledge sheet (the caller owns it).
 */

import { useMemo, useState } from "react";
import { Linkify } from "@/components/Linkify";
import { Icon } from "@/components/Icon";
import { docFormat, fmtDue, linkOf, linkSource, parseSubtasks, serializeSubtasks, type Todo } from "@/lib/todo/types";
import { SubtaskEditor } from "../notes";

export const SHAPE_LABEL: Record<string, string> = { doc: "Document", checklist: "Checklist", list: "List", link: "Link" };

/** Light markdown → blocks, for reading (not editing): # headings, - bullets, 1. numbers, - [ ] ticks, paragraphs. */
type Block = { kind: "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "tick"; text?: string; items?: { text: string; done?: boolean }[] };
function toBlocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: "p", text: para.join(" ") }); para = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flush(); continue; }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) { flush(); out.push({ kind: h[1].length === 1 ? "h1" : h[1].length === 2 ? "h2" : "h3", text: h[2] }); continue; }
    const tick = line.match(/^\s*- \[([ xX])\] (.*)$/);
    if (tick) { flush(); const last = out.at(-1); const item = { text: tick[2], done: tick[1] !== " " }; if (last?.kind === "tick") last.items!.push(item); else out.push({ kind: "tick", items: [item] }); continue; }
    const ul = line.match(/^\s*[-•] (.*)$/);
    if (ul) { flush(); const last = out.at(-1); if (last?.kind === "ul") last.items!.push({ text: ul[1] }); else out.push({ kind: "ul", items: [{ text: ul[1] }] }); continue; }
    const ol = line.match(/^\s*\d+[.)] (.*)$/);
    if (ol) { flush(); const last = out.at(-1); if (last?.kind === "ol") last.items!.push({ text: ol[1] }); else out.push({ kind: "ol", items: [{ text: ol[1] }] }); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

export function Reading({ text }: { text: string }) {
  const blocks = useMemo(() => toBlocks(text), [text]);
  const p: React.CSSProperties = { margin: 0, fontSize: 17, lineHeight: 1.65, color: "var(--ink)", overflowWrap: "anywhere" };
  return (
    <div className="kn-doc" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      {blocks.map((b, i) => {
        if (b.kind === "h1") return <h2 key={i} style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, margin: "10px 0 0" }}>{b.text}</h2>;
        if (b.kind === "h2") return <h3 key={i} style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.3, margin: "8px 0 0" }}>{b.text}</h3>;
        if (b.kind === "h3") return <h4 key={i} style={{ fontSize: 17, fontWeight: 650, lineHeight: 1.35, margin: "6px 0 0", color: "var(--ink-2)" }}>{b.text}</h4>;
        if (b.kind === "p") return <p key={i} style={p}><Linkify text={b.text!} /></p>;
        if (b.kind === "ul") return <ul key={i} style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>{b.items!.map((it, j) => <li key={j} style={{ ...p, lineHeight: 1.55 }}><Linkify text={it.text} /></li>)}</ul>;
        if (b.kind === "ol") return <ol key={i} style={{ margin: 0, paddingLeft: 24, display: "grid", gap: 6 }}>{b.items!.map((it, j) => <li key={j} style={{ ...p, lineHeight: 1.55 }}><Linkify text={it.text} /></li>)}</ol>;
        return (
          <div key={i} style={{ display: "grid", gap: 6 }}>
            {b.items!.map((it, j) => (
              <div key={j} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 8, alignItems: "start" }}>
                <span aria-hidden style={{ width: 20, height: 20, marginTop: 4, borderRadius: 7, border: `2px solid ${it.done ? "transparent" : "var(--line-strong)"}`, background: it.done ? "var(--pos)" : "var(--fill-1)", display: "inline-grid", placeItems: "center" }}>
                  {it.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span style={{ ...p, lineHeight: 1.55, color: it.done ? "var(--ink-3)" : "var(--ink)", textDecoration: it.done ? "line-through" : "none" }}><Linkify text={it.text} /></span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The add box at the foot of a list. */
export function AddItem({ onAdd }: { onAdd: (text: string) => void }) {
  const [v, setV] = useState("");
  const add = () => { const text = v.trim(); if (!text) return; onAdd(text); setV(""); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 10 }}>
      <input className="cc-input" value={v} onChange={(e) => setV(e.target.value)} enterKeyHint="done" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add an item" style={{ fontSize: 16, minHeight: 46, borderRadius: 12 }} />
      <button type="button" onClick={add} disabled={!v.trim()} className="cc-btn cc-btn-secondary" style={{ minHeight: 46, minWidth: 46, borderRadius: 12, fontSize: 18, padding: 0 }} aria-label="Add item">+</button>
    </div>
  );
}

export function EntryView({ t, today, onSave, onEdit, onClose, closeKind = "back" }: {
  t: Todo; today: string;
  onSave: (t: Todo) => void; onEdit: () => void;
  /** "back" = the full page (a ← button); "pane" = inside the laptop pane, which has its own close. */
  onClose: () => void; closeKind?: "back" | "pane";
}) {
  const fmt = docFormat(t);
  const url = fmt === "link" ? linkOf(t) : null;
  const items = parseSubtasks(t.notes);
  const addListItem = (text: string) => onSave({ ...t, notes: (serializeSubtasks([...items, { text, done: false }]) ?? "").replace(/^- \[ \] /gm, "- ") });
  const pills = [
    t.priority > 0 ? "Pinned" : null,
    t.dueDate ? `Reminder ${fmtDue(t.dueDate, today)}${t.dueTime ? ` ${t.dueTime}` : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="kn-page" style={{ display: "grid", gap: 18, maxWidth: 640, paddingBottom: closeKind === "back" ? 40 : 8, alignContent: "start" }}>
      {/* Top bar · back or close, the shape, Edit */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {closeKind === "back" && (
          <button type="button" onClick={onClose} className="cc-btn cc-btn-ghost" aria-label="Back" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12, fontSize: 18 }}>←</button>
        )}
        <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)" }}>
          <Icon name={fmt} size={15} />{SHAPE_LABEL[fmt]}
        </span>
        <button type="button" onClick={onEdit} className="cc-btn cc-btn-secondary" style={{ minHeight: 40, padding: "0 14px", borderRadius: 10, fontSize: 15 }}>Edit</button>
      </div>

      {/* Title block */}
      <div style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: fmt === "doc" ? 30 : 26, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, overflowWrap: "anywhere", margin: 0 }}>{t.title}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 13.5, color: "var(--ink-3)" }}>
          <span>{fmtDate(t.updatedAt)}</span>
          {fmt === "checklist" && items.length > 0 && <span>· {items.filter((i) => !i.done).length} open</span>}
          {fmt === "list" && items.length > 0 && <span>· {items.length} item{items.length === 1 ? "" : "s"}</span>}
          {pills.map((p) => <span key={p} className="cc-pill" style={{ fontSize: 12.5, padding: "2px 8px" }}>{p}</span>)}
        </div>
      </div>

      {/* The shape's layout */}
      {fmt === "link" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="cc-card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--violet)" }}>{url ? linkSource(url) : "no address yet"}</span>
            {url && <span style={{ fontSize: 14, color: "var(--ink-3)", overflowWrap: "anywhere" }}>{url.replace(/^https?:\/\/(www\.)?/, "")}</span>}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-primary" style={{ minHeight: 54, borderRadius: 14, fontSize: 17, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Open · {linkSource(url)} ↗
              </a>
            )}
          </div>
          {(t.notes ?? "").trim() !== (url ?? "") && t.notes && <Reading text={(t.notes ?? "").replace(url ?? "", "").trim()} />}
        </div>
      )}

      {fmt === "doc" && (
        t.notes?.trim()
          ? <Reading text={t.notes} />
          : <button type="button" onClick={onEdit} style={{ background: "transparent", border: "none", font: "inherit", color: "var(--ink-4)", fontSize: 16, textAlign: "left", padding: "10px 0", cursor: "pointer" }}>Empty · tap to write</button>
      )}

      {fmt === "checklist" && (
        <div className="cc-card" style={{ padding: "6px 14px 12px" }}>
          <SubtaskEditor notes={t.notes ?? null} onChange={(v) => onSave({ ...t, notes: v })} placeholder="Add an item" ordered />
        </div>
      )}

      {fmt === "list" && (
        <div className="cc-card" style={{ padding: "4px 14px 12px" }}>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid" }}>
            {items.map((it, i) => (
              <li key={`${i}-${it.text}`} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 8, alignItems: "start", minHeight: 48, padding: "10px 0", borderBottom: i < items.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--ink-4)", paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 17, lineHeight: 1.5, overflowWrap: "anywhere" }}><Linkify text={it.text} /></span>
              </li>
            ))}
          </ol>
          <AddItem onAdd={addListItem} />
        </div>
      )}
    </div>
  );
}
