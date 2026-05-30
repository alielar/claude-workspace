/**
 * Navigation config — single source of truth for all nav items.
 * Icon names map to keys in <Icon /> component.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;   // key in ICONS map (see Icon.tsx)
  color: string;  // module accent colour
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", color: "#7C4DFF" },
  { href: "/workouts",  label: "Workouts",  icon: "workouts",  color: "#FF8A8A" },
  // News removed from sidebar — accessible via "See all" link on the dashboard
  { href: "/checklist", label: "Checklist", icon: "checklist", color: "#6FD49A" },
  { href: "/wordbank",  label: "Words",     icon: "words",     color: "#7C4DFF" },
  { href: "/knowledge", label: "Knowledge", icon: "knowledge", color: "#FFC15C" },
  { href: "/library",   label: "Library",   icon: "library",   color: "#64FFDA" },
  { href: "/mood",      label: "Mood",      icon: "mood",      color: "#FFC15C" },
  { href: "/sleep",     label: "Sleep",     icon: "sleep",     color: "#818CF8" },
  // Finance removed — module not in use
  { href: "/journal",   label: "Journal",   icon: "journal",   color: "#FB923C" },
];

// Primary 5 for mobile bottom bar
export const NAV_PRIMARY = NAV.slice(0, 5);
// Remaining for "More" sheet
export const NAV_MORE    = NAV.slice(5);
