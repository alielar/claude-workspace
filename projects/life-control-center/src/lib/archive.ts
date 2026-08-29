/**
 * Archived modules — code and data kept, UI out of the navigation.
 *
 * Restore any of them in ONE step: add an entry to NAV in src/lib/navigation.ts
 * (the pages, API routes and database tables are all still live).
 */

export type ArchivedModule = {
  href: string;
  label: string;
  what: string;
  /** Phase of the spec where it may come back */
  comeback?: string;
};

export const ARCHIVE: ArchivedModule[] = [
  { href: "/workouts",  label: "Gym workouts",   what: "The old 4-day gym split: live logger, PRs, calendar, run log.", comeback: "On request" },
  { href: "/library",   label: "Library & notes", what: "PDF reader, reading sessions, annotations and the notes → flashcards system.", comeback: "Physical-book notes, later" },
  { href: "/knowledge", label: "Knowledge",       what: "Review drill for the notes captured while reading." },
  { href: "/wordbank",  label: "Word bank",       what: "Spaced-repetition flashcards for words. All words kept.", comeback: "Phase 7 (optional)" },
  { href: "/mood",      label: "Mood",            what: "Daily mood scores and heatmap.", comeback: "Apple Watch phase" },
  { href: "/sleep",     label: "Sleep",           what: "Sleep stages and scores from the Apple Shortcut (data still arrives silently).", comeback: "Apple Watch phase" },
  { href: "/journal",   label: "Journal",         what: "Three-question nightly journal (stored on this device only).", comeback: "Apple Watch phase" },
];
