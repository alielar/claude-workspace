import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authRequired } from "@/lib/session";

/** Who is signed in, and whether login is switched on at all. */
export async function GET() {
  const s = await auth();
  return NextResponse.json({ required: authRequired(), email: s?.user.email ?? null });
}
