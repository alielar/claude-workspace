"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { LANGS, ROLES, people, type Lang } from "@/db/schema";
import { clearPersonCookie, currentPerson, setPersonCookie } from "@/lib/session";

export async function choosePerson(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await setPersonCookie(id);
  redirect("/today");
}

export async function switchPerson() {
  await clearPersonCookie();
  redirect("/");
}

export async function setMyLanguage(formData: FormData) {
  const me = await currentPerson();
  const lang = String(formData.get("lang")) as Lang;
  if (!me || !LANGS.includes(lang)) return;
  await db.update(people).set({ lang }).where(eq(people.id, me.id));
  revalidatePath("/", "layout");
}

async function requireAdmin() {
  const me = await currentPerson();
  if (!me?.isAdmin) throw new Error("Admins only");
  return me;
}

const BOOL_FIELDS = ["isAdmin", "isAway", "isChild", "simpleUi"] as const;
type BoolField = (typeof BOOL_FIELDS)[number];

export async function togglePersonFlag(formData: FormData) {
  const me = await requireAdmin();
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
  const role = String(formData.get("role"));
  if (!name || !ROLES.includes(role as (typeof ROLES)[number])) return;
  const rows = await db.select({ s: people.sortOrder }).from(people);
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.s), 0) + 1;
  await db.insert(people).values({
    name,
    role: role as (typeof ROLES)[number],
    lang: role === "cook" ? "ar" : "en",
    sortOrder,
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/people");
}

export async function deletePerson(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id === me.id) return;
  await db.delete(people).where(eq(people.id, id));
  revalidatePath("/", "layout");
}
