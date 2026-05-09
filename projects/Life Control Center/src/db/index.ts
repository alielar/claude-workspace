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

// The "file:placeholder.db" fallback is only reached at build time when no env var
// is set. createClient() validates URL format but does not open a connection until
// the first query. Real API calls will always have TURSO_DATABASE_URL set.
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:placeholder.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
