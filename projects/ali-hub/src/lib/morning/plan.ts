/**
 * Morning routine plan (2026-09-08, Ali-approved sequence).
 * Wake time depends on whether today is a training day (kb_workouts.assignedDays,
 * set in Settings → Training days). Steps stack from the wake time; every minute
 * is editable in Settings and sticks (user_settings.morning_plan).
 */

export type MorningStep = { id: string; label: string; minutes: number; trainOnly?: boolean };

export type MorningPlan = {
  trainWake: string;   // "06:00"
  restWake: string;    // "07:00"
  callsAt: string;     // "08:30" · the hard stop
  /** Saturday (2026-09-24, Ali works Saturdays but starts an hour later): the whole routine,
   * wake, calls AND every timed step on Today, moves later by this many minutes. */
  saturdayShiftMin: number;
  steps: MorningStep[];
};

/** How a calendar day is scheduled (2026-09-24): weekdays as configured, Saturday shifted
 * later by `saturdayShiftMin`, Sunday with no fixed times at all. */
export type DayKind = "weekday" | "saturday" | "sunday";
export function dayKindOf(ymd: string): DayKind {
  const dow = new Date(ymd + "T12:00:00Z").getUTCDay();
  return dow === 6 ? "saturday" : dow === 0 ? "sunday" : "weekday";
}

export const DEFAULT_SATURDAY_SHIFT_MIN = 60;

export const DEFAULT_MORNING_PLAN: MorningPlan = {
  trainWake: "06:00",
  restWake: "07:00",
  callsAt: "08:30",
  saturdayShiftMin: DEFAULT_SATURDAY_SHIFT_MIN,
  steps: [
    { id: "wake",      label: "Wake up · water · bathroom", minutes: 10 },
    { id: "stretch",   label: "Mobility",                   minutes: 10 },
    { id: "breathe",   label: "Wim Hof",                    minutes: 12 },
    { id: "train",     label: "Train",                      minutes: 36, trainOnly: true },
    { id: "shower",    label: "Shower",                     minutes: 15 },
    { id: "breakfast", label: "Breakfast + podcast",        minutes: 25 },
  ],
};

const HM = /^\d{2}:\d{2}$/;

export function parseMorningPlan(json: string | null | undefined): MorningPlan {
  try {
    const p = JSON.parse(json ?? "null") as MorningPlan | null;
    if (!p || !HM.test(p.trainWake) || !HM.test(p.restWake) || !HM.test(p.callsAt) || !Array.isArray(p.steps)) return DEFAULT_MORNING_PLAN;
    const steps = p.steps
      .filter((s) => s && typeof s.label === "string" && Number.isFinite(s.minutes) && s.minutes >= 0)
      // "Stretching" became "Mobility" on 2026-09-12 · a saved plan still carrying the old default label follows.
      .map((s) => (s.id === "stretch" && /^stretch(ing)?$/i.test(s.label) ? { ...s, label: "Mobility" } : s));
    const saturdayShiftMin = Number.isFinite(p.saturdayShiftMin) ? Math.max(0, Math.min(240, Math.round(p.saturdayShiftMin))) : DEFAULT_SATURDAY_SHIFT_MIN;
    return steps.length ? { ...p, steps, saturdayShiftMin } : DEFAULT_MORNING_PLAN;
  } catch { return DEFAULT_MORNING_PLAN; }
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "07:15" + 60 → "08:15" (wraps at midnight). */
export function shiftHM(hhmm: string, minutes: number): string {
  return toHM(toMin(hhmm) + minutes);
}

export type MorningRow = { id: string; label: string; start: string; end: string };

/**
 * The morning as a clock. `kind` = "saturday" shifts wake and calls by `plan.saturdayShiftMin`;
 * "sunday" has no clock at all (rows come back with empty start/end, `timed` false).
 */
export function computeMorning(plan: MorningPlan, isTraining: boolean, kind: DayKind = "weekday"): { wake: string; callsAt: string; rows: MorningRow[]; bufferMin: number; timed: boolean } {
  const shift = kind === "saturday" ? plan.saturdayShiftMin : 0;
  const timed = kind !== "sunday";
  const wake = toHM(toMin(isTraining ? plan.trainWake : plan.restWake) + shift);
  const callsAt = toHM(toMin(plan.callsAt) + shift);
  let t = toMin(wake);
  const rows: MorningRow[] = [];
  for (const s of plan.steps) {
    if (s.trainOnly && !isTraining) continue;
    if (s.minutes <= 0) continue;
    rows.push({ id: s.id, label: s.label, start: timed ? toHM(t) : "", end: timed ? toHM(t + s.minutes) : "" });
    t += s.minutes;
  }
  return { wake, callsAt, rows, bufferMin: toMin(callsAt) - t, timed };
}
