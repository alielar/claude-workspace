import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/migrate";

export async function POST() {
  await ensureSchema();
  return NextResponse.json({ ok: true });
}
