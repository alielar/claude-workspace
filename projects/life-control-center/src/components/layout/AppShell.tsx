/**
 * AppShell · the frame around every screen.
 *
 * Phone:   content + fixed bottom tab bar (MobileNav).
 * Desktop: 56px icon sidebar + content.
 *
 * Deliberately tiny: no command palette, no floating capture button,
 * no animation library. Everything here ships on every page, so it stays small.
 */

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { SwRegister } from "@/components/pwa/SwRegister";
import { SyncOutbox } from "@/components/pwa/SyncOutbox";
import { ThemeSunset } from "@/components/pwa/ThemeSunset";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <Sidebar />
      <main className="app-main" id="main-content">
        <div className="app-content">{children}</div>
      </main>
      <MobileNav />
      <SwRegister />
      <SyncOutbox />
      <ThemeSunset />
    </>
  );
}
