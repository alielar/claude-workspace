/**
 * To-do (spec §4.5). Simple by default, personalisable when wanted.
 *
 * Borrowed ideas (researched: Things, Todoist, TickTick, Notion):
 *  - Things:  "Today / This evening / Anytime / Someday" — schedule by intent, not just by date.
 *  - Todoist: one quick-add line that understands dates ("tomorrow 9am", "fri", "next week"),
 *             "#project" and "!!" priority — nothing to tap through.
 *  - TickTick: one-tap defer ("tomorrow", "weekend") from the list.
 *  Ignored on purpose: databases, sub-tasks, sharing, filters — convenience, not a database.
 *
 * Reminders = a due date (+ optional time). The phone shows a home-screen badge with the
 * number due today (iOS 16.4+ web app badge). Push notifications come in Phase 7.
 */

export type Priority = 0 | 1 | 2; // none · important · urgent

/** Work and Personal are tasks; "list" entries are kept things — running lists
 * and notes (spec §7c item 7): no buckets, no nagging unless given a reminder date. */
export type Area = "work" | "personal" | "list";
export const AREAS: { key: Area; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
];

export type Todo = {
  clientId: string;            // generated on the phone, makes every write idempotent
  title: string;
  area: Area;                  // work | personal — each list has its own due counts and reminders
  notes: string | null;
  project: string | null;      // free-form "#tag", lower-case
  dueDate: string | null;      // YYYY-MM-DD (Europe/Madrid day) — null = Anytime / Someday
  dueTime: string | null;      // HH:MM
  evening: boolean;            // "This evening" (Things) — shown in the evening block of that day
  nagMinutes?: number | null;  // reminder nag cadence in minutes (5/10/15/30); empty = 30
  someday: boolean;            // parked, out of the way
  priority: Priority;
  sortOrder: number;
  doneAt: number | null;       // ms
  createdAt: number;           // ms
  updatedAt: number;           // ms — last-writer-wins on the server
  deleted: boolean;            // soft delete so an offline replay never resurrects it
};

export type TodosData = { todos: Todo[] };

export function newTodoId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

// ─── Dates (all in the checklist's Europe/Madrid day) ─────────────────────────

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD. */
export function weekday(ymd: string): number {
  return new Date(ymd + "T12:00:00Z").getUTCDay();
}

/** Next occurrence of `dow` (0–6) strictly after `from`, or `from` itself when allowToday. */
export function nextWeekday(from: string, dow: number, allowToday = false): string {
  let d = from;
  if (!allowToday) d = addDays(d, 1);
  for (let i = 0; i < 7; i++) {
    if (weekday(d) === dow) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function nextWeekend(from: string): string {
  // Saturday, or today if it already is the weekend
  const dow = weekday(from);
  if (dow === 6 || dow === 0) return from;
  return nextWeekday(from, 6);
}

export function nextMonday(from: string): string {
  return nextWeekday(from, 1);
}

export function fmtDue(ymd: string, today: string): string {
  if (ymd === today) return "Today";
  if (ymd === addDays(today, 1)) return "Tomorrow";
  if (ymd === addDays(today, -1)) return "Yesterday";
  const diff = Math.round((new Date(ymd + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000);
  const d = new Date(ymd + "T12:00:00Z");
  if (diff > 0 && diff < 7) return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function fmtTime(hhmm: string): string {
  return hhmm;
}

// ─── Quick add parser ─────────────────────────────────────────────────────────

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

export type QuickParse = {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  evening: boolean;
  someday: boolean;
  project: string | null;
  priority: Priority;
  /** which words were consumed (for the live preview) */
  tokens: string[];
};

/**
 * "Call the bank tomorrow 10am #money !!" →
 *   title "Call the bank", dueDate tomorrow, dueTime 10:00, project "money", priority 2.
 * Understands: today · tonight/this evening · tomorrow · tmrw · weekend · next week ·
 *              mon…sunday · next fri · in 3 days · 15/9 or 15-09 · 9am 18:30 ·
 *              #project · ! / !! · someday
 */
export function parseQuickAdd(input: string, today: string): QuickParse {
  let text = ` ${input.trim()} `;
  const out: QuickParse = { title: "", dueDate: null, dueTime: null, evening: false, someday: false, project: null, priority: 0, tokens: [] };
  const eat = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (!m) return;
    fn(m);
    out.tokens.push(m[0].trim());
    text = text.replace(re, " ");
  };

  eat(/\s#([\p{L}\p{N}_-]{1,24})(?=\s)/u, (m) => { out.project = m[1].toLowerCase(); });
  eat(/\s(!{1,3})(?=\s)/, (m) => { out.priority = m[1].length >= 2 ? 2 : 1; });
  eat(/\s(someday|later|one day)(?=\s)/i, () => { out.someday = true; });
  eat(/\s(tonight|this evening|evening)(?=\s)/i, () => { out.evening = true; out.dueDate = out.dueDate ?? today; });
  eat(/\s(tomorrow|tmrw|tmr)\s+(evening|night)(?=\s)/i, () => { out.dueDate = addDays(today, 1); out.evening = true; });
  eat(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => { out.dueDate = addDays(today, 1); });
  eat(/\s(today)(?=\s)/i, () => { out.dueDate = today; });
  eat(/\s(this\s+)?(weekend)(?=\s)/i, () => { out.dueDate = nextWeekend(today); });
  eat(/\s(next\s+week)(?=\s)/i, () => { out.dueDate = nextMonday(today); });
  eat(/\s(next\s+)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)(?=\s)/i, (m) => {
    const dow = DOW[m[2].toLowerCase()];
    let d = nextWeekday(today, dow);
    if (m[1]) d = addDays(d, weekday(today) < dow || weekday(today) === dow ? 7 : 0); // "next fri" = the one after this coming one when it's still this week
    out.dueDate = d;
  });
  eat(/\sin\s+(\d{1,2})\s+(day|days|week|weeks)(?=\s)/i, (m) => {
    const n = parseInt(m[1], 10) * (m[2].startsWith("week") ? 7 : 1);
    out.dueDate = addDays(today, n);
  });
  eat(/\s(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?=\s)/, (m) => {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : parseInt(today.slice(0, 4), 10);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (!m[3] && ymd < today) ymd = `${year + 1}-${ymd.slice(5)}`; // 3/1 said in December means next year
      out.dueDate = ymd;
    }
  });
  eat(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (m) => {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    out.dueTime = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  });
  eat(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s)/, (m) => {
    const h = parseInt(m[1], 10);
    if (h <= 23) out.dueTime = `${String(h).padStart(2, "0")}:${m[2]}`;
  });
  eat(/\s(?:at\s+)(\d{1,2})h?(?=\s)/i, (m) => {
    const h = parseInt(m[1], 10);
    if (h <= 23) out.dueTime = `${String(h).padStart(2, "0")}:00`;
  });

  if (out.dueTime && !out.dueDate && !out.someday) out.dueDate = today;
  if (out.dueTime && parseInt(out.dueTime.slice(0, 2), 10) >= 19) out.evening = true;
  if (out.someday) { out.dueDate = null; out.dueTime = null; out.evening = false; }
  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}

// ─── Grouping for the list ────────────────────────────────────────────────────

export type Bucket = "overdue" | "today" | "evening" | "upcoming" | "someday";

export function bucketOf(t: Todo, today: string, isEveningNow: boolean): Bucket {
  // No date = Someday (the "Anytime" bucket was retired 2026-08-31).
  if (t.someday || !t.dueDate) return "someday";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return t.evening && !isEveningNow ? "evening" : "today";
  return "upcoming";
}

export function sortTodos(a: Todo, b: Todo): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if ((a.dueTime ?? "99") !== (b.dueTime ?? "99")) return (a.dueTime ?? "99") < (b.dueTime ?? "99") ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt - b.createdAt;
}

/** Number to put on the home-screen badge: open tasks due today or earlier. */
export function badgeCount(todos: Todo[], today: string, area?: Area): number {
  return todos.filter((t) => !t.deleted && !t.doneAt && !t.someday && t.dueDate !== null && t.dueDate <= today && (!area || (t.area ?? "personal") === area)).length;
}
