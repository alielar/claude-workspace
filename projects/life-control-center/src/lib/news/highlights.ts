/**
 * Football highlights, spoiler-free (2026-09-12, spec §7c item 11) · server only.
 *
 * What Ali sees: "Inter Milan vs Arsenal" + "Champions League · League phase, round 1".
 * No title, no thumbnail, no score. Tapping opens the video in the YouTube app.
 *
 * Sources (all public channel Atom feeds, no API key, all verified playable from
 * Spain on 2026-09-11):
 *   · beIN SPORTS (Arabic, official) → Champions League, La Liga, Premier League,
 *     Ligue 1. Its own titles carry no score ("ملخص مباراة X وY | competition - round").
 *   · Serie A (official league channel) → Serie A league matches (beIN has no rights).
 *   · FC Bayern, Borussia Dortmund, RB Leipzig (official club channels) → their
 *     Bundesliga league matches (beIN has no rights; the Bundesliga channel posts
 *     none). VfB Stuttgart's channel posts no first-team league highlights → gap.
 *
 * Coverage rule: Champions League matches where at least one side plays in one of
 * the five big leagues, plus the DOMESTIC league matches of every CL participant
 * from those leagues (CL_TEAMS below, extended automatically by any team that shows
 * up in a stored CL highlight).
 *
 * Feeds hold only the last 15 uploads and beIN posts 15+ a day, so pollHighlights()
 * runs from the reminders tick every 5 min and stores what it finds (video id
 * unique). Duplicates of the same match from two sources collapse on
 * (teams, competition, ±3 days). Rows older than 21 days are pruned.
 */

import { db } from "@/db";
import { highlights } from "@/db/schema";
import { desc, lt, sql } from "drizzle-orm";

export type Competition = "Champions League" | "La Liga" | "Premier League" | "Bundesliga" | "Serie A" | "Ligue 1";
type League = "ESP" | "GER" | "ITA" | "FRA" | "ENG" | "OTHER";

export type Highlight = {
  videoId: string;
  home: string;
  away: string;
  competition: Competition;
  context: string;       // "Champions League · League phase, round 1" / "Serie A · Matchday 3"
  publishedAt: number;   // ms
};

type Source = { id: string; channelId: string; kind: "bein" | "latin" };
export const SOURCES: Source[] = [
  { id: "bein",    channelId: "UCJUCcJUeh0Cz2xyKwkw5Q1w", kind: "bein" },
  { id: "seriea",  channelId: "UCBJeMCIeLQos7wacox4hmLQ", kind: "latin" },
  { id: "bayern",  channelId: "UCZkcxFIsqW5htimoUQKA0iA", kind: "latin" },
  { id: "bvb",     channelId: "UCK8rTVgp3-MebXkmeJcQb1Q", kind: "latin" },
  { id: "leipzig", channelId: "UCkZwB4IGoNBvRmVT2gaO4XA", kind: "latin" },
];

// ─── Teams ────────────────────────────────────────────────────────────────────
// canonical display name → league + aliases (Arabic as beIN writes them, Latin as
// the league/club channels write them). Matching is on normalized text.
type TeamDef = { league: League; aliases: string[] };
const TEAMS: Record<string, TeamDef> = {
  // Spain
  "Real Madrid":        { league: "ESP", aliases: ["ريال مدريد", "real madrid"] },
  "Barcelona":          { league: "ESP", aliases: ["برشلونة", "barcelona", "fc barcelona", "barça"] },
  "Atlético Madrid":    { league: "ESP", aliases: ["أتليتيكو مدريد", "اتلتيكو مدريد", "atletico madrid", "atlético madrid", "atlético de madrid", "atletico de madrid"] },
  "Villarreal":         { league: "ESP", aliases: ["فياريال", "villarreal", "villarreal cf"] },
  "Real Betis":         { league: "ESP", aliases: ["ريال بيتيس", "real betis", "betis"] },
  "Athletic Club":      { league: "ESP", aliases: ["أتلتيك بلباو", "اتلتيك بلباو", "athletic club", "athletic bilbao"] },
  "Sevilla":            { league: "ESP", aliases: ["إشبيلية", "اشبيلية", "sevilla"] },
  "Valencia":           { league: "ESP", aliases: ["فالنسيا", "valencia"] },
  "Real Sociedad":      { league: "ESP", aliases: ["ريال سوسييداد", "real sociedad"] },
  "Girona":             { league: "ESP", aliases: ["جيرونا", "girona"] },
  "Rayo Vallecano":     { league: "ESP", aliases: ["رايو فاييكانو", "rayo vallecano"] },
  "Málaga":             { league: "ESP", aliases: ["ملقا", "malaga", "málaga"] },
  "Getafe":             { league: "ESP", aliases: ["خيتافي", "getafe"] },
  "Osasuna":            { league: "ESP", aliases: ["أوساسونا", "اوساسونا", "osasuna"] },
  "Celta Vigo":         { league: "ESP", aliases: ["سيلتا فيغو", "celta", "celta vigo", "celta de vigo"] },
  "Alavés":             { league: "ESP", aliases: ["ألافيس", "الافيس", "alaves", "alavés", "deportivo alaves", "deportivo alavés"] },
  "Mallorca":           { league: "ESP", aliases: ["ريال مايوركا", "مايوركا", "mallorca", "real mallorca"] },
  "Espanyol":           { league: "ESP", aliases: ["إسبانيول", "اسبانيول", "espanyol"] },
  "Levante":            { league: "ESP", aliases: ["ليفانتي", "levante"] },
  "Elche":              { league: "ESP", aliases: ["إلتشي", "التشي", "elche"] },
  "Real Oviedo":        { league: "ESP", aliases: ["ريال أوفييدو", "أوفييدو", "real oviedo", "oviedo"] },
  "Las Palmas":         { league: "ESP", aliases: ["لاس بالماس", "las palmas"] },
  "Valladolid":         { league: "ESP", aliases: ["بلد الوليد", "valladolid", "real valladolid"] },
  "Leganés":            { league: "ESP", aliases: ["ليغانيس", "leganes", "leganés"] },
  // Germany
  "Bayern Munich":      { league: "GER", aliases: ["بايرن ميونيخ", "بايرن ميونخ", "bayern", "fc bayern", "fc bayern munich", "fc bayern münchen", "bayern munich", "bayern münchen"] },
  "Borussia Dortmund":  { league: "GER", aliases: ["بوروسيا دورتموند", "دورتموند", "borussia dortmund", "bvb", "dortmund"] },
  "RB Leipzig":         { league: "GER", aliases: ["لايبتسيغ", "لايبزيغ", "rb leipzig", "leipzig"] },
  "Stuttgart":          { league: "GER", aliases: ["شتوتغارت", "vfb stuttgart", "stuttgart", "vfb"] },
  "Bayer Leverkusen":   { league: "GER", aliases: ["باير ليفركوزن", "ليفركوزن", "bayer leverkusen", "bayer 04 leverkusen", "leverkusen"] },
  "Eintracht Frankfurt":{ league: "GER", aliases: ["آينتراخت فرانكفورت", "فرانكفورت", "eintracht frankfurt", "frankfurt"] },
  "Freiburg":           { league: "GER", aliases: ["فرايبورغ", "sc freiburg", "freiburg"] },
  "Mainz":              { league: "GER", aliases: ["ماينز", "mainz", "1. fsv mainz 05", "mainz 05"] },
  "Wolfsburg":          { league: "GER", aliases: ["فولفسبورغ", "vfl wolfsburg", "wolfsburg"] },
  "Mönchengladbach":    { league: "GER", aliases: ["مونشنغلادباخ", "borussia mönchengladbach", "borussia monchengladbach", "m'gladbach", "gladbach", "mönchengladbach"] },
  "Hoffenheim":         { league: "GER", aliases: ["هوفنهايم", "tsg hoffenheim", "hoffenheim", "tsg 1899 hoffenheim"] },
  "Werder Bremen":      { league: "GER", aliases: ["فيردر بريمن", "werder bremen", "sv werder bremen", "bremen"] },
  "Augsburg":           { league: "GER", aliases: ["أوغسبورغ", "fc augsburg", "augsburg"] },
  "Union Berlin":       { league: "GER", aliases: ["يونيون برلين", "union berlin", "1. fc union berlin"] },
  "Heidenheim":         { league: "GER", aliases: ["هايدنهايم", "heidenheim", "1. fc heidenheim"] },
  "St. Pauli":          { league: "GER", aliases: ["سانت باولي", "st. pauli", "fc st. pauli", "st pauli"] },
  "Hamburg":            { league: "GER", aliases: ["هامبورغ", "hamburger sv", "hamburg", "hsv"] },
  "Köln":               { league: "GER", aliases: ["كولن", "1. fc köln", "fc köln", "koln", "köln", "cologne"] },
  "Schalke":            { league: "GER", aliases: ["شالكه", "fc schalke 04", "schalke", "schalke 04"] },
  "Hertha Berlin":      { league: "GER", aliases: ["هيرتا برلين", "hertha bsc", "hertha berlin", "hertha"] },
  "Bochum":             { league: "GER", aliases: ["بوخوم", "vfl bochum", "bochum"] },
  "Kiel":               { league: "GER", aliases: ["هولشتاين كيل", "holstein kiel", "kiel"] },
  "Darmstadt":          { league: "GER", aliases: ["دارمشتات", "darmstadt", "sv darmstadt 98"] },
  // Italy
  "Inter Milan":        { league: "ITA", aliases: ["إنتر ميلان", "إنتر", "انتر", "inter", "inter milan", "fc internazionale", "internazionale"] },
  "Napoli":             { league: "ITA", aliases: ["نابولي", "napoli", "ssc napoli"] },
  "Roma":               { league: "ITA", aliases: ["روما", "roma", "as roma"] },
  "Como":               { league: "ITA", aliases: ["كومو", "como", "como 1907"] },
  "Juventus":           { league: "ITA", aliases: ["يوفنتوس", "juventus", "juve"] },
  "AC Milan":           { league: "ITA", aliases: ["ميلان", "milan", "ac milan"] },
  "Atalanta":           { league: "ITA", aliases: ["أتالانتا", "اتالانتا", "atalanta"] },
  "Lazio":              { league: "ITA", aliases: ["لاتسيو", "lazio"] },
  "Fiorentina":         { league: "ITA", aliases: ["فيورنتينا", "fiorentina"] },
  "Bologna":            { league: "ITA", aliases: ["بولونيا", "bologna"] },
  "Torino":             { league: "ITA", aliases: ["تورينو", "torino"] },
  "Udinese":            { league: "ITA", aliases: ["أودينيزي", "اودينيزي", "udinese"] },
  "Genoa":              { league: "ITA", aliases: ["جنوى", "genoa"] },
  "Sassuolo":           { league: "ITA", aliases: ["ساسولو", "sassuolo"] },
  "Lecce":              { league: "ITA", aliases: ["ليتشي", "lecce"] },
  "Cagliari":           { league: "ITA", aliases: ["كالياري", "cagliari"] },
  "Parma":              { league: "ITA", aliases: ["بارما", "parma"] },
  "Verona":             { league: "ITA", aliases: ["هيلاس فيرونا", "فيرونا", "verona", "hellas verona"] },
  "Cremonese":          { league: "ITA", aliases: ["كريمونيزي", "cremonese"] },
  "Pisa":               { league: "ITA", aliases: ["بيزا", "pisa"] },
  "Frosinone":          { league: "ITA", aliases: ["فروزينوني", "frosinone"] },
  "Monza":              { league: "ITA", aliases: ["مونزا", "monza"] },
  "Empoli":             { league: "ITA", aliases: ["إمبولي", "امبولي", "empoli"] },
  "Venezia":            { league: "ITA", aliases: ["فينيسيا", "venezia"] },
  "Salernitana":        { league: "ITA", aliases: ["ساليرنيتانا", "salernitana"] },
  // France
  "PSG":                { league: "FRA", aliases: ["باريس سان جيرمان", "paris saint-germain", "paris saint germain", "psg", "paris sg"] },
  "Lille":              { league: "FRA", aliases: ["ليل", "lille", "losc lille", "losc"] },
  "Lens":               { league: "FRA", aliases: ["لانس", "لونس", "lens", "rc lens"] },
  "Marseille":          { league: "FRA", aliases: ["مارسيليا", "marseille", "olympique de marseille", "om"] },
  "Monaco":             { league: "FRA", aliases: ["موناكو", "monaco", "as monaco"] },
  "Lyon":               { league: "FRA", aliases: ["ليون", "lyon", "olympique lyonnais", "ol"] },
  "Nice":               { league: "FRA", aliases: ["نيس", "nice", "ogc nice"] },
  "Brest":              { league: "FRA", aliases: ["بريست", "brest", "stade brestois"] },
  "Rennes":             { league: "FRA", aliases: ["رين", "rennes", "stade rennais"] },
  "Strasbourg":         { league: "FRA", aliases: ["ستراسبورغ", "strasbourg", "rc strasbourg"] },
  "Toulouse":           { league: "FRA", aliases: ["تولوز", "toulouse"] },
  "Nantes":             { league: "FRA", aliases: ["نانت", "nantes", "fc nantes"] },
  "Montpellier":        { league: "FRA", aliases: ["مونبلييه", "montpellier"] },
  "Reims":              { league: "FRA", aliases: ["ريمس", "reims", "stade de reims"] },
  "Le Havre":           { league: "FRA", aliases: ["لوهافر", "le havre"] },
  "Auxerre":            { league: "FRA", aliases: ["أوكسير", "اوكسير", "auxerre"] },
  "Angers":             { league: "FRA", aliases: ["أنجيه", "انجيه", "angers"] },
  "Lorient":            { league: "FRA", aliases: ["لوريان", "lorient"] },
  "Metz":               { league: "FRA", aliases: ["ميتز", "metz"] },
  "Paris FC":           { league: "FRA", aliases: ["باريس إف سي", "paris fc"] },
  "Saint-Étienne":      { league: "FRA", aliases: ["سانت إتيان", "saint-etienne", "saint-étienne", "as saint-étienne"] },
  // England
  "Liverpool":          { league: "ENG", aliases: ["ليفربول", "liverpool"] },
  "Arsenal":            { league: "ENG", aliases: ["آرسنال", "ارسنال", "arsenal"] },
  "Manchester City":    { league: "ENG", aliases: ["مانشستر سيتي", "manchester city", "man city"] },
  "Manchester United":  { league: "ENG", aliases: ["مانشستر يونايتد", "manchester united", "man united", "man utd"] },
  "Aston Villa":        { league: "ENG", aliases: ["أستون فيلا", "استون فيلا", "aston villa"] },
  "Chelsea":            { league: "ENG", aliases: ["تشلسي", "chelsea"] },
  "Tottenham":          { league: "ENG", aliases: ["توتنهام هوتسبير", "توتنهام", "tottenham", "tottenham hotspur", "spurs"] },
  "Newcastle":          { league: "ENG", aliases: ["نيوكاسل يونايتد", "نيوكاسل", "newcastle", "newcastle united"] },
  "Everton":            { league: "ENG", aliases: ["إيفرتون", "ايفرتون", "everton"] },
  "Ipswich Town":       { league: "ENG", aliases: ["إيبسويتش تاون", "إبسويتش تاون", "ipswich", "ipswich town"] },
  "Hull City":          { league: "ENG", aliases: ["هال سيتي", "hull city", "hull"] },
  "Brighton":           { league: "ENG", aliases: ["برايتون", "brighton", "brighton & hove albion"] },
  "Wolves":             { league: "ENG", aliases: ["ولفرهامبتون", "wolves", "wolverhampton", "wolverhampton wanderers"] },
  "West Ham":           { league: "ENG", aliases: ["وست هام", "وست هام يونايتد", "west ham", "west ham united"] },
  "Fulham":             { league: "ENG", aliases: ["فولهام", "fulham"] },
  "Brentford":          { league: "ENG", aliases: ["برينتفورد", "brentford"] },
  "Crystal Palace":     { league: "ENG", aliases: ["كريستال بالاس", "crystal palace"] },
  "Bournemouth":        { league: "ENG", aliases: ["بورنموث", "bournemouth", "afc bournemouth"] },
  "Nottingham Forest":  { league: "ENG", aliases: ["نوتينغهام فورست", "nottingham forest", "forest"] },
  "Leeds United":       { league: "ENG", aliases: ["ليدز يونايتد", "ليدز", "leeds", "leeds united"] },
  "Burnley":            { league: "ENG", aliases: ["بيرنلي", "burnley"] },
  "Sunderland":         { league: "ENG", aliases: ["سندرلاند", "sunderland"] },
  "Leicester City":     { league: "ENG", aliases: ["ليستر سيتي", "leicester", "leicester city"] },
  "Southampton":        { league: "ENG", aliases: ["ساوثهامبتون", "southampton"] },
  "Sheffield United":   { league: "ENG", aliases: ["شيفيلد يونايتد", "sheffield united"] },
  // Champions League regulars from elsewhere (so the other side has an English name)
  "Bodø/Glimt":         { league: "OTHER", aliases: ["بودو/غليمت", "بودو غليمت", "bodø/glimt", "bodo/glimt", "fk bodø/glimt", "bodo glimt"] },
  "Slovan Bratislava":  { league: "OTHER", aliases: ["سلوفان براتيسلافا", "slovan bratislava"] },
  "Feyenoord":          { league: "OTHER", aliases: ["فاينورد", "feyenoord"] },
  "Porto":              { league: "OTHER", aliases: ["بورتو", "porto", "fc porto"] },
  "Sabah":              { league: "OTHER", aliases: ["صباح الأذربيجاني", "صباح", "sabah", "sabah fk"] },
  "Slavia Prague":      { league: "OTHER", aliases: ["سلافيا براغ", "slavia prague", "slavia praha"] },
  "Fenerbahçe":         { league: "OTHER", aliases: ["فنربهتشة", "فنربخشة", "fenerbahçe", "fenerbahce"] },
  "Sporting CP":        { league: "OTHER", aliases: ["سبورتينغ لشبونة", "sporting", "sporting cp", "sporting lisbon"] },
  "Galatasaray":        { league: "OTHER", aliases: ["غلطة سراي", "galatasaray"] },
  "Viking":             { league: "OTHER", aliases: ["فايكينغ", "viking", "viking fk", "viking stavanger"] },
  "PSV":                { league: "OTHER", aliases: ["بي إس في آيندهوفن", "آيندهوفن", "psv", "psv eindhoven"] },
  "Shakhtar Donetsk":   { league: "OTHER", aliases: ["شاختار دونيتسك", "شاختار", "shakhtar", "shakhtar donetsk"] },
  "Club Brugge":        { league: "OTHER", aliases: ["كلوب بروج", "club brugge", "club bruges"] },
  "Benfica":            { league: "OTHER", aliases: ["بنفيكا", "benfica", "sl benfica"] },
  "Ajax":               { league: "OTHER", aliases: ["أياكس", "اياكس", "ajax"] },
  "Celtic":             { league: "OTHER", aliases: ["سلتيك", "celtic"] },
  "Copenhagen":         { league: "OTHER", aliases: ["كوبنهاغن", "copenhagen", "fc copenhagen", "fc københavn"] },
  "Olympiacos":         { league: "OTHER", aliases: ["أولمبياكوس", "اولمبياكوس", "olympiacos", "olympiakos"] },
  "Union Saint-Gilloise": { league: "OTHER", aliases: ["يونيون سان جيلواز", "union saint-gilloise", "union sg", "royale union sg"] },
  "Qarabağ":            { league: "OTHER", aliases: ["قره باغ", "qarabağ", "qarabag"] },
  "Kairat":             { league: "OTHER", aliases: ["قيرات", "كايرات", "kairat", "kairat almaty"] },
  "Pafos":              { league: "OTHER", aliases: ["بافوس", "pafos"] },
  "Red Bull Salzburg":  { league: "OTHER", aliases: ["ريد بول سالزبورغ", "سالزبورغ", "salzburg", "red bull salzburg"] },
  "Sturm Graz":         { league: "OTHER", aliases: ["شتورم غراتس", "sturm graz"] },
  "Dinamo Zagreb":      { league: "OTHER", aliases: ["دينامو زغرب", "dinamo zagreb"] },
  "Young Boys":         { league: "OTHER", aliases: ["يونغ بويز", "young boys", "bsc young boys"] },
  "Nijmegen":           { league: "OTHER", aliases: ["نيميخن", "nec nijmegen", "nijmegen"] },
  "LASK":               { league: "OTHER", aliases: ["لاسك لينتس", "lask", "lask linz"] },
};

/**
 * Champions League participants from the five leagues, season 2026-27, as seen in
 * beIN's round-1 highlights (2026-09-08 → 10). Any team that later appears in a
 * stored CL highlight is added automatically (see clTeams()).
 */
const CL_TEAMS_SEED = new Set<string>([
  "Real Madrid", "Barcelona", "Atlético Madrid", "Villarreal", "Real Betis",
  "Bayern Munich", "Borussia Dortmund", "RB Leipzig", "Stuttgart",
  "Inter Milan", "Napoli", "Roma", "Como",
  "PSG", "Lille", "Lens",
  "Liverpool", "Arsenal", "Manchester City", "Manchester United", "Aston Villa",
]);

// ─── Text normalization + team resolution ─────────────────────────────────────
const normAr = (s: string) => s
  .replace(/[ً-ْـ]/g, "")     // harakat, tatweel
  .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/\s+/g, " ").trim();
const normLat = (s: string) => s
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[’']/g, "'")
  .replace(/\b(fc|cf|afc|sc|ssc|as|ac|rc|sv|vfl|vfb|tsg|fk|bsc|1\.|1907|04|05|09|1899)\b/g, " ")
  .replace(/[^a-z0-9/& ]/g, " ")
  .replace(/\s+/g, " ").trim();
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

type Resolved = { name: string; league: League };
const ALIAS_INDEX: { alias: string; ar: boolean; name: string; league: League }[] = Object.entries(TEAMS)
  .flatMap(([name, def]) => def.aliases.map((a) => ({ alias: hasArabic(a) ? normAr(a) : normLat(a), ar: hasArabic(a), name, league: def.league })))
  .sort((a, b) => b.alias.length - a.alias.length); // longest alias first ("real betis" before "betis")

export function resolveTeam(raw: string): Resolved | null {
  const s = raw.trim();
  if (!s) return null;
  const ar = hasArabic(s);
  const n = ar ? normAr(s) : normLat(s);
  if (!n) return null;
  const exact = ALIAS_INDEX.find((a) => a.ar === ar && a.alias === n);
  if (exact) return { name: exact.name, league: exact.league };
  const partial = ALIAS_INDEX.find((a) => a.ar === ar && a.alias.length >= 4 && (n.includes(a.alias) || (a.alias.includes(n) && n.length >= 5)));
  return partial ? { name: partial.name, league: partial.league } : null;
}

// ─── Competition + context ────────────────────────────────────────────────────
const AR_ORDINALS: Record<string, number> = { "الاولي": 1, "الثانيه": 2, "الثالثه": 3, "الرابعه": 4, "الخامسه": 5, "السادسه": 6, "السابعه": 7, "الثامنه": 8, "التاسعه": 9, "العاشره": 10 };

function competitionOf(text: string): Competition | null {
  const ar = normAr(text);
  const lat = normLat(text);
  if (/دوري ابطال اوروبا/.test(ar) || /champions league/.test(lat)) return "Champions League";
  if (/الدوري الاسباني/.test(ar) || /\bla ?liga\b/.test(lat)) return "La Liga";
  if (/الدوري الانجليزي/.test(ar) || /premier league/.test(lat)) return "Premier League";
  if (/الدوري الالماني/.test(ar) || /bundesliga/.test(lat)) return "Bundesliga";
  if (/الدوري الايطالي/.test(ar) || /serie a/.test(lat)) return "Serie A";
  if (/الدوري الفرنسي/.test(ar) || /ligue 1/.test(lat)) return "Ligue 1";
  return null;
}

/** "League phase, round 3" · "Matchday 4" · "Round of 16, first leg" · "" when unknown. */
function roundOf(text: string, comp: Competition): string {
  const ar = normAr(text);
  const lat = normLat(text);
  if (comp === "Champions League") {
    if (/النهائي\b/.test(ar) && !/نصف|ربع|ثمن/.test(ar)) return "Final";
    if (/نصف النهائي|نصف نهائي/.test(ar) || /semi/.test(lat)) return `Semi-final${legAr(ar)}`;
    if (/ربع النهائي|ربع نهائي/.test(ar) || /quarter/.test(lat)) return `Quarter-final${legAr(ar)}`;
    if (/ثمن النهائي|ثمن نهائي/.test(ar) || /round of 16/.test(lat)) return `Round of 16${legAr(ar)}`;
    if (/الملحق/.test(ar) || /play-?off/.test(lat)) return `Play-off${legAr(ar)}`;
    const n = matchdayNumber(ar, lat);
    return n ? `League phase, round ${n}` : "League phase";
  }
  const n = matchdayNumber(ar, lat);
  return n ? `Matchday ${n}` : "";
}
const legAr = (ar: string) => (/ذهاب/.test(ar) ? ", first leg" : /اياب/.test(ar) ? ", second leg" : "");
function matchdayNumber(ar: string, lat: string): number | null {
  const d = ar.match(/الجوله\s*(\d{1,2})/) ?? ar.match(/الجوله\s*ال?(\S+)/);
  if (d) {
    if (/^\d+$/.test(d[1])) return Number(d[1]);
    const w = d[1].startsWith("ال") ? d[1] : `ال${d[1]}`;
    if (AR_ORDINALS[w]) return AR_ORDINALS[w];
  }
  const l = lat.match(/\b(\d{1,2})\s*(?:a|ª|st|nd|rd|th)?\s*(?:giornata|spieltag|matchday|round|md)\b/) ?? lat.match(/\b(?:giornata|spieltag|matchday|round|md)\s*(\d{1,2})\b/);
  if (l) return Number(l[1]);
  // Atalanta-style "Highlights 3ª Serie A 2026/27" · the ordinal mark alone (normLat strips ª → check the raw form).
  const ord = /(\d{1,2})\s*ª/.exec(ar);
  return ord ? Number(ord[1]) : null;
}

// ─── Title parsing ────────────────────────────────────────────────────────────
export type Parsed = { home: Resolved | { name: string; league: League }; away: Resolved | { name: string; league: League }; competition: Competition; context: string };

/** beIN: "ملخص مباراة <home> و<away> [(2-1)] | <competition> - <round>" */
export function parseBein(title: string): Parsed | null {
  const t = title.replace(/\s+/g, " ").trim();
  if (!/^ملخص مباراة/.test(t)) return null;
  const [matchPart, ...rest] = t.split("|");
  const tail = rest.join("|");
  const comp = competitionOf(tail || t);
  if (!comp) return null;
  const teamsText = matchPart.replace(/^ملخص مباراة/, "").replace(/\(.*?\)/g, "").replace(/\d+\s*[-–:]\s*\d+/g, "").trim();
  // Split on " و" (space + waw) · a team name starting with و ("وست هام") keeps its waw.
  const idx = teamsText.indexOf(" و");
  if (idx < 0) return null;
  const homeRaw = teamsText.slice(0, idx).trim();
  const awayRaw = teamsText.slice(idx + 2).trim();
  if (!homeRaw || !awayRaw) return null;
  const home = resolveTeam(homeRaw) ?? { name: homeRaw, league: "OTHER" as League };
  const away = resolveTeam(awayRaw) ?? { name: awayRaw, league: "OTHER" as League };
  return { home, away, competition: comp, context: `${comp}${roundOf(tail, comp) ? ` · ${roundOf(tail, comp)}` : ""}` };
}

/**
 * Latin channels: any "A vs B" / "A - B" / "A – B" / "A v B" segment whose two sides
 * both resolve to known teams; scores and emoji stripped first. The competition
 * comes from anywhere in the title (Serie A · Bundesliga · Champions League).
 */
export function parseLatin(title: string): Parsed | null {
  const clean = title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ").replace(/\s+/g, " ").trim();
  if (!/highlight|zusammenfassung|sintesi/i.test(clean)) return null;
  if (/\b(u1[0-9]|u2[0-3]|primavera|women|frauen|futuro|youth|legends|classic|training)\b/i.test(clean)) return null;
  const comp = competitionOf(clean);
  if (!comp) return null;
  for (const seg of clean.split(/\s*\|\s*/)) {
    const s = seg.replace(/\(?\b\d{1,2}\s*[-–:]\s*\d{1,2}\b\)?/g, " ").replace(/\s+/g, " ").trim();
    const parts = s.split(/\s+(?:vs\.?|v\.?|–|—)\s+|\s*-\s*/i);
    if (parts.length < 2) continue;
    // Try every split point so a hyphenated club name ("Saint-Étienne") still works.
    for (let i = 1; i < parts.length; i++) {
      const home = resolveTeam(parts.slice(0, i).join("-"));
      const away = resolveTeam(parts.slice(i).join("-"));
      if (home && away && home.name !== away.name) {
        return { home, away, competition: comp, context: `${comp}${roundOf(clean, comp) ? ` · ${roundOf(clean, comp)}` : ""}` };
      }
    }
  }
  return null;
}

// ─── Feed fetch ───────────────────────────────────────────────────────────────
type FeedEntry = { videoId: string; title: string; publishedAt: number };
async function fetchFeed(channelId: string): Promise<FeedEntry[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { "user-agent": "ali-control-center" }, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();
  const out: FeedEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1];
    const pub = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title) out.push({ videoId: id, title: decodeXml(title), publishedAt: pub ? Date.parse(pub) : Date.now() });
  }
  return out;
}
const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

// ─── Poll + store ─────────────────────────────────────────────────────────────
const KEEP_DAYS = 21;
const TOP5: League[] = ["ESP", "GER", "ITA", "FRA", "ENG"];

/** Seed set + every team seen in a stored Champions League highlight. */
async function clTeams(): Promise<Set<string>> {
  const set = new Set(CL_TEAMS_SEED);
  try {
    const rows = await db.select({ home: highlights.home, away: highlights.away, competition: highlights.competition }).from(highlights);
    for (const r of rows) if (r.competition === "Champions League") {
      for (const n of [r.home, r.away]) if (TEAMS[n] && TOP5.includes(TEAMS[n].league)) set.add(n);
    }
  } catch { /* table missing on first run · seed only */ }
  return set;
}

function wanted(p: Parsed, cl: Set<string>): boolean {
  const sides = [p.home, p.away];
  if (p.competition === "Champions League") return sides.some((s) => TOP5.includes(s.league));
  return sides.some((s) => cl.has(s.name));
}

/** The poll runs from the tick before anyone opened Today (ensureMigrate) · same DDL as migrate. */
async function ensureTable() {
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT NOT NULL UNIQUE, source TEXT NOT NULL, title TEXT NOT NULL,
      home TEXT NOT NULL, away TEXT NOT NULL, competition TEXT NOT NULL, context TEXT NOT NULL,
      published_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`));
  } catch { /* exists */ }
}

export type Candidate = Highlight & { source: string; title: string };

/** Fetch + parse every source (no database) · shared by the poll and the local test. */
export async function scanSources(cl: Set<string> = CL_TEAMS_SEED): Promise<{ candidates: Candidate[]; rejected: { source: string; title: string }[]; errors: string[] }> {
  const results = await Promise.allSettled(SOURCES.map(async (src) => ({ src, entries: await fetchFeed(src.channelId) })));
  const errors: string[] = [];
  const candidates: Candidate[] = [];
  const rejected: { source: string; title: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") { errors.push(`${SOURCES[i].id}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 60)}`); return; }
    for (const e of r.value.entries) {
      const p = r.value.src.kind === "bein" ? parseBein(e.title) : parseLatin(e.title);
      if (!p || !wanted(p, cl)) { rejected.push({ source: r.value.src.id, title: e.title }); continue; }
      candidates.push({ videoId: e.videoId, home: p.home.name, away: p.away.name, competition: p.competition, context: p.context, publishedAt: e.publishedAt, source: r.value.src.id, title: e.title });
    }
  });
  return { candidates, rejected, errors };
}

/** Fetch every source, parse, filter, store. Returns how many new rows landed. */
export async function pollHighlights(): Promise<{ added: number; seen: number; errors: string[] }> {
  await ensureTable();
  const cl = await clTeams();
  const { candidates, errors } = await scanSources(cl);

  let existing: { videoId: string; home: string; away: string; competition: string; publishedAt: Date }[] = [];
  try {
    existing = await db.select({ videoId: highlights.videoId, home: highlights.home, away: highlights.away, competition: highlights.competition, publishedAt: highlights.publishedAt }).from(highlights);
  } catch { /* first run before migrate · treat as empty */ }
  const known = new Set(existing.map((x) => x.videoId));
  const pairKey = (h: string, a: string, c: string) => `${[h, a].sort().join("|")}|${c}`;
  const sameMatch = (h: string, a: string, c: string, t: number) =>
    existing.some((x) => pairKey(x.home, x.away, x.competition) === pairKey(h, a, c) && Math.abs(x.publishedAt.getTime() - t) < 3 * 86400_000);

  let added = 0;
  // beIN first so its clean, score-free copy wins when two sources carry the same match.
  candidates.sort((a, b) => (a.source === "bein" ? 0 : 1) - (b.source === "bein" ? 0 : 1));
  for (const c of candidates) {
    if (known.has(c.videoId) || sameMatch(c.home, c.away, c.competition, c.publishedAt)) continue;
    try {
      await db.insert(highlights).values({ videoId: c.videoId, source: c.source, title: c.title, home: c.home, away: c.away, competition: c.competition, context: c.context, publishedAt: new Date(c.publishedAt) });
      existing.push({ videoId: c.videoId, home: c.home, away: c.away, competition: c.competition, publishedAt: new Date(c.publishedAt) });
      known.add(c.videoId);
      added += 1;
    } catch { /* raced with another poll · fine */ }
  }
  try { await db.delete(highlights).where(lt(highlights.publishedAt, new Date(Date.now() - KEEP_DAYS * 86400_000))); } catch { /* best effort */ }
  return { added, seen: candidates.length, errors };
}

export async function listHighlights(limit = 40): Promise<Highlight[]> {
  const rows = await db.select().from(highlights).orderBy(desc(highlights.publishedAt)).limit(limit);
  return rows.map((r) => ({ videoId: r.videoId, home: r.home, away: r.away, competition: r.competition as Competition, context: r.context, publishedAt: r.publishedAt.getTime() }));
}
