/**
 * The profile on the server · one JSON column, `user_settings.profile` (installed by
 * ensureSettingsColumns and the migrate route). Ali's row never needs one: with nothing stored
 * the primary user reads as PRIMARY_PROFILE, anyone else as GUEST_PROFILE.
 */

import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSettingsColumns } from "@/lib/db/ensureColumns";
import { isPrimaryUser } from "@/lib/user";
import { GUEST_PROFILE, PRIMARY_PROFILE, parseProfile, type Profile } from "@/lib/profile/types";

export async function getProfile(userId: string): Promise<{ profile: Profile; primary: boolean }> {
  await ensureSettingsColumns();
  const primary = await isPrimaryUser(userId);
  const base = primary ? PRIMARY_PROFILE : GUEST_PROFILE;
  try {
    const [row] = await db.select({ profile: userSettings.profile }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return { profile: parseProfile(row?.profile, base), primary };
  } catch { return { profile: base, primary }; }
}

export async function saveProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  const { profile, primary } = await getProfile(userId);
  const next = parseProfile(JSON.stringify({ ...profile, ...patch }), primary ? PRIMARY_PROFILE : GUEST_PROFILE);
  const json = JSON.stringify(next);
  const [existing] = await db.select({ id: userSettings.id }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!existing) await db.insert(userSettings).values({ userId, profile: json });
  else await db.update(userSettings).set({ profile: json, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  return next;
}

/** Shorthand for the crons: does this account have a section. */
export async function userHas(userId: string, section: Profile["sections"][number]): Promise<boolean> {
  const { profile } = await getProfile(userId);
  return profile.sections.includes(section);
}
