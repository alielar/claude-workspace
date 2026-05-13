"use client";

/**
 * AppShell — wraps every authenticated page.
 *
 * Desktop (≥768px):
 *   - Fixed left sidebar, 64px wide (icon-only) by default.
 *   - Hover → expands to 240px as an overlay (content doesn't shift).
 *   - Pin button (📌) → locks sidebar open; content shifts right (240px).
 *   - Pin state persisted to localStorage.
 *
 * Mobile (<768px):
 *   - Fixed bottom tab bar showing 5 primary modules.
 *   - "More" tab → slides up a sheet with remaining modules.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Dumbbell, Newspaper, BookOpen,
  CheckSquare, BookMarked, SmilePlus, Moon,
  Wallet, PenLine, Settings, LogOut,
  Pin, PinOff, MoreHorizontal, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

// ─── Nav items ──────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, color: "var(--accent-primary)" },
  { href: "/workouts",   label: "Workouts",   icon: Dumbbell,        color: "var(--module-workout)" },
  { href: "/news",       label: "News Brief", icon: Newspaper,       color: "var(--module-news)" },
  { href: "/library",    label: "Library",    icon: BookOpen,        color: "var(--module-library)" },
  { href: "/checklist",  label: "Checklist",  icon: CheckSquare,     color: "var(--module-checklist)" },
  { href: "/wordbank",   label: "Word Bank",  icon: BookMarked,      color: "var(--module-wordbank)" },
  { href: "/mood",       label: "Mood",       icon: SmilePlus,       color: "var(--module-mood)" },
  { href: "/sleep",      label: "Sleep",      icon: Moon,            color: "var(--module-sleep)" },
  { href: "/finance",    label: "Finance",    icon: Wallet,          color: "var(--module-finance)" },
  { href: "/journal",    label: "Journal",    icon: PenLine,         color: "var(--module-journal)" },
];

// First 5 shown in mobile bottom bar; rest go in "More" sheet
const MOBILE_PRIMARY = PRIMARY_NAV.slice(0, 5);
const MOBILE_MORE = PRIMARY_NAV.slice(5);

const SIDEBAR_W   = 240;
const COLLAPSED_W = 64;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pinned, setPinned]   = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const hoverRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load pinned state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    if (saved === "true") setPinned(true);
    setMounted(true);
  }, []);

  // Sync --sidebar-w CSS var (only changes when pinned state changes)
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty(
      "--sidebar-w",
      `${pinned ? SIDEBAR_W : COLLAPSED_W}px`
    );
  }, [pinned, mounted]);

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-pinned", String(next));
      return next;
    });
  };

  const expanded = pinned || hovered;

  const handleMouseEnter = () => {
    clearTimeout(hoverRef.current);
    setHovered(true);
  };
  const handleMouseLeave = () => {
    hoverRef.current = setTimeout(() => setHovered(false), 80);
  };

  return (
    <div className="h-full">

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 overflow-hidden"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: mounted ? (expanded ? SIDEBAR_W : COLLAPSED_W) : COLLAPSED_W,
          background: "rgba(10,10,15,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid var(--border-subtle)",
          transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Logo + pin */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 56,
            padding: expanded ? "0 16px" : "0 0",
            justifyContent: expanded ? "space-between" : "center",
            borderBottom: "1px solid var(--border-subtle)",
            transition: "padding 0.22s ease",
          }}
        >
          {/* CC mark */}
          <div
            className="flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{
              width: 30, height: 30, minWidth: 30,
              borderRadius: 8,
              background: "var(--accent-primary)",
              color: "#fff",
              letterSpacing: "0.02em",
              boxShadow: "0 0 12px rgba(124,92,255,0.35)",
            }}
          >
            CC
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between flex-1 ml-3 overflow-hidden"
              >
                <div className="overflow-hidden">
                  <p className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                    Control Center
                  </p>
                </div>
                <button
                  onClick={togglePin}
                  className="p-1.5 rounded-md transition-colors ml-2"
                  style={{ color: pinned ? "var(--accent-bright)" : "var(--text-tertiary)" }}
                  title={pinned ? "Unpin sidebar" : "Pin sidebar"}
                >
                  {pinned
                    ? <Pin size={13} fill="currentColor" />
                    : <PinOff size={13} />
                  }
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: "8px 8px" }}>
          {PRIMARY_NAV.map(({ href, label, icon: Icon, color }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} className="block mb-0.5">
                <div
                  className={cn("nav-pill", active ? "active" : "")}
                  style={{
                    justifyContent: expanded ? "flex-start" : "center",
                    padding: expanded ? "9px 12px" : "9px 0",
                    transition: "padding 0.22s ease",
                    width: "100%",
                    // Override active color per-module
                    ...(active ? {
                      background: `${color}18`,
                      color: color,
                    } : {}),
                  }}
                  title={!expanded ? label : undefined}
                >
                  <Icon
                    size={16}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ minWidth: 16, color: active ? color : undefined }}
                  />
                  <AnimatePresence>
                    {expanded && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.16 }}
                        className="overflow-hidden whitespace-nowrap text-[13px] font-medium"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Settings + Sign out */}
        <div style={{ padding: "8px 8px 12px", borderTop: "1px solid var(--border-subtle)" }}>
          <Link href="/settings" className="block mb-0.5">
            <div
              className={cn("nav-pill", pathname === "/settings" ? "active" : "")}
              style={{
                justifyContent: expanded ? "flex-start" : "center",
                padding: expanded ? "9px 12px" : "9px 0",
                transition: "padding 0.22s ease",
                width: "100%",
              }}
              title={!expanded ? "Settings" : undefined}
            >
              <Settings size={15} strokeWidth={1.8} style={{ minWidth: 16 }} />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.16 }}
                    className="overflow-hidden whitespace-nowrap text-[13px] font-medium"
                  >
                    Settings
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="nav-pill w-full"
            style={{
              justifyContent: expanded ? "flex-start" : "center",
              padding: expanded ? "9px 12px" : "9px 0",
              color: "var(--danger)",
              transition: "padding 0.22s ease",
            }}
            title={!expanded ? "Sign out" : undefined}
          >
            <LogOut size={15} strokeWidth={1.8} style={{ minWidth: 16 }} />
            <AnimatePresence>
              {expanded && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.16 }}
                  className="overflow-hidden whitespace-nowrap text-[13px] font-medium"
                >
                  Sign out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="app-main pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-1"
        style={{
          height: 60,
          background: "rgba(10,10,15,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {MOBILE_PRIMARY.map(({ href, label, icon: Icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1"
              style={{ minWidth: 52, height: 52 }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: active ? `${color}20` : "transparent" }}
              >
                <Icon
                  size={17}
                  strokeWidth={active ? 2.2 : 1.8}
                  style={{ color: active ? color : "var(--text-tertiary)" }}
                />
              </div>
              <span
                className="text-[9px] font-medium leading-none"
                style={{ color: active ? color : "var(--text-tertiary)" }}
              >
                {label === "News Brief" ? "News" : label === "Word Bank" ? "Words" : label}
              </span>
            </Link>
          );
        })}

        {/* More tab */}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1"
          style={{ minWidth: 52, height: 52 }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center">
            <MoreHorizontal size={17} strokeWidth={1.8} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <span className="text-[9px] font-medium leading-none" style={{ color: "var(--text-tertiary)" }}>
            More
          </span>
        </button>
      </nav>

      {/* ── Mobile "More" sheet ───────────────────────────────────────────── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="md:hidden fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.6)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderBottom: "none",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              {/* Handle + header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="w-8 h-1 rounded-full mx-auto" style={{ background: "var(--border-default)" }} />
                <button onClick={() => setMoreOpen(false)} className="p-1">
                  <X size={18} style={{ color: "var(--text-tertiary)" }} />
                </button>
              </div>

              {/* Module grid */}
              <div className="grid grid-cols-3 gap-3 p-4">
                {[...MOBILE_MORE, { href: "/settings", label: "Settings", icon: Settings, color: "var(--text-secondary)" }]
                  .map(({ href, label, icon: Icon, color }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        className="flex flex-col items-center gap-2 py-3 rounded-xl"
                        style={{
                          background: active ? `${color}18` : "var(--bg-elevated-2)",
                          border: `1px solid ${active ? color + "30" : "var(--border-subtle)"}`,
                        }}
                      >
                        <Icon size={22} strokeWidth={1.8} style={{ color: active ? color : "var(--text-secondary)" }} />
                        <span className="text-[11px] font-medium" style={{ color: active ? color : "var(--text-secondary)" }}>
                          {label}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
