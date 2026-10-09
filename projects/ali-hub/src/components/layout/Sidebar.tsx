"use client";

/**
 * Sidebar · laptop only (hidden <768px via CSS). REDESIGN 2026-10-06/07: 224 px wide, Ali's own mark
 * on top (the A·T·E ligature of `src/lib/appIcon.tsx`, the same as the phone's icon), the "Search or
 * add" door, then every section as a flat list · no group labels (Ali 2026-10-07) · R2-D2 and
 * Settings pinned at the bottom. The to-dos due today ride on To-do as a badge. FOLDS TO A RAIL
 * (Ali 2026-10-08): the button at the foot, or the `[` key, keeps only the mark and the icons
 * (`data-rail` on <html>, `src/lib/rail.ts`); every link then carries its name as a tooltip.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { isNavActive, type NavItem } from "@/lib/navigation";
import { useNav } from "@/lib/useNav";
import { useTodos } from "@/lib/todo/useTodos";
import { badgeCount } from "@/lib/todo/types";
import { checklistToday } from "@/lib/checklist/day";
import { useRail, toggleRail } from "@/lib/rail";

/** The app icon as the phone draws it: near-black tile, white ligature · a brand asset, so its two colours are literal on purpose. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden style={{ borderRadius: size * 0.24, flexShrink: 0 }}>
      <rect width="512" height="512" fill="#0B0B10" />
      <g stroke="#FFFFFF" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M112 140 H430" /><path d="M300 140 V404" /><path d="M292 146 L118 404" /><path d="M158 300 H424" /><path d="M300 404 H424" />
      </g>
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const today = checklistToday();
  const { data } = useTodos(today);
  const due = data ? badgeCount(data.todos, today) : 0;
  const rail = useRail();
  const { top: TOP, bottom: BOTTOM } = useNav();
  const link = (item: NavItem) => {
    const active = isNavActive(item, pathname);
    const badge = item.label === "To-do" && due > 0 ? due : null;
    return (
      <Link key={item.href} href={item.href} className={`cc-sidebar-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined} title={rail ? item.label : undefined}>
        <span className="cc-sidebar-icon"><Icon name={item.icon} size={18} strokeWidth={active ? 2.2 : 1.7} /></span>
        <span className="cc-sidebar-label">{item.label}</span>
        {badge !== null && <span className="cc-sidebar-badge">{badge}</span>}
      </Link>
    );
  };

  return (
    <aside className="cc-sidebar">
      <Link href="/today" className="cc-sidebar-brand" aria-label="A L I · Today"><Mark /><span className="cc-sidebar-label">A L I</span></Link>
      <button type="button" className="cc-sidebar-search" onClick={() => window.dispatchEvent(new CustomEvent("cc:palette"))} aria-label="Search or add · command K" title={rail ? "Search or add · ⌘K" : undefined}>
        <Icon name="search" size={16} />
        <span>Search or add…</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="cc-sidebar-nav" aria-label="Main navigation">
        <div className="cc-sidebar-group">{TOP.map(link)}</div>
        <div className="cc-sidebar-group" style={{ marginTop: "auto" }}>{BOTTOM.map(link)}</div>
      </nav>
      <button type="button" className="cc-sidebar-fold" onClick={toggleRail} aria-label={rail ? "Open the sidebar" : "Fold the sidebar"} title={rail ? "Open the sidebar · [" : "Fold the sidebar · ["} aria-expanded={!rail}>
        <Icon name={rail ? "railOpen" : "railClose"} size={17} strokeWidth={1.8} />
        <span className="cc-sidebar-label">Fold</span>
      </button>
    </aside>
  );
}
