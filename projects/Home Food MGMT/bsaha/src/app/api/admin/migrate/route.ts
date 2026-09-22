import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/migrate";
import { seedDishes } from "@/db/seedDishes";
import { forgetSlimDishes } from "@/lib/slim";

/** The import of 1,100 dishes takes a while on a cold start. */
export const maxDuration = 60;

/** Installs the schema, then refreshes the built-in library from data/dishes (upsert by slug). */
export async function POST() {
  await ensureSchema();
  const n = await seedDishes();
  forgetSlimDishes();
  return NextResponse.json({ ok: true, dishes: n });
}
