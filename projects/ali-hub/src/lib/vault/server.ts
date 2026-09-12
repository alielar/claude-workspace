/**
 * Vault · server side (2026-09-12). Blind storage: salt + verifier per user, opaque
 * blobs per item. Tables self-create (the migrate route also spreads VAULT_DDL).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const VAULT_DDL = [
  `CREATE TABLE IF NOT EXISTS vault_meta (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blob TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS ix_vault_items_user ON vault_items(user_id, deleted)`,
];

let ready: Promise<void> | null = null;
export function ensureVaultTables(): Promise<void> {
  ready ??= (async () => { for (const ddl of VAULT_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } } })();
  return ready;
}

export type MetaRow = { salt: string; iterations: number; verifier: string };
export type ItemRow = { id: string; blob: string; updated_at: number };

export async function readMeta(userId: string): Promise<MetaRow | null> {
  const r = await db.run(sql`SELECT salt, iterations, verifier FROM vault_meta WHERE user_id = ${userId}`);
  const row = r.rows[0] as unknown as MetaRow | undefined;
  return row ? { salt: String(row.salt), iterations: Number(row.iterations), verifier: String(row.verifier) } : null;
}

export async function writeMeta(userId: string, m: MetaRow): Promise<void> {
  await db.run(sql`INSERT INTO vault_meta (user_id, salt, iterations, verifier) VALUES (${userId}, ${m.salt}, ${m.iterations}, ${m.verifier})
    ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, iterations = excluded.iterations, verifier = excluded.verifier, updated_at = unixepoch() * 1000`);
}

export async function readItems(userId: string): Promise<ItemRow[]> {
  const r = await db.run(sql`SELECT id, blob, updated_at FROM vault_items WHERE user_id = ${userId} AND deleted = 0 ORDER BY updated_at DESC`);
  return (r.rows as unknown as ItemRow[]).map((x) => ({ id: String(x.id), blob: String(x.blob), updated_at: Number(x.updated_at) }));
}

/** Upsert · last writer wins on updated_at. `deleted` tombstones the row (blob wiped). */
export async function upsertItem(userId: string, id: string, blob: string, updatedAt: number, deleted: boolean): Promise<void> {
  await db.run(sql`INSERT INTO vault_items (id, user_id, blob, updated_at, deleted) VALUES (${id}, ${userId}, ${deleted ? "" : blob}, ${updatedAt}, ${deleted ? 1 : 0})
    ON CONFLICT(id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at, deleted = excluded.deleted
    WHERE vault_items.user_id = excluded.user_id AND vault_items.updated_at <= excluded.updated_at`);
}

/** Replace everything at once (passphrase change: every blob re-encrypted on the phone). */
export async function replaceAll(userId: string, meta: MetaRow, items: { id: string; blob: string; updatedAt: number }[]): Promise<void> {
  await db.run(sql`DELETE FROM vault_items WHERE user_id = ${userId}`);
  for (const it of items) await upsertItem(userId, it.id, it.blob, it.updatedAt, false);
  await writeMeta(userId, meta);
}
