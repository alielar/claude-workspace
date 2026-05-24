"use client";

/**
 * HamburgerMenu — mobile-only top-left nav button + full-height slide-out drawer.
 * Shows all nav items with icon dots and labels.
 * Only visible below 768px (controlled by CSS class cc-hamburger-btn).
 */

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/navigation";

interface HamburgerMenuProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function HamburgerMenu({ open, onOpen, onClose }: HamburgerMenuProps) {
  const pathname = usePathname();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger button — fixed top-left, mobile only */}
      <button
        className="cc-hamburger-btn"
        onClick={onOpen}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <span className="cc-hamburger-bar" style={{ transform: open ? "rotate(45deg) translate(4px, 4px)" : "none" }} />
        <span className="cc-hamburger-bar" style={{ opacity: open ? 0 : 1 }} />
        <span className="cc-hamburger-bar" style={{ transform: open ? "rotate(-45deg) translate(4px, -4px)" : "none" }} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="cc-hamburger-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <nav
        className={`cc-hamburger-drawer${open ? " open" : ""}`}
        aria-label="Main navigation"
      >
        {/* App wordmark */}
        <div style={{
          padding: "0 20px 16px",
          borderBottom: "1px solid var(--line)",
          marginBottom: 8,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            Control Center
          </div>
        </div>

        {NAV.map(({ href, label, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`cc-hamburger-nav-link${active ? " active" : ""}`}
            >
              <span
                className="cc-hamburger-nav-dot"
                style={{ background: active ? color : "var(--ink-5)" }}
              />
              <span style={{ color: active ? color : undefined }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
