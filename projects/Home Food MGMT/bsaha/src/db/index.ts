/**
 * Turso (libsql) client with Drizzle. No connection is opened until the first query,
 * so the build passes without TURSO_DATABASE_URL. Dev uses `file:local.db`.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const DB_CONFIGURED = Boolean(process.env.TURSO_DATABASE_URL);

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || ":memory:",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

client.execute("PRAGMA foreign_keys = ON").catch(() => {});

export const db = drizzle(client, { schema });
export type DB = typeof db;
