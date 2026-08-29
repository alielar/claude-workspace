/** Shape returned by GET /api/checklist — shared by the Today screen and the editor. */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export type ChecklistItem = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  timeOfDay: TimeOfDay;
  completedToday: boolean;
  streak: number;
  last7: boolean[];
  source: "manual" | "workout";
  autoSource: string | null;
  color: string;
  notes: string | null;
  href?: string;
};

export type ChecklistData = {
  items: ChecklistItem[];
  overallStreak: number;
  monthlyPct: { date: string; pct: number }[];
  thirtyDayAvg: number;
  bestStreak30: number;
};

export const ITEM_COLORS: Record<string, string> = {
  violet: "#7C4DFF",
  cyan:   "#64FFDA",
  green:  "#6FD49A",
  amber:  "#FFC15C",
  red:    "#FF8A8A",
  pink:   "#F472B6",
};

export function itemColor(id: string | null | undefined): string {
  return ITEM_COLORS[id ?? "violet"] ?? ITEM_COLORS.violet;
}
