import { cache } from "react";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { devices, people, type Device, type Person } from "@/db/schema";

/**
 * Identity is the device. A phone that picks a name gets a random device id in a cookie and a
 * `devices` row binding it to that person. From then on the phone is that person.
 * Only a device flagged `ownerDevice` (Ali's) can switch to another name. Admins release devices.
 */
const COOKIE = "bsaha_device";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Session = { device: Device; person: Person } | null;

/** One DB round-trip per request, shared by layout and page. */
export const currentSession = cache(async (): Promise<Session> => {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  await ensureSchema();
  const [row] = await db
    .select({ device: devices, person: people })
    .from(devices)
    .innerJoin(people, eq(people.id, devices.personId))
    .where(eq(devices.id, id));
  return row ?? null;
});

export async function currentPerson(): Promise<Person | null> {
  return (await currentSession())?.person ?? null;
}

export async function deviceId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function setDeviceCookie(id: string) {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR });
}

/** "iPhone", "iPad", "Android", "Mac", "Windows" or "Phone" — enough to recognise a device in the list. */
export async function deviceLabel(): Promise<string> {
  const ua = (await headers()).get("user-agent") ?? "";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Phone";
}
