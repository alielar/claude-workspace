"use client";

/**
 * MobileNav · fixed bottom tab bar, phone only (hidden ≥768px via CSS).
 *
 * Feels instant: navigation fires on touchstart (not on the click that iOS
 * delivers ~later), and you can keep the finger down and SLIDE across the bar —
 * the section under the finger opens as you pass it. All routes are prefetched
 * on mount so switching is local. Plain CSS, no animation library.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { NAV, isNavActive } from "@/lib/navigation";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const lastHref = useRef<string | null>(null);

  // Warm every tab once so a slide lands on an already-loaded screen.
  useEffect(() => {
    for (const item of NAV) router.prefetch(item.href);
  }, [router]);

  const hrefAt = (clientX: number, clientY: number): string | null => {
    const nav = navRef.current;
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    if (clientY < r.top - 24) return null; // finger slid up and away · stop switching
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[data-href]"));
    for (const a of links) {
      const b = a.getBoundingClientRect();
      if (clientX >= b.left && clientX < b.right) return a.dataset.href ?? null;
    }
    return null;
  };

  const go = (href: string | null) => {
    if (!href || href === lastHref.current) return;
    lastHref.current = href;
    if (!isNavActive(NAV.find((n) => n.href === href)!, pathname) || href !== pathname) router.push(href);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    lastHref.current = pathname;
    const t = e.touches[0];
    go(hrefAt(t.clientX, t.clientY));
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    go(hrefAt(t.clientX, t.clientY));
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    // We already navigated on touchstart/move · swallow the synthetic click.
    e.preventDefault();
    lastHref.current = null;
  };

  return (
    <nav
      ref={navRef}
      className="cc-mobile-nav"
      aria-label="Main navigation"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => (lastHref.current = null)}
    >
      {NAV.map((item) => {
        const active = isNavActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-href={item.href}
            className={`cc-mobile-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
            draggable={false}
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
