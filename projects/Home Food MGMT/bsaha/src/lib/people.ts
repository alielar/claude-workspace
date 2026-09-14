import { asc } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { people } from "@/db/schema";

export async function listPeople() {
  await ensureSchema();
  return db.select().from(people).orderBy(asc(people.sortOrder), asc(people.id));
}
