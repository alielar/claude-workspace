/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Quality grades:
 *   0 = Again (complete blackout)
 *   1 = Hard  (significant difficulty)
 *   2 = Good  (correct with effort)
 *   3 = Easy  (perfect response)
 *
 * Returns updated interval (days), ease factor, and next review date.
 */

export type SM2Result = {
  interval: number;      // days until next review
  easeFactor: number;    // updated ease factor
  repetitions: number;   // how many times reviewed successfully
  nextReviewDate: string; // "YYYY-MM-DD"
};

export function sm2(
  quality: 0 | 1 | 2 | 3,
  repetitions: number,
  easeFactor: number,
  interval: number
): SM2Result {
  let newInterval: number;
  let newEaseFactor = easeFactor;
  let newRepetitions = repetitions;

  if (quality >= 2) {
    // Correct response
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    newRepetitions = repetitions + 1;
  } else {
    // Incorrect — reset
    newInterval = 1;
    newRepetitions = 0;
  }

  // Update ease factor based on quality (min 1.3)
  newEaseFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02)
  );

  // Compute next review date
  const next = new Date();
  next.setDate(next.getDate() + newInterval);
  const nextReviewDate = next.toISOString().split("T")[0];

  return {
    interval: newInterval,
    easeFactor: newEaseFactor,
    repetitions: newRepetitions,
    nextReviewDate,
  };
}
