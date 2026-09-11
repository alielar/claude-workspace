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

/** Sunset→sunrise (20:00–07:00, Ali's clock): the app is always in NIGHT mode. */
function inSunsetWindow(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 20 || h < 7;
}

/** Recompute the <html data-theme> attribute from the stored choice + the clock.
 * During the sunset window the app is always Night (warm, low blue light) —
 * whatever was chosen; the daytime choice (Light/Dark/Automatic) rules the day. */
export function refreshThemeAttr() {
  const root = document.documentElement;
  const choice = readTheme();
  if (inSunsetWindow()) {
    root.setAttribute("data-theme", "night");
    return;
  }
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
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
