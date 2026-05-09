/**
 * POST /api/news/generate
 * Generate today's news brief (or return cached version if already generated today).
 * Also sends the email if it hasn't been sent yet.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { newsBriefs, userSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateNewsBrief, formatBriefAsEmail } from "@/lib/news-brief";
import { todayInTz } from "@/lib/utils";
import { Resend } from "resend";

export async function POST() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Get user timezone
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  const tz = settings?.timezone ?? "Europe/Madrid";
  const today = todayInTz(tz);

  // Check if brief already generated today
  const [existing] = await db
    .select()
    .from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)));

  if (existing) {
    return NextResponse.json(JSON.parse(existing.content));
  }

  // Generate new brief
  const brief = await generateNewsBrief(today);

  // Save to DB
  const [saved] = await db
    .insert(newsBriefs)
    .values({
      userId,
      date: today,
      content: JSON.stringify(brief),
    })
    .returning();

  // Send email if enabled
  if (settings?.newsEmailEnabled && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.NEWS_EMAIL_FROM ?? "Life Control Center <onboarding@resend.dev>",
        to: process.env.NEWS_EMAIL_TO!,
        subject: `Daily Brief — ${new Date(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
        html: formatBriefAsEmail(brief),
      });

      // Mark email as sent
      await db
        .update(newsBriefs)
        .set({ emailSentAt: new Date() })
        .where(eq(newsBriefs.id, saved.id));
    } catch (err) {
      console.error("Failed to send news email:", err);
    }
  }

  return NextResponse.json(brief);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const tz = settings?.timezone ?? "Europe/Madrid";
  const today = todayInTz(tz);

  const [existing] = await db
    .select()
    .from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)));

  if (existing) return NextResponse.json(JSON.parse(existing.content));
  return NextResponse.json(null);
}
