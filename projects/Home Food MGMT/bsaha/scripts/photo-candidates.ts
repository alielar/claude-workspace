/** For each slug in data/photo-redo.json (slug -> [queries]), fetch up to 4 free-licence candidates and save thumbs to data/candidates/<slug>-<n>.jpg + candidates.json. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(__dirname, "..");
const redo = JSON.parse(fs.readFileSync(path.join(root, "data/photo-redo.json"), "utf8")) as Record<string, string[]>;
const outDir = path.join(root, "data/candidates");
fs.mkdirSync(outDir, { recursive: true });
const UA = "Bsaha family meal app (contact: ali.elaraki@edueasy.group)";
const OK = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd|pdm)$/i;
type Hit = { url: string; credit: string; license: string; source: string; title: string };
const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function commons(q: string): Promise<Hit[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "12", gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1000" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) return [];
  const j = await r.json(); const out: Hit[] = [];
  for (const p of Object.values(j?.query?.pages ?? {}) as { title: string; imageinfo?: Array<Record<string, unknown>> }[]) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const meta = ii.extmetadata as Record<string, { value: string }> | undefined; const lic = meta?.LicenseShortName?.value ?? "";
    const w = Number(ii.width ?? 0), h = Number(ii.height ?? 0);
    if (!OK.test(lic) || w < 600 || h < 400 || w / h > 2.2 || h / w > 1.6 || /\.(svg|gif|tif|tiff)$/i.test(p.title)) continue;
    out.push({ url: String(ii.thumburl ?? ii.url), credit: strip(meta?.Artist?.value ?? "Wikimedia Commons"), license: lic, source: String(ii.descriptionurl), title: p.title });
  }
  return out;
}
async function openverse(q: string): Promise<Hit[]> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.search = new URLSearchParams({ q, license: "cc0,by,by-sa,pdm", page_size: "12" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) return [];
  const j = await r.json();
  return (j?.results ?? []).filter((it: { width?: number }) => Number(it.width ?? 0) >= 600).map((it: Record<string, string>) => ({ url: it.url, credit: it.creator || it.source || "Openverse", license: `CC ${String(it.license).toUpperCase()} ${it.license_version ?? ""}`.trim(), source: it.foreign_landing_url || it.url, title: it.title ?? "" }));
}
async function thumb(url: string, file: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) return false;
  const tmp = file + ".tmp"; fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  try { execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "70", "--resampleWidth", "800", tmp, "--out", file], { stdio: "ignore" }); } catch { fs.rmSync(tmp, { force: true }); return false; }
  fs.rmSync(tmp, { force: true }); return true;
}
async function one(slug: string, queries: string[]): Promise<Hit[]> {
  const seen = new Set<string>(); const picks: Hit[] = [];
  for (const q of queries) {
    for (const h of [...(await commons(q).catch(() => [])), ...(await openverse(q).catch(() => []))]) {
      if (seen.has(h.url) || picks.length >= 4) continue; seen.add(h.url);
      if (await thumb(h.url, path.join(outDir, `${slug}-${picks.length}.jpg`)).catch(() => false)) picks.push(h);
    }
    if (picks.length >= 4) break;
  }
  return picks;
}

async function run() {
  const file = path.join(outDir, "candidates.json");
  const all: Record<string, Hit[]> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const todo = Object.entries(redo).filter(([slug]) => !all[slug]);
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4);
    const results = await Promise.all(batch.map(([slug, qs]) => one(slug, qs)));
    batch.forEach(([slug], k) => { all[slug] = results[k]; console.log(slug, results[k].length); });
    fs.writeFileSync(file, JSON.stringify(all, null, 1));
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
