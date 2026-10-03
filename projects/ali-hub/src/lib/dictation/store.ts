/**
 * R2-D2 dictation · the shared state (Ali 2026-10-01: "talk, go and look at another section, keep
 * transcribing"). A module-level store, so it outlives the R2-D2 page: the app changes screens
 * without a reload, the microphone keeps running and the text keeps growing; the small pill in
 * AppShell shows it on every other screen. The composer's draft lives here too (and in
 * localStorage), so nothing said is lost if the page is left or the app is closed.
 *
 * Tiny on purpose (it ships on every page): the engine (`engine.ts`) is imported by the R2-D2 page
 * only and registers its stop function here.
 */

import { useSyncExternalStore } from "react";

export type DictStatus = "idle" | "connecting" | "live" | "stopping" | "error";
export type DictState = {
  status: DictStatus;
  /** The composer's text, committed (typed, or a finished dictation). */
  draft: string;
  /** Finished phrases of the dictation running now. */
  final: string;
  /** The phrase being spoken right now · replaced on every update. */
  interim: string;
  startedAt: number | null;
  error: string | null;
};

const KEY = "cc-alai-draft";
let state: DictState = { status: "idle", draft: "", final: "", interim: "", startedAt: null, error: null };
let loaded = false;
const subs = new Set<() => void>();
let stopper: (() => void) | null = null;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { state = { ...state, draft: localStorage.getItem(KEY) ?? "" }; } catch { /* private mode */ }
}

export function getDict(): DictState { load(); return state; }
/** Server snapshot · never dictating, empty draft. */
export const SERVER_DICT: DictState = { status: "idle", draft: "", final: "", interim: "", startedAt: null, error: null };

export function subscribeDict(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

export function setDict(patch: Partial<DictState>) {
  load();
  state = { ...state, ...patch };
  if ("draft" in patch || "final" in patch) {
    // Saved on every finished phrase, so a closed app keeps what was said.
    try { localStorage.setItem(KEY, joinText(state.draft, state.final)); } catch { /* full or private */ }
  }
  subs.forEach((f) => f());
}

/** Text pieces joined with one space, none doubled. */
export function joinText(...parts: string[]): string {
  return parts.reduce((acc, p) => {
    const t = p.trim();
    if (!t) return acc;
    if (!acc) return t;
    return /\s$/.test(acc) ? acc + t : `${acc} ${t}`;
  }, "");
}

/** What the composer shows: the draft, then what has been said so far. */
export function composed(s: DictState = getDict()): string {
  return s.status === "idle" || s.status === "error" ? s.draft : joinText(s.draft, s.final, s.interim);
}

export function isDictating(s: DictState = getDict()): boolean {
  return s.status === "connecting" || s.status === "live" || s.status === "stopping";
}

export function registerStopper(fn: (() => void) | null) { stopper = fn; }
export function stopDictation() { stopper?.(); }

/** The live state in a component. */
export function useDict(): DictState { return useSyncExternalStore(subscribeDict, getDict, () => SERVER_DICT); }
