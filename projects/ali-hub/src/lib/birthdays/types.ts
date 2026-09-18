/**
 * Birthdays & important dates — a Docs entry of its own (spec: reached from
 * To-do → Docs → Birthdays, like the password vault). Name + a yearly date; a
 * push goes out once, `remindDaysBefore` days ahead of each occurrence (default 3,
 * editable per person), and Today shows the nearest one inside its window until
 * it passes.
 */

export type Birthday = {
  clientId: string;            // generated on the phone, makes every write idempotent
  name: string;
  month: number;                // 1-12
  day: number;                  // 1-31
  year: number | null;          // birth year, optional · only used to show the age they're turning
  remindDaysBefore: number;     // 0-30, default 3
  notes: string | null;         // gift ideas etc, optional
  createdAt: number;            // ms
  updatedAt: number;            // ms · last-writer-wins on the server
  deleted: boolean;
};

export type BirthdaysData = { birthdays: Birthday[] };

export const DEFAULT_REMIND_DAYS = 3;
export const REMIND_OPTIONS = [0, 1, 2, 3, 5, 7, 14] as const;

export function newBirthdayId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** This birthday's date within year `y` · Feb 29 falls back to Feb 28 outside a leap year. */
function dateInYear(b: Pick<Birthday, "month" | "day">, y: number): string {
  const day = b.month === 2 && b.day === 29 && !isLeap(y) ? 28 : b.day;
  return `${y}-${String(b.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The next occurrence on or after `today` (YYYY-MM-DD, the checklist's Europe/Madrid day). */
export function nextOccurrence(b: Pick<Birthday, "month" | "day">, today: string): string {
  const y = Number(today.slice(0, 4));
  const thisYear = dateInYear(b, y);
  return thisYear >= today ? thisYear : dateInYear(b, y + 1);
}

export function daysUntil(b: Pick<Birthday, "month" | "day">, today: string): number {
  const occ = nextOccurrence(b, today);
  return Math.round((Date.parse(`${occ}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

/** The age turning on the next occurrence, or null when no birth year is recorded. */
export function turningAge(b: Pick<Birthday, "month" | "day" | "year">, today: string): number | null {
  if (!b.year) return null;
  return Number(nextOccurrence(b, today).slice(0, 4)) - b.year;
}

export function fmtBirthdayDate(b: Pick<Birthday, "month" | "day">): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(2001, b.month - 1, b.day)));
}

/** "Today" / "Tomorrow" / "In 5 days". */
export function fmtDaysUntil(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** Inside its own reminder window — the nudge Today and the push both key off. */
export function dueSoon(b: Pick<Birthday, "month" | "day" | "remindDaysBefore">, today: string): boolean {
  return daysUntil(b, today) <= (b.remindDaysBefore ?? DEFAULT_REMIND_DAYS);
}

export function sortByUpcoming<T extends Pick<Birthday, "month" | "day">>(list: T[], today: string): T[] {
  return [...list].sort((a, b) => daysUntil(a, today) - daysUntil(b, today));
}
