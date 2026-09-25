import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const LANGS = ["en", "fr", "ar"] as const;
export type Lang = (typeof LANGS)[number];
/** Light or dark screens; "system" follows the phone. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const ROLES = ["family", "cook", "grocery"] as const;
export type Role = (typeof ROLES)[number];

/** One row per household member and the cook. Identity is just "tap your name". */
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("family"),
  lang: text("lang", { enum: LANGS }).notNull().default("en"),
  theme: text("theme", { enum: THEMES }).notNull().default("system"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  /** The platform owner (Ali). Can switch person on any device and release devices. */
  isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
  isAway: integer("is_away", { mode: "boolean" }).notNull().default(false),
  /** Children never see macros or calories. */
  isChild: integer("is_child", { mode: "boolean" }).notNull().default(false),
  /** Photo-first screens with almost no reading (Layla). */
  simpleUi: integer("simple_ui", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  /** JSON string[] of DISLIKE_TAGS. Filters this person's views only. */
  dislikes: text("dislikes", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull().default(""),
});

export type Person = typeof people.$inferSelect;

/** One row per phone or tablet that picked a name. A device stays locked to its person. */
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  personId: integer("person_id").notNull(),
  /** Bound by the owner: keeps the right to switch person. */
  ownerDevice: integer("owner_device", { mode: "boolean" }).notNull().default(false),
  label: text("label").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
  lastSeenAt: text("last_seen_at").notNull().default(""),
});
export type Device = typeof devices.$inferSelect;

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

/** Tags a person can dislike. Dishes carrying a disliked tag are hidden from that person's views. */
export const DISLIKE_TAGS = ["peppers", "raw_onion", "spicy", "fish", "red_meat", "eggs", "dairy", "nuts"] as const;
export type DislikeTag = (typeof DISLIKE_TAGS)[number];

export type Ingredient = {
  en: string;
  fr: string;
  ar: string;
  qty: number;
  unit: "g" | "ml" | "piece" | "bunch" | "tbsp" | "tsp" | "pinch";
  group: "fresh" | "dry";
};

export type Recipe = { steps: string[]; tips: string[] };

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };

/** USDA MyPlate Kitchen courses. A dish can carry more than one. */
export const CATEGORIES = [
  "main", "side", "salad", "soup", "sandwich", "appetizer", "sauce", "dessert", "breakfast", "bread", "snack", "beverage",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The five MyPlate food groups. */
export const FOOD_GROUPS = ["vegetables", "fruits", "grains", "protein", "dairy"] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];
/** One food group and the USDA amount per serving, e.g. { group: "vegetables", amount: "1/2 cups" }. */
export type FoodGroupAmount = { group: FoodGroup; amount: string };

/** Full USDA nutrition table per serving. Values are numbers in the unit the key says. */
export type Nutrition = Partial<Record<
  | "calories" | "fat_g" | "saturated_fat_g" | "cholesterol_mg" | "sodium_mg" | "carbs_g" | "fiber_g" | "sugars_g" | "added_sugars_g"
  | "protein_g" | "calcium_mg" | "iron_mg" | "potassium_mg" | "vitamin_d_mcg" | "vitamin_c_mg" | "vitamin_a_mcg",
  number
>>;

export const dishes = sqliteTable("dishes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  meal: text("meal", { enum: MEALS }).notNull(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  /** Darija in Arabic script. */
  nameAr: text("name_ar").notNull(),
  /** Darija in Latin letters, shown to the family next to their language. */
  nameLatin: text("name_latin").notNull(),
  descEn: text("desc_en").notNull().default(""),
  descFr: text("desc_fr").notNull().default(""),
  cuisine: text("cuisine").notNull().default(""),
  servings: integer("servings").notNull().default(4),
  prepMin: integer("prep_min").notNull().default(0),
  cookMin: integer("cook_min").notNull().default(0),
  /** JSON Macros, per serving, estimates. */
  macros: text("macros", { mode: "json" }).$type<Macros>().notNull(),
  /** JSON Ingredient[] for `servings` people. */
  ingredients: text("ingredients", { mode: "json" }).$type<Ingredient[]>().notNull(),
  /** JSON Recipe in Darija, Arabic script, written for the cook. */
  recipeAr: text("recipe_ar", { mode: "json" }).$type<Recipe>().notNull(),
  /** The same recipe for family members reading English or French. Empty steps when not available. */
  recipeEn: text("recipe_en", { mode: "json" }).$type<Recipe>().notNull().default({ steps: [], tips: [] }),
  recipeFr: text("recipe_fr", { mode: "json" }).$type<Recipe>().notNull().default({ steps: [], tips: [] }),
  /**
   * Every meal this dish can be picked for. `meal` stays the primary one. A main dish is
   * ["lunch","dinner"], a breakfast is ["breakfast"], a snack or dessert all three.
   */
  meals: text("meals", { mode: "json" }).$type<Meal[]>().notNull().default([]),
  /** JSON Category[]: USDA courses, first one is shown on the card. */
  categories: text("categories", { mode: "json" }).$type<Category[]>().notNull().default([]),
  /** JSON FoodGroupAmount[]: MyPlate food groups with the amount per serving. */
  foodGroups: text("food_groups", { mode: "json" }).$type<FoodGroupAmount[]>().notNull().default([]),
  /** JSON Nutrition: the fuller USDA table behind `macros`. */
  nutrition: text("nutrition", { mode: "json" }).$type<Nutrition>().notNull().default({}),
  /** USDA visitor rating out of 5 and how many people rated. */
  rating: real("rating"),
  ratingCount: integer("rating_count").notNull().default(0),
  /** Where the recipe text comes from (public domain USDA page) and the credit line. */
  sourceUrl: text("source_url"),
  sourceText: text("source_text"),
  /** JSON string[] e.g. ["chicken","cooked_onion"]. */
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  photoUrl: text("photo_url"),
  photoCredit: text("photo_credit"),
  photoLicense: text("photo_license"),
  photoSourceUrl: text("photo_source_url"),
  /** Always "ready" today. Kept for a future background fill-in. */
  status: text("status").notNull().default("ready"),
  /** Main menu = international. Moroccan dishes live in the Moroccan menu only. */
  inMain: integer("in_main", { mode: "boolean" }).notNull().default(true),
  /** Healthy side of the Moroccan menu (hand-picked list). International dishes are all designed lean. */
  isLean: integer("is_lean", { mode: "boolean" }).notNull().default(true),
  /** YouTube link showing how the dish is made. */
  videoUrl: text("video_url"),
  /** Darija checked by the family. */
  reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
  /**
   * The library holds every dish ever added. `onMenu` is the smaller hand-picked set the
   * family and the cook actually see - about 30 per meal. Taking a dish off the menu leaves
   * it in the library with its photo and recipe intact, ready to be put back.
   */
  onMenu: integer("on_menu", { mode: "boolean" }).notNull().default(true),
  /** When it last left the menu, so the library can show the recent ones first. */
  removedAt: text("removed_at"),
  removedBy: integer("removed_by"),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(""),
});

export type Dish = typeof dishes.$inferSelect;

/** Tomorrow's pool: the cook shortlists up to 5 dishes per meal; the family chooses only from these. */
export const pools = sqliteTable("pools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** YYYY-MM-DD, the day the meal is eaten. */
  day: text("day").notNull(),
  meal: text("meal", { enum: MEALS }).notNull(),
  dishId: integer("dish_id").notNull(),
  addedBy: integer("added_by"),
  createdAt: text("created_at").notNull().default(""),
});
export type PoolRow = typeof pools.$inferSelect;

/**
 * One person's choice for one meal of one day, taken from that day's pool.
 * At most one row per person per meal per day: choosing again replaces the earlier choice.
 * Locked at LOCK_HOUR the evening before; after that the cook cooks what is here, and
 * decides herself for any meal nobody chose.
 */
export const picks = sqliteTable("picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** YYYY-MM-DD, the day the meal is eaten. */
  day: text("day").notNull(),
  meal: text("meal", { enum: MEALS }).notNull(),
  dishId: integer("dish_id").notNull(),
  personId: integer("person_id").notNull(),
  createdAt: text("created_at").notNull().default(""),
});
export type PickRow = typeof picks.$inferSelect;
