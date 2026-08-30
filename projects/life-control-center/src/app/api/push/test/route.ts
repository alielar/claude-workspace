import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendToUser } from "@/lib/push/server";

/** POST /api/push/test — one test notification to every subscribed device. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await sendToUser(session.user.id, { title: "A L I", body: "Reminders are on. This is what one looks like.", tag: "test", url: "/todo" });
  return NextResponse.json(r);
}
