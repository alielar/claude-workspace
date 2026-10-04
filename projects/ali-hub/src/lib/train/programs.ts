/**
 * Speediance programs (Ali 2026-10-04) · the two upper-body sessions he built in the Speediance
 * app, copied here move by move so Train can show the plan, match a Watch "Traditional Strength
 * Training" workout to it by weekday, and read volume over the weeks. The machine runs the
 * session; A L I only shows it and reads what the Watch recorded.
 *
 * The weekly plan (Ali: "two upper-body Speediance sessions, two runs, one kettlebell · kettlebell
 * and runs cover the legs"): Push · Pull on the machine, two runs with the Watch, Kettlebell 30
 * on Saturday. Legs day retired. The DAYS live on the Routine rows (`gym-push`, `gym-pull`,
 * `run`, `gym-kb` in ROUTINE_SEED), editable on Today → Edit; this file holds the content.
 */

export type ProgramKey = "push" | "pull";

/** One working set as Speediance shows it: weight × reps (`perSide` = alternating R/L sets). */
export type ProgramSet = { kg: number; reps: number };
export type ProgramMove = {
  name: string;
  /** warm · training · stretch, as in the app. */
  phase: "warm" | "training" | "stretch";
  /** Working sets, in order (training moves). */
  sets?: ProgramSet[];
  /** Timed moves (warm-up, stretches): seconds per side or per round. */
  seconds?: number;
  /** Rounds of the timed move (2 = left and right). */
  rounds?: number;
  /** One arm or one side at a time (sets alternate R/L). */
  perSide?: boolean;
};

export type Program = {
  key: ProgramKey;
  name: string;
  /** The Routine row that carries this program's weekday(s). */
  routineKey: "gym-push" | "gym-pull";
  /** Plain words for the card. */
  muscles: string;
  /** What Speediance quotes for the whole session (its own volume count, both handles). */
  planned: { kg: number; kcal: number; minutes: number };
  moves: ProgramMove[];
};

const w = (name: string, seconds = 30, rounds = 2): ProgramMove => ({ name, phase: "warm", seconds, rounds });
const st = (name: string, seconds = 30, rounds = 1): ProgramMove => ({ name, phase: "stretch", seconds, rounds });
const t = (name: string, sets: [number, number][], perSide = false): ProgramMove => ({ name, phase: "training", sets: sets.map(([kg, reps]) => ({ kg, reps })), ...(perSide ? { perSide } : {}) });
const rep = (kg: number, reps: number, n: number): [number, number][] => Array.from({ length: n }, () => [kg, reps]);

export const PROGRAMS: Program[] = [
  {
    key: "push", name: "Push", routineKey: "gym-push", muscles: "chest · shoulders · triceps",
    planned: { kg: 4114, kcal: 324, minutes: 35 },
    moves: [
      w("Kneeling Spine Rotation"),
      w("Shoulder Circle (Forward)"),
      t("Incline Barbell Bench Press", [[22, 10], ...rep(40, 8, 3)]),
      t("Seated Barbell Shoulder Press", rep(22, 8, 3)),
      t("Barbell Supine Straight Arm Pullover", rep(18, 12, 3)),
      t("Incline Cable Fly", rep(10, 12, 2)),
      t("Kneeling Lateral Raise", rep(7, 15, 3)),
      t("Standing Overhead Cable Triceps Extension", rep(18, 12, 3)),
      st("Bench Chest Stretch", 30, 2),
      st("Shoulder Stretch", 30, 2),
    ],
  },
  {
    key: "pull", name: "Pull", routineKey: "gym-pull", muscles: "back · biceps · rear delts · core",
    planned: { kg: 3814, kcal: 315, minutes: 34 },
    moves: [
      w("Kneeling Spine Rotation"),
      t("Bent Over Barbell Row", [[20, 10], ...rep(30, 8, 3)]),
      t("Underhand Barbell Row", rep(25, 10, 3)),
      t("Bench Kneeling Bent Over Row", rep(12, 10, 4), true),
      t("Cable Bent-Over Reverse Fly", [[8, 12], [8, 12], [8, 15]]),
      t("Standing Dual-Handle Cable Biceps Curls", [[10, 10], [10, 10], [10, 12]]),
      t("Low-High Woodchop", rep(15, 12, 4), true),
      st("Bench Back Stretch"),
      st("Bench Biceps Stretch"),
    ],
  },
];

export const programByKey = (k: ProgramKey) => PROGRAMS.find((p) => p.key === k)!;

/** "22×10 · 40×8 ×3" · the sets of a move in one short string. */
export function setsLabel(m: ProgramMove): string {
  if (m.phase !== "training" || !m.sets) return m.rounds && m.rounds > 1 ? `${m.rounds} × ${m.seconds} s` : `${m.seconds} s`;
  const out: string[] = [];
  let i = 0;
  while (i < m.sets.length) {
    const s = m.sets[i]; let n = 1;
    while (i + n < m.sets.length && m.sets[i + n].kg === s.kg && m.sets[i + n].reps === s.reps) n++;
    out.push(`${s.kg}×${s.reps}${n > 1 ? ` ×${n}` : ""}`);
    i += n;
  }
  return out.join(" · ") + (m.perSide ? " · per side" : "");
}

/** Working sets and the heaviest kg of a program · for the card's one-line summary. */
export function programSummary(p: Program): { moves: number; sets: number; topKg: number } {
  const training = p.moves.filter((m) => m.phase === "training");
  return {
    moves: training.length,
    sets: training.reduce((n, m) => n + (m.sets?.length ?? 0), 0),
    topKg: Math.max(0, ...training.flatMap((m) => (m.sets ?? []).map((s) => s.kg))),
  };
}

/** Tonnes lifted as Speediance counts it · "4.1 t". */
export const fmtTonnes = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
