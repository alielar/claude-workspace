/**
 * Finds a free-licence photo for every dish in data/dish-list.json, downloads it, resizes to 800px
 * with macOS `sips`, saves public/dishes/<slug>.jpg and records credit + licence in data/photos.json.
 * Sources: Wikimedia Commons (CC BY, CC BY-SA, CC0, public domain), then Openverse.
 * Idempotent: slugs already in photos.json are skipped. Optional data/photo-queries.json overrides the search text.
 * Run: npx tsx scripts/fetch-photos.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { slugify } from "../src/lib/slug";

const root = path.resolve(__dirname, "..");
const dishFiles = fs.readdirSync(path.join(root, "data/dishes")).filter((f) => f.endsWith(".json"));
const dishRows = dishFiles.flatMap((f) => JSON.parse(fs.readFileSync(path.join(root, "data/dishes", f), "utf8")) as { name_en: string; photo_query?: string }[]);
const list = { all: dishRows.map((d) => d.name_en) } as Record<string, string[]>;
const QUERY_FROM_JSON: Record<string, string> = Object.fromEntries(dishRows.filter((d) => d.photo_query).map((d) => [slugify(d.name_en), d.photo_query as string]));
const photosFile = path.join(root, "data/photos.json");
const photos = JSON.parse(fs.readFileSync(photosFile, "utf8")) as Record<string, { file: string; credit: string; license: string; source: string }>;
const overridesFile = path.join(root, "data/photo-queries.json");
const overrides: Record<string, string> = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, "utf8")) : {};
const UA = "Bsaha family meal app (contact: ali.elaraki@edueasy.group)";
const OK_LICENSES = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd|pdm)$/i;

type Hit = { url: string; credit: string; license: string; source: string };

function strip(html: string) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

async function commons(q: string): Promise<Hit | null> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "8",
    gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1000",
  }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  const pages = Object.values(j?.query?.pages ?? {}) as { title: string; imageinfo?: Array<Record<string, unknown>> }[];
  const key = q.split(" ")[0].toLowerCase();
  pages.sort((a, b) => Number(b.title.toLowerCase().includes(key)) - Number(a.title.toLowerCase().includes(key)));
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const meta = ii.extmetadata as Record<string, { value: string }> | undefined;
    const lic = meta?.LicenseShortName?.value ?? "";
    const w = Number(ii.width ?? 0), h = Number(ii.height ?? 0);
    if (!OK_LICENSES.test(lic) || w < 600 || h < 400 || w / h > 2.2 || h / w > 1.6) continue;
    if (/\.(svg|gif|tif|tiff)$/i.test(p.title)) continue;
    return {
      url: String(ii.thumburl ?? ii.url), credit: strip(meta?.Artist?.value ?? "Wikimedia Commons"),
      license: lic, source: String(ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`),
    };
  }
  return null;
}

async function openverse(q: string): Promise<Hit | null> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.search = new URLSearchParams({ q, license: "cc0,by,by-sa,pdm", page_size: "8", aspect_ratio: "wide,square" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  for (const it of j?.results ?? []) {
    if (Number(it.width ?? 0) < 600) continue;
    return { url: it.url, credit: it.creator || it.source || "Openverse", license: `CC ${String(it.license).toUpperCase()} ${it.license_version ?? ""}`.trim(), source: it.foreign_landing_url || it.url };
  }
  return null;
}

async function download(url: string, slug: string): Promise<string | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const tmp = path.join(root, "public/dishes", `${slug}.tmp`);
  const out = path.join(root, "public/dishes", `${slug}.jpg`);
  fs.writeFileSync(tmp, buf);
  try {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", "800", tmp, "--out", out], { stdio: "ignore" });
  } catch { fs.rmSync(tmp, { force: true }); return null; }
  fs.rmSync(tmp, { force: true });
  return `${slug}.jpg`;
}

async function run() {
  const names = Object.values(list).flat();
  let found = 0;
  const missing: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    if (photos[slug]) { found++; continue; }
    const q = overrides[slug] ?? QUERY_FROM_JSON[slug] ?? name.replace(/\(.*?\)/g, "").replace(/\b(with|and|no peppers|whole-wheat|homemade|light|fresh)\b/gi, " ").replace(/\s+/g, " ").trim();
    let hit = await commons(q).catch(() => null);
    if (!hit) hit = await openverse(q).catch(() => null);
    if (!hit) { missing.push(name); console.log("  none:", name); continue; }
    const file = await download(hit.url, slug);
    if (!file) { missing.push(name); console.log("  download failed:", name); continue; }
    photos[slug] = { file, credit: hit.credit.slice(0, 120), license: hit.license, source: hit.source };
    fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
    found++;
    console.log(`ok ${found}/${names.length}: ${name} · ${hit.license}`);
  }
  console.log(`\n${found} photos, ${missing.length} missing`);
  if (missing.length) fs.writeFileSync(path.join(root, "data/photos-missing.json"), JSON.stringify(missing, null, 2));
}
run().catch((e) => { console.error(e); process.exit(1); });
