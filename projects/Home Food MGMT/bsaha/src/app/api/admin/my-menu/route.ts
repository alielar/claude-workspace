import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { people } from "@/db/schema";
import { buildMyMenu } from "@/lib/mine";

export const maxDuration = 60;

/**
 * Builds a person's own menu from the library by the health rules in `healthyFor`, and switches
 * that person to their own menu. `?person=<name>` (default: the owner), `?dry=1` to preview.
 * Only ever adds dishes.
 */
export async function POST(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const name = url.searchParams.get("person");
  const [person] = await db.select().from(people).where(name ? eq(people.name, name) : eq(people.isOwner, true));
  if (!person) return NextResponse.json({ ok: false, error: "no such person" }, { status: 404 });
  const report = await buildMyMenu(person, dry);
  if (!dry && !person.ownMenu) await db.update(people).set({ ownMenu: true }).where(eq(people.id, person.id));
  return NextResponse.json({ ok: true, dry, person: person.name, ...report });
}
