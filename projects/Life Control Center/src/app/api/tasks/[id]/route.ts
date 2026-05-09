/**
 * PATCH /api/tasks/[id]  → update task (title, notes, dueDate, status)
 * DELETE /api/tasks/[id] → delete task (also removes Google Calendar event)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { google } from "googleapis";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);
  const body = await req.json();

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Partial<typeof existing> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.completedAt = body.status === "done" ? new Date() : null;
  }

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();

  // Sync status to Google Calendar event
  if (body.status !== undefined && existing.googleCalendarEventId) {
    try {
      const calendar = await getCalendarClient(session.user.id);
      if (calendar) {
        if (body.status === "done") {
          // Mark the event as complete (colorId = 8 = graphite in Google Calendar)
          await calendar.events.patch({
            calendarId: "primary",
            eventId: existing.googleCalendarEventId,
            requestBody: { colorId: "8", summary: `✓ ${existing.title}` },
          });
        }
      }
    } catch {
      // Calendar sync failed — local update succeeded
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete from Google Calendar if synced
  if (existing.googleCalendarEventId) {
    try {
      const calendar = await getCalendarClient(session.user.id);
      if (calendar) {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: existing.googleCalendarEventId,
        });
      }
    } catch {
      // Best-effort — proceed with local delete
    }
  }

  await db.delete(tasks).where(eq(tasks.id, id));
  return NextResponse.json({ success: true });
}
