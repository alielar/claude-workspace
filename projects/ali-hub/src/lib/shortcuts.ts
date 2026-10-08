/**
 * Keyboard shortcuts (REDESIGN 2026-10-06/07 · Ali: "think of the most useful ones, list them all
 * in Settings with what they are for"). Single letters, Gmail-style, so they work in a browser tab
 * AND in the installed app (⌘1…⌘9 are the browser's own tab keys and never reach a page · the ⌘
 * numbers below only work in the installed window). Nothing fires while typing in a box, while a
 * sheet is open, or on the phone (no keys arrive). The global ones run in `CommandBar`; the page
 * ones in their page. This file is the one list: the handler and the Settings card both read it.
 */


export type Shortcut = { keys: string[]; label: string; goal: string };
/** The keys Ali can change live in `src/lib/keymap.ts` (`ACTIONS`, `useBindings`). */
export type ShortcutGroup = { title: string; where: string; items: Shortcut[] };

export const SHORTCUTS: ShortcutGroup[] = [
  // The "Anywhere" group is `ACTIONS` in src/lib/keymap.ts (Ali can change those keys in Settings); these are the fixed ones around it.
  {
    title: "Anywhere", where: "every screen",
    items: [
      { keys: ["⌘", "K"], label: "The same box", goal: "also works while typing in a field" },
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
