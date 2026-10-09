/**
 * Navigation · single source of truth for the phone tab bar, the laptop sidebar and the command bar.
 *
 * REDESIGN 2026-10-06 (the prototype Ali approved):
 *   Laptop sidebar · every section visible, in groups: Today · Work and life (To-do, Knowledge) ·
 *                    Body (Train, Health) · Watch (News) · The app (R2-D2, Settings). ⌘1…⌘8 jump.
 *   Phone tab bar  · Today · To-do · Train · News · More. "More" is not a page: it opens the picker
 *                    with Health, Knowledge, R2-D2 and Settings (`OTHER`); while one of those is open
 *                    the tab wears that section's icon and name.
 *
 * Knowledge is its own page since the To-do wave (2026-10-06): `/knowledge` (entries, Passwords, Birthdays);
 * the old `/todo?area=list` address forwards there. To-do is a two-way switch, Personal · Work.
 * Archived modules are deliberately NOT here · reachable from /archive; to restore one, add a line.
 */

export type IconKey = "today" | "news" | "settings" | "train" | "todo" | "r2d2" | "health" | "other" | "knowledge";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  match?: string[]; // extra route prefixes that mark this item active
  /** One quiet line under the label inside the More picker and the command bar. */
  hint?: string;
  /** ⌘ + this key jumps there on the laptop. */
  key?: string;
};

export const TODAY: NavItem = { href: "/today", label: "Today", icon: "today", key: "1", match: ["/today", "/checklist", "/stretch", "/breathe", "/books"], hint: "The day, tomorrow, the picks" };
export const TODO: NavItem = { href: "/todo", label: "To-do", icon: "todo", key: "2", hint: "Personal · Work" };
export const KNOWLEDGE: NavItem = { href: "/knowledge", label: "Knowledge", icon: "knowledge", key: "3", match: ["/knowledge", "/vault", "/birthdays", "/todo/entry"], hint: "Entries · passwords · birthdays" };
export const TRAIN: NavItem = { href: "/train", label: "Train", icon: "train", key: "4", match: ["/train"], hint: "This week · the coach · Body and Mind" };
export const HEALTH: NavItem = { href: "/health", label: "Health", icon: "health", key: "5", match: ["/health"], hint: "Today's checkup" };
export const NEWS: NavItem = { href: "/news", label: "News", icon: "news", key: "6", match: ["/news", "/podcast"], hint: "Picks · weekly brief · football" };
export const R2D2: NavItem = { href: "/r2d2", label: "R2-D2", icon: "r2d2", key: "7", match: ["/r2d2", "/alai", "/fix"], hint: "Ask for a change · shipped by the Mac" };
export const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: "settings", key: "8", match: ["/settings", "/archive"] };

/** The laptop sidebar, in groups. */
export const SIDEBAR: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [TODAY] },
  { label: "Work and life", items: [TODO, KNOWLEDGE] },
  { label: "Body", items: [TRAIN, HEALTH] },
  { label: "Watch", items: [NEWS] },
  { label: "The app", items: [R2D2, SETTINGS] },
];

/** Every section, flat, in sidebar order (the command bar's "Go to" list, ⌘1…⌘8). */
export const ALL: NavItem[] = SIDEBAR.flatMap((g) => g.items);

/** The sections behind the phone's "More" tab, in this order. */
export const OTHER: NavItem[] = [HEALTH, KNOWLEDGE, R2D2, SETTINGS];

/** The phone's tab bar. "More" carries no page of its own: its href is the first section inside it. */
export const NAV: NavItem[] = [
  TODAY,
  TODO,
  TRAIN,
  NEWS,
  { href: "/health", label: "More", icon: "other", match: OTHER.flatMap((o) => o.match ?? [o.href]) },
];

export const OTHER_TAB_HREF = "/health";

/** Kept for older imports: the flat laptop list. */
export const RAIL: NavItem[] = ALL;

/** Whether a nav item is active for the current pathname. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href.split("?")[0]];
  if (item.href === "/todo") return pathname === "/todo"; // /todo/entry/* belongs to Knowledge
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The More section the current path belongs to, if any. */
export function otherSection(pathname: string): NavItem | null {
  return OTHER.find((o) => isNavActive(o, pathname)) ?? null;
}

// ─── Per person (2026-10-09 · a second account on the hub) ───────────────────────────────────────
/**
 * The lists above are ALI's. A guest account has no Train, Health or R2-D2 (src/lib/profile/types.ts),
 * so the sidebar, the phone bar and the command bar ask `navFor(sections)` instead. With every section
 * the answer is exactly the lists above; with none the phone bar is Today · To-do · Knowledge · News ·
 * Settings and the picker never shows (`other` empty).
 */
export type NavSet = { all: NavItem[]; top: NavItem[]; bottom: NavItem[]; tabs: NavItem[]; other: NavItem[]; otherHref: string | null };

export function navFor(sections: readonly string[] | null | undefined): NavSet {
  const has = (s: string) => !sections || sections.includes(s);
  const full = !sections || (has("train") && has("health") && has("r2d2"));
  if (full) return { all: ALL, top: ALL.filter((n) => n !== R2D2 && n !== SETTINGS), bottom: [R2D2, SETTINGS], tabs: NAV, other: OTHER, otherHref: OTHER_TAB_HREF };
  const all = [TODAY, TODO, KNOWLEDGE, ...(has("train") ? [TRAIN] : []), ...(has("health") ? [HEALTH] : []), NEWS, ...(has("r2d2") ? [R2D2] : []), SETTINGS];
  const bottom = [...(has("r2d2") ? [R2D2] : []), SETTINGS];
  const top = all.filter((n) => !bottom.includes(n));
  // The phone: four sections then Settings when nothing is left for a picker, else the picker holds the rest.
  const main = [TODAY, TODO, ...(has("train") ? [TRAIN] : [KNOWLEDGE]), NEWS];
  const other = all.filter((n) => !main.includes(n) && n !== SETTINGS);
  if (other.length === 0) return { all, top, bottom, tabs: [...main, SETTINGS], other: [], otherHref: null };
  const otherAll = [...other, SETTINGS];
  const otherHref = otherAll[0].href;
  return { all, top, bottom, tabs: [...main, { href: otherHref, label: "More", icon: "other", match: otherAll.flatMap((o) => o.match ?? [o.href]) }], other: otherAll, otherHref };
}
