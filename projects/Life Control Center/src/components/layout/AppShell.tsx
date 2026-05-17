"use client";

/**
 * AppShell — V2 "Ambient Futurism" layout shell.
 *
 * Replaces sidebar layout with horizontal TopNav (fixed top) + MobileNav (fixed bottom).
 *
 * Provides global state for:
 *   - CommandPalette (⌘K)
 *   - QuickCapture FAB + modal
 *
 * Session provider is wired here so TopNav can access user info.
 */

import { useState, useEffect, useCallback } from "react";
import { SessionProvider } from "next-auth/react";
import { TopNav } from "@/components/layout/TopNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { CommandPalette } from "@/components/CommandPalette";
import { QuickCapture, QuickCaptureFAB } from "@/components/QuickCapture";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab]   = useState<"word" | "mood" | "journal" | "checklist">("word");

  // ⌘K / Ctrl+K binding
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
    <SessionProvider>
      {/* Top navigation bar */}
      <TopNav onSearch={() => setPaletteOpen(true)} />

      {/* Main content */}
      <main className="app-main">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

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
    </SessionProvider>
  );
}
