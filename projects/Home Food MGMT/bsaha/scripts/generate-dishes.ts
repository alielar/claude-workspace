/**
 * Optional helper: fills data/dishes/<meal>.json from data/dish-list.json using Claude.
 * The launch library was written by hand with the same rules (see data/RULES.md). Use this for
 * regenerating a meal or extending the list. Needs ANTHROPIC_API_KEY in .env.local.
 * Run: npx tsx --env-file=.env.local scripts/generate-dishes.ts
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.DISH_MODEL || "claude-sonnet-5";
const client = new Anthropic();
const root = path.resolve(__dirname, "..");
const list = JSON.parse(fs.readFileSync(path.join(root, "data/dish-list.json"), "utf8")) as Record<string, string[]>;
const SYSTEM = fs.readFileSync(path.join(root, "data/RULES.md"), "utf8");

type Out = Record<string, unknown> & { name_en: string };

async function generate(meal: string, names: string[]): Promise<Out[]> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 20000,
    system: SYSTEM + "\n\nReturn ONLY a JSON array, no prose, no code fences.",
    messages: [{ role: "user", content: `Meal type: ${meal}. Keep name_en exactly as given.\n\nDishes:\n${names.map((n) => "- " + n).join("\n")}` }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
}

async function run() {
  for (const meal of Object.keys(list)) {
    const file = path.join(root, `data/dishes/${meal}.json`);
    const have: Out[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    const done = new Set(have.map((d) => d.name_en));
    const todo = list[meal].filter((n) => !done.has(n));
    for (let i = 0; i < todo.length; i += 5) {
      const out = await generate(meal, todo.slice(i, i + 5));
      for (const d of out) if (!done.has(d.name_en)) { have.push(d); done.add(d.name_en); }
      fs.writeFileSync(file, JSON.stringify(have, null, 2));
      console.log(`${meal}: ${have.length}/${list[meal].length}`);
    }
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
