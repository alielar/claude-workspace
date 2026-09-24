"use client";

/**
 * Local-first read cache.
 *
 * Every screen renders from the phone's own copy of the data first (instant,
 * works offline), then refreshes from the server in the background.
 *
 * Storage is localStorage for now: synchronous, tiny payloads, zero setup.
 * If a module ever needs more than a few hundred KB, swap the two functions
 * below for IndexedDB · nothing else changes.
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
    /* storage full or unavailable · the app still works, just without offline data */
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
 * useCached · read the local copy instantly, then fetch fresh data.
 *
 *   const { data, setData, refresh } = useCached("checklist", () => fetchJson("/api/checklist"));
 *
 * `setData` updates both the screen and the local copy (use it for optimistic edits).
 */
export function useCached<T>(key: string, fetcher: () => Promise<T | null>, opts?: {
  /**
   * Combine what the server sent with what the phone has. Modules whose rows carry their own
   * `updatedAt` (to-dos) use it so a server answer can never revert a newer local edit, however
   * the requests were ordered on the wire. Without it the server copy replaces the local one.
   */
  merge?: (local: T | null, server: T) => T;
}) {
  const [state, setState] = useState<State<T>>({
    data: null, savedAt: null, loading: true, refreshing: false, stale: false,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);
  const mergeRef = useRef(opts?.merge);
  useEffect(() => { mergeRef.current = opts?.merge; }, [opts?.merge]);

  // Guards a race that made a tick "come back" and need a second tap: a background
  // refresh started BEFORE an optimistic setData (e.g. the 45s interval, or a focus
  // refresh) can resolve AFTER it with server data that predates the edit — a GET that
  // raced the PUT. Applying that response would silently revert the optimistic change.
  // If a local edit landed after this refresh began, its answer is stale · skip it and
  // let the next refresh (the outbox-flush one right after the write lands, or the next
  // interval tick) pick up the truth.
  //
  // 2026-09-24: the same guard now also covers the WRITE. `markEdit()` is called again when
  // the PUT has landed, so a GET that started while the PUT was still in flight (it can
  // answer with pre-edit rows even though it began after the tap) is discarded too.
  const lastEditRef = useRef(0);
  const markEdit = useCallback(() => { lastEditRef.current = Date.now(); }, []);

  const refresh = useCallback(async () => {
    if (!isOnline()) {
      setState((s) => ({ ...s, refreshing: false, stale: true, loading: false }));
      return;
    }
    const startedAt = Date.now();
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const fresh = await fetcherRef.current();
      if (lastEditRef.current > startedAt) {
        setState((s) => ({ ...s, refreshing: false, loading: false }));
        return;
      }
      if (fresh !== null && fresh !== undefined) {
        setState((s) => {
          if (isWorkerCopy(fresh)) {
            // The worker's old copy: only worth showing when the phone has nothing at all.
            if (s.data !== null) return { ...s, refreshing: false, loading: false, stale: true };
            return { data: fresh, savedAt: s.savedAt, loading: false, refreshing: false, stale: true };
          }
          const next = mergeRef.current ? mergeRef.current(s.data, fresh) : fresh;
          writeCache(key, next);
          return { data: next, savedAt: Date.now(), loading: false, refreshing: false, stale: false };
        });
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
    lastEditRef.current = Date.now();
    setState((s) => {
      const next = typeof updater === "function" ? (updater as (p: T | null) => T)(s.data) : updater;
      writeCache(key, next);
      return { ...s, data: next, savedAt: Date.now() };
    });
  }, [key]);

  return { ...state, setData, refresh, markEdit };
}

/**
 * Small helper: GET a JSON endpoint, null on any failure.
 *
 * An answer the service worker served from ITS cache (header `x-ali-cache`, set in
 * public/sw.js when the network was slow or down) is flagged (`isWorkerCopy`). That copy is
 * older than the phone's own localStorage copy and must never be applied as if the server
 * had just said it · before 2026-09-24 it was, which is why a ticked to-do could "come back"
 * (the GET after the tick timed out, the worker handed back yesterday's list, the store
 * believed it) and why the laptop could sit on stale rows until a hard reload.
 */
export async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    // Signed out (login is on and the cookie is gone) · go sign in once.
    location.assign("/login");
  }
  if (!res.ok) return null;
  const body = (await res.json()) as T;
  if (res.headers.get("x-ali-cache") === "1" && body && typeof body === "object") workerCopies.add(body as object);
  return body;
}

/** Bodies the service worker served from its cache · `useCached` only uses one when it has nothing at all. */
const workerCopies = new WeakSet<object>();
export function isWorkerCopy(v: unknown): boolean {
  return !!v && typeof v === "object" && workerCopies.has(v as object);
}
