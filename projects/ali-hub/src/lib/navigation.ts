/**
 * Navigation · single source of truth for the tab bar (phone) and sidebar (desktop).
 *
 * FOUR tabs on the phone (Ali 2026-10-03 "seven is too many" · 2026-10-04 R2-D2 moved into the
 * picker): Today · To-do · Other · Settings. "Other" is not a page: it opens a small picker with
 * News, Train, Health and R2-D2 (`OTHER`, in that order · R2-D2 last, "just below Health"). The
 * desktop rail has room, so it lists the four in place of the picker.
 *
 * Archived modules (old gym workouts, library/notes, word bank, mood, sleep,
 * journal) are deliberately NOT here. They are reachable from /archive.
 * To restore one: add a line to OTHER below. That is the whole restore step.
 */

export type IconKey = "today" | "news" | "settings" | "train" | "todo" | "r2d2" | "health" | "other";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  match?: string[]; // extra route prefixes that mark this item active
  /** One quiet line under the label inside the Other picker. */
  hint?: string;
};

/** The sections behind the "Other" tab, in this order. */
export const OTHER: NavItem[] = [
  { href: "/news",   label: "News",   icon: "news",   match: ["/news", "/podcast"], hint: "Daily picks · watch later · football" },
  { href: "/train",  label: "Train",  icon: "train",  hint: "Body · Mind" },
  { href: "/health", label: "Health", icon: "health", hint: "Today's checkup" },
  { href: "/r2d2",   label: "R2-D2",  icon: "r2d2",   match: ["/r2d2", "/alai", "/fix"], hint: "Ask for a change · shipped by the Mac" },
];

/** The phone's tab bar. "Other" carries no page of its own: its href is the first section inside it. */
export const NAV: NavItem[] = [
  { href: "/today",    label: "Today",    icon: "today",    match: ["/today", "/checklist", "/stretch", "/breathe", "/books"] },
  { href: "/todo",     label: "To-do",    icon: "todo",     match: ["/todo", "/vault", "/birthdays"] },
  { href: "/news",     label: "Other",    icon: "other",    match: OTHER.flatMap((o) => o.match ?? [o.href]) },
  { href: "/settings", label: "Settings", icon: "settings", match: ["/settings", "/archive"] },
];

export const OTHER_TAB_HREF = "/news";

/** The desktop rail: the same order, with the Other picker unfolded. */
export const RAIL: NavItem[] = NAV.flatMap((n) => (n.label === "Other" ? OTHER : [n]));

/** Whether a nav item is active for the current pathname. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The Other section the current path belongs to, if any. */
export function otherSection(pathname: string): NavItem | null {
  return OTHER.find((o) => isNavActive(o, pathname)) ?? null;
}
