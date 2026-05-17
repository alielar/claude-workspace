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
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", color: "#B388FF" },
  { href: "/workouts",  label: "Workouts",  icon: "workouts",  color: "#FF8A8A" },
  { href: "/news",      label: "News",      icon: "news",      color: "#7EE7FF" },
  { href: "/checklist", label: "Checklist", icon: "checklist", color: "#6FD49A" },
  { href: "/wordbank",  label: "Words",     icon: "words",     color: "#B388FF" },
  { href: "/library",   label: "Library",   icon: "library",   color: "#7EE7FF" },
  { href: "/mood",      label: "Mood",      icon: "mood",      color: "#FFC15C" },
  { href: "/sleep",     label: "Sleep",     icon: "sleep",     color: "#818CF8" },
  { href: "/finance",   label: "Finance",   icon: "finance",   color: "#6FD49A" },
  { href: "/journal",   label: "Journal",   icon: "journal",   color: "#FB923C" },
];

// Primary 5 for mobile bottom bar
export const NAV_PRIMARY = NAV.slice(0, 5);
// Remaining for "More" sheet
export const NAV_MORE    = NAV.slice(5);
