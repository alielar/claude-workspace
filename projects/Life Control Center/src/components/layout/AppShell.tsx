"use client";

/**
 * AppShell — wraps every authenticated page.
 *
 * Desktop layout:
 *   - Fixed left sidebar, collapsible (260px expanded / 68px icon-only)
 *   - Sidebar width set as CSS variable --sidebar-w on <html>
 *   - Main content uses .app-main class which reads that CSS variable for padding
 *
 * Mobile layout:
 *   - Full-width content
 *   - Fixed bottom tab bar (5 primary items)
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Dumbbell,
  Newspaper,
  BookOpen,
  Calendar,
  Target,
  BookMarked,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, color: "var(--accent-bright)" },
  { href: "/workouts",   label: "Workouts",   icon: Dumbbell,        color: "var(--workout-color)" },
  { href: "/news",       label: "News Brief", icon: Newspaper,       color: "var(--news-color)" },
  { href: "/library",    label: "Library",    icon: BookOpen,        color: "var(--library-color)" },
  { href: "/calendar",   label: "Calendar",   icon: Calendar,        color: "var(--calendar-color)" },
  { href: "/goals",      label: "Goals",      icon: Target,          color: "var(--goals-color)" },
  { href: "/wordbank",   label: "Word Bank",  icon: BookMarked,      color: "var(--wordbank-color)" },
];

const EXPANDED_W = 260;
const COLLAPSED_W = 68;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore persisted state + mark as mounted (avoids hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  // Keep CSS variable in sync so .app-main padding tracks sidebar width
  useEffect(() => {
    if (!mounted) return;
    const w = collapsed ? COLLAPSED_W : EXPANDED_W;
    document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
  }, [collapsed, mounted]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <div className="h-full">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-30 overflow-hidden"
        style={{
          width: mounted ? sidebarW : EXPANDED_W,
          background: "var(--bg-surface)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Logo row */}
        <div
          className="flex items-center shrink-0 overflow-hidden"
          style={{
            padding: collapsed ? "24px 0" : "24px 20px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            transition: "padding 0.28s ease",
          }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              boxShadow: "0 2px 12px rgba(99,102,241,0.45)",
              color: "#fff",
              minWidth: 32,
            }}
          >
            CC
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="ml-3 overflow-hidden whitespace-nowrap"
              >
                <p className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                  Control Center
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Personal OS
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden" style={{ padding: "12px 8px" }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon, color }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} className="block mb-0.5">
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "flex items-center rounded-xl cursor-pointer select-none overflow-hidden transition-colors",
                    active ? "" : "hover:bg-white/5"
                  )}
                  style={{
                    height: 40,
                    padding: collapsed ? "0" : "0 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    gap: collapsed ? 0 : 10,
                    background: active ? `${color}14` : "transparent",
                    border: `1px solid ${active ? `${color}22` : "transparent"}`,
                    transition: "background 0.15s, border 0.15s, padding 0.28s",
                  }}
                  title={collapsed ? label : undefined}
                >
                  <Icon
                    size={17}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ color: active ? color : "var(--text-muted)", minWidth: 17 }}
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="text-[13px] font-medium whitespace-nowrap overflow-hidden"
                        style={{ color: active ? color : "var(--text-secondary)" }}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {active && !collapsed && (
                    <motion.div
                      layoutId="sidebar-dot"
                      className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Settings + Sign out + Collapse toggle */}
        <div
          className="shrink-0 overflow-hidden"
          style={{
            padding: "8px 8px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Link href="/settings" className="block mb-0.5">
            <div
              className={cn(
                "flex items-center rounded-xl h-10 cursor-pointer hover:bg-white/5 transition-colors overflow-hidden",
                pathname === "/settings" ? "bg-white/6" : ""
              )}
              style={{
                padding: collapsed ? "0" : "0 12px",
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? "center" : "flex-start",
                transition: "padding 0.28s",
              }}
              title={collapsed ? "Settings" : undefined}
            >
              <Settings size={17} strokeWidth={1.8} style={{ color: "var(--text-muted)", minWidth: 17 }} />
              {!collapsed && (
                <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                  Settings
                </span>
              )}
            </div>
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center rounded-xl h-10 cursor-pointer hover:bg-white/5 transition-colors overflow-hidden mb-2"
            style={{
              padding: collapsed ? "0" : "0 12px",
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? "center" : "flex-start",
              transition: "padding 0.28s",
            }}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={17} strokeWidth={1.8} style={{ color: "var(--text-muted)", minWidth: 17 }} />
            {!collapsed && (
              <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                Sign out
              </span>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center rounded-xl h-9 cursor-pointer transition-colors hover:bg-white/5"
            style={{
              padding: collapsed ? "0" : "0 12px",
              gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? "center" : "flex-start",
              transition: "padding 0.28s",
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft size={15} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
            ) : (
              <>
                <PanelLeftClose size={15} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
                <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  Collapse
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main content — offset via .app-main + CSS variable ───────────── */}
      <main className="app-main pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-1 py-1.5"
        style={{
          background: "rgba(13,13,20,0.98)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {NAV_ITEMS.slice(0, 5).map(({ href, label, icon: Icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl"
              style={{ minWidth: 52 }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{ background: active ? `${color}18` : "transparent" }}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2.2 : 1.8}
                  style={{ color: active ? color : "var(--text-muted)" }}
                />
              </div>
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: active ? color : "var(--text-muted)" }}
              >
                {label === "News Brief" ? "News" : label === "Word Bank" ? "Words" : label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
