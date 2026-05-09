/**
 * GET /api/calendar/events
 * Pulls the next 14 days of events from Google Calendar primary calendar.
 * Returns a combined list of Google events + app tasks with a due date.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { accounts, tasks } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { google } from "googleapis";
import { addDays, startOfDay } from "date-fns";

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO datetime
  end: string;
  isAllDay: boolean;
  source: "google" | "task";
  isDone?: boolean;
  taskId?: number;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = addDays(now, 14);

  const events: CalEvent[] = [];

  // ── Google Calendar events ────────────────────────────────────────────────
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    if (account?.access_token) {
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token ?? undefined,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2 });
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      for (const ev of res.data.items ?? []) {
        const isAllDay = !ev.start?.dateTime;
        events.push({
          id: `g-${ev.id}`,
          title: ev.summary ?? "(No title)",
          start: ev.start?.dateTime ?? ev.start?.date ?? now.toISOString(),
          end: ev.end?.dateTime ?? ev.end?.date ?? now.toISOString(),
          isAllDay,
          source: "google",
        });
      }
    }
  } catch {
    // Calendar unavailable — continue with just local tasks
  }

  // ── App tasks with a due date ─────────────────────────────────────────────
  const taskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, session.user.id),
        isNotNull(tasks.dueDate)
      )
    );

  for (const t of taskRows) {
    if (!t.dueDate) continue;
    const start = new Date(t.dueDate);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    events.push({
      id: `t-${t.id}`,
      title: t.title,
      start: start.toISOString(),
      end: end.toISOString(),
      isAllDay: false,
      source: "task",
      isDone: t.status === "done",
      taskId: t.id,
    });
  }

  // Sort by start time
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return NextResponse.json(events);
}
