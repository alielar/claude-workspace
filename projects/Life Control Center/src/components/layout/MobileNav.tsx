"use client";

/**
 * MobileNav — fixed bottom navigation bar (mobile-only, hidden md+).
 *
 * Shows 5 primary modules + "More" button.
 * "More" opens a bottom sheet with the remaining modules.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, MoreHorizontal, Settings } from "lucide-react";
import { Icon } from "@/components/Icon";
import { NAV_PRIMARY, NAV_MORE } from "@/lib/navigation";

export function MobileNav() {
  const pathname  = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* ── Bottom tab bar ────────────────────────────── */}
      <nav className="cc-mobile-nav md:hidden" aria-label="Mobile navigation">
        {NAV_PRIMARY.map(({ href, label, icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="cc-mobile-tab"
              aria-current={active ? "page" : undefined}
            >
              <span
                className="cc-mobile-tab-icon"
                style={active ? { color, background: `${color}22` } : undefined}
              >
                <Icon name={icon} size={17} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span
                className="cc-mobile-tab-label"
                style={active ? { color } : undefined}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* More */}
        <button className="cc-mobile-tab" onClick={() => setMoreOpen(true)}>
          <span className="cc-mobile-tab-icon">
            <MoreHorizontal size={17} strokeWidth={1.8} />
          </span>
          <span className="cc-mobile-tab-label">More</span>
        </button>
      </nav>

      {/* ── More sheet ─────────────────────────────────── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.65)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="md:hidden cc-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              {/* Handle */}
              <div className="cc-sheet-handle-row">
                <div className="cc-sheet-handle" />
                <button onClick={() => setMoreOpen(false)} className="cc-icon-btn absolute right-4">
                  <X size={16} />
                </button>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-3 gap-3 p-4">
                {NAV_MORE.map(({ href, label, icon, color }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      className="flex flex-col items-center gap-2 py-3 rounded-2xl transition-colors"
                      style={{
                        background: active ? `${color}18` : "var(--bg-card)",
                        border: `1px solid ${active ? color + "40" : "var(--border)"}`,
                      }}
                    >
                      <Icon
                        name={icon}
                        size={22}
                        strokeWidth={1.8}
                        style={{ color: active ? color : "var(--ink-2)" }}
                      />
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: active ? color : "var(--ink-2)" }}
                      >
                        {label}
                      </span>
                    </Link>
                  );
                })}

                {/* Settings */}
                <Link
                  href="/settings"
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-2 py-3 rounded-2xl transition-colors"
                  style={{
                    background: pathname === "/settings" ? "#7C4DFF18" : "var(--bg-card)",
                    border: `1px solid ${pathname === "/settings" ? "#7C4DFF40" : "var(--border)"}`,
                  }}
                >
                  <Settings
                    size={22}
                    strokeWidth={1.8}
                    style={{ color: pathname === "/settings" ? "#7C4DFF" : "var(--ink-2)" }}
                  />
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: pathname === "/settings" ? "#7C4DFF" : "var(--ink-2)" }}
                  >
                    Settings
                  </span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
