/**
 * Turns data/myplate/raw.json (parsed USDA recipes, English, US units) into the trilingual, metric,
 * halal dish records Bsaha needs. One JSON file per recipe lands in data/myplate/translated/, so the
 * run can stop and resume. Several recipes go into each request to keep the cost down.
 *
 * Run: npx tsx --env-file=.env.local scripts/myplate/translate.ts [batchSize] [concurrency]
 * Paid fallback to translate-gemini.ts. Needs ANTHROPIC_API_KEY. DISH_MODEL overrides the model (default claude-opus-5).
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.DISH_MODEL || "claude-opus-5";
const BATCH = Number(process.argv[2] || 4);
const CONCURRENCY = Number(process.argv[3] || 4);
const root = path.resolve(__dirname, "../..");
const RAW = JSON.parse(fs.readFileSync(path.join(root, "data/myplate/raw.json"), "utf8")) as Raw[];
const OUT_DIR = path.join(root, "data/myplate/translated");
fs.mkdirSync(OUT_DIR, { recursive: true });
const client = new Anthropic();

type Raw = {
  slug: string; name: string; description: string; yield: string; prep_time: string; cook_time: string; serving_size: string;
  ingredients: { text: string; note: string }[]; directions: string[]; directions_extra: string; notes: string;
  nutrition: Record<string, number>; food_groups: { group: string; amount: string }[];
};

const SYSTEM = fs.readFileSync(path.join(__dirname, "translate-prompt.md"), "utf8");

function describe(r: Raw): string {
  const ing = r.ingredients.map((i) => `- ${i.text}${i.note ? ` ${i.note}` : ""}`).join("\n");
  const dir = r.directions.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const extra = [r.directions_extra, r.notes].filter(Boolean).join("\n");
  const n = r.nutrition;
  return `### ${r.slug}
Name: ${r.name}
Description: ${r.description}
Yield: ${r.yield}${r.serving_size ? ` (serving size ${r.serving_size})` : ""}
Prep time: ${r.prep_time || "not given"}. Cook time: ${r.cook_time || "not given"}.
Per serving: ${n.calories ?? "?"} kcal, ${n.protein_g ?? "?"} g protein, ${n.carbs_g ?? "?"} g carbs, ${n.fat_g ?? "?"} g fat.
Ingredients:
${ing}
Directions:
${dir}${extra ? `\nNotes:\n${extra}` : ""}`;
}

type Out = {
  name_en: string; name_fr: string; name_ar: string; name_latin: string; desc_en: string; desc_fr: string;
  servings: number; prep_min: number; cook_min: number;
  ingredients: { en: string; fr: string; ar: string; qty: number; unit: string; group: string }[];
  recipe_ar: { steps: string[]; tips: string[] }; recipe_fr: { steps: string[]; tips: string[] };
  tags: string[]; categories: string[];
};

function extractArray(text: string): unknown[] {
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a < 0 || b < a) throw new Error("no JSON array in reply");
  return JSON.parse(text.slice(a, b + 1)) as unknown[];
}

const UNITS = new Set(["g", "ml", "piece", "bunch", "tbsp", "tsp", "pinch"]);
function valid(o: Out): boolean {
  return Boolean(o && o.name_en && o.name_fr && o.name_ar && o.name_latin && Array.isArray(o.ingredients) && o.ingredients.length > 0
    && o.ingredients.every((i) => i.en && i.fr && i.ar && typeof i.qty === "number" && UNITS.has(i.unit) && (i.group === "fresh" || i.group === "dry"))
    && o.recipe_ar?.steps?.length > 0 && o.recipe_fr?.steps?.length > 0 && Array.isArray(o.categories) && o.categories.length > 0);
}

let spent = { in: 0, out: 0, cacheRead: 0 };

async function translateBatch(batch: Raw[]): Promise<void> {
  const prompt = `${batch.length} recipe${batch.length > 1 ? "s" : ""} follow. Return a JSON array of ${batch.length} objects.\n\n${batch.map(describe).join("\n\n")}`;
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  spent.in += msg.usage.input_tokens; spent.out += msg.usage.output_tokens; spent.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  if (msg.stop_reason === "max_tokens") throw new Error("max_tokens");
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const arr = extractArray(text) as Out[];
  if (arr.length !== batch.length) throw new Error(`got ${arr.length} objects for ${batch.length} recipes`);
  batch.forEach((r, i) => {
    const o = arr[i];
    if (!valid(o)) { console.warn(`  invalid: ${r.slug}`); return; }
    fs.writeFileSync(path.join(OUT_DIR, `${r.slug}.json`), JSON.stringify({ slug: r.slug, ...o }, null, 1));
  });
}

async function run() {
  const todo = RAW.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.slug}.json`)) && r.ingredients.length && r.directions.length);
  console.log(`${RAW.length} recipes, ${todo.length} to do, model ${MODEL}, ${BATCH} per request, ${CONCURRENCY} at a time`);
  const batches: Raw[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0, failed = 0;
  const worker = async () => {
    for (;;) {
      const b = batches.shift();
      if (!b) return;
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try { await translateBatch(b); ok = true; }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500)) {
            await new Promise((r) => setTimeout(r, 20000 * (attempt + 1)));
          } else if (msg === "max_tokens" && b.length > 1) {
            // too long for one reply: split and requeue
            batches.push(b.slice(0, Math.ceil(b.length / 2)), b.slice(Math.ceil(b.length / 2))); ok = true;
          } else {
            console.warn(`  retry ${attempt + 1} for ${b.map((r) => r.slug).join(", ")}: ${msg}`);
          }
        }
      }
      if (!ok) failed += b.length;
      done += b.length;
      if (done % 20 < BATCH) console.log(`${done}/${todo.length} · tokens in ${spent.in} (cached ${spent.cacheRead}) out ${spent.out}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const have = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length;
  console.log(`done. translated files: ${have}/${RAW.length}, failed this run: ${failed}`);
  console.log(`tokens: in ${spent.in} (cache read ${spent.cacheRead}), out ${spent.out}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
