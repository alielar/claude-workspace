"use client";

/**
 * MobileNav — fixed bottom tab bar, phone only (hidden ≥768px via CSS).
 * Plain CSS, no animation library. Every tab is a ≥48px tap target.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV, isNavActive } from "@/lib/navigation";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="cc-mobile-nav" aria-label="Main navigation">
      {NAV.map((item) => {
        const active = isNavActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`cc-mobile-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="cc-mobile-tab-icon">
              <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
            </span>
            <span className="cc-mobile-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
