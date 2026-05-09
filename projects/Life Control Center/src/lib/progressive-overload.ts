/**
 * Progressive Overload Engine
 *
 * Rules (RIR-based, MacroFactor-style simplified):
 *
 * 1. Hit top of rep range on ALL working sets AND avg RIR logged ≤ 1
 *    → Suggest +1kg (dumbbells) or +2.5kg (cable) next session
 *
 * 2. Hit top of rep range but avg RIR > 1
 *    → Maintain weight — note "push harder next time"
 *
 * 3. Did NOT hit top of rep range
 *    → Maintain weight — note "aim for the top of your rep range"
 *
 * 4. Max dumbbell cap: 20kg — flag when at or above
 *
 * Warm-up sets are excluded from calculations.
 */

export type SetLogSummary = {
  setType: "standard" | "drop" | "warmup";
  weightKg: number | null;
  repsLogged: number | null;
  rirLogged: number | null;
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
      message: "No working sets logged — maintain current weight.",
      capReached: false,
    };
  }

  // Check if all sets hit top of rep range
  const allHitTop = workingSets.every(
    (s) => s.repRangeMax !== null && s.repsLogged! >= s.repRangeMax
  );

  // Average RIR (ignore null values)
  const rirValues = workingSets
    .map((s) => s.rirLogged)
    .filter((r): r is number => r !== null);
  const avgRir =
    rirValues.length > 0
      ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length
      : null;

  // Current weight from last working set
  const currentWeight =
    workingSets[workingSets.length - 1]?.weightKg ?? null;

  const increment = isCable(exerciseName) ? CABLE_INCREMENT : DUMBBELL_INCREMENT;
  const suggestedWeight =
    currentWeight !== null ? currentWeight + increment : null;
  const capReached =
    suggestedWeight !== null && !isCable(exerciseName) && suggestedWeight > MAX_DUMBBELL_KG;

  // Decision logic
  if (allHitTop && avgRir !== null && avgRir <= 1) {
    if (capReached) {
      return {
        action: "maintain",
        suggestedWeightKg: MAX_DUMBBELL_KG,
        message: `At max dumbbell (${MAX_DUMBBELL_KG}kg). Focus on reps and technique — consider adding a set.`,
        capReached: true,
      };
    }
    return {
      action: "increase",
      suggestedWeightKg: suggestedWeight,
      message: `Great session! Increase to ${suggestedWeight}kg next time.`,
      capReached: false,
    };
  }

  if (allHitTop && (avgRir === null || avgRir > 1)) {
    return {
      action: "maintain",
      suggestedWeightKg: currentWeight,
      message: `Hit the rep range but left reps in reserve. Push harder next session before adding weight.`,
      capReached: false,
    };
  }

  return {
    action: "maintain",
    suggestedWeightKg: currentWeight,
    message: `Aim to hit ${workingSets[0]?.repRangeMax ?? "the top of your"} reps on all sets before increasing weight.`,
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
