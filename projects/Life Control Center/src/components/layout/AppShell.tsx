"use client";

/**
 * AppShell — V2 "Ambient Futurism" layout shell.
 *
 * Desktop: 56px fixed vertical Sidebar + scrollable main content.
 * Mobile:  no sidebar — MobileNav (fixed bottom tab bar) handles navigation.
 *
 * Global state managed here:
 *   - CommandPalette (⌘K / Ctrl+K — keyboard-discovered, not advertised)
 *   - QuickCapture FAB + modal
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { CommandPalette } from "@/components/CommandPalette";
import { QuickCapture, QuickCaptureFAB } from "@/components/QuickCapture";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab]   = useState<"word" | "mood" | "journal" | "checklist">("word");

  // ⌘K / Ctrl+K — keyboard-only discovery, no visible hint in chrome
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openCapture = useCallback((tab: string) => {
    setCaptureTab(tab as "word" | "mood" | "journal" | "checklist");
    setCaptureOpen(true);
  }, []);

  return (
    <>
      {/* Skip-to-content for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Vertical icon sidebar — desktop only, always collapsed */}
      <Sidebar />

      {/* Fixed bottom tab bar — mobile only */}
      <MobileNav />

      {/* Main content — pushed right on desktop by sidebar width via .app-main CSS */}
      <main className="app-main" id="main-content">
        {/* Settings gear — top right, desktop only */}
        <Link
          href="/settings"
          aria-label="Settings"
          style={{
            position: "fixed", top: 16, right: 20, zIndex: 50,
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)",
            color: "var(--ink-3)", transition: "color 150ms, border-color 150ms",
          }}
          className="settings-gear"
        >
          <Settings size={16} strokeWidth={1.6} />
        </Link>
        <div className="app-content">
          {children}
        </div>
      </main>

      {/* ⌘K Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onQuickCapture={openCapture}
      />

      {/* Quick capture FAB (desktop only) */}
      <QuickCaptureFAB onClick={() => setCaptureOpen(true)} />

      {/* Quick capture modal */}
      <QuickCapture
        open={captureOpen}
        initialTab={captureTab}
        onClose={() => setCaptureOpen(false)}
      />
    </>
  );
}
