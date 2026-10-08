"use client";

/**
 * Keyboard shortcuts you can change (Ali 2026-10-08: "I pick a specific key or combo for any
 * action"). Every ACTION has a default; the chosen keys live on the device in `cc-keys`
 * ({ id: keys }) and the defaults are the fallback, so a reset is one deletion. The handler in
 * `CommandBar` and the Settings card both read `useBindings()` · the one list is `ACTIONS` here
 * and the fixed page keys stay in `src/lib/shortcuts.ts`.
 *
 * KEYS as text: a chord is modifiers + key joined by "+", lower case ("c", "shift+n",
 * "meta+shift+k"); a sequence is two chords with a space ("g t"). `chordOf(e)` turns a keydown
 * into that text; `showKeys()` turns it into what the eye reads ("⌘⇧K", "g then t").
 */

import { useSyncExternalStore } from "react";
import { ALL } from "@/lib/navigation";

export type Action = { id: string; label: string; goal: string; keys: string; run: "add" | "search" | "list" | "rail" | { href: string } };

const GO_LETTERS = ["t", "d", "k", "r", "h", "n", "2", "s"];
export const ACTIONS: Action[] = [
  { id: "add", label: "New to-do", keys: "c", run: "add", goal: "type the line, Return saves it, the day and hour are read from the words · Tab flips Personal and Work · Shift+Return opens the subtasks box, one a line, ⌘Return saves" },
  { id: "search", label: "Search or jump", keys: "/", run: "search", goal: "to-dos, Knowledge, the sections" },
  ...ALL.map((n, i) => ({ id: `go-${n.href.replace(/\W/g, "")}`, label: `Go to ${n.label}`, keys: `g ${GO_LETTERS[i]}`, run: { href: n.href }, goal: "" })),
  { id: "breathe", label: "Start Breathe", keys: "b", run: { href: "/breathe" }, goal: "the breathing session, picker first" },
  { id: "mobility", label: "Start Mobility", keys: "m", run: { href: "/stretch" }, goal: "today's mobility session, ready to start" },
  { id: "functional", label: "Start Functional", keys: "f", run: { href: "/train/kb1" }, goal: "the kettlebell clock, ready to start" },
  { id: "podcast", label: "Start Podcast", keys: "p", run: { href: "/podcast" }, goal: "this week's episode" },
  { id: "routine", label: "Start Routine", keys: "e", run: { href: "/checklist" }, goal: "edit the routine and the morning clock" },
  { id: "week", label: "Start Your week", keys: "w", run: { href: "/train/report" }, goal: "the coach's report for the week" },
  { id: "rail", label: "Fold the sidebar", keys: "[", run: "rail", goal: "icons only · the same key opens it again" },
  { id: "list", label: "This list", keys: "?", run: "list", goal: "" },
];

const KEY = "cc-keys";
const EVENT = "cc:keys";
export type Bindings = Record<string, string>;

function stored(): Bindings {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return raw && typeof raw === "object" ? raw : {}; } catch { return {}; }
}
let cache: Bindings | null = null;
/** id → keys, the defaults with the device's choices on top. */
export function bindings(): Bindings {
  if (cache) return cache;
  const s = typeof localStorage === "undefined" ? {} : stored();
  cache = Object.fromEntries(ACTIONS.map((a) => [a.id, s[a.id] ?? a.keys]));
  return cache;
}
const DEFAULTS: Bindings = Object.fromEntries(ACTIONS.map((a) => [a.id, a.keys]));
export function isDefault(id: string, b: Bindings = bindings()) { return b[id] === DEFAULTS[id]; }
export function setBinding(id: string, keys: string | null) {
  const s = stored();
  if (keys === null || keys === DEFAULTS[id]) delete s[id]; else s[id] = keys;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  cache = null;
  window.dispatchEvent(new Event(EVENT));
}
const sub = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
export function useBindings(): Bindings { return useSyncExternalStore(sub, bindings, () => DEFAULTS); }

/** The action already holding these keys, if any. */
export function takenBy(keys: string, exceptId: string, b: Bindings = bindings()): Action | null {
  const id = Object.keys(b).find((k) => k !== exceptId && b[k] === keys);
  return id ? ACTIONS.find((a) => a.id === id) ?? null : null;
}

const MOD_KEYS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock"]);
/** A keydown as chord text, or null for a bare modifier. */
export function chordOf(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.key)) return null;
  const mods = [e.metaKey && "meta", e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift"].filter(Boolean) as string[];
  let k = e.key;
  if (k === " ") k = "space"; else if (k.length === 1) k = k.toLowerCase();
  else k = k.toLowerCase(); // "enter", "escape", "tab", "arrowdown", "backspace"
  // A plain shifted character ("?" is shift+/ on most keyboards) is written as the character itself.
  if (mods.length === 1 && mods[0] === "shift" && e.key.length === 1 && !/[a-z]/i.test(e.key)) return k;
  return mods.length ? `${mods.join("+")}+${k}` : k;
}
export const hasModifier = (keys: string) => /(^|\s)(meta|ctrl|alt)\+/.test(keys);

const GLYPH: Record<string, string> = { meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", enter: "⏎", escape: "esc", space: "space", tab: "tab", backspace: "⌫", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" };
/** Keys as the eye reads them · one entry per chord ("⌘⇧K", or "g" then "t"). */
export function showKeys(keys: string): string[] {
  return keys.split(" ").map((chord) => {
    const parts = chord.split("+");
    return parts.map((p, i) => GLYPH[p] ?? (parts.length > 1 && i === parts.length - 1 && p.length === 1 ? p.toUpperCase() : p)).join("");
  });
}
