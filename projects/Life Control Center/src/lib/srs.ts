/**
 * Fixed-interval spaced repetition (3-button system).
 *
 * Intervals (days) by step index:
 *   0 → same day (again)
 *   1 → 1 day
 *   2 → 3 days
 *   3 → 7 days
 *   4 → 14 days
 *   5 → 30 days
 *   6 → 90 days
 *
 * Buttons:
 *   "again" → reset to step 0, nextReview = today, streak = 0
 *   "good"  → advance 1 step, nextReview = today + STEPS[newStep] days, streak++
 *   "easy"  → advance 2 steps, nextReview = today + STEPS[newStep] days, streak++
 *
 * The `interval` DB column is repurposed to store this step index (0–6).
 * SM-2 fields (easeFactor, repetitions) are preserved but ignored.
 */

import { format, addDays } from "date-fns";

const STEPS = [0, 1, 3, 7, 14, 30, 90] as const;
const MAX_STEP = STEPS.length - 1;

export type SrsButton = "again" | "good" | "easy";

export interface SrsResult {
  /** New step index — stored in `interval` column */
  step: number;
  /** ISO "YYYY-MM-DD" date of next review */
  nextReviewDate: string;
  /** "new" | "learning" | "mastered" */
  masteryStatus: "new" | "learning" | "mastered";
  /** Updated streak count */
  streak: number;
}

function stepToMastery(step: number): "new" | "learning" | "mastered" {
  if (step <= 1) return "new";
  if (step <= 4) return "learning";
  return "mastered";
}

/**
 * Compute the next SRS state given a button press.
 *
 * @param button    Which button the user pressed
 * @param step      Current step index (0–6), stored in `interval` column
 * @param streak    Current streak count
 */
export function srsReview(
  button: SrsButton,
  step: number,
  streak: number
): SrsResult {
  const today = format(new Date(), "yyyy-MM-dd");

  let newStep: number;
  let newStreak: number;

  if (button === "again") {
    newStep = 0;
    newStreak = 0;
  } else if (button === "good") {
    newStep = Math.min(step + 1, MAX_STEP);
    newStreak = streak + 1;
  } else {
    // easy — skip ahead two steps
    newStep = Math.min(step + 2, MAX_STEP);
    newStreak = streak + 1;
  }

  const daysAhead = STEPS[newStep as keyof typeof STEPS] ?? 0;
  const nextReviewDate =
    daysAhead === 0
      ? today // "again" → due today again (back of queue)
      : format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

  return {
    step: newStep,
    nextReviewDate,
    masteryStatus: stepToMastery(newStep),
    streak: newStreak,
  };
}
