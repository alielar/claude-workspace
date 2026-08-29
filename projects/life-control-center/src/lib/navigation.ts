/**
 * Navigation — single source of truth for the tab bar (phone) and sidebar (desktop).
 *
 * Today · Train · News · Settings. Phase 5 adds To-do. Keep this list short on purpose —
 * if something needs a second thought about where it lives, the nav is wrong.
 *
 * Archived modules (old gym workouts, library/notes, word bank, mood, sleep,
 * journal) are deliberately NOT here. They are reachable from /archive.
 * To restore one: add a line to NAV below. That is the whole restore step.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: "today" | "news" | "settings" | "train" | "todo";
  match?: string[]; // extra route prefixes that mark this item active
};

export const NAV: NavItem[] = [
  { href: "/today",    label: "Today",    icon: "today",    match: ["/today", "/checklist", "/stretch", "/books"] },
  { href: "/train",    label: "Train",    icon: "train" },
  { href: "/news",     label: "News",     icon: "news" },
  { href: "/settings", label: "Settings", icon: "settings", match: ["/settings", "/archive"] },
];

/** Whether a nav item is active for the current pathname. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
