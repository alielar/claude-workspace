"use client";

/**
 * Sidebar · desktop only (hidden <768px via CSS). 56px icon rail, ALWAYS collapsed
 * (Ali 2026-09-27 · it used to widen to 200px on hover); the label shows as a small
 * tooltip beside the icon. Same NAV list as the phone bar; Settings, last in NAV, sits alone
 * at the BOTTOM of the rail (Ali, 2026-09-01 and again 2026-09-27: "keep it on the bottom").
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV, isNavActive } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="cc-sidebar">
      <nav className="cc-sidebar-nav" aria-label="Main navigation" style={{ flex: 1 }}>
        {NAV.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cc-sidebar-link${active ? " active" : ""}`}
              aria-label={item.label}
              title={item.label}
              style={item.icon === "settings" ? { marginTop: "auto" } : undefined}
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
