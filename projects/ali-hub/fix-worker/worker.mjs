#!/usr/bin/env node
/**
 * Fix chat worker · runs on Ali's Mac under launchd (com.ali.ali-hub-fix-worker, KeepAlive).
 *
 * Every 30 s: ask the app for queued fix requests (GET /api/fix?queued=1 with the app key,
 * which also stamps the "Mac listening" heartbeat). When there are some, take ALL of them as
 * one batch, mark them "building", save the screenshots to disk, and run Claude Code headless
 * in projects/ali-hub with the requests as the prompt. Claude implements, type-checks,
 * commits, pushes, deploys, and writes fix-worker/tmp/batch-<id>/result.json. The worker
 * posts each result back (PATCH /api/fix) · the API sends Ali a push.
 *
 * Why a batch and not one run per message: two Claude runs in the same working tree at the
 * same time would fight over git; and three messages sent in a minute usually describe one
 * change. Picking up everything queued at once is near-instant when the queue is short and
 * still one deploy when it is not. One batch at a time, always.
 *
 * Env (fix-worker/.env, git-ignored): APP_KEY (required), FIX_BASE_URL (default the live app),
 * CLAUDE_BIN, FIX_MAX_MINUTES (default 50), FIX_MODEL (optional · default = Claude Code's default).
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");                  // projects/ali-hub
const workspace = path.resolve(project, "../..");          // claude-workspace (Vercel is linked here)
const NODE_BIN = "/Users/alielaraki/.nvm/versions/node/v24.14.0/bin";

// ── env · fix-worker/.env is written by the one-line command from Settings → Fix chat ("Connect the Mac").
// Missing key → the job waits and re-reads the file every minute instead of dying (launchd would only restart it).
const ENV_FILE = path.join(here, ".env");
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
loadEnv();
const KEY = () => process.env.APP_KEY;
const BASE = (process.env.FIX_BASE_URL || "https://ali-hub.vercel.app").replace(/\/$/, "");
const CLAUDE = process.env.CLAUDE_BIN || path.join(NODE_BIN, "claude");
const MAX_MIN = Number(process.env.FIX_MAX_MINUTES || 50);
const POLL_MS = 30_000;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { "x-app-key": KEY(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const when = (ms) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(new Date(ms));

function buildPrompt(requests, imagesById, resultPath) {
  const blocks = requests.map((r) => {
    const imgs = imagesById.get(r.id) ?? [];
    return `### Request ${r.id} · sent ${when(r.createdAt)}\n${r.text || "(no text · see the screenshots)"}${imgs.length ? `\nScreenshots (open them with the Read tool): ${imgs.join(", ")}` : ""}`;
  }).join("\n\n");
  return `You are shipping fixes for A L I, the app in this repository (projects/ali-hub). Ali sent them from the Fix chat inside the app, in his own words, sometimes with screenshots. Nobody is watching and nobody can answer a question: decide, build, verify, ship, report.

REQUESTS IN THIS BATCH (oldest first)

${blocks}

RULES
- CLAUDE.md (the workspace one and the project one) applies in full, hard limits included. Read the project CLAUDE.md before touching code.
- Work through the requests in order. Related requests may share one change.
- After each request: \`npx tsc --noEmit -p .\` must pass. Commit the change with a plain-language message.
- When every request is done: \`git push origin main\`, then deploy with \`cd ${workspace} && npx vercel --prod --yes\`, then confirm \`curl -s -o /dev/null -w '%{http_code}' https://ali-hub.vercel.app/login\` prints 200.
- A request that is unclear, that needs a price, a rule or a date only Ali knows, or that would break a hard limit: do not guess. Mark it "failed" and make the reply the one question Ali must answer (he reads replies in the chat and will send a new message).
- The app already does what is asked → "skipped" with a one-line reply saying where it is.
- Do not edit fix-worker/ (the program that runs you) unless a request is explicitly about it. Never touch the other projects in the workspace.
- Plain language in replies: Ali is a product person, not an engineer. Say what he will see and where, not how it is built.

REPORT · mandatory last step
Write ${resultPath} as JSON, one entry per request, exactly this shape:
[{"id": ${requests[0].id}, "status": "shipped" | "failed" | "skipped", "reply": "one or two short sentences for Ali", "commit": "short sha or null"}]
If the push or the deploy failed, every shipped entry becomes "failed" and its reply says what failed, in one line.`;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? project, encoding: "utf8", env: { ...process.env, PATH: `${NODE_BIN}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin`, HOME: process.env.HOME || "/Users/alielaraki" } });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

async function runClaude(prompt, logPath) {
  const args = ["-p", prompt, "--dangerously-skip-permissions", "--setting-sources", "user,project,local", "--max-turns", "300", "--output-format", "text"];
  if (process.env.FIX_MODEL) args.push("--model", process.env.FIX_MODEL);
  const out = fs.openSync(logPath, "a");
  const child = spawn(CLAUDE, args, {
    cwd: project, stdio: ["ignore", out, out],
    env: { ...process.env, PATH: `${NODE_BIN}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin`, HOME: process.env.HOME || "/Users/alielaraki" },
  });
  const timer = setTimeout(() => { log("time is up · stopping claude"); child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 15_000); }, MAX_MIN * 60_000);
  const code = await new Promise((resolve) => child.on("close", resolve));
  clearTimeout(timer); fs.closeSync(out);
  return code;
}

async function cycle() {
  const { requests } = await api("GET", `/api/fix?queued=1&note=${encodeURIComponent(`worker ${process.pid}`)}`);
  if (!requests?.length) return;
  const batchId = Date.now().toString(36);
  const dir = path.join(here, "tmp", `batch-${batchId}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(here, "logs"), { recursive: true });
  const logPath = path.join(here, "logs", `batch-${batchId}.log`);
  log(`batch ${batchId} · ${requests.length} request(s): ${requests.map((r) => r.id).join(", ")}`);

  const imagesById = new Map();
  for (const r of requests) {
    await api("PATCH", "/api/fix", { id: r.id, status: "building", batchId });
    const paths = [];
    (r.images ?? []).forEach((dataUrl, i) => {
      const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!m) return;
      const file = path.join(dir, `req-${r.id}-${i + 1}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
      fs.writeFileSync(file, Buffer.from(m[2], "base64"));
      paths.push(file);
    });
    imagesById.set(r.id, paths);
  }

  // Fresh tree first · the nightly auto-save and the laptop both push to main.
  const pull = run("git", ["pull", "--rebase", "--autostash", "origin", "main"]);
  fs.appendFileSync(logPath, `=== ${new Date().toISOString()} git pull → ${pull.code}\n${pull.out}\n`);

  const resultPath = path.join(dir, "result.json");
  const prompt = buildPrompt(requests, imagesById, resultPath);
  fs.writeFileSync(path.join(dir, "prompt.md"), prompt);
  fs.appendFileSync(logPath, `=== ${new Date().toISOString()} claude start\n`);
  const code = await runClaude(prompt, logPath);
  fs.appendFileSync(logPath, `\n=== ${new Date().toISOString()} claude end · exit ${code}\n`);

  let results = [];
  try { results = JSON.parse(fs.readFileSync(resultPath, "utf8")); } catch { results = []; }
  const byId = new Map((Array.isArray(results) ? results : []).map((x) => [Number(x.id), x]));
  for (const r of requests) {
    const x = byId.get(r.id);
    const status = x && ["shipped", "failed", "skipped"].includes(x.status) ? x.status : "failed";
    const reply = x?.reply ? String(x.reply).slice(0, 2000)
      : `The build ended without a report (exit ${code}). The log is on the Mac: fix-worker/logs/batch-${batchId}.log`;
    const commitSha = x?.commit ? String(x.commit).slice(0, 40) : null;
    try { await api("PATCH", "/api/fix", { id: r.id, status, reply, commitSha, batchId }); }
    catch (e) { log(`report for ${r.id} failed: ${e.message}`); }
    log(`request ${r.id} → ${status}`);
  }
}

log(`fix worker up · ${BASE} · claude at ${CLAUDE}`);
let saidNoKey = false;
for (;;) {
  if (!KEY()) {
    loadEnv();
    if (!KEY()) { if (!saidNoKey) { log("no APP_KEY yet · waiting for fix-worker/.env (Settings → Fix chat → Connect the Mac)"); saidNoKey = true; } await sleep(60_000); continue; }
    log("APP_KEY found · connecting"); saidNoKey = false;
  }
  try { await cycle(); } catch (e) { log(`cycle error: ${e.message}`); }
  await sleep(POLL_MS);
}
