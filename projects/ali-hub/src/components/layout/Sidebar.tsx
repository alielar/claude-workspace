"use client";

/**
 * Sidebar · laptop only (hidden <768px via CSS). REDESIGN 2026-10-06: 224 px wide, every section
 * visible in groups (`SIDEBAR` in lib/navigation.ts), labels beside the icons, the ⌘ key of each
 * section on hover, the to-dos due today as a badge, and the "Search or add" door to the command
 * bar at the top. Settings is the last row of the last group.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SIDEBAR, isNavActive } from "@/lib/navigation";
import { useTodos } from "@/lib/todo/useTodos";
import { badgeCount } from "@/lib/todo/types";
import { checklistToday } from "@/lib/checklist/day";

export function Sidebar() {
  const pathname = usePathname();
  const today = checklistToday();
  const { data } = useTodos(today);
  const due = data ? badgeCount(data.todos, today) : 0;

  return (
    <aside className="cc-sidebar">
      <div className="cc-sidebar-brand"><span className="cc-sidebar-mark" aria-hidden />A L I</div>
      <button type="button" className="cc-sidebar-search" onClick={() => window.dispatchEvent(new CustomEvent("cc:palette"))} aria-label="Search or add · command K">
        <Icon name="search" size={16} />
        <span>Search or add…</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="cc-sidebar-nav" aria-label="Main navigation">
        {SIDEBAR.map((g, gi) => (
          <div key={gi} className="cc-sidebar-group">
            {g.label && <div className="cc-sidebar-grp">{g.label}</div>}
            {g.items.map((item) => {
              const active = isNavActive(item, pathname) && !(item.label === "To-do" && pathname.startsWith("/todo/entry"));
              const badge = item.label === "To-do" && due > 0 ? due : null;
              return (
                <Link key={item.href} href={item.href} className={`cc-sidebar-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                  <span className="cc-sidebar-icon"><Icon name={item.icon} size={18} strokeWidth={active ? 2.2 : 1.7} /></span>
                  <span className="cc-sidebar-label">{item.label}</span>
                  {badge !== null ? <span className="cc-sidebar-badge">{badge}</span> : item.key ? <kbd className="cc-sidebar-key">⌘{item.key}</kbd> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
