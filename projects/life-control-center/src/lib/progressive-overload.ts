/**
 * Progressive Overload Engine
 *
 * Rules (rep-range based):
 *
 * 1. Hit top of rep range on ALL working sets
 *    → Suggest weight increase next session
 *
 * 2. Did NOT hit top of rep range on all sets
 *    → Maintain weight · note "aim for the top of your rep range"
 *
 * 3. Max dumbbell cap: 20kg · flag when at or above
 *
 * Warm-up sets are excluded from calculations.
 */

export type SetLogSummary = {
  setType: "standard" | "drop" | "warmup";
  weightKg: number | null;
  repsLogged: number | null;
  repRangeMax: number | null;
};

export type ProgressionSuggestion = {
  action: "increase" | "maintain" | "deload";
  suggestedWeightKg: number | null;
  message: string;
  capReached: boolean;
};

const MAX_DUMBBELL_KG = 20;
const DUMBBELL_INCREMENT = 1; // kg per side
const CABLE_INCREMENT = 2.5;  // kg on stack

/** Determine if an exercise uses a cable machine based on its name */
function isCable(exerciseName: string): boolean {
  return exerciseName.toLowerCase().includes("cable");
}

/** Pick a deterministic-ish message variant based on exercise name */
function pick<T>(exerciseName: string, options: T[]): T {
  let hash = 0;
  for (let i = 0; i < exerciseName.length; i++) {
    hash = ((hash << 5) - hash + exerciseName.charCodeAt(i)) | 0;
  }
  return options[Math.abs(hash) % options.length];
}

// ─── Message template pools ────────────────────────────────────────────────

const MSG_INCREASE = [
  (w: number) => `Solid progress · bump up to ${w}kg next session.`,
  (w: number) => `You earned this. Go ${w}kg next time.`,
  (w: number) => `All sets hit the top · time for ${w}kg.`,
  (w: number) => `Strong work. Move to ${w}kg and own it.`,
  (w: number) => `Rep targets crushed. Step up to ${w}kg.`,
  (w: number) => `Ready for the next level · ${w}kg is yours.`,
  (w: number) => `Clean reps across the board. Load ${w}kg next.`,
];

const MSG_MAINTAIN = [
  (max: number | string) => `Keep pushing toward ${max} reps per set · you're close.`,
  (max: number | string) => `Not quite at ${max} reps on every set yet. Stay the course.`,
  (max: number | string) => `Stick with this weight until all sets hit ${max} reps.`,
  (max: number | string) => `Almost there · one or two sets short of ${max}. Hold steady.`,
  (max: number | string) => `Focus on form and hitting ${max} reps consistently.`,
  (max: number | string) => `You're building a base. Lock in ${max} reps before moving up.`,
];

const MSG_CAP = [
  `At max dumbbell (${MAX_DUMBBELL_KG}kg). Add a set or slow the tempo.`,
  `Maxed out at ${MAX_DUMBBELL_KG}kg · try paused reps or an extra set.`,
  `${MAX_DUMBBELL_KG}kg ceiling reached. Focus on mind-muscle connection.`,
  `Can't go heavier (${MAX_DUMBBELL_KG}kg cap). Add volume or time under tension.`,
  `Topped out at ${MAX_DUMBBELL_KG}kg · play with tempo or squeeze at the top.`,
];

const MSG_NO_SETS = [
  "No working sets logged · keep the same weight next time.",
  "Nothing recorded for this one. Repeat the same load.",
  "Skipped or not logged · maintain your previous weight.",
];

/**
 * Given the logged sets for one exercise in the last session,
 * return a suggestion for the next session.
 */
export function computeProgressionSuggestion(
  exerciseName: string,
  sets: SetLogSummary[]
): ProgressionSuggestion {
  // Only evaluate working sets (exclude warm-up)
  const workingSets = sets.filter(
    (s) => s.setType === "standard" && s.repsLogged !== null
  );

  if (workingSets.length === 0) {
    return {
      action: "maintain",
      suggestedWeightKg: null,
      message: pick(exerciseName, MSG_NO_SETS),
      capReached: false,
    };
  }

  // Check if all sets hit top of rep range
  const allHitTop = workingSets.every(
    (s) => s.repRangeMax !== null && s.repsLogged! >= s.repRangeMax
  );

  // Current weight from last working set
  const currentWeight =
    workingSets[workingSets.length - 1]?.weightKg ?? null;

  const increment = isCable(exerciseName) ? CABLE_INCREMENT : DUMBBELL_INCREMENT;
  const suggestedWeight =
    currentWeight !== null ? currentWeight + increment : null;
  const capReached =
    suggestedWeight !== null && !isCable(exerciseName) && suggestedWeight > MAX_DUMBBELL_KG;

  // Decision logic
  if (allHitTop) {
    if (capReached) {
      return {
        action: "maintain",
        suggestedWeightKg: MAX_DUMBBELL_KG,
        message: pick(exerciseName, MSG_CAP),
        capReached: true,
      };
    }
    return {
      action: "increase",
      suggestedWeightKg: suggestedWeight,
      message: pick(exerciseName, MSG_INCREASE)(suggestedWeight!),
      capReached: false,
    };
  }

  const repTarget = workingSets[0]?.repRangeMax ?? "the top of your";
  return {
    action: "maintain",
    suggestedWeightKg: currentWeight,
    message: pick(exerciseName, MSG_MAINTAIN)(repTarget),
    capReached: false,
  };
}

/** Compute suggestions for all exercises in a session */
export function computeSessionSuggestions(
  exerciseLogs: { exerciseName: string; sets: SetLogSummary[] }[]
): Record<string, ProgressionSuggestion> {
  const suggestions: Record<string, ProgressionSuggestion> = {};
  for (const { exerciseName, sets } of exerciseLogs) {
    suggestions[exerciseName] = computeProgressionSuggestion(exerciseName, sets);
  }
  return suggestions;
}
