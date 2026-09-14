import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { devices, people, type Device } from "@/db/schema";

export async function listPeople() {
  await ensureSchema();
  return db.select().from(people).orderBy(asc(people.sortOrder), asc(people.id));
}

export async function devicesByPerson(): Promise<Map<number, Device[]>> {
  await ensureSchema();
  const rows = await db.select().from(devices).orderBy(asc(devices.createdAt));
  const map = new Map<number, Device[]>();
  for (const r of rows) map.set(r.personId, [...(map.get(r.personId) ?? []), r]);
  return map;
}

export async function personById(id: number) {
  const [p] = await db.select().from(people).where(eq(people.id, id));
  return p ?? null;
}
