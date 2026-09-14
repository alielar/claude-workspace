"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { DISLIKE_TAGS, MEALS, dishes, people, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { researchDish } from "@/lib/research";

const EMPTY_MACROS = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

export async function addDish(formData: FormData) {
  const me = await currentPerson();
  if (!me) return;
  await ensureSchema();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const meal = String(formData.get("meal")) as Meal;
  const photo = String(formData.get("photo") ?? "").trim();
  if (!name || !MEALS.includes(meal)) return;
  const photoUrl = /^https?:\/\//i.test(photo) ? photo.slice(0, 500) : null;

  let slug = slugify(name) || "dish";
  const taken = await db.select({ slug: dishes.slug }).from(dishes).where(eq(dishes.slug, slug));
  if (taken.length) slug = `${slug}-${Date.now().toString(36)}`;

  const [row] = await db
    .insert(dishes)
    .values({
      slug, meal, nameEn: name, nameFr: name, nameAr: name, nameLatin: name,
      macros: EMPTY_MACROS, ingredients: [], recipeAr: { steps: [], tips: [] }, tags: [],
      photoUrl, photoCredit: photoUrl ? me.name : null, photoLicense: photoUrl ? "family" : null,
      status: "researching", isCustom: true, createdBy: me.id, createdAt: new Date().toISOString(),
    })
    .returning({ id: dishes.id });

  after(() => researchDish(row.id, name, meal));
  redirect(`/menu/${slug}`);
}

export async function retryResearch(formData: FormData) {
  const me = await currentPerson();
  if (!me) return;
  const id = Number(formData.get("id"));
  const [d] = await db.select().from(dishes).where(eq(dishes.id, id));
  if (!d || d.status === "researching") return;
  await db.update(dishes).set({ status: "researching" }).where(eq(dishes.id, id));
  after(() => researchDish(id, d.nameEn, d.meal));
  revalidatePath(`/menu/${d.slug}`);
}

export async function toggleDislike(formData: FormData) {
  const me = await currentPerson();
  const tag = String(formData.get("tag"));
  if (!me || !DISLIKE_TAGS.includes(tag as (typeof DISLIKE_TAGS)[number])) return;
  const set = new Set(me.dislikes ?? []);
  if (set.has(tag)) set.delete(tag); else set.add(tag);
  await db.update(people).set({ dislikes: [...set] }).where(eq(people.id, me.id));
  revalidatePath("/", "layout");
}

export async function setReviewed(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  const value = formData.get("value") === "1";
  await db.update(dishes).set({ reviewed: value }).where(eq(dishes.id, id));
  revalidatePath("/menu", "layout");
}

export async function saveRecipe(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  const lines = (k: string) => String(formData.get(k) ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const steps = lines("steps");
  const tips = lines("tips");
  if (!steps.length) return;
  await db.update(dishes).set({ recipeAr: { steps, tips }, reviewed: true }).where(eq(dishes.id, id));
  revalidatePath("/menu", "layout");
}

export async function deleteDish(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  await db.delete(dishes).where(eq(dishes.id, id));
  redirect("/menu");
}
