/**
 * GET  /api/tasks         → list all tasks (todo first, then done)
 * POST /api/tasks         → create a task
 *                            body: { title, notes?, dueDate? (ISO string) }
 *
 * Google Calendar: if the user has a connected Google account with calendar
 * scope, newly created tasks are also pushed to Google Calendar as events.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, accounts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { google } from "googleapis";

// ── helpers ───────────────────────────────────────────────────────────────────

async function getCalendarClient(userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (!account?.access_token) return null;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.user.id))
    .orderBy(desc(tasks.createdAt));

  return NextResponse.json(rows);
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, notes, dueDate } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const dueDateObj = dueDate ? new Date(dueDate) : null;

  // Insert task
  const [task] = await db
    .insert(tasks)
    .values({
      userId: session.user.id,
      title: title.trim(),
      notes: notes ?? null,
      dueDate: dueDateObj,
    })
    .returning();

  // Push to Google Calendar (best-effort — don't fail if calendar isn't available)
  let googleEventId: string | null = null;
  try {
    const calendar = await getCalendarClient(session.user.id);
    if (calendar) {
      const eventStart = dueDate ? new Date(dueDate) : new Date();
      const eventEnd = new Date(eventStart.getTime() + 30 * 60 * 1000); // +30 min

      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title.trim(),
          description: notes ?? undefined,
          start: { dateTime: eventStart.toISOString() },
          end: { dateTime: eventEnd.toISOString() },
        },
      });

      googleEventId = event.data.id ?? null;

      if (googleEventId) {
        await db
          .update(tasks)
          .set({ googleCalendarEventId: googleEventId })
          .where(eq(tasks.id, task.id));
      }
    }
  } catch {
    // Calendar push failed — task is still saved locally
  }

  return NextResponse.json({ ...task, googleCalendarEventId: googleEventId });
}
