import { redirect } from "next/navigation";

/**
 * /workouts/history — removed in Change 4.
 * Sessions: week calendar on /workouts (click any day)
 * PRs: ticker drawer on /workouts
 * Analytics: /workouts/analytics
 */
export default function WorkoutsHistoryPage() {
  redirect("/workouts");
}
