/**
 * Apple Watch data via Health Auto Export (HAE) · pure parsing, no database.
 *
 * HAE Premium's "REST API" automation POSTs one envelope per run:
 *   { data: { metrics: [{ name, units, data: [...] }], workouts: [...] } }
 * Dates arrive as "yyyy-MM-dd HH:mm:ss ±HHMM" in the phone's own timezone
 * (Europe/Madrid for Ali). Everything here is defensive: users report fields
 * that differ from the docs, so every number is optional and the raw record is
 * kept by the caller for the first weeks.
 */

export type SleepNight = {
  date: string;                 // wake day, YYYY-MM-DD (Europe/Madrid)
  sleepStart: number | null;    // ms
  sleepEnd: number | null;
  inBedStart: number | null;
  inBedEnd: number | null;
  totalMin: number | null;      // asleep (all stages)
  coreMin: number | null;
  deepMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  inBedMin: number | null;
  score: number | null;         // A L I score 0–100 (Apple has none) · see sleepScore()
  source: string | null;        // "Apple Watch" etc.
};

export type WatchWorkout = {
  hkId: string;                 // HealthKit UUID, unique
  date: string;                 // start day, YYYY-MM-DD (Europe/Madrid)
  type: string;                 // "Running", "Traditional Strength Training", …
  startMs: number;
  endMs: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  hrAvg: number | null;
  hrMin: number | null;
  hrMax: number | null;
  steps: number | null;
  elevationM: number | null;
  intensityMet: number | null;
  source: string | null;
  raw: Record<string, unknown>; // the workout minus the heavy arrays (route, HR series)
};

export type DailyMetric = {
  date: string;
  metric: string;               // HAE name: resting_heart_rate, heart_rate_variability, …
  qty: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  units: string | null;
};

export type Parsed = { sleep: SleepNight[]; workouts: WatchWorkout[]; metrics: DailyMetric[]; skipped: string[] };

const MADRID = "Europe/Madrid";
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: MADRID, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Madrid for a timestamp. */
export function madridDate(ms: number): string {
  return ymdFmt.format(new Date(ms));
}

/** "2026-09-12 07:05:00 +0200" (or ISO, or a bare date) → ms, else null. */
export function parseHaeDate(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) {
    const off = m[3] ? (m[3] === "Z" ? "Z" : m[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "+02:00";
    const t = Date.parse(`${m[1]}T${m[2]}${off}`);
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T12:00:00+02:00`);
    return Number.isNaN(t) ? null : t;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** The YYYY-MM-DD a HAE record belongs to · the string already carries the phone's local day. */
function recordDay(v: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  const ms = parseHaeDate(v);
  return ms === null ? null : madridDate(ms);
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v !== null && "qty" in v) return num((v as { qty: unknown }).qty);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const rnd = (n: number | null, d = 0): number | null => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Sleep values come in the metric's units (hr by default, sometimes min). → minutes */
function toMinutes(v: unknown, units: string | null): number | null {
  const n = num(v);
  if (n === null) return null;
  const u = (units ?? "hr").toLowerCase();
  if (u.startsWith("hr") || u.startsWith("h")) return Math.round(n * 60);
  if (u.startsWith("s")) return Math.round(n / 60);
  return Math.round(n);
}

function toKm(d: unknown): number | null {
  if (d == null) return null;
  if (typeof d === "number") return rnd(d, 2);
  const o = d as { qty?: unknown; units?: unknown };
  const q = num(o.qty);
  if (q === null) return null;
  const u = String(o.units ?? "km").toLowerCase();
  const km = u === "mi" ? q * 1.609344 : u === "m" ? q / 1000 : u === "yd" ? q * 0.0009144 : q;
  return rnd(km, 2);
}

function toKcal(e: unknown): number | null {
  if (e == null) return null;
  if (typeof e === "number") return Math.round(e);
  const o = e as { qty?: unknown; units?: unknown };
  const q = num(o.qty);
  if (q === null) return null;
  const u = String(o.units ?? "kcal").toLowerCase();
  return Math.round(u === "kj" ? q / 4.184 : u === "cal" ? q / 1000 : q);
}

/**
 * A L I sleep score, 0–100. Apple Health has no sleep score, so this is ours and
 * deliberately simple: 60 pts duration (8 h = full, 4 h = 0), 20 pts deep sleep
 * (≥ 15 % of asleep = full), 20 pts continuity (awake ≤ 5 % of in-bed = full,
 * ≥ 25 % = 0). Missing stages → that part is scored neutral (half).
 */
export function sleepScore(n: Pick<SleepNight, "totalMin" | "deepMin" | "awakeMin" | "inBedMin">): number | null {
  if (n.totalMin === null) return null;
  const dur = Math.max(0, Math.min(1, (n.totalMin - 240) / 240)) * 60;
  const deep = n.deepMin === null ? 10 : Math.max(0, Math.min(1, n.deepMin / n.totalMin / 0.15)) * 20;
  const bed = n.inBedMin ?? n.totalMin + (n.awakeMin ?? 0);
  const cont = n.awakeMin === null || bed <= 0 ? 10 : Math.max(0, Math.min(1, 1 - (n.awakeMin / bed - 0.05) / 0.2)) * 20;
  return Math.round(dur + deep + cont);
}

const HEAVY_KEYS = new Set(["route", "heartRateData", "heartRateRecovery", "stepCount", "walkingAndRunningDistance", "activeEnergy", "elevation"]);

function parseWorkout(w: Record<string, unknown>): WatchWorkout | null {
  const startMs = parseHaeDate(w.start);
  if (startMs === null) return null;
  const endMs = parseHaeDate(w.end);
  const type = String(w.name ?? w.workoutActivityType ?? "Workout");
  const hkId = typeof w.id === "string" && w.id ? w.id : `${type}|${startMs}`;
  const hr = (w.heartRate ?? {}) as Record<string, unknown>;
  let hrAvg = num(hr.avg ?? hr.Avg), hrMin = num(hr.min ?? hr.Min), hrMax = num(hr.max ?? hr.Max);
  // Some payloads carry only a per-minute series (`heartRateData`) · derive the three numbers.
  const series = Array.isArray(w.heartRateData) ? (w.heartRateData as Record<string, unknown>[]) : null;
  if (hrAvg === null && series && series.length) {
    const vals = series.map((p) => num(p.Avg ?? p.qty)).filter((x): x is number => x !== null);
    if (vals.length) {
      hrAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
      hrMin = Math.min(...series.map((p) => num(p.Min ?? p.qty) ?? Infinity));
      hrMax = Math.max(...series.map((p) => num(p.Max ?? p.qty) ?? -Infinity));
      if (!Number.isFinite(hrMin)) hrMin = null;
      if (!Number.isFinite(hrMax)) hrMax = null;
    }
  }
  const durationSec = num(w.duration) ?? (endMs !== null ? Math.round((endMs - startMs) / 1000) : null);
  const elev = (w.elevation ?? {}) as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) if (!HEAVY_KEYS.has(k)) raw[k] = v;
  return {
    hkId, date: madridDate(startMs), type, startMs, endMs,
    durationSec: durationSec === null ? null : Math.round(durationSec),
    distanceKm: toKm(w.distance),
    activeKcal: toKcal(w.activeEnergyBurned ?? w.activeEnergy),
    totalKcal: toKcal(w.totalEnergy ?? w.totalEnergyBurned),
    hrAvg: rnd(hrAvg), hrMin: rnd(hrMin), hrMax: rnd(hrMax),
    steps: rnd(num(w.stepCount)),
    elevationM: rnd(num(elev.ascent)),
    intensityMet: rnd(num(w.intensity), 1),
    source: typeof w.source === "string" ? w.source : typeof w.device === "string" ? w.device : null,
    raw,
  };
}

function parseSleep(rec: Record<string, unknown>, units: string | null): SleepNight | null {
  const sleepStart = parseHaeDate(rec.sleepStart), sleepEnd = parseHaeDate(rec.sleepEnd);
  const inBedStart = parseHaeDate(rec.inBedStart), inBedEnd = parseHaeDate(rec.inBedEnd);
  const endMs = sleepEnd ?? inBedEnd;
  const date = endMs !== null ? madridDate(endMs) : recordDay(rec.date);
  if (!date) return null;
  const totalMin = toMinutes(rec.asleep ?? rec.totalSleep, units);
  const n: SleepNight = {
    date, sleepStart, sleepEnd, inBedStart, inBedEnd,
    totalMin,
    coreMin: toMinutes(rec.core, units),
    deepMin: toMinutes(rec.deep, units),
    remMin: toMinutes(rec.rem, units),
    awakeMin: toMinutes(rec.awake, units),
    inBedMin: toMinutes(rec.inBed, units) ?? (inBedStart !== null && inBedEnd !== null ? Math.round((inBedEnd - inBedStart) / 60000) : null),
    score: null,
    source: typeof rec.sleepSource === "string" ? rec.sleepSource : typeof rec.source === "string" ? rec.source : null,
  };
  if (n.totalMin === null && n.sleepStart !== null && n.sleepEnd !== null) n.totalMin = Math.round((n.sleepEnd - n.sleepStart) / 60000);
  if (n.totalMin === null || n.totalMin <= 0) return null; // an empty night (the old Shortcut's failure mode) is not a night
  n.score = sleepScore(n);
  return n;
}

/** Parse one HAE envelope. Never throws · unknown shapes end up in `skipped`. */
export function parseHaePayload(body: unknown): Parsed {
  const out: Parsed = { sleep: [], workouts: [], metrics: [], skipped: [] };
  const data = (body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") { out.skipped.push("no data object"); return out; }

  const metrics = Array.isArray(data.metrics) ? (data.metrics as Record<string, unknown>[]) : [];
  for (const m of metrics) {
    const name = String(m.name ?? "").trim();
    const units = typeof m.units === "string" ? m.units : null;
    const rows = Array.isArray(m.data) ? (m.data as Record<string, unknown>[]) : [];
    if (!name) { out.skipped.push("metric without name"); continue; }
    if (name === "sleep_analysis") {
      for (const r of rows) { const n = parseSleep(r, units); if (n) out.sleep.push(n); else out.skipped.push("sleep row"); }
      continue;
    }
    for (const r of rows) {
      const date = recordDay(r.date);
      if (!date) { out.skipped.push(`${name} row without date`); continue; }
      const hasRange = r.Min != null || r.Avg != null || r.Max != null;
      out.metrics.push({
        date, metric: name, units,
        qty: hasRange ? null : rnd(num(r.qty), 2),
        min: rnd(num(r.Min ?? r.min), 2), avg: rnd(num(r.Avg ?? r.avg), 2), max: rnd(num(r.Max ?? r.max), 2),
      });
    }
  }

  const workouts = Array.isArray(data.workouts) ? (data.workouts as Record<string, unknown>[]) : [];
  for (const w of workouts) { const p = parseWorkout(w); if (p) out.workouts.push(p); else out.skipped.push("workout without start"); }

  // One row per night · if a summarised export repeats a date, the later record wins.
  const byDate = new Map<string, SleepNight>();
  for (const n of out.sleep) byDate.set(n.date, n);
  out.sleep = [...byDate.values()];
  return out;
}

/** Plain-language workout type · "Traditional Strength Training" → "Strength". */
export function shortWorkoutType(t: string): string {
  const s = t.toLowerCase();
  if (s.includes("run")) return "Run";
  if (s.includes("strength") || s.includes("functional")) return "Strength";
  if (s.includes("walk") || s.includes("hik")) return "Walk";
  if (s.includes("cycl") || s.includes("bik")) return "Ride";
  if (s.includes("swim")) return "Swim";
  if (s.includes("hiit") || s.includes("high intensity")) return "HIIT";
  if (s.includes("yoga") || s.includes("flex") || s.includes("mind")) return "Mobility";
  return t.replace(/ Training$/, "");
}
