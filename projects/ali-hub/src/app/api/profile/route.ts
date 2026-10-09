/**
 * GET   /api/profile → { profile, primary, email, name } · who is signed in and what they see.
 * PATCH /api/profile { name?, about?, football?, onboarded?, sundayFree? } → the same shape.
 * A guest cannot grant themself a section (`sections` is ignored here · that is Ali's call, in code).
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getProfile, saveProfile } from "@/lib/profile/server";
import type { Me, Profile } from "@/lib/profile/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { profile, primary } = await getProfile(s.user.id);
  const me: Me = { profile, primary, email: s.user.email, name: profile.name || s.user.name };
  return NextResponse.json(me, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Partial<Profile> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "bad body" }, { status: 400 });
  const patch: Partial<Profile> = {};
  if (typeof b.name === "string") patch.name = b.name.trim().slice(0, 40);
  if (typeof b.about === "string") patch.about = b.about.trim().slice(0, 400);
  if (typeof b.football === "boolean") patch.football = b.football;
  if (typeof b.onboarded === "boolean") patch.onboarded = b.onboarded;
  if (typeof b.sundayFree === "boolean") patch.sundayFree = b.sundayFree;
  const profile = await saveProfile(s.user.id, patch);
  const me: Me = { profile, primary: s.user.primary, email: s.user.email, name: profile.name || s.user.name };
  return NextResponse.json(me, { headers: { "Cache-Control": "no-store" } });
}
