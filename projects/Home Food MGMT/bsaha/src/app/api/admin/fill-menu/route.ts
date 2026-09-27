import { NextResponse } from "next/server";
import { fillMenu } from "@/lib/menuFill";

export const maxDuration = 60;

/**
 * Fills the menu up to 30 per meal with the best rated dishes, keeping everything already picked.
 * Only ever adds, never removes. `?dry=1` reports what would change without touching anything.
 */
export async function POST(req: Request) {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const report = await fillMenu(dry);
  return NextResponse.json({ ok: true, dry, ...report });
}
