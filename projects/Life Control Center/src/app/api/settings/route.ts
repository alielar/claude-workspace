/**
 * GET  /api/settings → get user settings (creates defaults if none exist)
 * PATCH /api/settings → update fields: timezone, newsTopics, newsEmailEnabled, newsEmailTime
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULTS = {
  timezone: "Africa/Casablanca",
  newsTopics: '["football","geopolitics","tech","ai","business"]',
  newsEmailEnabled: true,
  newsEmailTime: "09:00",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!settings) {
    // Auto-create defaults
    const [created] = await db
      .insert(userSettings)
      .values({ userId: session.user.id, ...DEFAULTS })
      .returning();
    return NextResponse.json(created);
  }

  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const allowed = ["timezone", "newsTopics", "newsEmailEnabled", "newsEmailTime"];
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Ensure settings row exists
  const [existing] = await db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (!existing) {
    await db.insert(userSettings).values({ userId: session.user.id, ...DEFAULTS, ...updates });
  } else {
    await db
      .update(userSettings)
      .set(updates)
      .where(eq(userSettings.userId, session.user.id));
  }

  const [updated] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  return NextResponse.json(updated);
}
