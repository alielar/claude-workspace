/**
 * Database schema for Control Center
 * Drizzle ORM + Turso (SQLite)
 *
 * Only tables the code still reads/writes are declared here. Old tables that
 * still exist in the database (NextAuth accounts/sessions, workout v1, tasks,
 * goals) are left alone in Turso but no longer declared — nothing touches them.
 *
 * Active:   users, user_settings, news_briefs, checklist_*, weekly_reviews
 * Archived: programs / workout_plans / exercise_db / plan_exercises /
 *           gym_sessions / gym_sets / exercise_prs / workout_coach / run_logs,
 *           books / reading_* / annotations / pdf_blobs, word_bank_entries,
 *           mood_entries, sleep_entries (data kept, UI out of navigation)
 */

import { sql } from "drizzle-orm";
import {
  text,
  integer,
  real,
  sqliteTable,
} from "drizzle-orm/sqlite-core";

// ─── User ─────────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").notNull().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── User Settings ─────────────────────────────────────────────────────────────

export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  // News preferences stored as JSON string: ["football","geopolitics","tech","ai","business"]
  newsTopics: text("news_topics").notNull().default('["football","geopolitics","tech","ai","business"]'),
  newsEmailEnabled: integer("news_email_enabled", { mode: "boolean" }).notNull().default(true),
  newsEmailTime: text("news_email_time").notNull().default("09:00"),
  /** Enabled YouTube channel ids for the brief as a JSON array; null = all of YT_CHANNELS. */
  newsChannels: text("news_channels"),
  /** Current kettlebell weight. 12 until every movement is mastered, then 16. */
  kettlebellKg: real("kettlebell_kg").notNull().default(12),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Train — kettlebell era (Phase 3) ─────────────────────────────────────────

/**
 * Workout templates. Two rows per user: "w1" (AMRAP) and "w2" (straight sets).
 * `exercises` is JSON — see TrainExercise in src/lib/train/types.ts.
 * `assignedDays` is reserved for a future fixed schedule (JSON array of "mon".."sun"); null = alternate.
 */
export const kbWorkouts = sqliteTable("kb_workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),                      // "w1" | "w2"
  name: text("name").notNull(),
  format: text("format").notNull(),                // "amrap" | "sets"
  amrapMinutes: integer("amrap_minutes"),          // w1 only
  restSeconds: integer("rest_seconds").notNull().default(90), // w2 only
  exercises: text("exercises").notNull().default("[]"),
  assignedDays: text("assigned_days"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** One finished (or abandoned) workout. `clientId` makes offline replays idempotent. */
export const kbSessions = sqliteTable("kb_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().unique(),
  workoutKey: text("workout_key").notNull(),       // "w1" | "w2"
  date: text("date").notNull(),                    // YYYY-MM-DD (Europe/Madrid)
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  durationSeconds: integer("duration_seconds"),
  rounds: integer("rounds"),                       // w1
  weightKg: real("weight_kg"),                     // kettlebell used
  log: text("log").notNull().default("{}"),        // JSON: w1 round timestamps / w2 sets done
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Books — the waiting list (Phase 4) ───────────────────────────────────────

/** Physical books to read. Seeded from BOOK_SEED by slug; custom ones have slug "c:<clientId>". */
export const readingQueue = sqliteTable("reading_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug"),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  author: text("author").notNull(),
  isbn: text("isbn"),
  coverUrl: text("cover_url"),
  covers: text("covers"),          // what this book covers
  payoff: text("payoff"),          // what I'll get out of it
  pages: integer("pages"),
  year: integer("year"),
  status: text("status").notNull().default("queue"), // queue | reading | finished
  sortOrder: integer("sort_order").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── To-do (Phase 5) ──────────────────────────────────────────────────────────

/**
 * One row per task. `clientId` is generated on the phone and unique, so every
 * write is an upsert (safe to replay from the offline outbox). Soft-deleted rows
 * stay so a late replay cannot resurrect a task. `updatedAt` = last-writer-wins.
 */
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().unique(),
  title: text("title").notNull(),
  area: text("area").notNull().default("personal"),   // "work" | "personal"
  notes: text("notes"),
  project: text("project"),
  dueDate: text("due_date"),           // YYYY-MM-DD
  dueTime: text("due_time"),           // HH:MM
  evening: integer("evening", { mode: "boolean" }).notNull().default(false),
  someday: integer("someday", { mode: "boolean" }).notNull().default(false),
  priority: integer("priority").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  doneAt: integer("done_at", { mode: "timestamp_ms" }),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Running (archived) ───────────────────────────────────────────────────────

/** Running log entries */
export const runLogs = sqliteTable("run_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // ISO date string "YYYY-MM-DD"
  distanceKm: real("distance_km").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  // Computed: durationSeconds / distanceKm → seconds per km
  paceSecondsPerKm: integer("pace_seconds_per_km"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── News ──────────────────────────────────────────────────────────────────────

/** One daily news brief — generated once at 9 AM, cached here */
export const newsBriefs = sqliteTable("news_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // "YYYY-MM-DD"
  // Full brief as JSON string: { stories: [{ headline, summary, whyMatters, category }] }
  content: text("content").notNull(),
  emailSentAt: integer("email_sent_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Library ───────────────────────────────────────────────────────────────────

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  topic: text("topic"),
  // "not_started" | "reading" | "finished"
  status: text("status").notNull().default("not_started"),
  // Target reading month (1-12, for the 12-book/year plan)
  targetMonth: integer("target_month"),
  targetYear: integer("target_year"),
  totalPages: integer("total_pages"),
  coverUrl: text("cover_url"),
  // true for public domain books (Meditations, Communist Manifesto, The Republic)
  isPublicDomain: integer("is_public_domain", { mode: "boolean" }).notNull().default(false),
  publicDomainUrl: text("public_domain_url"),
  // Path/key to uploaded PDF in storage
  pdfKey: text("pdf_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Reading period — set when user clicks Start / Finish
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const readingProgress = sqliteTable("reading_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  currentPage: integer("current_page").notNull().default(0),
  lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }),
  bookmarkText: text("bookmark_text"),
  bookmarkPage: integer("bookmark_page"),
});

export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  selectedText: text("selected_text").notNull(),
  note: text("note"),
  color: text("color").notNull().default("yellow"), // "yellow" | "blue" | "green" | "red"
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Reading sessions — one row per reading session for streak + habit tracking */
export const readingSessions = sqliteTable("reading_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startPage: integer("start_page").notNull().default(1),
  endPage: integer("end_page").notNull().default(1),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  /** Europe/Madrid date YYYY-MM-DD — used for streak calculation */
  date: text("date").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Reading notes — things learned during reading, with SRS review */
export const readingNotes = sqliteTable("reading_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bookId: integer("book_id").references(() => books.id, { onDelete: "cascade" }),
  sessionId: integer("session_id"),
  pageNumber: integer("page_number"),
  content: text("content").notNull(),
  interval: integer("interval").notNull().default(0), // SRS step index 0–6
  streak: integer("streak").notNull().default(0),
  nextReviewDate: text("next_review_date").notNull(),
  masteryStatus: text("mastery_status").notNull().default("new"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Raw PDF bytes stored as base64 — one row per uploaded book */
export const pdfBlobs = sqliteTable("pdf_blobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .unique()
    .references(() => books.id, { onDelete: "cascade" }),
  // Base64-encoded PDF binary
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Word Bank ──────────────────────────────────────────────────────────────────

export const wordBankEntries = sqliteTable("word_bank_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  definition: text("definition").notNull(),
  etymology: text("etymology"),
  exampleSentence: text("example_sentence"),
  // Part of speech: "noun" | "verb" | "adjective" | "adverb" | "phrase" | etc.
  partOfSpeech: text("part_of_speech"),
  // Language: "en" | "fr" | "darija"
  language: text("language").notNull().default("en"),
  // Source book ID (optional)
  bookId: integer("book_id").references(() => books.id, { onDelete: "set null" }),
  // SM-2 fields kept for backwards compat — NOT used by new SRS logic
  easeFactor: real("ease_factor").notNull().default(2.5),
  // Repurposed as step index (0–6) into the fixed-interval progression
  interval: integer("interval").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  // Consecutive "Good" or "Easy" reviews without an "Again"
  streak: integer("streak").notNull().default(0),
  // ISO date string "YYYY-MM-DD"
  nextReviewDate: text("next_review_date").notNull(),
  // "new" | "learning" | "mastered"
  masteryStatus: text("mastery_status").notNull().default("new"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Workouts (archived gym system — data kept) ───────────────────────────────

/** Named training programs (e.g. "Beta", "Alpha") */
export const programs = sqliteTable("programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),           // "Beta"
  description: text("description"),
  cycles: integer("cycles"),             // 7
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Workout days within a program (Push / Pull / Legs / Push-Up SESH) */
export const workoutPlans = sqliteTable("workout_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),           // "Push", "Pull", "Legs", etc.
  type: text("type").notNull().default("strength"), // "strength" | "skill" | "cardio"
  sortOrder: integer("sort_order").notNull().default(0),
  assignedDays: text("assigned_days"), // JSON array: ["mon","thu"] or null
  targetMuscles: text("target_muscles"), // JSON array: ["chest","triceps"] or null
});

/** Master exercise library — one row per unique movement */
export const exerciseDb = sqliteTable("exercise_db", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  primaryMuscle: text("primary_muscle"),   // "chest" | "lats" | "quads" | ...
  secondaryMuscles: text("secondary_muscles"), // JSON array string
  equipment: text("equipment"),            // "dumbbell" | "cable" | "bodyweight" | ...
  notes: text("notes"),
  // Default weight increment for progressive overload suggestions
  weightIncrement: real("weight_increment").notNull().default(2.5),
  // Demo video: YouTube embed URL or Vercel Blob URL
  videoUrl: text("video_url"),
  videoType: text("video_type"), // "youtube" | "upload" | null
  // How sets are tracked in the active session
  // "reps_weight" | "reps_only" | "time_weight" | "time_only" | "distance"
  trackingType: text("tracking_type").notNull().default("reps_weight"),
  // Alternative group ID — exercises with the same group are interchangeable
  alternativeGroupId: text("alternative_group_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Exercise slots in a workout plan, with set prescriptions */
export const planExercises = sqliteTable("plan_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id")
    .notNull()
    .references(() => workoutPlans.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exerciseDb.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  // JSON array: [{type, repMin, repMax, restS}]
  setConfig: text("set_config").notNull().default("[]"),
});

/** Actual logged gym sessions */
export const gymSessions = sqliteTable("gym_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => workoutPlans.id),
  programId: integer("program_id").references(() => programs.id),
  workoutName: text("workout_name").notNull(),
  originalTemplateName: text("original_template_name"), // backup if workout deleted
  date: text("date").notNull(),               // "YYYY-MM-DD"
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Individual sets within a logged gym session */
export const gymSets = sqliteTable("gym_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => gymSessions.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").references(() => exerciseDb.id),
  exerciseName: text("exercise_name").notNull(), // denormalized for resilience
  setNumber: integer("set_number").notNull(),
  setType: text("set_type").notNull().default("standard"), // "standard"|"warmup"|"drop"|"failure"
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rir: integer("rir"),
  durationSeconds: integer("duration_seconds"), // for timed sets
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Personal records per exercise — updated by import + live logging */
export const exercisePrs = sqliteTable("exercise_prs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exerciseDb.id, { onDelete: "cascade" }),
  exerciseName: text("exercise_name").notNull(),
  bestWeightKg: real("best_weight_kg"),
  bestReps: integer("best_reps"),
  estimated1rm: real("estimated_1rm"),
  achievedAt: text("achieved_at").notNull(), // "YYYY-MM-DD"
});

// ─── Checklist ─────────────────────────────────────────────────────────────────
// Items are "same every day" recurring tasks. The workout item is virtual
// (computed from the workout module) and shown automatically.

/** Recurring daily checklist items configured by the user */
export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  emoji: text("emoji"),               // optional leading emoji
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Time-of-day tag: morning | afternoon | evening | anytime */
  timeOfDay: text("time_of_day").notNull().default("anytime"),
  /** Auto-check source module: null = manual, else auto-tracked from that module */
  autoSource: text("auto_source"), // 'workout' | 'reading' | 'words' | 'journal' | 'mood' | null
  /** Accent color for the item row: violet (default) | cyan | green | amber | red | pink */
  color: text("color").notNull().default("violet"),
  /** Optional note shown under the title in the item row */
  notes: text("notes"),
  /**
   * routine — part of the fixed daily routine (stretch, breathe, supplements…)
   * habit   — a habit being built; tracked, but not counted in the day's streak until promoted
   * manual  — a regular checklist item
   */
  kind: text("kind").notNull().default("manual"),
  /** Stable id for built-in routine steps (stretch | breathe | supp-am | supp-pm | read). */
  routineKey: text("routine_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** AI-suggested habits from journal/mood pattern analysis, generated weekly */
export const checklistSuggestions = sqliteTable("checklist_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD of the Sunday
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  suggestedEmoji: text("suggested_emoji"),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'dismissed'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Weekly pattern observations generated by AI from checklist completion data */
export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD of the Sunday
  patternObservation: text("pattern_observation"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Mood ─────────────────────────────────────────────────────────────────────

/** Daily mood entries — one per user per day */
export const moodEntries = sqliteTable("mood_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // "YYYY-MM-DD" Europe/Madrid
  score: integer("score").notNull(), // 1–5
  note: text("note").notNull().default(""),
  time: text("time").notNull().default(""), // "HH:MM"
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Sleep ────────────────────────────────────────────────────────────────────

/** Daily sleep entries — one per user per day */
export const sleepEntries = sqliteTable("sleep_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // "YYYY-MM-DD" Europe/Madrid
  bedtime: text("bedtime").notNull(), // "HH:MM"
  wake: text("wake").notNull(), // "HH:MM"
  hours: real("hours").notNull(), // decimal hours
  quality: integer("quality").notNull(), // 1–10
  source: text("source").notNull().default("manual"), // "manual" | "apple_health"
  stageDeepMinutes: integer("stage_deep_minutes"),
  stageCoreMinutes: integer("stage_core_minutes"),
  stageRemMinutes: integer("stage_rem_minutes"),
  stageAwakeMinutes: integer("stage_awake_minutes"),
  heartRateAvg: real("heart_rate_avg"),
  heartRateMin: real("heart_rate_min"),
  heartRateMax: real("heart_rate_max"),
  respiratoryRateAvg: real("respiratory_rate_avg"),
  bloodOxygenAvg: real("blood_oxygen_avg"),
  sleepScore: integer("sleep_score"), // 0–100, from Apple Health
  rawPayload: text("raw_payload"), // full JSON from Apple Shortcut
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Weekly AI coach card for the workouts module — one per user per week */
export const workoutCoach = sqliteTable("workout_coach", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD of Monday
  content: text("content").notNull(),      // AI-generated markdown/plain text
  generatedAt: integer("generated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** One completion record per item per user per day (ISO "YYYY-MM-DD") */
export const checklistCompletions = sqliteTable("checklist_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => checklistItems.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Europe/Madrid "today" in YYYY-MM-DD format
  date: text("date").notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
