"use client";

/**
 * Local-first read cache.
 *
 * Every screen renders from the phone's own copy of the data first (instant,
 * works offline), then refreshes from the server in the background.
 *
 * Storage is localStorage for now: synchronous, tiny payloads, zero setup.
 * If a module ever needs more than a few hundred KB, swap the two functions
 * below for IndexedDB — nothing else changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "cc:v1:";

type Envelope<T> = { savedAt: number; data: T };

export function readCache<T>(key: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Envelope<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* storage full or unavailable — the app still works, just without offline data */
  }
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

type State<T> = {
  data: T | null;
  savedAt: number | null;
  /** true until we have either a cached copy or a server answer */
  loading: boolean;
  /** true while a background refresh is in flight */
  refreshing: boolean;
  /** true if the last refresh failed (offline or server error) */
  stale: boolean;
};

/**
 * useCached — read the local copy instantly, then fetch fresh data.
 *
 *   const { data, setData, refresh } = useCached("checklist", () => fetchJson("/api/checklist"));
 *
 * `setData` updates both the screen and the local copy (use it for optimistic edits).
 */
export function useCached<T>(key: string, fetcher: () => Promise<T | null>) {
  const [state, setState] = useState<State<T>>({
    data: null, savedAt: null, loading: true, refreshing: false, stale: false,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  const refresh = useCallback(async () => {
    if (!isOnline()) {
      setState((s) => ({ ...s, refreshing: false, stale: true, loading: false }));
      return;
    }
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const fresh = await fetcherRef.current();
      if (fresh !== null && fresh !== undefined) {
        writeCache(key, fresh);
        setState({ data: fresh, savedAt: Date.now(), loading: false, refreshing: false, stale: false });
      } else {
        setState((s) => ({ ...s, refreshing: false, loading: false }));
      }
    } catch {
      setState((s) => ({ ...s, refreshing: false, stale: true, loading: false }));
    }
  }, [key]);

  // 1) paint from the phone's copy, 2) refresh in the background.
  // The cache is read after mount on purpose: the server-rendered HTML has no
  // localStorage, so reading it during render would break hydration.
  useEffect(() => {
    const cached = readCache<T>(key);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage after mount
      setState({ data: cached.data, savedAt: cached.savedAt, loading: false, refreshing: false, stale: false });
    }
    refresh();
  }, [key, refresh]);

  // Keep devices in step: refetch when the app returns to the foreground or the
  // window regains focus (phone -> laptop and back), when queued writes finish
  // replaying, and every 45 s while the screen stays open and visible.
  useEffect(() => {
    let last = 0;
    const soon = () => {
      const now = Date.now();
      if (now - last < 3000) return; // collapse focus+visibility double fire
      last = now;
      refresh();
    };
    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    window.addEventListener("focus", soon);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("cc:outbox-flushed", soon);
    const iv = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 45_000);
    return () => {
      window.removeEventListener("focus", soon);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("cc:outbox-flushed", soon);
      clearInterval(iv);
    };
  }, [refresh]);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setState((s) => {
      const next = typeof updater === "function" ? (updater as (p: T | null) => T)(s.data) : updater;
      writeCache(key, next);
      return { ...s, data: next, savedAt: Date.now() };
    });
  }, [key]);

  return { ...state, setData, refresh };
}

/** Small helper: GET a JSON endpoint, null on any failure. */
export async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    // Signed out (login is on and the cookie is gone) — go sign in once.
    location.assign("/login");
  }
  if (!res.ok) return null;
  return (await res.json()) as T;
}
