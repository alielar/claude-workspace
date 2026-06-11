/**
 * Static muscle group map for known exercises.
 * primary: the main muscle targeted
 * secondary: supporting muscles
 * equipment: primary equipment type
 */

export interface MuscleInfo {
  primary: string;
  secondary: string[];
  equipment: string;
}

const map: Record<string, MuscleInfo> = {
  // ── Push exercises ──────────────────────────────────────────────────────────
  "low incline dumbbell press": {
    primary: "chest",
    secondary: ["front_delts", "triceps"],
    equipment: "dumbbell",
  },
  "seated dumbbell overhead press": {
    primary: "front_delts",
    secondary: ["side_delts", "triceps"],
    equipment: "dumbbell",
  },
  "cable straight bar triceps pushdown": {
    primary: "triceps",
    secondary: [],
    equipment: "cable",
  },
  "dumbbell fly": {
    primary: "chest",
    secondary: ["front_delts"],
    equipment: "dumbbell",
  },
  "seated dumbbell lateral raise": {
    primary: "side_delts",
    secondary: [],
    equipment: "dumbbell",
  },
  "standing dumbbell lateral raise": {
    primary: "side_delts",
    secondary: [],
    equipment: "dumbbell",
  },
  "seated overhand grip dumbbell rear delt fly": {
    primary: "rear_delts",
    secondary: ["upper_back"],
    equipment: "dumbbell",
  },
  "seated dumbbell wrist curl": {
    primary: "forearms",
    secondary: [],
    equipment: "dumbbell",
  },
  "push-up": {
    primary: "chest",
    secondary: ["triceps", "front_delts"],
    equipment: "bodyweight",
  },
  "close grip push-up": {
    primary: "triceps",
    secondary: ["chest", "front_delts"],
    equipment: "bodyweight",
  },
  "wide grip push-up": {
    primary: "chest",
    secondary: ["front_delts"],
    equipment: "bodyweight",
  },
  "incline push-up": {
    primary: "chest",
    secondary: ["front_delts", "triceps"],
    equipment: "bodyweight",
  },
  "pause push-up": {
    primary: "chest",
    secondary: ["triceps", "front_delts"],
    equipment: "bodyweight",
  },

  // ── Pull exercises ──────────────────────────────────────────────────────────
  "overhand grip cable lat pulldown": {
    primary: "lats",
    secondary: ["upper_back", "biceps"],
    equipment: "cable",
  },
  "single arm elbow-in dumbbell row": {
    primary: "upper_back",
    secondary: ["lats", "biceps"],
    equipment: "dumbbell",
  },
  "dumbbell pullover": {
    primary: "lats",
    secondary: ["chest", "serratus"],
    equipment: "dumbbell",
  },
  "standing dumbbell biceps curl": {
    primary: "biceps",
    secondary: ["forearms"],
    equipment: "dumbbell",
  },
  "incline hammer curl": {
    primary: "biceps",
    secondary: ["forearms"],
    equipment: "dumbbell",
  },
  "standing dumbbell shrug": {
    primary: "upper_traps",
    secondary: [],
    equipment: "dumbbell",
  },

  // ── Legs exercises ──────────────────────────────────────────────────────────
  "goblet squat": {
    primary: "quads",
    secondary: ["glutes", "upper_back"],
    equipment: "dumbbell",
  },
  "dumbbell reverse lunge": {
    primary: "quads",
    secondary: ["glutes", "hamstrings"],
    equipment: "dumbbell",
  },
  "dumbbell forward lunge": {
    primary: "quads",
    secondary: ["glutes", "hamstrings"],
    equipment: "dumbbell",
  },
  "standing on ground single leg bodyweight calf raise": {
    primary: "calves",
    secondary: [],
    equipment: "bodyweight",
  },
  "leg extension": {
    primary: "quads",
    secondary: [],
    equipment: "machine",
  },

  // ── Push-Up SESH / Core ─────────────────────────────────────────────────────
  "plank lateral hip flexion": {
    primary: "obliques",
    secondary: ["abs"],
    equipment: "bodyweight",
  },
  "weighted russian twist": {
    primary: "obliques",
    secondary: ["abs"],
    equipment: "dumbbell",
  },
  "weighted crunch (holding weight on chest)": {
    primary: "abs",
    secondary: [],
    equipment: "dumbbell",
  },
  "side plank": {
    primary: "obliques",
    secondary: ["abs"],
    equipment: "bodyweight",
  },

  // ── New exercises (4-Day Split) ────────────────────────────────────────────
  "dumbbell front raise": {
    primary: "front_delts",
    secondary: ["side_delts"],
    equipment: "dumbbell",
  },
  "dumbbell bent over row": {
    primary: "upper_back",
    secondary: ["lats", "biceps"],
    equipment: "dumbbell",
  },
  "incline dumbbell curl": {
    primary: "biceps",
    secondary: ["forearms"],
    equipment: "dumbbell",
  },
  "cable overhead tricep extension": {
    primary: "triceps",
    secondary: [],
    equipment: "cable",
  },
  "preacher curl": {
    primary: "biceps",
    secondary: ["forearms"],
    equipment: "dumbbell",
  },
  "cable lat pulldown": {
    primary: "lats",
    secondary: ["upper_back", "biceps"],
    equipment: "cable",
  },
  "pull-up": {
    primary: "lats",
    secondary: ["upper_back", "biceps"],
    equipment: "bodyweight",
  },
  "close grip barbell incline bench press": {
    primary: "chest",
    secondary: ["front_delts", "triceps"],
    equipment: "barbell",
  },
  "incline barbell bench press": {
    primary: "chest",
    secondary: ["front_delts", "triceps"],
    equipment: "barbell",
  },
  "machine shoulder press": {
    primary: "front_delts",
    secondary: ["side_delts", "triceps"],
    equipment: "machine",
  },
  "barbell pendlay row": {
    primary: "upper_back",
    secondary: ["lats", "biceps"],
    equipment: "barbell",
  },
  "bayesian cable curl": {
    primary: "biceps",
    secondary: ["forearms"],
    equipment: "cable",
  },
  "dumbbell goblet squat": {
    primary: "quads",
    secondary: ["glutes", "upper_back"],
    equipment: "dumbbell",
  },
  "dumbbell romanian deadlift": {
    primary: "hamstrings",
    secondary: ["glutes"],
    equipment: "dumbbell",
  },
  "barbell romanian deadlift": {
    primary: "hamstrings",
    secondary: ["glutes"],
    equipment: "barbell",
  },
  "barbell squat": {
    primary: "quads",
    secondary: ["glutes", "hamstrings"],
    equipment: "barbell",
  },
  "single leg calf raise": {
    primary: "calves",
    secondary: [],
    equipment: "bodyweight",
  },
  "dumbbell bulgarian split squat": {
    primary: "quads",
    secondary: ["glutes", "hamstrings"],
    equipment: "dumbbell",
  },
  "dumbbell walking lunge": {
    primary: "quads",
    secondary: ["glutes", "hamstrings"],
    equipment: "dumbbell",
  },
};

export function getMuscleInfo(exerciseName: string): MuscleInfo {
  const key = exerciseName.toLowerCase().trim();
  return (
    map[key] ?? {
      primary: "unknown",
      secondary: [],
      equipment: "other",
    }
  );
}
