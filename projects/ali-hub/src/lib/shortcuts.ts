/**
 * Keyboard shortcuts (REDESIGN 2026-10-06/07 · Ali: "think of the most useful ones, list them all
 * in Settings with what they are for"). Single letters, Gmail-style, so they work in a browser tab
 * AND in the installed app (⌘1…⌘9 are the browser's own tab keys and never reach a page · the ⌘
 * numbers below only work in the installed window). Nothing fires while typing in a box, while a
 * sheet is open, or on the phone (no keys arrive). The global ones run in `CommandBar`; the page
 * ones in their page. This file is the one list: the handler and the Settings card both read it.
 */

import { ALL, type NavItem } from "@/lib/navigation";

export type Shortcut = { keys: string[]; label: string; goal: string };
export type ShortcutGroup = { title: string; where: string; items: Shortcut[] };

/** `g` then this letter jumps to the section (Gmail's "go to"). */
export const GO_KEYS: { key: string; item: NavItem }[] = [
  { key: "t", item: ALL[0] }, // Today
  { key: "d", item: ALL[1] }, // To-do
  { key: "k", item: ALL[2] }, // Knowledge
  { key: "r", item: ALL[3] }, // Train
  { key: "h", item: ALL[4] }, // Health
  { key: "n", item: ALL[5] }, // News
  { key: "2", item: ALL[6] }, // R2-D2
  { key: "s", item: ALL[7] }, // Settings
];

/** One letter starts something, from any screen. */
export const START_KEYS: { key: string; href: string; label: string; goal: string }[] = [
  { key: "b", href: "/breathe", label: "Breathe", goal: "the breathing session, picker first" },
  { key: "m", href: "/stretch", label: "Mobility", goal: "today's mobility session, ready to start" },
  { key: "f", href: "/train/kb1", label: "Functional", goal: "the kettlebell clock, ready to start" },
  { key: "p", href: "/podcast", label: "Podcast", goal: "this week's episode" },
  { key: "e", href: "/checklist", label: "Routine", goal: "edit the routine and the morning clock" },
  { key: "w", href: "/train/report", label: "Your week", goal: "the coach's report for the week" },
];

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Anywhere", where: "every screen",
    items: [
      { keys: ["c"], label: "New to-do", goal: "type the line, Return saves it, the day and hour are read from the words · Tab flips Personal and Work · Shift+Return opens the subtasks box, one a line, ⌘Return saves" },
      { keys: ["/"], label: "Search or jump", goal: "to-dos, Knowledge, the sections" },
      { keys: ["⌘", "K"], label: "The same box", goal: "also works while typing in a field" },
      { keys: ["g", "t"], label: "Go to Today", goal: "g then a letter: t Today · d To-do · k Knowledge · r Train · h Health · n News · 2 R2-D2 · s Settings" },
      ...START_KEYS.map((s) => ({ keys: [s.key], label: `Start ${s.label}`, goal: s.goal })),
      { keys: ["["], label: "Fold the sidebar", goal: "icons only · the same key opens it again" },
      { keys: ["?"], label: "This list", goal: "" },
      { keys: ["esc"], label: "Close", goal: "the pane, the box, the cursor" },
    ],
  },
  {
    title: "To-do", where: "on the To-do page",
    items: [
      { keys: ["n"], label: "New task", goal: "jumps to the add box" },
      { keys: ["j", "k"], label: "Move down, up", goal: "the cursor walks the open groups" },
      { keys: ["⏎"], label: "Open", goal: "the task under the cursor, in the pane" },
      { keys: ["space"], label: "Tick", goal: "done, with the chime" },
      { keys: ["t"], label: "Tomorrow", goal: "moves a task due today to tomorrow" },
    ],
  },
  {
    title: "Knowledge", where: "on the Knowledge page",
    items: [
      { keys: ["/"], label: "Search", goal: "titles, text and the hidden words" },
      { keys: ["n"], label: "New entry", goal: "jumps to the add box" },
      { keys: ["j", "k"], label: "Move down, up", goal: "the cursor walks the entries; with the pane open it follows" },
      { keys: ["⏎"], label: "Open", goal: "in the pane" },
    ],
  },
  {
    title: "In a pane", where: "a task or an entry open on the laptop",
    items: [
      { keys: ["⤢"], label: "Wider", goal: "the button in the pane's corner; remembered" },
      { keys: ["esc"], label: "Close", goal: "saves what was typed" },
    ],
  },
  {
    title: "The installed app", where: "only in the app's own window (a browser tab keeps these for its tabs)",
    items: [
      { keys: ["⌘", "1…8"], label: "Jump to a section", goal: "in sidebar order" },
    ],
  },
];

/** True while a key press should be left alone: typing, a sheet open, the command bar open. */
export function keysBusy(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  // The command bar's own box, while the bar is closed, is not "typing" (it is invisible and may still hold the focus).
  if (el?.closest("input, textarea, select, [contenteditable]") && !el.closest(".cc-pal:not(.open)")) return true;
  if (document.querySelector('.cc-sheet-panel, .cc-pal.open, [role="dialog"]:not(.cc-pal)')) return true;
  return false;
}
