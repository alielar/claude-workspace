"use client";

/**
 * Sidebar — desktop only (hidden <768px via CSS). 56px icon rail,
 * expands to show labels on hover. Same NAV list as the phone tab bar.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV, isNavActive } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="cc-sidebar">
      <nav className="cc-sidebar-nav" aria-label="Main navigation">
        {NAV.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cc-sidebar-link${active ? " active" : ""}`}
              aria-label={item.label}
            >
              <span className="cc-sidebar-icon">
                <Icon name={item.icon} size={18} strokeWidth={active ? 2.2 : 1.6} />
              </span>
              <span className="cc-sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
