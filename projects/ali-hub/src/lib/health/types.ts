/**
 * Apple Watch data via Health Auto Export (HAE) · pure parsing, no database.
 *
 * HAE Premium's "REST API" automation POSTs one envelope per run:
 *   { data: { metrics: [{ name, units, data: [...] }], workouts: [...] } }
 * Dates arrive as "yyyy-MM-dd HH:mm:ss ±HHMM" in the phone's own timezone
 * (Europe/Madrid for Ali). Everything here is defensive: users report fields
 * that differ from the docs, so every number is optional and the raw record is
 * kept by the caller for the first weeks.
 *
 * Since 2026-09-28 the heavy arrays are kept too (Ali wants the map and the splits):
 * the GPS route, the heart-rate trace and kilometre splits computed here, stored in
 * their own table so the workout list stays light.
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
  series: WorkoutSeries | null; // the heavy arrays, compacted · stored apart (health_workout_series)
};

/** [lat, lon, altitude m | null, ms] · lat/lon to 5 decimals (~1 m), at most ROUTE_MAX_POINTS. */
export type RoutePoint = [number, number, number | null, number];
/** [ms, bpm] */
export type HrPoint = [number, number];
/** One kilometre of a run (the last one may be partial). */
export type Split = {
  km: number;               // 1, 2, 3 … (the partial last split keeps its ordinal)
  distKm: number;           // 1 for a full split, the fraction for the last one
  sec: number;              // time spent in this split
  paceSec: number | null;   // seconds per km (sec / distKm)
  hrAvg: number | null;
  elevM: number | null;     // climb in this split (positive deltas only)
  partial?: true;
};
export type WorkoutSeries = { route: RoutePoint[]; hr: HrPoint[]; splits: Split[] };

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

const ROUTE_MAX_POINTS = 2400; // ~1 point every 2–3 s on a 10 km run · a map needs no more
const R_EARTH_M = 6371008.8;

/** Metres between two lat/lon points (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(a));
}

/** HAE route points ({lat, lon, altitude, timestamp} · also latitude/longitude/date) → compact, time-ordered, noisy fixes dropped. */
function parseRoute(v: unknown): RoutePoint[] {
  if (!Array.isArray(v)) return [];
  const pts: RoutePoint[] = [];
  for (const p of v as Record<string, unknown>[]) {
    if (!p || typeof p !== "object") continue;
    const lat = num(p.lat ?? p.latitude), lon = num(p.lon ?? p.lng ?? p.longitude);
    const t = parseHaeDate(p.timestamp ?? p.date ?? p.time);
    if (lat === null || lon === null || t === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const acc = num(p.horizontalAccuracy);
    if (acc !== null && acc > 50) continue;
    const alt = num(p.altitude ?? p.alt);
    pts.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, alt === null ? null : Math.round(alt * 10) / 10, t]);
  }
  pts.sort((a, b) => a[3] - b[3]);
  if (pts.length <= ROUTE_MAX_POINTS) return pts;
  const step = pts.length / ROUTE_MAX_POINTS;
  const out: RoutePoint[] = [];
  for (let i = 0; i < ROUTE_MAX_POINTS; i++) out.push(pts[Math.floor(i * step)]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/** HAE heart-rate samples ({date, Avg|qty}) → [ms, bpm], time-ordered. */
function parseHrSeries(v: unknown): HrPoint[] {
  if (!Array.isArray(v)) return [];
  const out: HrPoint[] = [];
  for (const p of v as Record<string, unknown>[]) {
    if (!p || typeof p !== "object") continue;
    const t = parseHaeDate(p.date ?? p.timestamp), bpm = num(p.Avg ?? p.avg ?? p.qty);
    if (t !== null && bpm !== null && bpm > 20 && bpm < 260) out.push([t, Math.round(bpm)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Cumulative distance over time: [ms, metres so far] · from the route (haversine) or, failing that, HAE's distance samples. */
function distanceCurve(route: RoutePoint[], distSamples: unknown): [number, number][] {
  if (route.length >= 2) {
    const curve: [number, number][] = [[route[0][3], 0]];
    let d = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const seg = haversineM(a[0], a[1], b[0], b[1]);
      const dt = (b[3] - a[3]) / 1000;
      // a jump faster than 12 m/s is a GPS glitch, not running
      if (dt <= 0 || seg / dt > 12) { curve.push([b[3], d]); continue; }
      d += seg;
      curve.push([b[3], d]);
    }
    return curve;
  }
  if (!Array.isArray(distSamples)) return [];
  const rows = (distSamples as Record<string, unknown>[])
    .map((p) => ({ t: parseHaeDate(p?.date ?? p?.timestamp), m: (() => { const km = toKm({ qty: p?.qty, units: p?.units ?? "km" }); return km === null ? null : km * 1000; })() }))
    .filter((r): r is { t: number; m: number } => r.t !== null && r.m !== null)
    .sort((a, b) => a.t - b.t);
  if (!rows.length) return [];
  // A sample is the distance covered from its stamp to the next one · the total is reached at the interval's END.
  const gaps = rows.slice(1).map((r, i) => r.t - rows[i].t).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60_000;
  const curve: [number, number][] = [[rows[0].t, 0]];
  let d = 0;
  rows.forEach((r, i) => { d += r.m; curve.push([rows[i + 1]?.t ?? r.t + gap, d]); });
  return curve;
}

function avgBetween(hr: HrPoint[], t0: number, t1: number): number | null {
  let sum = 0, n = 0;
  for (const [t, bpm] of hr) { if (t >= t0 && t <= t1) { sum += bpm; n++; } }
  return n ? Math.round(sum / n) : null;
}

/** Climb with 3 m hysteresis: barometer jitter is ignored, a steady gentle slope still counts. */
function climbBetween(route: RoutePoint[], t0: number, t1: number): number | null {
  let base: number | null = null, gain = 0;
  for (const p of route) {
    if (p[3] < t0 || p[3] > t1 || p[2] === null) continue;
    if (base === null) { base = p[2]; continue; }
    if (p[2] - base >= 3) { gain += p[2] - base; base = p[2]; }
    else if (p[2] < base) base = p[2];
  }
  return base === null ? null : Math.round(gain);
}

/** Kilometre splits from a distance curve · time at each km boundary is interpolated. */
export function computeSplits(curve: [number, number][], route: RoutePoint[], hr: HrPoint[]): Split[] {
  if (curve.length < 2) return [];
  const splits: Split[] = [];
  let km = 1, tPrev = curve[0][0];
  for (let i = 1; i < curve.length; i++) {
    const [t0, d0] = curve[i - 1], [t1, d1] = curve[i];
    while (d1 >= km * 1000) {
      const frac = d1 === d0 ? 1 : (km * 1000 - d0) / (d1 - d0);
      const tCross = t0 + frac * (t1 - t0);
      const sec = Math.round((tCross - tPrev) / 1000);
      splits.push({ km, distKm: 1, sec, paceSec: sec, hrAvg: avgBetween(hr, tPrev, tCross), elevM: climbBetween(route, tPrev, tCross) });
      tPrev = tCross; km++;
    }
  }
  const [tEnd, dEnd] = curve[curve.length - 1];
  const rest = dEnd - (km - 1) * 1000;
  if (rest >= 50 && tEnd > tPrev) {
    const distKm = Math.round(rest) / 1000, sec = Math.round((tEnd - tPrev) / 1000);
    splits.push({ km, distKm, sec, paceSec: Math.round(sec / distKm), hrAvg: avgBetween(hr, tPrev, tEnd), elevM: climbBetween(route, tPrev, tEnd), partial: true });
  }
  return splits;
}

/** The heavy arrays of one workout, compacted · null when the record carries none. */
function parseWorkoutSeries(w: Record<string, unknown>): WorkoutSeries | null {
  const route = parseRoute(w.route);
  const hr = parseHrSeries(w.heartRateData);
  const splits = computeSplits(distanceCurve(route, w.walkingAndRunningDistance), route, hr);
  if (!route.length && !hr.length && !splits.length) return null;
  return { route, hr, splits };
}

/** min:ss per km for a pace in seconds · "5:24". */
export function fmtPace(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseWorkout(w: Record<string, unknown>): WatchWorkout | null {
  const startMs = parseHaeDate(w.start);
  if (startMs === null) return null;
  const endMs = parseHaeDate(w.end);
  const type = String(w.name ?? w.workoutActivityType ?? "Workout");
  const hkId = typeof w.id === "string" && w.id ? w.id : `${type}|${startMs}`;
  const hr = (w.heartRate ?? {}) as Record<string, unknown>;
  // Export Version 2 also carries avgHeartRate / minHeartRate / maxHeartRate as {qty, units}.
  let hrAvg = num(hr.avg ?? hr.Avg ?? w.avgHeartRate), hrMin = num(hr.min ?? hr.Min ?? w.minHeartRate), hrMax = num(hr.max ?? hr.Max ?? w.maxHeartRate);
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
  const elev = (w.elevation ?? {}) as Record<string, unknown>; // Version 1 {ascent, descent} · Version 2 elevationUp {qty}
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
    elevationM: rnd(num(elev.ascent ?? w.elevationUp)),
    intensityMet: rnd(num(w.intensity), 1),
    source: typeof w.source === "string" ? w.source : typeof w.device === "string" ? w.device : null,
    raw,
    series: parseWorkoutSeries(w),
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
