"use client";

import { useSyncExternalStore } from "react";

const Q = "(min-width: 1000px)";
const sub = (cb: () => void) => { const m = window.matchMedia(Q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

/** True on a laptop-sized window (≥ 1000 px, the two-column breakpoint) · false on the server and the phone. */
export function useLaptop(): boolean {
  return useSyncExternalStore(sub, () => window.matchMedia(Q).matches, () => false);
}
