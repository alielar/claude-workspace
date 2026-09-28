import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format seconds → "mm:ss" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format seconds → "Xh Ym" for workout durations */
export function formatWorkoutDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Format pace: seconds-per-km → "m:ss /km" */
export function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = secondsPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")} /km`;
}

/** Estimated 1-rep max: Epley formula */
export function epley1rm(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Today's date as YYYY-MM-DD in a given timezone */
/**
 * No em dashes anywhere on the hub (Ali 2026-09-29) · applied to every AI-written text before it
 * is stored: a dash between clauses becomes a comma, a dash opening a list or an aside a colon-like
 * pause is not needed, so a comma serves there too. Hyphens and en dashes between numbers stay.
 */
export function noDash(s: string): string {
  return s
    .replace(/\s*—\s*/g, ", ")          // em dash between clauses
    .replace(/\s+–\s+/g, ", ")          // spaced en dash used as one
    .replace(/,\s*([.,;:!?])/g, "$1")    // ", ." left by a dash before punctuation
    .replace(/([:;])\s*,\s*/g, "$1 ")     // ":," left by a dash after a colon
    .replace(/(^|\n)\s*,\s*/g, "$1");    // a dash that opened a line
}

export function todayInTz(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

/** Get ordinal suffix for a number (1st, 2nd, 3rd…) */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
