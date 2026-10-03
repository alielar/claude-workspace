/**
 * /api/fix · the Fix chat's one endpoint. Behind the login gate like every other API:
 * `src/proxy.ts` answers 401 without the session cookie or the `x-app-key` header, and
 * `auth()` checks the same two things again here. The Mac worker uses the key.
 *
 * GET               · the chat feed: newest 40 requests (counts only · pictures via /api/fix/image) + worker heartbeat
 * GET ?queued=1     · the worker's poll: stamps the heartbeat, returns queued requests with images
 * POST              · a new request {clientId, text, images[]} · idempotent on clientId · lands as "held"
 *                     (nothing is built until Ali taps Ship now → /api/fix/ship flips held → queued)
 * PATCH             · {id, status, reply?, commitSha?, batchId?} · the worker's progress, the
 *                     page's cancel (held/queued → skipped) and retry (failed → held).
 *                     {id, text} alone = Ali edits a WAITING message (held only · once released
 *                     by Ship now the text is the Mac's and stays as it was sent).
 *                     shipped / failed → one push to every device.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { fixRequests, fixWorker } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { ensureFixTables } from "@/lib/fix/server";
import { sendToUser } from "@/lib/push/server";
import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TEXT, STATUSES, type FixRequest, type FixStatus } from "@/lib/fix/types";

type Row = typeof fixRequests.$inferSelect;

function parseImages(json: string | null): string[] {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

function toRequest(r: Row, withImages: boolean): FixRequest {
  const imgs = parseImages(r.images);
  return {
    id: r.id, clientId: r.clientId, text: r.text,
    images: withImages ? imgs : null, imageCount: imgs.length,
    status: (STATUSES.includes(r.status as FixStatus) ? r.status : "queued") as FixStatus,
    reply: r.reply ?? null, commitSha: r.commitSha ?? null, batchId: r.batchId ?? null,
    createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    startedAt: r.startedAt?.getTime() ?? null, finishedAt: r.finishedAt?.getTime() ?? null,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await ensureFixTables();
  const url = new URL(req.url);

  if (url.searchParams.get("queued") === "1") {
    const note = (url.searchParams.get("note") ?? "").slice(0, 120) || null;
    await db.insert(fixWorker).values({ userId, seenAt: new Date(), note })
      .onConflictDoUpdate({ target: fixWorker.userId, set: { seenAt: new Date(), note } });
    const rows = await db.select().from(fixRequests)
      .where(and(eq(fixRequests.userId, userId), eq(fixRequests.status, "queued")))
      .orderBy(asc(fixRequests.createdAt));
    return NextResponse.json({ requests: rows.map((r) => toRequest(r, true)) });
  }

  const rows = await db.select().from(fixRequests).where(eq(fixRequests.userId, userId)).orderBy(desc(fixRequests.createdAt)).limit(40);
  const [w] = await db.select().from(fixWorker).where(eq(fixWorker.userId, userId));
  return NextResponse.json({
    requests: rows.map((r) => toRequest(r, false)).reverse(),
    worker: { seenAt: w?.seenAt?.getTime() ?? null, note: w?.note ?? null },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await ensureFixTables();
  const b = await req.json().catch(() => null);
  const clientId = typeof b?.clientId === "string" ? b.clientId.slice(0, 64) : "";
  const text = typeof b?.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";
  const images: string[] = Array.isArray(b?.images) ? b.images.filter((x: unknown) => typeof x === "string").slice(0, MAX_IMAGES) : [];
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  if (!text && images.length === 0) return NextResponse.json({ error: "say what to change" }, { status: 400 });
  for (const img of images) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > MAX_IMAGE_BYTES * 1.4) {
      return NextResponse.json({ error: "image too large or not an image" }, { status: 400 });
    }
  }
  const now = new Date();
  try {
    await db.insert(fixRequests).values({ userId, clientId, text, images: images.length ? JSON.stringify(images) : null, status: "held", createdAt: now, updatedAt: now });
  } catch { /* same clientId sent twice (an offline replay) · the first one stands */ }
  const [row] = await db.select().from(fixRequests).where(eq(fixRequests.clientId, clientId));
  return NextResponse.json({ request: toRequest(row, false) });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await ensureFixTables();
  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  if (Number.isFinite(id) && b?.status === undefined && typeof b?.text === "string") {
    const text = b.text.trim().slice(0, MAX_TEXT);
    const [cur] = await db.select().from(fixRequests).where(and(eq(fixRequests.id, id), eq(fixRequests.userId, userId)));
    if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (cur.status !== "held") return NextResponse.json({ error: "already shipped" }, { status: 409 });
    if (!text && parseImages(cur.images).length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
    await db.update(fixRequests).set({ text, updatedAt: new Date() }).where(and(eq(fixRequests.id, id), eq(fixRequests.status, "held")));
    const [row] = await db.select().from(fixRequests).where(eq(fixRequests.id, id));
    return NextResponse.json({ request: toRequest(row, false) });
  }
  const status = b?.status as FixStatus;
  if (!Number.isFinite(id) || !STATUSES.includes(status)) return NextResponse.json({ error: "id and a valid status required" }, { status: 400 });
  const [cur] = await db.select().from(fixRequests).where(and(eq(fixRequests.id, id), eq(fixRequests.userId, userId)));
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date();
  const set: Partial<Row> = { status, updatedAt: now };
  if (typeof b.reply === "string") set.reply = b.reply.trim().slice(0, 2000) || null;
  if (typeof b.commitSha === "string") set.commitSha = b.commitSha.trim().slice(0, 40) || null;
  if (typeof b.batchId === "string") set.batchId = b.batchId.slice(0, 40);
  if (status === "building") { set.startedAt = now; set.finishedAt = null; }
  if (status === "queued" || status === "held") { set.startedAt = null; set.finishedAt = null; set.reply = null; set.commitSha = null; }
  if (status === "shipped" || status === "failed" || status === "skipped") set.finishedAt = now;
  await db.update(fixRequests).set(set).where(eq(fixRequests.id, id));
  const [row] = await db.select().from(fixRequests).where(eq(fixRequests.id, id));

  if ((status === "shipped" || status === "failed") && cur.status !== status) {
    const head = cur.text.replace(/\s+/g, " ").slice(0, 70) || "your fix";
    try {
      await sendToUser(userId, {
        title: status === "shipped" ? "R2-D2 shipped it" : "R2-D2 needs you",
        body: `${head}${row.reply ? ` · ${row.reply.slice(0, 120)}` : ""}`,
        tag: `fix-${id}`, url: "/r2d2",
      });
    } catch { /* push is a courtesy */ }
  }
  return NextResponse.json({ request: toRequest(row, false) });
}
