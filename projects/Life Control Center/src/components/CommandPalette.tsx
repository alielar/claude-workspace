"use client";

/**
 * <CommandPalette /> — ⌘K command palette.
 *
 * Sections:
 *   1. Quick actions  — Word, Mood, Journal, Checklist capture
 *   2. Navigate       — all module links
 *   3. Recent         — placeholder (extend with actual recents later)
 *
 * Keyboard:
 *   ↑ / ↓  — move selection
 *   Enter   — activate selected item
 *   Esc     — close
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { Icon } from "@/components/Icon";
import { ALL_DESTINATIONS } from "@/lib/navigation";

type PaletteItem = {
  id: string;
  section: string;
  label: string;
  icon: string;
  color?: string;
  action: () => void;
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onQuickCapture?: (tab: string) => void;
}

export function CommandPalette({ open, onClose, onQuickCapture }: CommandPaletteProps) {
  const router  = useRouter();
  const [query, setQuery]   = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build item list
  const allItems: PaletteItem[] = [
    // Quick actions
    { id: "qc-word",      section: "Quick Capture", label: "Add Word",           icon: "words",    color: "#7C4DFF", action: () => { onQuickCapture?.("word");      onClose(); } },
    { id: "qc-mood",      section: "Quick Capture", label: "Log Mood",           icon: "mood",     color: "#FFC15C", action: () => { onQuickCapture?.("mood");      onClose(); } },
    { id: "qc-journal",   section: "Quick Capture", label: "Journal Entry",      icon: "journal",  color: "#FB923C", action: () => { onQuickCapture?.("journal");   onClose(); } },
    { id: "qc-checklist", section: "Quick Capture", label: "Add Checklist Item", icon: "checklist",color: "#6FD49A", action: () => { onQuickCapture?.("checklist"); onClose(); } },
    // Navigate
    ...ALL_DESTINATIONS.map((n) => ({
      id: `nav-${n.href}`,
      section: "Navigate",
      label: n.label,
      icon: n.icon,
      color: n.color,
      action: () => { router.push(n.href); onClose(); },
    })),
  ];

  // Filter by query
  const filtered = query.trim()
    ? allItems.filter((i) =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.section.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Group by section
  const sections = filtered.reduce<Record<string, PaletteItem[]>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  // Flat list for cursor tracking
  const flat = filtered;

  const activate = useCallback((item: PaletteItem) => {
    item.action();
    setQuery("");
    setCursor(0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && flat[cursor]) activate(flat[cursor]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flat, cursor, activate, onClose]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset cursor when query changes
  useEffect(() => { setCursor(0); }, [query]);

  let itemIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            className="cc-palette"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            {/* Search input */}
            <div className="cc-palette-input-row">
              <Search size={15} strokeWidth={1.8} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
              <input
                ref={inputRef}
                className="cc-palette-input"
                placeholder="Search or jump to…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button className="cc-icon-btn" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              )}
              <kbd className="cc-kbd">Esc</kbd>
            </div>

            {/* Results */}
            <div className="cc-palette-results">
              {Object.entries(sections).map(([section, items]) => (
                <div key={section}>
                  <p className="cc-palette-section-label">{section}</p>
                  {items.map((item) => {
                    itemIndex++;
                    const idx = itemIndex;
                    const active = cursor === idx;
                    return (
                      <button
                        key={item.id}
                        className={`cc-palette-item${active ? " active" : ""}`}
                        onClick={() => activate(item)}
                        onMouseEnter={() => setCursor(idx)}
                      >
                        <span
                          className="cc-palette-item-icon"
                          style={{ color: item.color ?? "var(--ink-2)" }}
                        >
                          <Icon name={item.icon} size={14} strokeWidth={1.8} />
                        </span>
                        <span>{item.label}</span>
                        <span className="cc-palette-item-section">{item.section}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {flat.length === 0 && (
                <p className="cc-palette-empty">No results for "{query}"</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
