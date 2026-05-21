/**
 * Database schema for Life Control Center
 * Using Drizzle ORM with Turso (SQLite)
 *
 * Tables:
 *  - users, sessions, accounts          → NextAuth
 *  - workout_programs, sessions,
 *    exercises, set_templates,
 *    workout_logs, set_logs, prs        → Workouts module
 *  - books, reading_progress,
 *    annotations, word_lookups          → Library module
 *  - news_briefs                        → News module
 *  - tasks                              → Calendar / Tasks module
 *  - goals                              → Goals module
 *  - word_bank_entries                  → Word Bank module
 *  - user_settings                      → App-wide settings
 */

import { sql } from "drizzle-orm";
import {
  text,
  integer,
  real,
  sqliteTable,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ─── NextAuth Tables ──────────────────────────────────────────────────────────

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

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").notNull().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

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
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ─── Workouts ──────────────────────────────────────────────────────────────────

/** A named workout program (e.g. "PPL Hypertrophy") */
export const workoutPrograms = sqliteTable("workout_programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // JSON array of session IDs in weekly rotation order
  rotationOrder: text("rotation_order").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * A session template (e.g. "Push", "Pull", "Legs").
 * Not to be confused with workout_logs which are actual performed sessions.
 */
export const workoutSessions = sqliteTable("workout_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id")
    .notNull()
    .references(() => workoutPrograms.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Push", "Pull", "Legs", "Core", "Push-Up Skill"
  // "ppl" | "core" | "skill" — affects UI grouping
  type: text("type").notNull().default("ppl"),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(60),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** An exercise slot within a session template */
export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  muscleGroup: text("muscle_group"), // "chest", "shoulders", "triceps", etc.
  // ExerciseDB / API Ninjas lookup name for fetching GIF demos
  apiLookupName: text("api_lookup_name"),
  // Cached GIF URL from ExerciseDB
  demoGifUrl: text("demo_gif_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
});

/**
 * Set templates define the default target for each set in an exercise.
 * These are the "planned" sets shown when starting a workout.
 */
export const setTemplates = sqliteTable("set_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  // "standard" | "drop" | "warmup"
  setType: text("set_type").notNull().default("standard"),
  repRangeMin: integer("rep_range_min"),
  repRangeMax: integer("rep_range_max"),
  // null for timed sets (Core holds)
  durationSeconds: integer("duration_seconds"),
  rirTarget: integer("rir_target"), // 0–4; null = not tracked
  restSeconds: integer("rest_seconds").notNull().default(60),
});

/** One full workout performed on a given date */
export const workoutLogs = sqliteTable("workout_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workoutSessions.id),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  // Computed: finishedAt - startedAt in seconds
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
});

/** One logged set inside a workout_log */
export const setLogs = sqliteTable("set_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutLogId: integer("workout_log_id")
    .notNull()
    .references(() => workoutLogs.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  setNumber: integer("set_number").notNull(),
  setType: text("set_type").notNull().default("standard"),
  weightKg: real("weight_kg"),
  repsLogged: integer("reps_logged"),
  // Timed sets (Core holds): duration in seconds instead of reps
  durationSeconds: integer("duration_seconds"),
  rirLogged: integer("rir_logged"), // 0–4; null = not tracked
  restSeconds: integer("rest_seconds"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

/** Personal records — updated automatically after each workout log */
export const personalRecords = sqliteTable("personal_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  bestWeightKg: real("best_weight_kg"),
  bestReps: integer("best_reps"),
  // Estimated 1RM: weight × (1 + reps/30)
  estimated1rm: real("estimated_1rm"),
  achievedAt: integer("achieved_at", { mode: "timestamp_ms" }).notNull(),
});

/** Running log entries (separate from PPL sessions) */
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

// ─── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
  // "todo" | "done"
  status: text("status").notNull().default("todo"),
  // Google Calendar event ID (set after syncing to Google Calendar)
  googleCalendarEventId: text("google_calendar_event_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ─── Goals ─────────────────────────────────────────────────────────────────────

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  // "fitness" | "reading" | "work" | "other"
  category: text("category").notNull().default("other"),
  // Optional numeric target (e.g. 5 for "run 5km")
  targetValue: real("target_value"),
  currentValue: real("current_value").notNull().default(0),
  unit: text("unit"), // "km", "books", etc.
  targetDate: integer("target_date", { mode: "timestamp_ms" }),
  // "active" | "completed" | "archived"
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ─── Workouts v2 (MacroFactor import — non-conflicting names) ──────────────────

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

/** Workout day templates within a program (Push / Pull / Legs / Push-Up SESH) */
export const workoutPlans = sqliteTable("workout_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),           // "Push", "Pull", "Legs", "Push-Up SESH"
  type: text("type").notNull().default("strength"), // "strength" | "skill" | "cardio"
  sortOrder: integer("sort_order").notNull().default(0),
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
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Exercise slots in a workout plan template, with set prescriptions */
export const planExercises = sqliteTable("plan_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id")
    .notNull()
    .references(() => workoutPlans.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exerciseDb.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  // JSON array: [{type, repMin, repMax, rir, restS}]
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
  workoutName: text("workout_name").notNull(), // "Beta (Push)"
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
