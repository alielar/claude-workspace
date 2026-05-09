/**
 * Seed data for Ali's PPL workout program.
 * Matches exactly the MacroFactor export provided during planning.
 *
 * Weekly rotation: Push → Pull → Legs → Core → Push → Pull → Push-Up Skill
 */

export type SetTemplateInput = {
  setNumber: number;
  setType: "standard" | "drop" | "warmup";
  repRangeMin?: number;
  repRangeMax?: number;
  durationSeconds?: number; // for timed sets (Core holds)
  rirTarget?: number;
  restSeconds: number;
};

export type ExerciseInput = {
  name: string;
  muscleGroup: string;
  apiLookupName?: string;
  sets: SetTemplateInput[];
};

export type SessionInput = {
  name: string;
  type: "ppl" | "core" | "skill";
  defaultRestSeconds: number;
  sortOrder: number;
  exercises: ExerciseInput[];
};

// ─── Helper: generate standard 3-set working block with 1 warm-up ────────────

function standardSets(
  count: number,
  repMin: number,
  repMax: number,
  restSeconds: number,
  rirTargets?: (number | undefined)[]
): SetTemplateInput[] {
  const sets: SetTemplateInput[] = [
    // Warm-up set (always first — lower weight, not counted in progression)
    {
      setNumber: 1,
      setType: "warmup",
      repRangeMin: repMax,
      repRangeMax: repMax + 4,
      rirTarget: 4,
      restSeconds: 60,
    },
  ];
  for (let i = 0; i < count; i++) {
    sets.push({
      setNumber: i + 2,
      setType: "standard",
      repRangeMin: repMin,
      repRangeMax: repMax,
      rirTarget: rirTargets?.[i],
      restSeconds,
    });
  }
  return sets;
}

// ─── Session definitions ──────────────────────────────────────────────────────

export const PROGRAM_SESSIONS: SessionInput[] = [
  // ── Push ────────────────────────────────────────────────────────────────────
  {
    name: "Push",
    type: "ppl",
    defaultRestSeconds: 60,
    sortOrder: 0,
    exercises: [
      {
        name: "Low Incline Dumbbell Press",
        muscleGroup: "chest",
        apiLookupName: "incline dumbbell press",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Seated Dumbbell Overhead Press",
        muscleGroup: "shoulders",
        apiLookupName: "dumbbell shoulder press",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Cable Straight Bar Triceps Pushdown",
        muscleGroup: "triceps",
        apiLookupName: "cable triceps pushdown",
        sets: standardSets(3, 6, 10, 60, [4, 1, 1]),
      },
      {
        name: "Dumbbell Fly",
        muscleGroup: "chest",
        apiLookupName: "dumbbell fly",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Seated Dumbbell Lateral Raise",
        muscleGroup: "shoulders",
        apiLookupName: "dumbbell lateral raise",
        sets: [
          { setNumber: 1, setType: "warmup", repRangeMin: 12, repRangeMax: 15, rirTarget: 4, restSeconds: 60 },
          { setNumber: 2, setType: "standard", repRangeMin: 6, repRangeMax: 10, rirTarget: 1, restSeconds: 60 },
          { setNumber: 3, setType: "standard", repRangeMin: 6, repRangeMax: 10, restSeconds: 60 },
          { setNumber: 4, setType: "standard", repRangeMin: 6, repRangeMax: 10, rirTarget: 0, restSeconds: 60 },
          { setNumber: 5, setType: "drop",     repRangeMin: 4, repRangeMax: 4,  rirTarget: 0, restSeconds: 0 },
        ],
      },
      {
        name: "Seated Overhand Grip Dumbbell Rear Delt Fly",
        muscleGroup: "rear delts",
        apiLookupName: "bent over dumbbell rear delt row",
        sets: standardSets(3, 6, 10, 60, [undefined, 0, 1]),
      },
      {
        name: "Seated Dumbbell Wrist Curl",
        muscleGroup: "forearms",
        apiLookupName: "dumbbell wrist curl",
        sets: standardSets(3, 6, 10, 60, [3, undefined, 2]),
      },
      {
        name: "Push-Up",
        muscleGroup: "chest",
        apiLookupName: "push-up",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 30, rirTarget: 4, restSeconds: 60 },
        ],
      },
    ],
  },

  // ── Pull ────────────────────────────────────────────────────────────────────
  {
    name: "Pull",
    type: "ppl",
    defaultRestSeconds: 60,
    sortOrder: 1,
    exercises: [
      {
        name: "Overhand Grip Cable Lat Pulldown",
        muscleGroup: "back",
        apiLookupName: "cable lat pulldown",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Single Arm Elbow-In Dumbbell Row",
        muscleGroup: "back",
        apiLookupName: "one arm dumbbell row",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Dumbbell Pullover",
        muscleGroup: "back",
        apiLookupName: "dumbbell pullover",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Standing Dumbbell Biceps Curl",
        muscleGroup: "biceps",
        apiLookupName: "dumbbell bicep curl",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Incline Dumbbell Hammer Curl",
        muscleGroup: "biceps",
        apiLookupName: "incline dumbbell curl",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Seated Dumbbell Wrist Curl",
        muscleGroup: "forearms",
        apiLookupName: "dumbbell wrist curl",
        sets: standardSets(3, 6, 10, 60),
      },
      {
        name: "Standing Dumbbell Shrug",
        muscleGroup: "traps",
        apiLookupName: "dumbbell shrug",
        sets: [
          { setNumber: 1, setType: "warmup", repRangeMin: 12, repRangeMax: 15, rirTarget: 4, restSeconds: 60 },
          { setNumber: 2, setType: "standard", repRangeMin: 6, repRangeMax: 10, restSeconds: 60 },
        ],
      },
    ],
  },

  // ── Legs ────────────────────────────────────────────────────────────────────
  {
    name: "Legs",
    type: "ppl",
    defaultRestSeconds: 120,
    sortOrder: 2,
    exercises: [
      {
        name: "Goblet Squat",
        muscleGroup: "quads",
        apiLookupName: "goblet squat",
        sets: standardSets(3, 6, 10, 120),
      },
      {
        name: "Dumbbell Reverse Lunge",
        muscleGroup: "quads",
        apiLookupName: "dumbbell lunge",
        sets: standardSets(3, 6, 10, 120),
      },
      {
        name: "Dumbbell Forward Lunge",
        muscleGroup: "quads",
        apiLookupName: "dumbbell lunge",
        sets: standardSets(3, 6, 10, 120),
      },
      {
        name: "Dumbbell Bulgarian Split Squat",
        muscleGroup: "quads",
        apiLookupName: "bulgarian split squat",
        sets: standardSets(3, 6, 10, 120),
      },
      {
        name: "Standing Single Leg Bodyweight Calf Raise",
        muscleGroup: "calves",
        apiLookupName: "standing calf raise",
        sets: standardSets(3, 6, 10, 120),
      },
      {
        name: "Dumbbell Romanian Deadlift",
        muscleGroup: "hamstrings",
        apiLookupName: "romanian deadlift",
        sets: standardSets(3, 6, 10, 120),
      },
    ],
  },

  // ── Core/Abs ────────────────────────────────────────────────────────────────
  {
    name: "Core",
    type: "core",
    defaultRestSeconds: 30,
    sortOrder: 3,
    exercises: [
      { name: "Weighted Russian Twist", muscleGroup: "core", apiLookupName: "russian twist",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "V-Sit Knee Extension", muscleGroup: "core", apiLookupName: "v sit",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "V-Sit Hold", muscleGroup: "core", apiLookupName: "v sit",
        sets: [
          { setNumber: 1, setType: "standard", durationSeconds: 30, restSeconds: 30 },
          { setNumber: 2, setType: "standard", durationSeconds: 30, restSeconds: 30 },
        ]
      },
      { name: "Plank Lateral Hip Flexion", muscleGroup: "core", apiLookupName: "plank",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "Hollow Body Rocking", muscleGroup: "core", apiLookupName: "hollow body hold",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "Superman Rocking", muscleGroup: "lower back", apiLookupName: "superman",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "Roll-Overs", muscleGroup: "core",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
      { name: "Hip Knee Flexion", muscleGroup: "hip flexors",
        sets: [
          { setNumber: 1, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
          { setNumber: 2, setType: "standard", repRangeMin: 8, repRangeMax: 12, restSeconds: 30 },
        ]
      },
    ],
  },

  // ── Push-Up Skill ────────────────────────────────────────────────────────────
  {
    name: "Push-Up Skill",
    type: "skill",
    defaultRestSeconds: 90,
    sortOrder: 4,
    exercises: [
      { name: "Close Grip Push-Up",  muscleGroup: "triceps", apiLookupName: "close grip push up",
        sets: [{ setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 20, restSeconds: 90 }] },
      { name: "Incline Push-Up",     muscleGroup: "chest", apiLookupName: "incline push up",
        sets: [{ setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 20, restSeconds: 90 }] },
      { name: "Wide Grip Push-Up",   muscleGroup: "chest", apiLookupName: "wide push up",
        sets: [{ setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 20, restSeconds: 90 }] },
      { name: "Pause Push-Up",       muscleGroup: "chest", apiLookupName: "push-up",
        sets: [{ setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 20, restSeconds: 90 }] },
      { name: "Push-Up",             muscleGroup: "chest", apiLookupName: "push-up",
        sets: [{ setNumber: 1, setType: "standard", repRangeMin: 15, repRangeMax: 20, restSeconds: 90 }] },
    ],
  },
];

/** Weekly rotation — session names in order */
export const WEEKLY_ROTATION = [
  "Push",
  "Pull",
  "Legs",
  "Core",
  "Push",
  "Pull",
  "Push-Up Skill",
];
