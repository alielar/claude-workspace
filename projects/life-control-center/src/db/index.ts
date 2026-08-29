/**
 * Turso database client.
 * Uses libsql (SQLite compatible) with Drizzle ORM.
 *
 * The client object is created at module load time (required by DrizzleAdapter),
 * but no actual network connection is established until the first query is executed.
 * This allows the build to complete without TURSO_DATABASE_URL being set.
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// The ":memory:" fallback is only reached at build time when no env var is set.
// Real requests always have TURSO_DATABASE_URL set.
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || ":memory:",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Enable foreign key enforcement (off by default in SQLite)
client.execute("PRAGMA foreign_keys = ON").catch(() => {});

export const db = drizzle(client, { schema });
export type DB = typeof db;
