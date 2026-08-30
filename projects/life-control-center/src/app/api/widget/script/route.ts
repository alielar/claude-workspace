import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** The Scriptable widget script with this app's key filled in — only for the signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const src = await readFile(path.join(process.cwd(), "public", "widget.js"), "utf8");
  const out = src.replace('const KEY = "";', `const KEY = ${JSON.stringify(process.env.APP_KEY ?? "")};`);
  return new NextResponse(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
