"use client";

import { useEffect } from "react";
import { flushOutbox } from "@/lib/local/outbox";

/**
 * Replays queued writes whenever the app opens, comes back online,
 * or returns to the foreground.
 */
export function SyncOutbox() {
  useEffect(() => {
    flushOutbox();
    const onOnline = () => flushOutbox();
    const onVisible = () => { if (document.visibilityState === "visible") flushOutbox(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
