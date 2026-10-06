/**
 * AppShell · the frame around every screen.
 *
 * Phone:   content + fixed bottom tab bar (MobileNav).
 * Desktop: 56px icon sidebar + content.
 *
 * REDESIGN 2026-10-06: the command bar (⌘K, search or add anywhere, the round button on the phone)
 * rides here too. Still no animation library. Everything here ships on every page, so it stays small.
 */

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { CommandBar } from "@/components/layout/CommandBar";
import { SwRegister } from "@/components/pwa/SwRegister";
import { SyncOutbox } from "@/components/pwa/SyncOutbox";
import { ThemeSunset } from "@/components/pwa/ThemeSunset";
import { PushHealth } from "@/components/pwa/PushHealth";
import { DictationPill } from "@/components/dictation/DictationPill";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <Sidebar />
      <main className="app-main" id="main-content">
        <div className="app-content">{children}</div>
      </main>
      <MobileNav />
      <CommandBar />
      <SwRegister />
      <SyncOutbox />
      <ThemeSunset />
      <PushHealth />
      <DictationPill />
    </>
  );
}
