import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/migrate";
import { seedDishes } from "@/db/seedDishes";

/** Installs the schema, then refreshes the built-in library from data/dishes (upsert by slug). */
export async function POST() {
  await ensureSchema();
  const n = await seedDishes();
  return NextResponse.json({ ok: true, dishes: n });
}
