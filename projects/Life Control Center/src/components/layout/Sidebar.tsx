"use client";

/**
 * Sidebar — collapses to 56px, expands to 200px on hover.
 *
 * Desktop only (hidden on mobile). Active module gets gradient bg + violet glow.
 * Labels fade in as the sidebar expands. No tooltip needed.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="cc-sidebar">
      {/* Module icons */}
      <nav className="cc-sidebar-nav" aria-label="Main navigation">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`cc-sidebar-link${active ? " active" : ""}`}
              aria-label={label}
            >
              <span className="cc-sidebar-icon">
                <Icon name={icon} size={18} strokeWidth={active ? 2.2 : 1.6} />
              </span>
              <span className="cc-sidebar-label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
