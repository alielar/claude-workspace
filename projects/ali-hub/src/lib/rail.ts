"use client";

import { useSyncExternalStore } from "react";

/**
 * The sidebar folded to a rail (Ali 2026-10-08: "I want to collapse it and only see the icons, the
 * logo stays"). Remembered in `cc-rail`, applied as `data-rail="1"` on <html> before first paint by
 * THEME_BOOT in app/layout.tsx so the page never jumps; the CSS in globals.css reads the attribute.
 */
const KEY = "cc-rail";
const EVENT = "cc:rail";

export function railOn(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-rail") === "1";
}

export function setRail(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-rail", "1"); else document.documentElement.removeAttribute("data-rail");
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleRail() { setRail(!railOn()); }

const sub = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

/** True while the sidebar is a rail · false on the server. */
export function useRail(): boolean {
  return useSyncExternalStore(sub, railOn, () => false);
}
