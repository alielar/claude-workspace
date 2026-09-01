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

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* ignore */ }
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
