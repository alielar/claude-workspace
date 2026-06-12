/**
 * Navigation config — single source of truth for all nav items.
 * Icon names map to keys in <Icon /> component.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;        // key in ICONS map (see Icon.tsx)
  color: string;       // module accent colour
  match?: string[];    // route prefixes that mark this item active (defaults to [href])
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", color: "#7C4DFF" },
  { href: "/workouts",  label: "Workouts",  icon: "workouts",  color: "#FF8A8A" },
  // Mind groups Words + Knowledge + Library (each still its own page)
  { href: "/mind",      label: "Mind",      icon: "mind",      color: "#7C4DFF",
    match: ["/mind", "/wordbank", "/knowledge", "/library"] },
  // Wellbeing groups Mood + Sleep + Journal (each still its own page)
  { href: "/wellbeing", label: "Wellbeing", icon: "wellbeing", color: "#FFC15C",
    match: ["/wellbeing", "/mood", "/sleep", "/journal"] },
  // Checklist removed from sidebar — reached via the "Edit" button on the dashboard checklist card
  // News removed from sidebar — accessible via "See all" link on the dashboard
  // Finance removed — module not in use
];

// Primary 5 for mobile bottom bar
export const NAV_PRIMARY = NAV.slice(0, 5);
// Remaining for "More" sheet
export const NAV_MORE    = NAV.slice(5);

/**
 * Every reachable destination — used by the command palette (⌘K) so the
 * grouped sub-pages and the checklist stay searchable even though they
 * aren't top-level sidebar items.
 */
export const ALL_DESTINATIONS: NavItem[] = [
  ...NAV,
  { href: "/checklist", label: "Checklist", icon: "checklist", color: "#6FD49A" },
  { href: "/wordbank",  label: "Words",     icon: "words",     color: "#7C4DFF" },
  { href: "/knowledge", label: "Knowledge", icon: "knowledge", color: "#FFC15C" },
  { href: "/library",   label: "Library",   icon: "library",   color: "#64FFDA" },
  { href: "/mood",      label: "Mood",      icon: "mood",      color: "#FFC15C" },
  { href: "/sleep",     label: "Sleep",     icon: "sleep",     color: "#818CF8" },
  { href: "/journal",   label: "Journal",   icon: "journal",   color: "#FB923C" },
];

/** Whether a nav item is active for the current pathname. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
