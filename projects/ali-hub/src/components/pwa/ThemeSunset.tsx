"use client";

import { useEffect } from "react";
import { refreshThemeAttr } from "@/lib/theme";

/** Re-applies the theme attribute every minute and on foreground, so Automatic's
 * 20:00 switch to Night (and the 07:00 switch back) happens live. */
export function ThemeSunset() {
  useEffect(() => {
    refreshThemeAttr();
    const iv = setInterval(refreshThemeAttr, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") refreshThemeAttr(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
