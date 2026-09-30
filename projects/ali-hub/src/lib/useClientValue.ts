"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Read a browser-only value (window, navigator, matchMedia…) without breaking
 * hydration: the server value is used for the first paint, the real value right after.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

/**
 * The clock, once, after mount (0 on the server and on the first paint). NOT through
 * useSyncExternalStore: a snapshot that changes on every call (Date.now()) makes React
 * re-render without end · React error #185, the Health tab on 2026-09-30.
 */
export function useNow(): number {
  const [now, setNow] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is read once, after hydration
  useEffect(() => { setNow(Date.now()); }, []);
  return now;
}
