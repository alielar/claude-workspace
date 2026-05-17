"use client";

/**
 * TopNav — fixed horizontal navigation bar.
 *
 * Structure:
 *   [CC logo] [module tabs — scrollable] [⌘K button] [avatar]
 *
 * - Visible on all screen sizes (desktop full labels, mobile icons only).
 * - Active tab highlighted with module accent colour.
 * - ⌘K button triggers CommandPalette (calls onSearch prop).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Search, Settings } from "lucide-react";
import { Icon } from "@/components/Icon";
import { NAV } from "@/lib/navigation";

interface TopNavProps {
  onSearch?: () => void;
}

export function TopNav({ onSearch }: TopNavProps) {
  const pathname  = usePathname();
  const { data: session } = useSession();

  return (
    <header className="cc-topnav">
      {/* ── Logo ── */}
      <Link href="/dashboard" className="cc-logo" aria-label="Control Center home">
        <span className="cc-logo-mark">CC</span>
        <span className="cc-logo-text">Control Center</span>
      </Link>

      {/* ── Module tabs ── */}
      <nav className="cc-nav-tabs" aria-label="Main navigation">
        {NAV.map(({ href, label, icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`cc-nav-tab${active ? " active" : ""}`}
              style={active ? ({ "--tab-color": color } as React.CSSProperties) : undefined}
              title={label}
            >
              <Icon name={icon} size={15} strokeWidth={active ? 2.2 : 1.8} />
              <span className="cc-nav-tab-label">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Right actions ── */}
      <div className="cc-nav-actions">
        {/* ⌘K search */}
        <button
          className="cc-icon-btn"
          onClick={onSearch}
          title="Search (⌘K)"
          aria-label="Open command palette"
        >
          <Search size={15} strokeWidth={1.8} />
          <kbd className="cc-kbd hidden md:flex">⌘K</kbd>
        </button>

        {/* Settings */}
        <Link href="/settings" className="cc-icon-btn" title="Settings">
          <Settings size={15} strokeWidth={1.8} />
        </Link>

        {/* Avatar / sign out */}
        <button
          className="cc-avatar"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          aria-label="Sign out"
        >
          {session?.user?.name?.[0]?.toUpperCase() ?? "A"}
        </button>
      </div>
    </header>
  );
}
