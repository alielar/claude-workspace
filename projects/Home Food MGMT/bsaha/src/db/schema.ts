import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const LANGS = ["en", "fr", "ar"] as const;
export type Lang = (typeof LANGS)[number];

export const ROLES = ["family", "cook"] as const;
export type Role = (typeof ROLES)[number];

/** One row per household member and the cook. Identity is just "tap your name". */
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("family"),
  lang: text("lang", { enum: LANGS }).notNull().default("en"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isAway: integer("is_away", { mode: "boolean" }).notNull().default(false),
  /** Children never see macros or calories. */
  isChild: integer("is_child", { mode: "boolean" }).notNull().default(false),
  /** Photo-first screens with almost no reading (Layla). */
  simpleUi: integer("simple_ui", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
});

export type Person = typeof people.$inferSelect;
