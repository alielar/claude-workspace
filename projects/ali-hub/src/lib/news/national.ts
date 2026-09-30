/**
 * National-team highlights (Ali 2026-09-29) · server only.
 *
 * Who: the top 10 of the LIVE FIFA men's ranking, plus Morocco whatever its rank. The ranking
 * is read from FIFA's own site (the schedule list gives the latest ranking id, the overview
 * gives the table), cached 24 h in `football_meta`, and the last good copy is kept when FIFA
 * is unreachable (a hardcoded list from 2026-07-20 only as the very last resort).
 *
 * What: every finished men's international match of those teams. Fixtures come from ESPN's
 * public scoreboard (one request per day, no key), filtered to the men's national-team
 * competitions in INTERNATIONAL_LEAGUES (Nations League, friendlies, AFCON and World Cup
 * qualifiers, the tournaments themselves…), so U21 / women's / club games never slip in.
 *
 * How: each match gets ONE row in `highlights`. First as "pending" (matchup + context, no
 * video · the "summary while there is no highlight yet"), then the hourly scan searches
 * YouTube for the match and fills in the most-viewed public copy whose title names both
 * sides and was uploaded after kick-off. Titles are stored, never shown (scores).
 *
 * When: `pollNational()` is called by every club poll (the 5-min tick) and runs itself at most
 * once an hour, scanning yesterday and today · the first run (or `?scan=national`) looks 8
 * days back, which is how the September 2026 window was backfilled. National teams only play
 * in the international windows, so outside them the scan simply finds nothing · no calendar
 * of windows to keep right.
 */

import { db } from "@/db";
import { footballMeta, highlights } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { searchVideos } from "@/lib/news/youtubeSearch";

const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "accept-language": "en" };

// ─── FIFA ranking ─────────────────────────────────────────────────────────────
export type Nation = { rank: number; name: string; code: string };
export type RankingCache = { fetchedAt: number; scheduleId: string; officialDate: string; teams: Nation[] };

const RANKING_TTL_MS = 24 * 3600_000;
export const TOP_N = 10;
export const ALWAYS_CODES = ["MAR"]; // Morocco, whatever its rank (Ali)
/** Last resort only · FIFA ranking of 2026-07-20 (the first after the World Cup). */
const FALLBACK: Nation[] = [
  { rank: 1, name: "Spain", code: "ESP" }, { rank: 2, name: "Argentina", code: "ARG" }, { rank: 3, name: "France", code: "FRA" },
  { rank: 4, name: "England", code: "ENG" }, { rank: 5, name: "Brazil", code: "BRA" }, { rank: 6, name: "Morocco", code: "MAR" },
  { rank: 7, name: "Portugal", code: "POR" }, { rank: 8, name: "Belgium", code: "BEL" }, { rank: 9, name: "Netherlands", code: "NED" },
  { rank: 10, name: "Mexico", code: "MEX" },
];

async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const row = await db.select({ value: footballMeta.value }).from(footballMeta).where(eq(footballMeta.key, key)).get();
    return row ? (JSON.parse(row.value) as T) : null;
  } catch { return null; }
}
async function setMeta(key: string, value: unknown): Promise<void> {
  await db.insert(footballMeta).values({ key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({ target: footballMeta.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
}
export async function ensureMetaTable() {
  try { await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS football_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`)); } catch { /* exists */ }
}

/** FIFA's own data: the newest published ranking schedule, then its table. Throws when either is unreadable. */
export async function fetchFifaRanking(): Promise<RankingCache> {
  const sres = await fetch("https://api.fifa.com/api/v3/rankingschedules/all?type=0&gender=male", { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!sres.ok) throw new Error(`fifa schedules ${sres.status}`);
  const sched = (await sres.json()) as { Results?: { IdRankingSchedule?: string; OfficialDate?: string; VisibilityDate?: string }[] };
  const now = Date.now();
  const published = (sched.Results ?? [])
    .filter((r) => r.IdRankingSchedule && r.OfficialDate && Date.parse(r.VisibilityDate ?? r.OfficialDate) <= now)
    .sort((a, b) => Date.parse(b.OfficialDate!) - Date.parse(a.OfficialDate!));
  const latest = published[0];
  if (!latest) throw new Error("fifa: no published ranking");
  const rres = await fetch(`https://inside.fifa.com/api/ranking-overview?locale=en&dateId=${encodeURIComponent(latest.IdRankingSchedule!)}&rankingType=football`, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!rres.ok) throw new Error(`fifa ranking ${rres.status}`);
  const data = (await rres.json()) as { rankings?: { rankingItem?: { rank?: number; name?: string; countryCode?: string } }[] };
  const teams: Nation[] = (data.rankings ?? [])
    .map((r) => ({ rank: Number(r.rankingItem?.rank), name: String(r.rankingItem?.name ?? ""), code: String(r.rankingItem?.countryCode ?? "") }))
    .filter((t) => t.rank > 0 && t.name && t.code)
    .sort((a, b) => a.rank - b.rank);
  if (teams.length < 50) throw new Error(`fifa ranking: only ${teams.length} rows`);
  return { fetchedAt: now, scheduleId: latest.IdRankingSchedule!, officialDate: latest.OfficialDate!.slice(0, 10), teams };
}

/** The cached ranking, refreshed after 24 h · the last good copy survives a FIFA outage. */
export async function currentRanking(): Promise<RankingCache | null> {
  const cached = await getMeta<RankingCache>("fifa-ranking");
  if (cached && Date.now() - cached.fetchedAt < RANKING_TTL_MS) return cached;
  try {
    const fresh = await fetchFifaRanking();
    await setMeta("fifa-ranking", fresh);
    return fresh;
  } catch {
    if (cached) { await setMeta("fifa-ranking", { ...cached, fetchedAt: Date.now() - RANKING_TTL_MS + 3600_000 }).catch(() => {}); } // retry in an hour, not every poll
    return cached;
  }
}

/** Top 10 + Morocco, from the live ranking (or its last good copy). */
export async function trackedNations(): Promise<{ teams: Nation[]; ranking: RankingCache | null }> {
  const ranking = await currentRanking();
  const all = ranking?.teams ?? FALLBACK;
  const teams = all.filter((t) => t.rank <= TOP_N || ALWAYS_CODES.includes(t.code));
  return { teams, ranking };
}

// ─── Country names · FIFA writes "Türkiye", ESPN "Turkey", YouTube "Holland" ──
const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const ALIASES: Record<string, string[]> = {
  "usa": ["united states", "united states of america", "us", "u.s."],
  "turkiye": ["turkey"],
  "korea republic": ["south korea", "korea"],
  "korea dpr": ["north korea"],
  "ir iran": ["iran"],
  "cote d'ivoire": ["ivory coast"],
  "czechia": ["czech republic"],
  "china pr": ["china"],
  "bosnia and herzegovina": ["bosnia-herzegovina", "bosnia"],
  "republic of ireland": ["ireland"],
  "cabo verde": ["cape verde"],
  "congo dr": ["dr congo", "democratic republic of congo", "drc"],
  "netherlands": ["holland"],
  "united arab emirates": ["uae"],
  "north macedonia": ["macedonia"],
  "trinidad and tobago": ["trinidad"],
};
/** One key per country whatever the spelling · the FIFA name is the key when it has aliases. */
export function countryKey(name: string): string {
  const n = strip(name);
  for (const [key, aliases] of Object.entries(ALIASES)) if (n === key || aliases.includes(n)) return key;
  return n;
}
/** Arabic names as beIN writes them · beIN's own titles carry no score, so its copy is the one to prefer. */
const ARABIC: Record<string, string[]> = {
  "spain": ["اسبانيا"], "argentina": ["الارجنتين"], "france": ["فرنسا"], "england": ["انجلترا", "انكلترا"], "brazil": ["البرازيل"],
  "morocco": ["المغرب"], "portugal": ["البرتغال"], "belgium": ["بلجيكا"], "netherlands": ["هولندا"], "mexico": ["المكسيك"],
  "germany": ["المانيا"], "colombia": ["كولومبيا"], "uruguay": ["اوروغواي", "الاوروغواي"], "italy": ["ايطاليا"], "croatia": ["كرواتيا"],
  "usa": ["امريكا", "الولايات المتحده"], "japan": ["اليابان"], "senegal": ["السنغال"], "ir iran": ["ايران"], "turkiye": ["تركيا"],
  "korea republic": ["كوريا الجنوبيه"], "switzerland": ["سويسرا"], "denmark": ["الدنمارك", "الدانمارك"], "austria": ["النمسا"], "ecuador": ["الاكوادور"],
  "norway": ["النرويج"], "egypt": ["مصر"], "algeria": ["الجزائر"], "ukraine": ["اوكرانيا"], "australia": ["استراليا"], "sweden": ["السويد"],
  "poland": ["بولندا"], "wales": ["ويلز"], "serbia": ["صربيا"], "greece": ["اليونان"], "nigeria": ["نيجيريا"], "cote d'ivoire": ["كوت ديفوار", "ساحل العاج"],
  "canada": ["كندا"], "hungary": ["المجر"], "scotland": ["اسكتلندا", "اسكوتلندا"], "czechia": ["التشيك"], "tunisia": ["تونس"], "cameroon": ["الكاميرون"],
  "qatar": ["قطر"], "saudi arabia": ["السعوديه"], "republic of ireland": ["ايرلندا", "جمهوريه ايرلندا"], "peru": ["بيرو"], "chile": ["تشيلي"],
  "paraguay": ["باراغواي"], "venezuela": ["فنزويلا"], "romania": ["رومانيا"], "slovenia": ["سلوفينيا"], "slovakia": ["سلوفاكيا"], "bolivia": ["بوليفيا"],
  "gabon": ["الغابون"], "lesotho": ["ليسوتو"], "ghana": ["غانا"], "mali": ["مالي"], "south africa": ["جنوب افريقيا"], "dr congo": ["الكونغو الديمقراطيه"],
  "israel": ["اسرائيل"], "kosovo": ["كوسوفو"], "georgia": ["جورجيا"], "bosnia and herzegovina": ["البوسنه والهرسك", "البوسنه"], "north macedonia": ["مقدونيا الشماليه"],
  "united arab emirates": ["الامارات"], "iraq": ["العراق"], "oman": ["عمان"], "kuwait": ["الكويت"], "bahrain": ["البحرين"], "jordan": ["الاردن"],
};
const normAr = (s: string) => s.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
/** Every spelling of a country a video title might use (≥ 4 letters). */
function countryNames(name: string): string[] {
  const key = countryKey(name);
  return [key, ...(ALIASES[key] ?? [])].filter((n) => n.length >= 4);
}
export function mentionsCountry(title: string, name: string): boolean {
  const t = ` ${strip(title).replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ")} `;
  if (countryNames(name).some((n) => t.includes(` ${n} `))) return true;
  const ar = ` ${normAr(title)} `;
  return (ARABIC[countryKey(name)] ?? []).some((n) => ar.includes(n));
}

// ─── ESPN fixtures ────────────────────────────────────────────────────────────
/** ESPN league id → the competition name shown on the card (men's national teams only). */
const INTERNATIONAL_LEAGUES: Record<string, string> = {
  "2395": "Nations League", "19267": "Nations League",
  "3922": "Friendly",
  "8315": "AFCON qualifier", "3908": "AFCON",
  "786": "World Cup qualifier", "787": "World Cup qualifier", "788": "World Cup qualifier", "789": "World Cup qualifier", "790": "World Cup qualifier", "792": "World Cup qualifier",
  "23449": "World Cup play-off", "8360": "World Cup play-off",
  "606": "World Cup",
  "781": "Euro", "3947": "Euro qualifier",
  "780": "Copa América",
  "4004": "Gold Cup", "19778": "Gold Cup qualifier",
  "20219": "Asian Cup",
  "23107": "Gulf Cup",
};

export type Fixture = { espnId: string; home: string; away: string; kickoff: number; competition: string; context: string; finished: boolean };

type EspnEvent = {
  id?: string; uid?: string; date?: string;
  competitions?: { altGameNote?: string; status?: { type?: { state?: string; completed?: boolean } }; competitors?: { homeAway?: string; team?: { displayName?: string } }[] }[];
};

const ymdToEspn = (ymd: string) => ymd.replace(/-/g, "");

/**
 * Every men's international match on one day (Europe/Madrid YYYY-MM-DD), finished or not.
 * ESPN first (it carries the AFCON qualifiers · two hosts, the first refused Vercel's servers
 * with a 403 on 2026-09-30 while answering the Mac), then FIFA's own match calendar (reachable
 * from Vercel, national teams flagged, but no CAF qualifiers).
 */
export async function fetchFixtures(ymd: string): Promise<Fixture[]> {
  const errors: string[] = [];
  for (const host of ["site.api.espn.com", "site.web.api.espn.com"]) {
    try { return await fetchEspn(host, ymd); } catch (e) { errors.push(`${host.split(".")[0]} ${String((e as Error)?.message ?? e).slice(0, 30)}`); }
  }
  try { return await fetchFifaCalendar(ymd); } catch (e) { errors.push(`fifa ${String((e as Error)?.message ?? e).slice(0, 30)}`); }
  throw new Error(errors.join(" · "));
}

async function fetchEspn(host: string, ymd: string): Promise<Fixture[]> {
  const res = await fetch(`https://${host}/apis/site/v2/sports/soccer/all/scoreboard?dates=${ymdToEspn(ymd)}&limit=1000`, { headers: { ...UA, accept: "application/json, text/plain, */*", referer: "https://www.espn.com/" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: Fixture[] = [];
  for (const e of data.events ?? []) {
    const leagueId = e.uid?.match(/~l:(\d+)~/)?.[1] ?? "";
    const competition = INTERNATIONAL_LEAGUES[leagueId];
    if (!competition || !e.id || !e.date) continue;
    const c = e.competitions?.[0];
    const home = c?.competitors?.find((x) => x.homeAway === "home")?.team?.displayName;
    const away = c?.competitors?.find((x) => x.homeAway === "away")?.team?.displayName;
    if (!home || !away) continue;
    // "UEFA Nations League, Group A2" → "Group A2" · "AFCON Qualifying, Group A" → "Group A" · friendlies carry nothing.
    const note = c?.altGameNote ?? "";
    const stage = note.includes(",") ? note.slice(note.indexOf(",") + 1).trim() : /final|semi|quarter|round|play-?off/i.test(note) ? note.trim() : "";
    out.push({
      espnId: e.id, home, away, kickoff: Date.parse(e.date), competition,
      context: stage ? `${competition} · ${stage}` : competition,
      finished: c?.status?.type?.state === "post" || c?.status?.type?.completed === true,
    });
  }
  return out;
}

type FifaName = { Locale?: string; Description?: string }[];
type FifaMatch = { IdMatch?: string; Date?: string; MatchStatus?: number; CompetitionName?: FifaName; StageName?: FifaName; GroupName?: FifaName; Home?: { TeamType?: number; Gender?: number; TeamName?: FifaName }; Away?: { TeamType?: number; TeamName?: FifaName } };
const fifaText = (n: FifaName | undefined) => n?.[0]?.Description?.trim() ?? "";
/** FIFA's competition names → the short labels used on the card. */
function fifaCompetition(name: string): string | null {
  const n = name.replace(/™/g, "").trim();
  if (/women|u-?1[0-9]|u-?2[0-3]|futsal|beach|olympic|youth|esports|club/i.test(n)) return null;
  if (/nations league/i.test(n)) return "Nations League";
  if (/^friendl/i.test(n)) return "Friendly";
  if (/world cup.*qualif/i.test(n)) return "World Cup qualifier";
  if (/world cup/i.test(n)) return "World Cup";
  if (/africa cup of nations.*qualif|afcon.*qualif/i.test(n)) return "AFCON qualifier";
  if (/africa cup of nations|afcon/i.test(n)) return "AFCON";
  if (/euro.*qualif/i.test(n)) return "Euro qualifier";
  if (/uefa euro/i.test(n)) return "Euro";
  if (/copa am/i.test(n)) return "Copa América";
  if (/gold cup/i.test(n)) return "Gold Cup";
  if (/asian cup/i.test(n)) return "Asian Cup";
  if (/gulf cup/i.test(n)) return "Gulf Cup";
  if (/arab cup/i.test(n)) return "Arab Cup";
  if (/asean cup/i.test(n)) return "ASEAN Cup";
  return n.replace(/^FIFA /, "") || null;
}
async function fetchFifaCalendar(ymd: string): Promise<Fixture[]> {
  const res = await fetch(`https://api.fifa.com/api/v3/calendar/matches?from=${ymd}T00:00:00Z&to=${ymd}T23:59:59Z&count=500&language=en`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = (await res.json()) as { Results?: FifaMatch[] };
  const out: Fixture[] = [];
  for (const m of data.Results ?? []) {
    if (m.Home?.TeamType !== 1 || m.Away?.TeamType !== 1 || (m.Home?.Gender !== undefined && m.Home.Gender !== 1)) continue;
    const competition = fifaCompetition(fifaText(m.CompetitionName));
    const home = fifaText(m.Home?.TeamName), away = fifaText(m.Away?.TeamName);
    if (!competition || !home || !away || !m.IdMatch || !m.Date) continue;
    const group = fifaText(m.GroupName), stage = fifaText(m.StageName);
    const detail = [stage, group].filter((x) => x && !/^(friendlies|regular season)/i.test(x)).join(", ");
    out.push({ espnId: `fifa-${m.IdMatch}`, home, away, kickoff: Date.parse(m.Date), competition, context: detail ? `${competition} · ${detail}` : competition, finished: m.MatchStatus === 0 });
  }
  return out;
}

// ─── The video ────────────────────────────────────────────────────────────────
const NOISE = /\b(u1[0-9]|u2[0-3]|under[- ]?2[0-3]|women|women's|female|ladies|futsal|beach|rugby|basketball|handball|volleyball|cricket|hockey|reaction|reacts?|preview|prediction|predictions|lineup|line-up|press conference|full match|live stream|efootball|fifa ?2[0-9]|fc ?2[0-9]|pes|esports|analysis|tactical)\b/i;

/** Most-viewed public video of this match: names both sides, 1.5–20 min, uploaded after kick-off. `null` = nothing yet. */
export async function pickNationalVideo(f: Fixture): Promise<string | null> {
  const sinceKickoff = (Date.now() - f.kickoff) / 3600_000;
  // YouTube's own "this week" / "this month" filter keeps the copy to THIS game, not the same two sides at a tournament years ago.
  const hits = await searchVideos(`${f.home} vs ${f.away} highlights`, { recent: sinceKickoff < 6 * 24 ? "week" : "month" });
  const ok = hits.filter((h) =>
    mentionsCountry(h.title, f.home) && mentionsCountry(h.title, f.away) &&
    /highlight|goals|résumé|resume|resumen|ملخص|zusammenfassung|sintesi|extended/i.test(h.title) &&
    !NOISE.test(h.title) &&
    h.seconds >= 90 && h.seconds <= 20 * 60 &&
    (h.ageHours === null || h.ageHours <= sinceKickoff + 30));
  // beIN's official copy first (score-free title, plays in Spain), then the most viewed.
  ok.sort((a, b) => Number(/bein/i.test(b.channel)) - Number(/bein/i.test(a.channel)) || b.views - a.views);
  return ok[0]?.videoId ?? null;
}

// ─── The scan ─────────────────────────────────────────────────────────────────
const SCAN_EVERY_MS = 60 * 60_000;
const PENDING_KEEP_DAYS = 10;
export const pendingId = (espnId: string) => `pending:${espnId}`;
export const isPendingId = (videoId: string) => videoId.startsWith("pending:");

const madridYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type NationalScan = { skipped?: boolean; days: string[]; tracked: string[]; fixtures: number; added: number; filled: number; searches: number; errors: string[] };

/**
 * Hourly (or forced): fixtures of the tracked nations → one row each; pending rows get their
 * video when YouTube has one. `days` = how far back (2 = yesterday + today, 8 on the first run).
 */
export async function pollNational(opts: { force?: boolean; days?: number; budget?: number } = {}): Promise<NationalScan> {
  await ensureMetaTable();
  const last = await getMeta<{ at: number }>("national-scan");
  if (!opts.force && last && Date.now() - last.at < SCAN_EVERY_MS) return { skipped: true, days: [], tracked: [], fixtures: 0, added: 0, filled: 0, searches: 0, errors: [] };
  const budget = opts.budget ?? 6;
  const { teams } = await trackedNations();
  const trackedKeys = new Set(teams.map((t) => countryKey(t.name)));
  const nDays = opts.days ?? (last ? 2 : 8);
  const days: string[] = [];
  for (let i = nDays - 1; i >= 0; i--) days.push(madridYmd(new Date(Date.now() - i * 86400_000)));

  const errors: string[] = [];
  const fixtures: Fixture[] = [];
  for (const d of days) {
    try { fixtures.push(...await fetchFixtures(d)); } catch (e) { errors.push(`${d}: ${String((e as Error)?.message ?? e).slice(0, 60)}`); }
  }
  const relevant = fixtures.filter((f) => f.finished && (trackedKeys.has(countryKey(f.home)) || trackedKeys.has(countryKey(f.away))));

  let existing: { id: number; videoId: string; home: string; away: string; competition: string; publishedAt: Date; source: string; watchedAt: Date | null; title: string }[] = [];
  try {
    existing = await db.select({ id: highlights.id, videoId: highlights.videoId, home: highlights.home, away: highlights.away, competition: highlights.competition, publishedAt: highlights.publishedAt, source: highlights.source, watchedAt: highlights.watchedAt, title: highlights.title }).from(highlights);
  } catch { /* first run */ }
  const known = new Set(existing.map((x) => x.videoId));
  const sameMatch = (f: Fixture) => existing.find((x) =>
    x.title === `espn:${f.espnId}` ||
    ([x.home, x.away].map(countryKey).sort().join("|") === [f.home, f.away].map(countryKey).sort().join("|") && Math.abs(x.publishedAt.getTime() - f.kickoff) < 3 * 86400_000));

  let added = 0, filled = 0, searches = 0;
  // Newest first so the budget goes to the matches Ali is most likely to open today.
  relevant.sort((a, b) => b.kickoff - a.kickoff);
  for (const f of relevant) {
    if (sameMatch(f)) continue;
    let videoId = pendingId(f.espnId), source = "national-pending";
    if (searches < budget) {
      searches += 1;
      const v = await pickNationalVideo(f).catch(() => null);
      if (v && !known.has(v)) { videoId = v; source = "national"; }
    }
    try {
      await db.insert(highlights).values({ videoId, source, title: `espn:${f.espnId}`, home: f.home, away: f.away, competition: f.competition, context: f.context, publishedAt: new Date(f.kickoff) });
      existing.push({ id: 0, videoId, home: f.home, away: f.away, competition: f.competition, publishedAt: new Date(f.kickoff), source, watchedAt: null, title: `espn:${f.espnId}` });
      known.add(videoId);
      added += 1;
    } catch { /* raced with another poll */ }
  }
  // Pending rows: try again for a video, newest first, inside the same budget.
  const pending = existing.filter((x) => x.source === "national-pending" && x.id > 0).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  for (const p of pending) {
    if (searches >= budget) break;
    searches += 1;
    const f: Fixture = { espnId: p.title.replace(/^espn:/, ""), home: p.home, away: p.away, kickoff: p.publishedAt.getTime(), competition: p.competition, context: "", finished: true };
    const v = await pickNationalVideo(f).catch(() => undefined);
    if (v && !known.has(v)) {
      await db.update(highlights).set({ videoId: v, source: "national" }).where(eq(highlights.id, p.id)).catch(() => {});
      known.add(v);
      filled += 1;
    }
  }
  // A match with no public highlight after 10 days will not get one · the row goes.
  try { await db.run(sql`DELETE FROM highlights WHERE source = 'national-pending' AND published_at < ${Date.now() - PENDING_KEEP_DAYS * 86400_000}`); } catch { /* best effort */ }
  await setMeta("national-scan", { at: Date.now(), days, tracked: teams.map((t) => t.name), fixtures: relevant.length, added, filled }).catch(() => {});
  return { days, tracked: teams.map((t) => t.name), fixtures: relevant.length, added, filled, searches, errors };
}

/** For the API: what the scan knows (ranking date, tracked teams, last run). */
export async function nationalStatus(): Promise<{ ranking: { officialDate: string; fetchedAt: number } | null; tracked: Nation[]; lastScan: unknown }> {
  const ranking = await currentRanking();
  const tracked = (ranking?.teams ?? FALLBACK).filter((t) => t.rank <= TOP_N || ALWAYS_CODES.includes(t.code));
  const lastScan = await getMeta("national-scan");
  const rows = await db.select({ n: sql<number>`count(*)` }).from(highlights).where(sql`source LIKE 'national%'`).catch(() => [{ n: 0 }]);
  return { ranking: ranking ? { officialDate: ranking.officialDate, fetchedAt: ranking.fetchedAt } : null, tracked, lastScan: { ...(lastScan as object ?? {}), rows: rows[0]?.n ?? 0 } };
}
