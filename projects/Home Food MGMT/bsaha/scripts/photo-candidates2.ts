/**
 * Quality pass: for every dish in data/dishes/*.json gather up to N free-licence candidates
 * (Flickr and Wikimedia via Openverse, plus Wikimedia Commons directly), min 800px wide, landscape-ish,
 * saved as 420px thumbs in data/candidates2/<slug>-<n>.jpg with metadata in candidates.json.
 * Skips slugs already present in candidates.json. Optional data/photo-queries2.json overrides the query.
 * Run: npx tsx scripts/photo-candidates2.ts [N]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { slugify } from "../src/lib/slug";

const N = Number(process.argv[2] || 8);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data/candidates2");
fs.mkdirSync(outDir, { recursive: true });
const UA = "Bsaha family meal app (contact: ali.elaraki@edueasy.group)";
const OK = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd|pdm)$/i;
type Hit = { url: string; credit: string; license: string; source: string; w: number; h: number };
const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const overrides: Record<string, string> = fs.existsSync(path.join(root, "data/photo-queries2.json")) ? JSON.parse(fs.readFileSync(path.join(root, "data/photo-queries2.json"), "utf8")) : {};

/** ONLY_PREFIX=intl- limits the run to dish files whose name starts with that prefix. */
const prefix = process.env.ONLY_PREFIX ?? "";
const dishes = fs.readdirSync(path.join(root, "data/dishes")).filter((f) => f.endsWith(".json") && f.startsWith(prefix))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(root, "data/dishes", f), "utf8")) as { name_en: string; photo_query?: string }[]);
const QUERY: Record<string, string> = Object.fromEntries(dishes.filter((d) => d.photo_query).map((d) => [slugify(d.name_en), d.photo_query as string]));

/** Short query: drop parentheses and filler, keep the first 4 meaningful words. */
function shortQuery(name: string) {
  const s = name.replace(/\(.*?\)/g, " ").replace(/\b(with|and|a|the|on|in|of|no peppers|light|homemade|whole-wheat|wholegrain|halal|style|plate|bowl|side|fresh|Moroccan|baked|oven)\b/gi, " ").replace(/[^A-Za-z ]/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").slice(0, 4).join(" ");
}

async function openverse(q: string, extra: Record<string, string>): Promise<Hit[]> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.search = new URLSearchParams({ q, license: "cc0,by,by-sa,pdm", page_size: "20", ...extra }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) return [];
  const j = await r.json();
  return (j?.results ?? []).map((it: Record<string, unknown>) => ({
    url: String(it.url), credit: String(it.creator || it.source || "Openverse"),
    license: `CC ${String(it.license).toUpperCase()} ${it.license_version ?? ""}`.trim().replace("CC PDM", "Public domain").replace("CC CC0", "CC0"),
    source: String(it.foreign_landing_url || it.url), w: Number(it.width ?? 0), h: Number(it.height ?? 0),
  }));
}
async function commons(q: string): Promise<Hit[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "12", gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1000" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) return [];
  const j = await r.json(); const out: Hit[] = [];
  for (const p of Object.values(j?.query?.pages ?? {}) as { title: string; imageinfo?: Array<Record<string, unknown>> }[]) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const meta = ii.extmetadata as Record<string, { value: string }> | undefined; const lic = meta?.LicenseShortName?.value ?? "";
    if (!OK.test(lic) || /\.(svg|gif|tif|tiff)$/i.test(p.title)) continue;
    out.push({ url: String(ii.thumburl ?? ii.url), credit: strip(meta?.Artist?.value ?? "Wikimedia Commons"), license: lic, source: String(ii.descriptionurl), w: Number(ii.width ?? 0), h: Number(ii.height ?? 0) });
  }
  return out;
}
const good = (h: Hit) => h.w >= 800 && h.h >= 500 && h.w / h.h <= 2.2 && h.h / h.w <= 1.4;

async function thumb(url: string, file: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) }); if (!r.ok) return false;
  const tmp = file + ".tmp"; fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  try { execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "70", "--resampleWidth", "420", tmp, "--out", file], { stdio: "ignore" }); } catch { fs.rmSync(tmp, { force: true }); return false; }
  fs.rmSync(tmp, { force: true }); return true;
}

async function one(slug: string, name: string): Promise<{ q: string; hits: Hit[] }> {
  // The dish file's own photo_query first (written for stock-photo search), then the name.
  const q0 = overrides[slug] ?? QUERY[slug] ?? shortQuery(name);
  let out = await gather(slug, q0);
  if (out.hits.length < 3 && q0.split(" ").length > 2) {
    const q1 = q0.split(" ").slice(0, 2).join(" ");
    const more = await gather(slug, q1, out.hits.length);
    out = { q: `${q0} / ${q1}`, hits: [...out.hits, ...more.hits] };
  }
  return out;
}

async function gather(slug: string, q: string, offset = 0): Promise<{ q: string; hits: Hit[] }> {
  const pools = await Promise.all([
    openverse(q, { source: "flickr" }).catch(() => []),
    openverse(q, { size: "large" }).catch(() => []),
    commons(q).catch(() => []),
  ]);
  const seen = new Set<string>(); const picks: Hit[] = [];
  const lists = pools.map((p) => p.filter(good));
  for (let i = 0; offset + picks.length < N && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const h = l[i]; if (!h || seen.has(h.url) || offset + picks.length >= N) continue; seen.add(h.url);
      if (await thumb(h.url, path.join(outDir, `${slug}-${offset + picks.length}.jpg`)).catch(() => false)) picks.push(h);
    }
  }
  return { q, hits: picks };
}

async function run() {
  const file = path.join(outDir, "candidates.json");
  const all: Record<string, { q: string; hits: Hit[] }> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const todo = dishes.map((d) => [slugify(d.name_en), d.name_en] as const).filter(([s]) => !all[s]);
  console.log("to do:", todo.length);
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const results = await Promise.all(batch.map(([slug, name]) => one(slug, name)));
    batch.forEach(([slug], k) => { all[slug] = results[k]; console.log(slug, results[k].hits.length, "·", results[k].q); });
    fs.writeFileSync(file, JSON.stringify(all, null, 1));
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
