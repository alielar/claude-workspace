"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { DISLIKE_TAGS, MEALS, dishes, people, picks, pools, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { forgetSlimDishes } from "@/lib/slim";

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

  // A family dish: name and photo are enough to pick it. Admins can add a recipe from the dish page.
  await db.insert(dishes).values({
    slug, meal, nameEn: name, nameFr: name, nameAr: name, nameLatin: name,
    macros: EMPTY_MACROS, ingredients: [], recipeAr: { steps: [], tips: [] }, tags: [],
    photoUrl, photoCredit: photoUrl ? me.name : null, photoLicense: photoUrl ? "family" : null,
    status: "ready", isCustom: true, createdBy: me.id, createdAt: new Date().toISOString(),
  });
  forgetSlimDishes();
  redirect(`/menu/${slug}`);
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
  await db.update(dishes).set({ recipeAr: { steps, tips }, reviewed: steps.length > 0 }).where(eq(dishes.id, id));
  revalidatePath("/menu", "layout");
}

/**
 * Take a dish off the menu. It keeps its photo, recipe and everything else and moves to the
 * Removed library, where it can be put back at any time. It also leaves any shortlist and any
 * choice that pointed at it, so nobody is told they are getting a dish that is no longer offered.
 */
export async function removeDish(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db.update(dishes).set({ removedAt: new Date().toISOString(), removedBy: me.id }).where(eq(dishes.id, id));
  await db.delete(pools).where(eq(pools.dishId, id));
  await db.delete(picks).where(eq(picks.dishId, id));
  forgetSlimDishes();
  revalidatePath("/", "layout");
  redirect("/menu/removed");
}

/** Put a dish from the Removed library back on the menu. */
export async function restoreDish(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  const [back] = await db
    .update(dishes)
    .set({ removedAt: null, removedBy: null })
    .where(and(eq(dishes.id, id), isNotNull(dishes.removedAt)))
    .returning({ slug: dishes.slug });
  forgetSlimDishes();
  revalidatePath("/", "layout");
  if (back) redirect(`/menu/${back.slug}`);
}

/** Delete for good, from the Removed library only. Nothing else in the app deletes a dish. */
export async function deleteDish(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db.delete(pools).where(eq(pools.dishId, id));
  await db.delete(picks).where(eq(picks.dishId, id));
  await db.delete(dishes).where(and(eq(dishes.id, id), isNotNull(dishes.removedAt)));
  forgetSlimDishes();
  revalidatePath("/", "layout");
  redirect("/menu/removed");
}

/** Admin: set or clear the YouTube link for a dish. */
export async function setVideo(formData: FormData) {
  const me = await currentPerson();
  if (!me?.isAdmin) return;
  const id = Number(formData.get("id"));
  const raw = String(formData.get("video") ?? "").trim();
  const ok = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(raw);
  await db.update(dishes).set({ videoUrl: ok ? raw.slice(0, 300) : null }).where(eq(dishes.id, id));
  revalidatePath("/menu", "layout");
}
