/**
 * PATCH /api/checklist/suggestions/[id]
 * Accept or dismiss a suggestion.
 * Accepting also creates a checklist item from the suggestion data.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistSuggestions, checklistItems } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { action } = await req.json();
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const [suggestion] = await db
    .select()
    .from(checklistSuggestions)
    .where(and(eq(checklistSuggestions.id, id), eq(checklistSuggestions.userId, userId)))
    .limit(1);

  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(checklistSuggestions)
    .set({ status: action === "accept" ? "accepted" : "dismissed" })
    .where(eq(checklistSuggestions.id, id));

  if (action === "accept") {
    const existing = await db
      .select({ sortOrder: checklistItems.sortOrder })
      .from(checklistItems)
      .where(eq(checklistItems.userId, userId))
      .orderBy(desc(checklistItems.sortOrder))
      .limit(1);
    const nextOrder = (existing[0]?.sortOrder ?? -1) + 1;

    await db.insert(checklistItems).values({
      userId,
      title: suggestion.title,
      emoji: suggestion.suggestedEmoji ?? null,
      timeOfDay: "anytime",
      autoSource: null,
      color: "violet",
      notes: suggestion.rationale,
      sortOrder: nextOrder,
    });
  }

  return NextResponse.json({ ok: true });
}
