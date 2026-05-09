/**
 * GET /api/news/cron
 * Called by Vercel Cron Jobs at 9 AM (user's timezone).
 * Protected by CRON_SECRET to prevent unauthorized triggering.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{ "path": "/api/news/cron", "schedule": "0 9 * * *" }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, newsBriefs, userSettings } from "@/db/schema";
import { generateNewsBrief, formatBriefAsEmail } from "@/lib/news-brief";
import { todayInTz } from "@/lib/utils";
import { Resend } from "resend";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select().from(users);

  for (const user of allUsers) {
    try {
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, user.id));

      if (!settings?.newsEmailEnabled) continue;

      const tz = settings?.timezone ?? "Europe/Madrid";
      const today = todayInTz(tz);

      // Skip if already generated today
      const [existing] = await db
        .select()
        .from(newsBriefs)
        .where(and(eq(newsBriefs.userId, user.id), eq(newsBriefs.date, today)));

      if (existing?.emailSentAt) continue;

      const brief = await generateNewsBrief(today);

      let briefId: number;
      if (existing) {
        briefId = existing.id;
      } else {
        const [saved] = await db
          .insert(newsBriefs)
          .values({ userId: user.id, date: today, content: JSON.stringify(brief) })
          .returning();
        briefId = saved.id;
      }

      // Send email
      if (user.email && process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: process.env.NEWS_EMAIL_FROM ?? "Life Control Center <onboarding@resend.dev>",
          to: process.env.NEWS_EMAIL_TO ?? user.email,
          subject: `Daily Brief — ${new Date(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
          html: formatBriefAsEmail(brief),
        });

        await db
          .update(newsBriefs)
          .set({ emailSentAt: new Date() })
          .where(eq(newsBriefs.id, briefId));
      }
    } catch (err) {
      console.error(`Failed to generate brief for user ${user.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
