/**
 * Which week the weekly brief and podcast cover · pure, safe on the client.
 *
 * Since 2026-10-04 (Ali: "on Sunday, on what happened during the week, instead of Monday") the
 * brief of week W is built on the SUNDAY of week W, after that morning's daily brief, and stays
 * the current one through the following Monday to Saturday. So: Sunday → this ISO week ·
 * any other day → the previous ISO week.
 */

/** ISO week key of a date ("2026-W40"). */
export function weekKeyOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;             // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);          // the Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export const isWeekKey = (s: string) => /^\d{4}-W\d{2}$/.test(s);

/** The week the brief covers on `todayYmd` (see the file comment). */
export function briefWeekKey(todayYmd: string): string {
  const d = new Date(`${todayYmd}T12:00:00Z`);
  if (d.getUTCDay() === 0) return weekKeyOf(todayYmd);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekKeyOf(d.toISOString().slice(0, 10));
}
