/**
 * The checklist's idea of "today", shared by server and phone.
 *
 * Ali's day runs on Europe/Madrid time. Anything ticked before 04:00 still
 * counts for the previous day (late-night check-offs).
 */

export const DAY_TZ = "Europe/Madrid";

export function madridHour(now: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: DAY_TZ, hour: "numeric", hour12: false }).format(now),
    10
  ) % 24;
}

export function checklistToday(now: Date = new Date()): string {
  const offset = madridHour(now) < 4 ? -1 : 0;
  const adjusted = new Date(now.getTime() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: DAY_TZ }).format(adjusted);
}

export type DayPart = "morning" | "afternoon" | "evening";

/**
 * Ali's clock: wakes ~07:30 (10:00 weekends), evening starts 21:00, sleeps ~23:30.
 *  morning   04:00–11:59
 *  afternoon 12:00–20:59
 *  evening   21:00–03:59
 */
export function dayPart(now: Date = new Date()): DayPart {
  const h = madridHour(now);
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 21) return "afternoon";
  return "evening";
}
