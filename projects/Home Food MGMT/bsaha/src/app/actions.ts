"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { LANGS, ROLES, devices, people, type Lang } from "@/db/schema";
import { currentSession, deviceId, deviceLabel, setDeviceCookie } from "@/lib/session";

/**
 * Tap a name. A fresh device gets bound to that person for good.
 * A device already bound is refused, unless it is an owner device (it may switch).
 * Bootstrap: the very first device that claims the owner's name becomes the owner device.
 */
export async function choosePerson(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await ensureSchema();
  const [target] = await db.select().from(people).where(eq(people.id, id));
  if (!target) return;

  const session = await currentSession();
  const now = new Date().toISOString();
  if (session) {
    if (!session.device.ownerDevice) redirect("/today"); // locked
    await db.update(devices).set({ personId: id, lastSeenAt: now }).where(eq(devices.id, session.device.id));
    redirect("/today");
  }

  let did = await deviceId();
  if (!did) {
    did = crypto.randomUUID();
    await setDeviceCookie(did);
  }
  let ownerDevice = false;
  if (target.isOwner) {
    const existing = await db.select({ id: devices.id }).from(devices).where(eq(devices.ownerDevice, true));
    ownerDevice = existing.length === 0; // first claim of the owner's name = the master device
  }
  await db
    .insert(devices)
    .values({ id: did, personId: id, ownerDevice, label: await deviceLabel(), createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: devices.id, set: { personId: id, lastSeenAt: now } });
  redirect("/today");
}

/** Owner devices only: go back to the name screen to pick someone else. */
export async function switchPerson() {
  const session = await currentSession();
  if (!session?.device.ownerDevice) redirect("/today");
  redirect("/?switch=1");
}

export async function setMyLanguage(formData: FormData) {
  const session = await currentSession();
  const lang = String(formData.get("lang")) as Lang;
  if (!session || !LANGS.includes(lang)) return;
  await db.update(people).set({ lang }).where(eq(people.id, session.person.id));
  revalidatePath("/", "layout");
}

async function requireAdmin() {
  const session = await currentSession();
  if (!session?.person.isAdmin) throw new Error("Admins only");
  return session;
}

async function requireOwner() {
  const session = await currentSession();
  if (!session?.person.isOwner || !session.device.ownerDevice) throw new Error("Owner only");
  return session;
}

const BOOL_FIELDS = ["isAdmin", "isAway", "isChild", "simpleUi"] as const;
type BoolField = (typeof BOOL_FIELDS)[number];

export async function togglePersonFlag(formData: FormData) {
  const { person: me } = await requireAdmin();
  const id = Number(formData.get("id"));
  const field = String(formData.get("field")) as BoolField;
  const next = formData.get("value") === "1";
  if (!Number.isFinite(id) || !BOOL_FIELDS.includes(field)) return;
  if (field === "isAdmin" && id === me.id && !next) return; // never lock yourself out
  await db.update(people).set({ [field]: next }).where(eq(people.id, id));
  revalidatePath("/people");
}

export async function renamePerson(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!Number.isFinite(id) || !name) return;
  await db.update(people).set({ name }).where(eq(people.id, id));
  revalidatePath("/", "layout");
}

export async function setPersonLanguage(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const lang = String(formData.get("lang")) as Lang;
  if (!Number.isFinite(id) || !LANGS.includes(lang)) return;
  await db.update(people).set({ lang }).where(eq(people.id, id));
  revalidatePath("/", "layout");
}

export async function addPerson(formData: FormData) {
  await requireAdmin();
  await ensureSchema();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const role = String(formData.get("role")) as (typeof ROLES)[number];
  if (!name || !ROLES.includes(role)) return;
  const rows = await db.select({ s: people.sortOrder }).from(people);
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.s), 0) + 1;
  await db.insert(people).values({ name, role, lang: role === "family" ? "en" : "ar", sortOrder, createdAt: new Date().toISOString() });
  revalidatePath("/people");
}

export async function deletePerson(formData: FormData) {
  const { person: me } = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id === me.id) return;
  await db.delete(devices).where(eq(devices.personId, id));
  await db.delete(people).where(eq(people.id, id));
  revalidatePath("/", "layout");
}

/** Owner: unbind one device. That phone sees "Who are you?" again on its next visit. */
export async function releaseDevice(formData: FormData) {
  const { device: mine } = await requireOwner();
  const id = String(formData.get("id"));
  if (id === mine.id) return; // never release the device you are holding
  await db.delete(devices).where(eq(devices.id, id));
  revalidatePath("/people");
}

/** Owner: unbind every device of one person. */
export async function releasePersonDevices(formData: FormData) {
  const { device: mine } = await requireOwner();
  const personId = Number(formData.get("personId"));
  if (!Number.isFinite(personId)) return;
  const rows = await db.select({ id: devices.id }).from(devices).where(eq(devices.personId, personId));
  for (const r of rows) if (r.id !== mine.id) await db.delete(devices).where(and(eq(devices.id, r.id), eq(devices.personId, personId)));
  revalidatePath("/people");
}

/** Owner: promote or demote a device's right to switch person. */
export async function setOwnerDevice(formData: FormData) {
  const { device: mine } = await requireOwner();
  const id = String(formData.get("id"));
  const value = formData.get("value") === "1";
  if (id === mine.id && !value) return; // keep at least this one
  await db.update(devices).set({ ownerDevice: value }).where(eq(devices.id, id));
  revalidatePath("/people");
}
