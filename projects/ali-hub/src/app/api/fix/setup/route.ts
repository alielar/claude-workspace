/**
 * GET /api/fix/setup · the one-line Terminal command that connects the Mac to the Fix chat:
 * writes APP_KEY into fix-worker/.env and (re)starts the launchd job. Signed-in browser only ·
 * a call carrying `x-app-key` is refused (403), the same rule as the vault: the key is handed
 * out once, to Ali's own browser, never to something that already has a key.
 *
 * Why: APP_KEY is a "sensitive" variable on Vercel · `vercel env pull` writes a placeholder,
 * so the Mac cannot fetch it on its own (2026-09-27).
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { authPrimary as auth } from "@/lib/auth"; // Ali's section (2026-10-09): a guest gets 401 here

export async function GET() {
  const h = await headers();
  if (h.get("x-app-key")) return NextResponse.json({ error: "browser only" }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.APP_KEY;
  if (!key) return NextResponse.json({ error: "APP_KEY is not set on the server" }, { status: 500 });
  const dir = "~/claude-workspace/projects/ali-hub/fix-worker";
  const plist = "com.ali.ali-hub-fix-worker.plist";
  const cmd = [
    `mkdir -p ${dir}/logs ${dir}/tmp`,
    `printf 'APP_KEY=%s\\n' '${key.replace(/'/g, "'\\''")}' > ${dir}/.env`,
    `cp ${dir}/launchd/${plist} ~/Library/LaunchAgents/`,
    `launchctl bootout gui/$(id -u)/com.ali.ali-hub-fix-worker 2>/dev/null`,
    `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${plist} && echo 'Fix worker connected'`,
  ].join(" && ").replace("2>/dev/null && launchctl bootstrap", "2>/dev/null; launchctl bootstrap");
  return new NextResponse(cmd + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
