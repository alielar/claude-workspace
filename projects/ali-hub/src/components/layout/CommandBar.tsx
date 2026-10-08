"use client";

/**
 * The command bar (REDESIGN 2026-10-06, the prototype Ali approved) · one box for the whole hub:
 *   type a to-do line ("Call Rani tomorrow at 11") → the parse is shown live, Return adds it
 *   type a word → to-dos and Knowledge entries that match (title, text, hidden search words), then
 *   the sections to jump to. ⌘K / Ctrl+K opens it anywhere, Esc closes, ↑↓ move, Return picks.
 *   ⌘1…⌘8 jump straight to a section. The phone opens it from the round button above the tab bar.
 * Everything reads the phone's cached copies; adding goes through the same outbox as the To-do page.
 */

import { toggleRail } from "@/lib/rail";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ALL, type NavItem } from "@/lib/navigation";
import { GO_KEYS, START_KEYS, keysBusy } from "@/lib/shortcuts";
import { useTodos } from "@/lib/todo/useTodos";
import { parseQuickAdd, isSleeping, type Todo } from "@/lib/todo/types";
import { checklistToday } from "@/lib/checklist/day";

type Item = { kind: "add"; title: string; parse: ReturnType<typeof parseQuickAdd> } | { kind: "todo"; t: Todo } | { kind: "know"; t: Todo } | { kind: "go"; n: NavItem };

const DAY_WORD = /\b(today|tomorrow|tonight|tmrw|weekend|next week|next month|this week|on (mon|tue|wed|thu|fri|sat|sun)|in \d+ (day|days|week|weeks|hour|hours)|at \d|\d{1,2}h\b|\d{1,2}(:\d{2})?\s?(am|pm)\b)/i;

export function CommandBar() {
  const [open, setOpen] = useState(false);
  // "add" = opened with the c key: whatever is typed becomes a to-do on Return (Ali: "create a to-do wherever I am").
  const [mode, setMode] = useState<"search" | "add">("search");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const today = checklistToday();
  const { data, add } = useTodos(today);

  const show = (pre = "", m: "search" | "add" = "search") => { setMode(m); setQ(pre); setSel(0); setOpen(true); setTimeout(() => inputRef.current?.focus(), 30); };
  const hide = () => { setOpen(false); setQ(""); setMode("search"); };
  // `g` waits one second for its letter (g t = Today, g d = To-do …).
  const goArmed = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) hide(); else show(); return; }
      if (open && e.key === "Escape") { e.preventDefault(); hide(); return; }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && /^[1-8]$/.test(e.key)) {
        const n = ALL[Number(e.key) - 1]; if (n) { e.preventDefault(); router.push(n.href); } return;
      }
      // Single letters, Gmail-style (src/lib/shortcuts.ts) · never while typing or while something is open.
      if (keysBusy(e)) return;
      const k = e.key;
      if (goArmed.current) {
        const go = GO_KEYS.find((g) => g.key === k);
        goArmed.current = null;
        if (go) { e.preventDefault(); router.push(go.item.href); return; }
      }
      if (k === "g") { goArmed.current = window.setTimeout(() => { goArmed.current = null; }, 1000); return; }
      if (k === "c") { e.preventDefault(); show("", "add"); return; }
      if (k === "/" && !document.querySelector("[data-local-search]")) { e.preventDefault(); show(); return; }
      if (k === "?") { e.preventDefault(); router.push("/settings#shortcuts"); return; }
      if (k === "[") { e.preventDefault(); toggleRail(); return; }
      const start = START_KEYS.find((s) => s.key === k);
      if (start) { e.preventDefault(); router.push(start.href); }
    };
    const onOpen = (e: Event) => { const d = (e as CustomEvent<string | { add: true }>).detail; if (d && typeof d === "object") show("", "add"); else show(typeof d === "string" ? d : ""); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("cc:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("cc:palette", onOpen); };
  }, [open, router]);
  // A route change closes it.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) { setSeen(pathname); if (open) { setOpen(false); setQ(""); } }

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const out: Item[] = [];
    const wantsAdd = mode === "add" ? ql.length > 0 : ql.length > 1 && (ql.startsWith("add ") || DAY_WORD.test(q) || ql.startsWith("+"));
    if (wantsAdd) {
      const raw = q.replace(/^(add\s+|\+\s*)/i, "");
      const parse = parseQuickAdd(raw, today);
      out.push({ kind: "add", title: parse.title || raw.trim(), parse });
    }
    const todos = (data?.todos ?? []).filter((t) => !t.deleted && !t.doneAt && !isSleeping(t, today));
    if (ql.length > 1) {
      const hit = (t: Todo) => `${t.title} ${t.notes ?? ""} ${t.keywords ?? ""}`.toLowerCase().includes(ql);
      for (const t of todos.filter((t) => t.area !== "list" && hit(t)).slice(0, 5)) out.push({ kind: "todo", t });
      for (const t of todos.filter((t) => t.area === "list" && hit(t)).slice(0, 5)) out.push({ kind: "know", t });
    }
    if (mode !== "add") for (const n of ALL.filter((n) => !ql || n.label.toLowerCase().includes(ql) || (n.hint ?? "").toLowerCase().includes(ql))) out.push({ kind: "go", n });
    if (!wantsAdd && ql.length > 1 && !out.some((i) => i.kind !== "go")) {
      const parse = parseQuickAdd(q, today);
      out.unshift({ kind: "add", title: parse.title || q.trim(), parse });
    }
    return out;
  }, [q, data, today, mode]);

  const pick = (it: Item) => {
    if (it.kind === "add") {
      const p = it.parse;
      add({ title: it.title, area: "personal", dueDate: p.dueDate ?? null, dueTime: p.dueTime ?? null, evening: p.evening ?? false });
      hide();
      return;
    }
    hide();
    if (it.kind === "go") router.push(it.n.href);
    else if (it.kind === "know") router.push(`/todo/entry/${encodeURIComponent(it.t.clientId)}`);
    else router.push(`/todo?area=${it.t.area}`);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[sel]; if (it) pick(it); }
  };

  if (!mounted) return null;
  const groups: { label: string; items: { it: Item; i: number }[] }[] = [];
  items.forEach((it, i) => {
    const label = it.kind === "add" ? "Add a to-do" : it.kind === "todo" ? "To-dos" : it.kind === "know" ? "Knowledge" : q.trim() ? "Go to" : "Jump to";
    const g = groups.find((x) => x.label === label) ?? (groups.push({ label, items: [] }), groups[groups.length - 1]);
    g.items.push({ it, i });
  });
  const addItem = items.find((i): i is Extract<Item, { kind: "add" }> => i.kind === "add");
  return createPortal(
    <>
      <div className={`cc-pal-veil${open ? " on" : ""}`} onClick={hide} aria-hidden />
      <div className={`cc-pal${open ? " open" : ""}`} role="dialog" aria-label="Search or add" aria-hidden={!open}>
        <div className="cc-pal-in">
          {mode === "add" ? <Icon name="plus" size={18} /> : <Icon name="search" size={18} />}
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} placeholder={mode === "add" ? "New to-do · Call Rani tomorrow at 11" : "Search, jump, or type a to-do…"} aria-label={mode === "add" ? "New to-do" : "Search or add"} autoCapitalize="sentences" />
          <kbd onClick={hide}>esc</kbd>
        </div>
        {addItem && (
          <div className="cc-pal-parse">
            Reads as <span className="cc-pill cc-pill-violet">{addItem.title}</span>
            {addItem.parse.dueDate && <span className="cc-pill">{addItem.parse.dueDate === today ? "Today" : addItem.parse.dueDate}</span>}
            {addItem.parse.dueTime && <span className="cc-pill">{addItem.parse.dueTime}</span>}
            {addItem.parse.evening && <span className="cc-pill">Evening</span>}
            <span className="cc-pill">Personal</span>
            <span className="cc-pal-hint">⏎ adds it</span>
          </div>
        )}
        <div className="cc-pal-res" role="listbox">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="cc-pal-grp">{g.label}</div>
              {g.items.map(({ it, i }) => (
                <button key={i} type="button" role="option" aria-selected={sel === i} className={`cc-pal-it${sel === i ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(it)}>
                  {it.kind === "add" ? <Icon name="plus" size={17} /> : it.kind === "go" ? <Icon name={it.n.icon} size={17} /> : <Icon name={it.kind === "know" ? "knowledge" : "todo"} size={17} />}
                  <span className="cc-pal-t">{it.kind === "add" ? it.title || "New to-do" : it.kind === "go" ? it.n.label : it.t.title}</span>
                  <span className="cc-pal-r">{it.kind === "add" ? (it.parse.dueDate ? (it.parse.dueDate === today ? "today" : it.parse.dueDate) + (it.parse.dueTime ? ` · ${it.parse.dueTime}` : "") : "anytime") : it.kind === "go" ? (it.n.key ? `⌘${it.n.key}` : "") : it.kind === "know" ? (it.t.format ?? "entry") : (it.t.dueDate ? (it.t.dueDate === today ? "today" : it.t.dueDate) : it.t.area)}</span>
                </button>
              ))}
            </div>
          ))}
          {!q.trim() && mode !== "add" && (
            <div>
              <div className="cc-pal-grp">Try</div>
              <button type="button" className="cc-pal-it" onClick={() => setQ("Call Rani tomorrow at 11")}><Icon name="plus" size={17} /><span className="cc-pal-t">Call Rani tomorrow at 11</span><span className="cc-pal-r">adds a to-do</span></button>
            </div>
          )}
        </div>
      </div>
      <button type="button" className="cc-kfab" aria-label="Search or add" onClick={() => show()}><Icon name="plus" size={22} strokeWidth={2.2} /></button>
    </>,
    document.body,
  );
}
