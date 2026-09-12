/**
 * /api/vault · blind storage for the password vault (2026-09-12).
 *
 *  GET    → { meta: {salt, iterations, verifier} | null, items: [{id, blob, updatedAt}] }
 *  POST   → first-time setup: { salt, iterations, verifier } (refused once a vault exists)
 *  PUT    → { items: [{id, blob, updatedAt, deleted?}] } · batch upsert (one item or a whole CSV import)
 *  PATCH  → passphrase change: { meta, items } replaces everything in one go
 *
 * Only the signed-in cookie session may call this · the widget/pinger key (`x-app-key`)
 * is refused on purpose: that key lives in a Scriptable script and a cron pinger and
 * has no business near the vault, even for ciphertext.
 * Never cached by the service worker (see public/sw.js).
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ensureVaultTables, readItems, readMeta, replaceAll, upsertItem, writeMeta, type MetaRow } from "@/lib/vault/server";

const noStore = { "Cache-Control": "no-store" };

async function user(req: NextRequest): Promise<string | NextResponse> {
  if (req.headers.get("x-app-key")) return NextResponse.json({ error: "The app key cannot open the vault." }, { status: 403, headers: noStore });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  await ensureVaultTables();
  return session.user.id;
}

const B64 = /^[A-Za-z0-9+/]+=*$/;
function validMeta(m: unknown): m is MetaRow {
  const x = m as MetaRow;
  return !!x && typeof x.salt === "string" && B64.test(x.salt) && x.salt.length >= 16 && x.salt.length <= 128
    && Number.isInteger(x.iterations) && x.iterations >= 100_000 && x.iterations <= 5_000_000
    && typeof x.verifier === "string" && B64.test(x.verifier) && x.verifier.length <= 512;
}
type InItem = { id: string; blob: string; updatedAt: number; deleted?: boolean };
function validItem(i: unknown): i is InItem {
  const x = i as InItem;
  return !!x && typeof x.id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(x.id)
    && typeof x.blob === "string" && (x.deleted ? true : B64.test(x.blob) && x.blob.length >= 24) && x.blob.length <= 200_000
    && Number.isFinite(Number(x.updatedAt));
}

export async function GET(req: NextRequest) {
  const u = await user(req); if (u instanceof NextResponse) return u;
  const [meta, items] = await Promise.all([readMeta(u), readItems(u)]);
  return NextResponse.json({ meta, items: items.map((i) => ({ id: i.id, blob: i.blob, updatedAt: i.updated_at })) }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const u = await user(req); if (u instanceof NextResponse) return u;
  const body = await req.json().catch(() => null);
  if (!validMeta(body)) return NextResponse.json({ error: "Bad setup payload" }, { status: 400, headers: noStore });
  if (await readMeta(u)) return NextResponse.json({ error: "A vault already exists. Change the passphrase from inside it." }, { status: 409, headers: noStore });
  await writeMeta(u, { salt: body.salt, iterations: body.iterations, verifier: body.verifier });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  const u = await user(req); if (u instanceof NextResponse) return u;
  if (!(await readMeta(u))) return NextResponse.json({ error: "Set up the vault first" }, { status: 409, headers: noStore });
  const body = await req.json().catch(() => null) as { items?: unknown[] } | null;
  const items = Array.isArray(body?.items) ? body!.items : [];
  if (items.length === 0 || items.length > 2000 || !items.every(validItem)) return NextResponse.json({ error: "Bad items" }, { status: 400, headers: noStore });
  for (const it of items as InItem[]) await upsertItem(u, it.id, it.blob, Math.round(Number(it.updatedAt)), !!it.deleted);
  return NextResponse.json({ ok: true, count: items.length }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  const u = await user(req); if (u instanceof NextResponse) return u;
  const body = await req.json().catch(() => null) as { meta?: unknown; items?: unknown[] } | null;
  if (!body || !validMeta(body.meta) || !Array.isArray(body.items) || body.items.length > 5000 || !body.items.every(validItem)) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400, headers: noStore });
  }
  await replaceAll(u, body.meta, (body.items as InItem[]).filter((i) => !i.deleted).map((i) => ({ id: i.id, blob: i.blob, updatedAt: Math.round(Number(i.updatedAt)) })));
  return NextResponse.json({ ok: true }, { headers: noStore });
}
