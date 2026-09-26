/**
 * To-do (spec §4.5). Simple by default, personalisable when wanted.
 *
 * Borrowed ideas (researched: Things, Todoist, TickTick, Notion):
 *  - Things:  "Today / This evening / Anytime / Someday" · schedule by intent, not just by date.
 *  - Todoist: one quick-add line that understands dates ("tomorrow 9am", "fri", "next week"),
 *             "#project" and "!!" priority · nothing to tap through.
 *  - TickTick: one-tap defer ("tomorrow", "weekend") from the list.
 *  Ignored on purpose: databases, sub-tasks, sharing, filters · convenience, not a database.
 *
 * Reminders = a due date (+ optional time). The phone shows a home-screen badge with the
 * number due today (iOS 16.4+ web app badge). Push notifications come in Phase 7.
 */

export type Priority = 0 | 1 | 2; // none · important · urgent

/** Work and Personal are tasks; "list" entries are kept things · running lists
 * and notes (spec §7c item 7): no buckets, no nagging unless given a reminder date. */
export type Area = "work" | "personal" | "list";
export const AREAS: { key: Area; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
];

export type Todo = {
  clientId: string;            // generated on the phone, makes every write idempotent
  title: string;
  area: Area;                  // work | personal · each list has its own due counts and reminders
  notes: string | null;
  project: string | null;      // free-form "#tag", lower-case
  dueDate: string | null;      // YYYY-MM-DD (Europe/Madrid day) · null = Anytime / Someday
  dueTime: string | null;      // HH:MM
  evening: boolean;            // "This evening" (Things) · shown in the evening block of that day
  nagMinutes?: number | null;  // reminder nag cadence in minutes (5/10/15/30); empty = 30
  wakeDate?: string | null;    // YYYY-MM-DD · Vault (far-future items): hidden from every list until this day
  notifyTarget?: "phone" | "laptop" | null; // where the reminder push goes · null = both
  format?: Format | null;      // how the notes display · see FORMATS (null = detected from the text)
  someday: boolean;            // parked, out of the way
  priority: Priority;
  sortOrder: number;
  doneAt: number | null;       // ms
  createdAt: number;           // ms
  updatedAt: number;           // ms · last-writer-wins on the server
  deleted: boolean;            // soft delete so an offline replay never resurrects it
};

export type TodosData = { todos: Todo[] };

// ─── Notes formats (2026-09-12) ───────────────────────────────────────────────
//
// One stored text (`notes`), several ways to show it. Tasks: "doc" (free text) or
// "checklist" (subtasks, ticked one by one). Docs add "list" (plain items),
// "sections" (headings you open and close, several at once) and "accordion"
// (headings, one open at a time). Sections come from `# Heading` lines, list
// items from `- ` lines and subtasks from `- [ ] ` / `- [x] ` lines · so any
// format can be switched to any other without losing the words.

export const FORMATS = ["doc", "checklist", "list", "sections", "accordion"] as const;
export type Format = (typeof FORMATS)[number];
export const TASK_FORMATS: { key: Format; label: string }[] = [{ key: "doc", label: "Notes" }, { key: "checklist", label: "Subtasks" }];
export const DOC_FORMATS: { key: Format; label: string; hint: string }[] = [
  { key: "list",      label: "List",      hint: "plain items, reorder by hand" },
  { key: "checklist", label: "Checklist", hint: "items you tick · a ticked one goes" },
  { key: "doc",       label: "Document",  hint: "free text with headings and lists" },
  { key: "sections",  label: "Sections",  hint: "# headings fold · open several" },
  { key: "accordion", label: "Accordion", hint: "# headings fold · one open at a time" },
];

/** The task's notes format: the saved choice, else Subtasks when every line is a checkbox. */
export function taskFormat(t: Pick<Todo, "format" | "notes">): "doc" | "checklist" {
  if (t.format === "checklist") return "checklist";
  if (t.format) return "doc";
  const lines = (t.notes ?? "").split("\n").filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => /^\s*- \[[ xX]\] /.test(l)) ? "checklist" : "doc";
}

/** The doc's format: the saved choice, else List when every line is an item, else Document. */
export function docFormat(t: Pick<Todo, "format" | "notes">): Format {
  if (t.format) return t.format;
  const lines = (t.notes ?? "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "list";
  if (lines.every((l) => /^\s*- \[[ xX]\] /.test(l))) return "checklist";
  if (lines.every((l) => /^- /.test(l))) return "list";
  return "doc";
}

export type SubTask = { text: string; done: boolean };

/** Every non-empty line is an item; `- [x]` marks it done, other markers are stripped. */
export function parseSubtasks(notes: string | null | undefined): SubTask[] {
  return (notes ?? "").split("\n").map((raw) => {
    const m = raw.match(/^\s*- \[([ xX])\] ?(.*)$/);
    if (m) return { text: m[2].trim(), done: m[1] !== " " };
    const text = raw.replace(/^\s*(- |\d+\. |#{1,3} )/, "").trim();
    return { text, done: false };
  }).filter((s) => s.text);
}

export function serializeSubtasks(items: SubTask[]): string | null {
  return items.length ? items.map((s) => `- [${s.done ? "x" : " "}] ${s.text.trim()}`).join("\n") : null;
}

export type DocSection = { title: string | null; body: string };

/** Split notes at `# Heading` lines (levels 1–3). Text before the first heading is an untitled intro. */
export function parseSections(notes: string | null | undefined): DocSection[] {
  const out: DocSection[] = [];
  let cur: DocSection | null = null;
  for (const raw of (notes ?? "").split("\n")) {
    const m = raw.match(/^#{1,3} (.*)$/);
    if (m) { if (cur) out.push(cur); cur = { title: m[1].trim(), body: "" }; continue; }
    if (!cur) cur = { title: null, body: "" };
    cur.body += (cur.body ? "\n" : "") + raw;
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.replace(/^\n+|\n+$/g, "") })).filter((s) => s.title !== null || s.body.trim());
}

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
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function fromMonthName(today: string, day: number, mon: string, year?: string): string | null {
  const month = MONTHS[mon.toLowerCase()];
  if (!month || day < 1 || day > 31) return null;
  let y = year ? parseInt(year, 10) : parseInt(today.slice(0, 4), 10);
  let ymd = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!year && ymd < today) { y += 1; ymd = `${y}-${ymd.slice(5)}`; } // "3 Jan" said in December means next year
  return ymd;
}
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const numberWord = (s: string) => WORDS[s.toLowerCase()] ?? parseInt(s, 10);
/** Minutes since midnight on Ali's clock (Europe/Madrid). */
function madridMinutes(): number {
  const p = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24, m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * One typed line → a task. Every natural way of writing a day or an hour is understood and
 * STRIPPED from the title ("Shave Friday at 11am" → "Shave", Friday 11:00); what was read is
 * listed in `tokens` so the quick-add bar can show it before the task is saved (2026-09-24).
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
  eat(/\s(tonight|this evening|evening|(?:at|in the)\s+night|tomorrow\s+night|night)(?=\s)/i, (m) => {
    out.evening = true;
    out.dueDate = /tomorrow/i.test(m[1]) ? addDays(today, 1) : out.dueDate ?? today; // a day named later in the line overrides
  });
  eat(/\s(tomorrow|tmrw|tmr)\s+(evening)(?=\s)/i, () => { out.dueDate = addDays(today, 1); out.evening = true; });
  eat(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => { out.dueDate = addDays(today, 1); });
  eat(/\s(today)(?=\s)/i, () => { out.dueDate = today; });
  eat(/\s(?:this\s+|on the\s+|at the\s+)?(weekend)(?=\s)/i, () => { out.dueDate = nextWeekend(today); });
  eat(/\s(next\s+week)(?=\s)/i, () => { out.dueDate = nextMonday(today); });
  eat(/\s(next\s+month)(?=\s)/i, () => { const d = new Date(`${today}T12:00:00Z`); out.dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10); });
  eat(/\s(end of (?:the )?week)(?=\s)/i, () => { out.dueDate = endOfWeek(today); });
  eat(/\s(end of (?:the )?month)(?=\s)/i, () => { const d = new Date(`${today}T12:00:00Z`); out.dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10); });
  // "Friday" · "on Friday" · "this Friday" · "next Friday" (the one after this coming one when it's still this week)
  eat(/\s(?:on\s+|this\s+)?(next\s+)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)(?=\s)/i, (m) => {
    const dow = DOW[m[2].toLowerCase()];
    let d = nextWeekday(today, dow);
    if (m[1]) d = addDays(d, weekday(today) < dow || weekday(today) === dow ? 7 : 0);
    out.dueDate = d;
  });
  eat(/\sin\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven)\s+(day|days|week|weeks|month|months)(?=\s)/i, (m) => {
    const n = numberWord(m[1]);
    if (m[2].startsWith("month")) { const d = new Date(`${today}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); out.dueDate = d.toISOString().slice(0, 10); }
    else out.dueDate = addDays(today, n * (m[2].startsWith("week") ? 7 : 1));
  });
  // "in 2 hours" · "in 30 minutes" · a time today (Europe/Madrid clock)
  eat(/\sin\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|half an)\s+(hour|hours|hr|hrs|minute|minutes|min|mins)(?=\s)/i, (m) => {
    const n = m[1].toLowerCase() === "half an" ? 0.5 : numberWord(m[1]);
    const mins = Math.round(n * (m[2].startsWith("h") ? 60 : 1));
    const nowMin = madridMinutes();
    const t = Math.min(23 * 60 + 59, nowMin + mins);
    out.dueTime = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    out.dueDate = today;
  });
  // "24 sep" · "24th of September" · "Sep 24" · "September 24th, 2027"
  eat(/\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?(?=\s)/i, (m) => { out.dueDate = fromMonthName(today, parseInt(m[1], 10), m[2], m[3]); });
  eat(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?=\s)/i, (m) => { out.dueDate = fromMonthName(today, parseInt(m[2], 10), m[1], m[3]); });
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
  // "11am" · "at 11 am" · "11:30pm" · "11.30 p.m." · "at 9 in the morning"
  eat(/\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?=\s)/i, (m) => {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase().startsWith("p")) h += 12;
    if (h <= 23) out.dueTime = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  });
  eat(/\s(?:at\s+|@\s*)?(noon|midday)(?=\s)/i, () => { out.dueTime = "12:00"; });
  eat(/\s(?:at\s+|@\s*)?(midnight)(?=\s)/i, () => { out.dueTime = "23:59"; out.evening = true; });
  eat(/\s(?:at\s+|@\s*)?(\d{1,2}):(\d{2})(?=\s)/i, (m) => {
    const h = parseInt(m[1], 10);
    if (h <= 23 && parseInt(m[2], 10) <= 59) out.dueTime = `${String(h).padStart(2, "0")}:${m[2]}`;
  });
  // "17h" · "9H" · "9h30" · "17H00" (Ali 2026-09-26) · the h makes it an hour, no "at" needed
  eat(/\s(?:at\s+|@\s*)?(\d{1,2})[hH](\d{2})?(?=\s)/, (m) => {
    const h = parseInt(m[1], 10), mm = m[2] ?? "00";
    if (h <= 23 && parseInt(mm, 10) <= 59) out.dueTime = `${String(h).padStart(2, "0")}:${mm}`;
  });
  eat(/\s(?:at\s+|@\s*)(\d{1,2})h?(?=\s)/i, (m) => {
    const h = parseInt(m[1], 10);
    if (h <= 23) out.dueTime = `${String(h).padStart(2, "0")}:00`;
  });
  // "tomorrow morning" · "Friday afternoon" · "this morning" · "in the morning" → a default hour
  // (morning 09:00, afternoon 15:00). Only when a day was named or the phrase is explicit, so a
  // title like "Morning run" keeps its word.
  {
    const m = text.match(/\s(?:(?:in the|this)\s+)?(morning|afternoon)(?=\s)/i);
    if (m && (out.dueDate || /(in the|this)/i.test(m[0]))) {
      out.dueTime = m[1].toLowerCase() === "morning" ? "09:00" : "15:00";
      out.dueDate = out.dueDate ?? today;
      out.tokens.push(m[0].trim());
      text = text.replace(m[0], " ");
    }
  }
  if (out.dueTime && !out.dueDate && !out.someday) out.dueDate = today;
  if (out.dueTime && parseInt(out.dueTime.slice(0, 2), 10) >= 19) out.evening = true;
  if (out.someday) { out.dueDate = null; out.dueTime = null; out.evening = false; }
  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}

// ─── Grouping for the list ────────────────────────────────────────────────────

export type Bucket = "overdue" | "today" | "evening" | "tomorrow" | "week" | "nextWeek" | "nextMonth" | "later" | "someday";

/** Sunday (YYYY-MM-DD) of the week `today` falls in · weeks run Monday → Sunday. */
export function endOfWeek(today: string): string {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, (7 - dow) % 7);
}

/** Last day of NEXT calendar month, YYYY-MM-DD. */
export function endOfNextMonth(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0, 12)).toISOString().slice(0, 10);
}

/**
 * Where a task shows on /todo. The far buckets (2026-09-11, Ali: "Upcoming" split
 * into folded sections) graduate automatically as the date approaches:
 * later → nextMonth → nextWeek → week → tomorrow → today.
 */
export function bucketOf(t: Todo, today: string, isEveningNow: boolean): Bucket {
  // No date = Someday (the "Anytime" bucket was retired 2026-08-31).
  if (t.someday || !t.dueDate) return "someday";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return t.evening && !isEveningNow ? "evening" : "today";
  if (t.dueDate === addDays(today, 1)) return "tomorrow";
  const eow = endOfWeek(today);
  if (t.dueDate <= eow) return "week";
  if (t.dueDate <= addDays(eow, 7)) return "nextWeek";
  if (t.dueDate <= endOfNextMonth(today)) return "nextMonth";
  return "later";
}

export function sortTodos(a: Todo, b: Todo): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if ((a.dueTime ?? "99") !== (b.dueTime ?? "99")) return (a.dueTime ?? "99") < (b.dueTime ?? "99") ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt - b.createdAt;
}

/** Sleeping in the Vault: hidden from every list, badge, nag until the wake day. */
export function isSleeping(t: Todo, today: string): boolean {
  return !!t.wakeDate && t.wakeDate > today;
}

/** Number to put on the home-screen badge: open tasks due today or earlier. */
export function badgeCount(todos: Todo[], today: string, area?: Area): number {
  return todos.filter((t) => !t.deleted && !t.doneAt && !t.someday && !isSleeping(t, today) && t.dueDate !== null && t.dueDate <= today && (!area || (t.area ?? "personal") === area)).length;
}
