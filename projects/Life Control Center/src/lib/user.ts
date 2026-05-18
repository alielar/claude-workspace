/**
 * Single-user identity for Control Center.
 *
 * This app belongs to one person: Ali. No multi-user, no auth flow.
 *
 * getUserId() resolves the user ID by:
 *   1. Checking USER_ID environment variable (set this in Vercel to match
 *      your existing DB user ID if you migrated from Google OAuth)
 *   2. Falling back to the first user row in the database
 *
 * The result is module-cached so only one DB query happens per cold start.
 */

import { db } from "@/db";
import { users } from "@/db/schema";

let _cached: string | null = null;

export async function getUserId(): Promise<string> {
  // Env override — set USER_ID in Vercel to match existing Google OAuth user ID
  if (process.env.USER_ID) return process.env.USER_ID;
  if (_cached) return _cached;

  // Query first user in DB (there should only ever be one)
  try {
    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    _cached = user?.id ?? "";
  } catch {
    _cached = "";
  }
  return _cached;
}
