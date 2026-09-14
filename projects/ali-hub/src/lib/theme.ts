"use client";

/**
 * Theme: "system" (default) | "light" | "dark" | "night" (warm, low blue light).
 * Stored in localStorage as "cc-theme"; applied as <html data-theme="…">.
 * The root layout runs a tiny inline script that applies it before first paint.
 */

import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark" | "night";

const KEY = "cc-theme";
const EVENT = "cc:theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "night" ? v : "system";
  } catch {
    return "system";
  }
}

/** Sunset→sunrise (20:00–07:00, Ali's clock): AUTOMATIC turns to Night in this window. */
function inSunsetWindow(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 20 || h < 7;
}

/** Recompute the <html data-theme> attribute from the stored choice + the clock.
 * Automatic (the default): follows the phone by day and is Night (warm, low blue light)
 * from 20:00 to 07:00. Light / Dark / Night picked by hand hold at any hour until changed
 * (Ali 2026-09-14: "by default automatic, but I can move it whenever I want" · before this
 * the night window overrode every choice). Keep in sync with THEME_BOOT in app/layout.tsx. */
export function refreshThemeAttr() {
  const root = document.documentElement;
  const choice = readTheme();
  if (choice !== "system") { root.setAttribute("data-theme", choice); return; }
  if (inSunsetWindow()) root.setAttribute("data-theme", "night");
  else root.removeAttribute("data-theme");
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* ignore */ }
  refreshThemeAttr();
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readTheme, () => "system" as ThemeChoice);
  return [choice, applyTheme];
}
