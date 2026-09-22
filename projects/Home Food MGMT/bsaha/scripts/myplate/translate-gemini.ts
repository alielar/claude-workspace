/**
 * Free translation pass with Google Gemini (free tier). Turns data/myplate/raw.json (parsed USDA
 * recipes, English, US units) into the trilingual, metric, halal records Bsaha needs. One JSON file
 * per recipe lands in data/myplate/translated/, so the run can stop and resume; five recipes share
 * one request to stay inside the free daily quota.
 *
 * Run: npx tsx --env-file=.env.local scripts/myplate/translate-gemini.ts [batchSize] [concurrency]
 * Needs GEMINI_API_KEY. GEMINI_MODEL overrides the model (default gemini-2.5-flash).
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY missing in .env.local"); process.exit(1); }
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BATCH = Number(process.argv[2] || 6);
const CONCURRENCY = Number(process.argv[3] || 2);
const root = path.resolve(__dirname, "../..");
const RAW = JSON.parse(fs.readFileSync(path.join(root, "data/myplate/raw.json"), "utf8")) as Raw[];
const OUT_DIR = path.join(root, "data/myplate/translated");
fs.mkdirSync(OUT_DIR, { recursive: true });

type Raw = {
  slug: string; name: string; description: string; yield: string; prep_time: string; cook_time: string; serving_size: string;
  ingredients: { text: string; note: string }[]; directions: string[]; directions_extra: string; notes: string;
  nutrition: Record<string, number>;
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
  slug: string; name_en: string; name_fr: string; name_ar: string; name_latin: string; desc_en: string; desc_fr: string;
  servings: number; prep_min: number; cook_min: number;
  ingredients: { en: string; fr: string; ar: string; qty: number; unit: string; group: string }[];
  recipe_ar: { steps: string[]; tips: string[] }; recipe_fr: { steps: string[]; tips: string[] };
  tags: string[]; categories: string[];
};

const recipeSchema = {
  type: "OBJECT",
  properties: {
    slug: { type: "STRING" },
    name_en: { type: "STRING" }, name_fr: { type: "STRING" }, name_ar: { type: "STRING" }, name_latin: { type: "STRING" },
    desc_en: { type: "STRING" }, desc_fr: { type: "STRING" },
    servings: { type: "INTEGER" }, prep_min: { type: "INTEGER" }, cook_min: { type: "INTEGER" },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          en: { type: "STRING" }, fr: { type: "STRING" }, ar: { type: "STRING" },
          qty: { type: "NUMBER" }, unit: { type: "STRING", enum: ["g", "ml", "piece", "bunch", "tbsp", "tsp", "pinch"] },
          group: { type: "STRING", enum: ["fresh", "dry"] },
        },
        required: ["en", "fr", "ar", "qty", "unit", "group"],
      },
    },
    recipe_ar: { type: "OBJECT", properties: { steps: { type: "ARRAY", items: { type: "STRING" } }, tips: { type: "ARRAY", items: { type: "STRING" } } }, required: ["steps", "tips"] },
    recipe_fr: { type: "OBJECT", properties: { steps: { type: "ARRAY", items: { type: "STRING" } }, tips: { type: "ARRAY", items: { type: "STRING" } } }, required: ["steps", "tips"] },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    categories: { type: "ARRAY", items: { type: "STRING", enum: ["main", "side", "salad", "soup", "sandwich", "appetizer", "sauce", "dessert", "breakfast", "bread", "snack", "beverage"] } },
  },
  required: ["slug", "name_en", "name_fr", "name_ar", "name_latin", "desc_en", "desc_fr", "servings", "prep_min", "cook_min", "ingredients", "recipe_ar", "recipe_fr", "tags", "categories"],
};

const UNITS = new Set(["g", "ml", "piece", "bunch", "tbsp", "tsp", "pinch"]);
const ARABIC = /[؀-ۿ]/;
function valid(o: Out): boolean {
  return Boolean(o && o.name_en && o.name_fr && o.name_ar && ARABIC.test(o.name_ar) && o.name_latin
    && Array.isArray(o.ingredients) && o.ingredients.length > 0
    && o.ingredients.every((i) => i.en && i.fr && i.ar && ARABIC.test(i.ar) && typeof i.qty === "number" && i.qty > 0 && UNITS.has(i.unit) && (i.group === "fresh" || i.group === "dry"))
    && o.recipe_ar?.steps?.length > 0 && o.recipe_ar.steps.every((s) => ARABIC.test(s))
    && o.recipe_fr?.steps?.length > 0 && Array.isArray(o.categories) && o.categories.length > 0);
}

let calls = 0, tokensIn = 0, tokensOut = 0;

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 60000,
      responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: recipeSchema },
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    calls++;
    if (res.status === 429 || res.status >= 500) {
      const wait = res.status === 429 ? 65_000 : 15_000 * (attempt + 1);
      console.warn(`  ${res.status}, waiting ${Math.round(wait / 1000)} s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const json = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    tokensIn += json.usageMetadata?.promptTokenCount ?? 0; tokensOut += json.usageMetadata?.candidatesTokenCount ?? 0;
    const c = json.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (c?.finishReason === "MAX_TOKENS") throw new Error("max_tokens");
    if (!text) throw new Error(`empty reply (${c?.finishReason ?? "no candidate"})`);
    return text;
  }
  throw new Error("gave up after retries");
}

async function translateBatch(batch: Raw[]): Promise<void> {
  const prompt = `${batch.length} recipe${batch.length > 1 ? "s" : ""} follow. Return a JSON array of ${batch.length} objects, in this order, each with its slug.\n\n${batch.map(describe).join("\n\n")}`;
  const text = await callGemini(prompt);
  const arr = JSON.parse(text) as Out[];
  if (!Array.isArray(arr)) throw new Error("not an array");
  const bySlug = new Map(arr.map((o) => [o.slug, o]));
  for (const r of batch) {
    const o = bySlug.get(r.slug) ?? arr[batch.indexOf(r)];
    if (!o || !valid(o)) { console.warn(`  invalid: ${r.slug}`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${r.slug}.json`), JSON.stringify({ ...o, slug: r.slug }, null, 1));
  }
}

async function run() {
  const todo = RAW.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.slug}.json`)) && r.ingredients.length && r.directions.length);
  console.log(`${RAW.length} recipes, ${todo.length} to do, model ${MODEL}, ${BATCH} per request, ${CONCURRENCY} at a time`);
  const batches: Raw[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0;
  const worker = async () => {
    for (;;) {
      const b = batches.shift();
      if (!b) return;
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try { await translateBatch(b); ok = true; }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "max_tokens" && b.length > 1) {
            batches.push(b.slice(0, Math.ceil(b.length / 2)), b.slice(Math.ceil(b.length / 2))); ok = true;
          } else {
            console.warn(`  retry ${attempt + 1} for ${b.map((r) => r.slug).join(", ")}: ${msg.slice(0, 200)}`);
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      }
      done += b.length;
      if (done % 25 < BATCH) {
        const have = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length;
        console.log(`${done}/${todo.length} sent · ${have} files · ${calls} calls · tokens in ${tokensIn} out ${tokensOut}`);
      }
      // free tier: stay well under the per-minute request limit
      await new Promise((r) => setTimeout(r, 4000));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const have = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length;
  console.log(`done. translated files: ${have}/${RAW.length}; ${calls} calls; tokens in ${tokensIn} out ${tokensOut}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
