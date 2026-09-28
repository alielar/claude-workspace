/**
 * POST /api/mind/grade · multipart: audio (≤ 2 min), part (callback | new), topicId.
 * Transcribes verbatim, computes the metrics, grades with the fixed rubric, stores the
 * session and moves the topic's callback schedule. The audio is not kept.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gradeRecording } from "@/lib/mind/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "bad upload" }, { status: 400 }); }
  const audio = form.get("audio");
  const part = String(form.get("part") ?? "");
  const topicId = Number(form.get("topicId"));
  if (!(audio instanceof Blob) || audio.size < 2000) return NextResponse.json({ error: "no audio" }, { status: 400 });
  if (audio.size > 8_000_000) return NextResponse.json({ error: "recording too large" }, { status: 413 });
  if ((part !== "callback" && part !== "new") || !Number.isFinite(topicId)) return NextResponse.json({ error: "part and topicId required" }, { status: 400 });
  const out = await gradeRecording(session.user.id, part, topicId, await audio.arrayBuffer(), audio.type);
  if ("error" in out) return NextResponse.json(out, { status: 502 });
  return NextResponse.json(out);
}
