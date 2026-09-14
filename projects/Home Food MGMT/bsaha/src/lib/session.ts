import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { people, type Person } from "@/db/schema";

const COOKIE = "bsaha_person";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function currentPerson(): Promise<Person | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id)) return null;
  await ensureSchema();
  const [p] = await db.select().from(people).where(eq(people.id, id));
  return p ?? null;
}

export async function setPersonCookie(id: number) {
  (await cookies()).set(COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearPersonCookie() {
  (await cookies()).delete(COOKIE);
}
