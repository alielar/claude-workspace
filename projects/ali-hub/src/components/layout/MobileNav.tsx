"use client";

/**
 * MobileNav · fixed bottom tab bar, phone only (hidden ≥768px via CSS).
 *
 * Five tabs (Ali 2026-10-03): Today · To-do · R2-D2 · Other · Settings. "Other" opens a small
 * picker above the bar with News, Train and Health; while one of those is open the tab wears
 * that section's own icon and name, so the bar always says where you are.
 *
 * Feels instant: navigation fires on touchstart (not on the click that iOS delivers later), and
 * you can keep the finger down and SLIDE across the bar · the section under the finger opens as
 * you pass it. All routes are prefetched on mount so switching is local. Plain CSS, no library.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { NAV, OTHER, OTHER_TAB_HREF, isNavActive, otherSection } from "@/lib/navigation";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const lastHref = useRef<string | null>(null);
  // The tapped tab lights up the instant the finger lands · the route change can
  // take a beat, and without this the tap felt ignored.
  const [pending, setPending] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  // A new path clears the pending light and closes the picker · adjusted during render, not in an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setPending(null); setPicker(false); }

  // Warm every tab once so a slide lands on an already-loaded screen.
  useEffect(() => {
    for (const item of NAV) router.prefetch(item.href);
    for (const item of OTHER) router.prefetch(item.href);
  }, [router]);

  const hrefAt = (clientX: number, clientY: number): string | null => {
    const nav = navRef.current;
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    if (clientY < r.top - 24) return null; // finger slid up and away · stop switching
    const links = Array.from(nav.querySelectorAll<HTMLElement>("[data-href]"));
    for (const a of links) {
      const b = a.getBoundingClientRect();
      if (clientX >= b.left && clientX < b.right) return a.dataset.href ?? null;
    }
    return null;
  };

  const go = (href: string | null) => {
    if (!href || href === lastHref.current) return;
    lastHref.current = href;
    if (href === OTHER_TAB_HREF) {
      // The Other tab opens its picker · it never navigates by itself.
      setPicker((p) => !p);
      return;
    }
    setPicker(false);
    if (href !== pathname) {
      setPending(href);
      router.push(href);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    lastHref.current = null;
    const t = e.touches[0];
    go(hrefAt(t.clientX, t.clientY));
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const h = hrefAt(t.clientX, t.clientY);
    if (h === OTHER_TAB_HREF) return; // sliding over Other must not flap the picker
    go(h);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    // We already navigated on touchstart/move · swallow the synthetic click.
    e.preventDefault();
    lastHref.current = null;
  };

  const section = otherSection(pathname);
  const pickTo = (href: string) => { setPicker(false); if (href !== pathname) { setPending(href); router.push(href); } };

  return (
    <>
      {picker && (
        <>
          <div className="cc-other-veil" onClick={() => setPicker(false)} aria-hidden />
          <div className="cc-other-picker" role="menu" aria-label="More sections">
            {OTHER.map((o) => {
              const active = isNavActive(o, pathname);
              return (
                <Link key={o.href} href={o.href} role="menuitem" className={`cc-other-row${active ? " active" : ""}`} onClick={(e) => { e.preventDefault(); pickTo(o.href); }} draggable={false}>
                  <span className="cc-other-icon"><Icon name={o.icon} size={20} strokeWidth={active ? 2.2 : 1.8} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 600 }}>{o.label}</span>
                    {o.hint && <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)", marginTop: 1 }}>{o.hint}</span>}
                  </span>
                  <span aria-hidden style={{ color: "var(--ink-4)", fontSize: 15 }}>›</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
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
          const isOther = item.href === OTHER_TAB_HREF;
          const active = pending ? (isOther ? OTHER.some((o) => o.href === pending) : pending === item.href) : (isNavActive(item, pathname) || (isOther && picker));
          const icon = isOther && section && !picker ? section.icon : item.icon;
          const label = isOther && section && !picker ? section.label : item.label;
          const inner = (
            <>
              <span className="cc-mobile-tab-icon">
                <Icon name={icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className="cc-mobile-tab-label">{label}</span>
            </>
          );
          if (isOther) {
            return (
              <button key="other" type="button" data-href={OTHER_TAB_HREF} className={`cc-mobile-tab${active ? " active" : ""}`} aria-haspopup="menu" aria-expanded={picker}
                onClick={() => setPicker((p) => !p)}>
                {inner}
              </button>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              data-href={item.href}
              className={`cc-mobile-tab${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              draggable={false}
            >
              {inner}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
