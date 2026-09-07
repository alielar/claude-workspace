"use client";

/**
 * Reminder health watch (2026-09-07). On devices where reminders were turned on,
 * checks on open / return to foreground (at most hourly): permission still granted,
 * subscription still exists, server still knows it. What can be repaired quietly is
 * repaired (re-subscribe while permission is granted); what needs Ali shows a banner.
 * iOS revokes web push under various conditions · this detects the failure, it
 * cannot prevent it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkPushHealth } from "@/lib/push/client";

const CHECK_EVERY_MS = 60 * 60 * 1000;      // hourly is plenty
const SNOOZE_MS = 24 * 60 * 60 * 1000;      // dismissed banner stays away a day

export function PushHealth() {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      try {
        if (Number(localStorage.getItem("cc-push-checked") ?? 0) > Date.now() - CHECK_EVERY_MS) return;
        localStorage.setItem("cc-push-checked", String(Date.now()));
      } catch { /* check anyway */ }
      const r = await checkPushHealth();
      if (stopped || r !== "broken") return;
      try { if (Number(localStorage.getItem("cc-push-snooze") ?? 0) > Date.now()) return; } catch { /* show */ }
      setBroken(true);
    };
    run();
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!broken) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 90,
      padding: "calc(env(safe-area-inset-top) + 8px) 12px 8px",
      background: "var(--bg-chrome)", borderBottom: "1px solid var(--warn)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span aria-hidden style={{ fontSize: 16 }}>🔕</span>
      <Link href="/settings" onClick={() => setBroken(false)} style={{ flex: 1, fontSize: 14.5, lineHeight: 1.35, color: "var(--ink)", textDecoration: "none" }}>
        Reminders stopped working on this phone · <span style={{ color: "var(--warn)", fontWeight: 600 }}>fix in Settings</span>
      </Link>
      <button
        onClick={() => {
          setBroken(false);
          try { localStorage.setItem("cc-push-snooze", String(Date.now() + SNOOZE_MS)); } catch { /* ignore */ }
        }}
        aria-label="Dismiss"
        style={{ minWidth: 40, minHeight: 40, border: "none", background: "transparent", color: "var(--ink-3)", fontSize: 16, cursor: "pointer" }}
      >✕</button>
    </div>
  );
}
