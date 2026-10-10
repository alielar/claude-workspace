// Reads every Claude Code session on this Mac and acts on them, using Claude Code's own
// commands and files only:
//   claude agents --json --all     live list (Cursor panels, terminals, background sessions)
//   ~/.claude/sessions/<pid>.json  per-session record (where it runs, waiting reason, Remote Control id)
//   ~/.claude/projects/<cwd>/<sessionId>.jsonl   the conversation itself
// Background sessions get the full set (new, message, pause, resume, delete); Cursor and
// terminal sessions can be opened, followed from the phone through the Claude app, or closed.

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const CLAUDE = process.env.CLAUDE_BIN || join(HOME, '.nvm/versions/node/v24.14.0/bin/claude');
export const WORKSPACE = process.env.WORKSPACE || join(HOME, 'claude-workspace');
const RECORDS = join(HOME, '.claude/sessions');
const TRANSCRIPTS = join(HOME, '.claude/projects');
const OLD_AFTER_MS = 24 * 3600e3; // idle longer than this → "Older"

// stdin closed: `claude --bg` would otherwise wait on it.
const run = (file, args, { timeout = 60_000, cwd } = {}) => new Promise((ok, ko) => {
  const p = spawn(file, args, { cwd });
  let out = '', err = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
  p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
  p.on('error', (e) => { clearTimeout(timer); ko(e); });
  p.on('close', (code) => { clearTimeout(timer); code === 0 ? ok(out) : ko(new Error((err.trim() || out.trim() || `exit ${code}`).slice(0, 400))); });
});
const claude = (args, opts) => run(CLAUDE, args, opts);

// ── where things are ─────────────────────────────────────────────────────────
export function projectOf(cwd) {
  const rel = relative(join(WORKSPACE, 'projects'), cwd);
  if (!rel.startsWith('..') && rel) return rel.split('/')[0];
  if (cwd === WORKSPACE) return 'Workspace';
  return basename(cwd);
}
export function projects() {
  const dir = join(WORKSPACE, 'projects');
  const list = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, cwd: join(dir, d.name) }));
  return [...list, { name: 'Workspace', cwd: WORKSPACE }];
}
const whereOf = (kind, entrypoint) => {
  if (kind && kind !== 'interactive') return 'background';
  if (entrypoint === 'claude-vscode') return 'cursor';
  if (entrypoint === 'claude-desktop') return 'desktop';
  if (entrypoint === 'sdk-cli' || entrypoint === 'sdk-ts' || entrypoint === 'sdk-py') return 'script';
  return 'terminal';
};

function readRecords() {
  const byPid = new Map(), bySession = new Map();
  for (const f of readdirSync(RECORDS)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(join(RECORDS, f), 'utf8'));
      byPid.set(r.pid, r); if (r.sessionId) bySession.set(r.sessionId, r);
    } catch {}
  }
  return { byPid, bySession };
}

const slug = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');
function transcriptPath(cwd, sessionId) {
  const direct = join(TRANSCRIPTS, slug(cwd), `${sessionId}.jsonl`);
  if (existsSync(direct)) return direct;
  for (const d of readdirSync(TRANSCRIPTS)) { const p = join(TRANSCRIPTS, d, `${sessionId}.jsonl`); if (existsSync(p)) return p; }
  return null;
}

// Last `bytes` of a file as whole lines.
function tailLines(file, bytes) {
  const size = statSync(file).size, start = Math.max(0, size - bytes);
  const fd = openSync(file, 'r'); const buf = Buffer.alloc(size - start);
  try { readSync(fd, buf, 0, buf.length, start); } finally { closeSync(fd); }
  const lines = buf.toString('utf8').split('\n');
  if (start > 0) lines.shift();
  return lines.filter(Boolean);
}

// ── turning transcript lines into a readable conversation ────────────────────
const SKIP_USER = /^<(system-reminder|local-command|command-stdout|command-stderr|bash-|task-notification|user-prompt-submit-hook)/;
function userText(content) {
  const raw = typeof content === 'string' ? content : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const t = raw.trim();
  if (!t || SKIP_USER.test(t) || t.startsWith('[Request interrupted')) return null;
  const cmd = /<command-name>([^<]*)<\/command-name>/.exec(t);
  if (cmd) { const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t); return `${cmd[1]}${args && args[1].trim() ? ' ' + args[1].trim() : ''}`; }
  if (t.startsWith('<command-message>')) return null;
  return t.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '').replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '').trim() || null;
}
const fileName = (p) => (p ? basename(String(p)) : 'a file');
function toolLabel(b) {
  const i = b.input || {};
  switch (b.name) {
    case 'Bash': return { k: 'ran', v: i.description || 'a command' };
    case 'Edit': case 'Write': case 'NotebookEdit': return { k: 'edited', v: fileName(i.file_path || i.notebook_path) };
    case 'Read': return { k: 'read', v: fileName(i.file_path) };
    case 'Grep': case 'Glob': return { k: 'searched', v: i.pattern || '' };
    case 'WebFetch': case 'WebSearch': return { k: 'web', v: i.url || i.query || '' };
    case 'Agent': case 'Task': return { k: 'agent', v: i.description || 'a helper' };
    default: return { k: 'other', v: b.name.replace(/^mcp__[^_]+__/, '').replace(/^mcp__/, '') };
  }
}
// One line for a run of tool calls: "Ran 3 commands · Edited server.mjs, app.js · Read 2 files"
function summarizeTools(tools) {
  const g = {}; for (const t of tools) (g[t.k] ||= []).push(t.v);
  const n = (k, one, many) => g[k] ? (g[k].length === 1 ? one : many.replace('#', g[k].length)) : null;
  const uniq = (a) => [...new Set(a)];
  return [
    n('ran', 'Ran a command', 'Ran # commands'),
    g.edited && `Edited ${uniq(g.edited).slice(0, 3).join(', ')}${uniq(g.edited).length > 3 ? ` +${uniq(g.edited).length - 3}` : ''}`,
    n('read', 'Read a file', 'Read # files'),
    n('searched', 'Searched once', 'Searched # times'),
    n('web', 'Looked on the web', 'Looked on the web # times'),
    n('agent', `Started a helper agent`, 'Started # helper agents'),
    g.other && `Used ${uniq(g.other).slice(0, 3).join(', ')}`,
  ].filter(Boolean).join(' · ');
}

export function conversation(file, { bytes = 3e6, limit = 160 } = {}) {
  const items = []; let tools = [], toolDetail = [];
  const flush = () => { if (tools.length) items.push({ role: 'tools', text: summarizeTools(tools), detail: toolDetail.slice(-30) }); tools = []; toolDetail = []; };
  for (const line of tailLines(file, bytes)) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.isSidechain || d.isMeta) continue;
    if (d.type === 'user') {
      const t = userText(d.message?.content);
      if (t) { flush(); items.push({ role: 'user', text: t, at: d.timestamp }); }
    } else if (d.type === 'assistant') {
      for (const b of d.message?.content || []) {
        if (b.type === 'text' && b.text.trim()) { flush(); items.push({ role: 'claude', text: b.text.trim(), at: d.timestamp }); }
        else if (b.type === 'tool_use') { const l = toolLabel(b); tools.push(l); toolDetail.push(`${b.name}: ${String(l.v).slice(0, 120)}`); }
      }
    }
  }
  flush();
  return items.slice(-limit);
}

// Title, last prompt, last answer and last activity, from the end of the transcript (cached by size+mtime).
const summaryCache = new Map();
function summary(file) {
  if (!file) return {};
  const st = statSync(file), key = `${st.size}:${st.mtimeMs}`;
  const hit = summaryCache.get(file); if (hit && hit.key === key) return hit.value;
  let title = null, aiTitle = null, lastPrompt = null, lastText = null, lastAt = null, lastRole = null, turnStart = null, bridge = null;
  for (const line of tailLines(file, 400e3)) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'custom-title' && d.customTitle) title = d.customTitle;
    else if (d.type === 'ai-title' && d.aiTitle) aiTitle = d.aiTitle;
    else if (d.type === 'bridge-session' && d.bridgeSessionId) bridge = d.bridgeSessionId;
    else if (d.isSidechain || d.isMeta) continue;
    else if (d.type === 'user') { const t = userText(d.message?.content); if (t) { lastPrompt = t; lastAt = d.timestamp; lastRole = 'user'; turnStart = d.timestamp; } }
    else if (d.type === 'assistant') {
      const t = (d.message?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (t) lastText = t;
      lastAt = d.timestamp; lastRole = 'claude';
    }
  }
  const value = { title: title || aiTitle, lastPrompt, lastText, lastAt, lastRole, turnStart, bridge };
  summaryCache.set(file, { key, value });
  return value;
}

// ── the list ─────────────────────────────────────────────────────────────────
// hub: the live-session module (live.mjs), so sessions the hub holds are marked and their state comes from it.
export async function list({ seen = {}, hub = null } = {}) {
  let procs = [];
  try { procs = JSON.parse(await claude(['agents', '--json', '--all'], { timeout: 15_000 })); } catch (e) { console.error('claude agents:', e.message); }
  const { byPid, bySession } = readRecords();
  const now = Date.now();
  const rows = new Map(); // sessionId → row (a live process wins over a stopped background record)
  const add = (a, rec) => {
    const isHub = !!hub?.isHub(a.sessionId);
    const where = isHub ? 'hub' : whereOf(a.kind, rec.entrypoint);
    const file = transcriptPath(a.cwd, a.sessionId);
    const s = summary(file);
    const l = isHub ? hub.live(a.sessionId) : null;
    const alive = isHub ? !!l : a.status !== undefined; // a stopped background session has no status
    const raw = a.status || null;
    const lastAt = Math.max(s.lastAt ? Date.parse(s.lastAt) : 0, l?.lastAt || 0) || rec.statusUpdatedAt || a.startedAt;
    let phase;
    if (l && l.asks.size) phase = 'needs';
    else if (l && (l.status === 'working' || l.status === 'starting')) phase = 'working';
    else if (!l && raw === 'waiting') phase = 'needs';
    else if (!l && raw === 'busy' && !isHub) phase = 'working';
    else if (!alive) phase = 'paused';
    else if (s.lastRole === 'claude' && lastAt > (seen[a.sessionId] || 0) && now - lastAt < OLD_AFTER_MS) phase = 'done';
    else if (now - lastAt > OLD_AFTER_MS) phase = 'old';
    else phase = 'idle';
    if (isHub && !l && phase === 'paused' && now - lastAt > OLD_AFTER_MS) phase = 'old';
    const bridge = rec.bridgeSessionId || s.bridge || null;
    const prev = rows.get(a.sessionId);
    if (prev && prev.alive && !alive) return;
    rows.set(a.sessionId, {
      id: a.sessionId, short: a.id || rec.jobId || null, pid: isHub ? null : a.pid, where, cwd: a.cwd, project: projectOf(a.cwd), alive,
      name: rec.nameSource === 'user' ? (rec.name || a.name) : (s.title || a.name || rec.name || 'New session'),
      phase, waitingFor: (l && l.asks.size ? [...l.asks.values()][0].title : null) || (rec.waitingFor ? `Waiting: ${rec.waitingFor}` : null), state: a.state || null,
      startedAt: a.startedAt, lastAt, turnStart: l?.turnStart || (s.turnStart ? Date.parse(s.turnStart) : null),
      lastPrompt: s.lastPrompt ? s.lastPrompt.slice(0, 300) : null, lastText: s.lastText ? s.lastText.slice(0, 400) : null,
      remote: bridge ? `https://claude.ai/code/${bridge.replace(/^cse_/, 'session_')}` : null,
      error: l?.error || null,
    });
  };
  for (const a of procs) add(a, byPid.get(a.pid) || bySession.get(a.sessionId) || {});
  // Hub sessions: the ones running (their process may not be listed yet) and the asleep ones.
  if (hub) for (const k of hub.remembered()) {
    if (rows.get(k.id)?.alive) continue;
    if (!transcriptPath(k.cwd, k.id) && !hub.live(k.id)) continue;
    add({ sessionId: k.id, cwd: k.cwd, startedAt: k.at }, {});
  }
  return [...rows.values()];
}

export function transcriptFor(session) { return transcriptPath(session.cwd, session.id); }

// ── actions ──────────────────────────────────────────────────────────────────
export const pause = (s) => claude(['stop', s.short]);
export const resume = (s) => claude(['--bg', '--resume', s.id], { cwd: s.cwd });
export const remove = (s) => claude(['rm', s.short]);

// Close a Cursor/terminal session: its process ends, the conversation stays on disk (/resume finds it).
export async function close(session) {
  if (session.where === 'background') return claude(['rm', session.short]);
  const cmd = (await run('/bin/ps', ['-o', 'command=', '-p', String(session.pid)]).catch(() => '')).trim();
  if (!/claude/i.test(cmd)) throw new Error('That session has already ended');
  process.kill(session.pid, 'SIGTERM');
}

// On the Mac: bring the session up in Cursor (its project window first, then the Claude panel).
export async function openInCursor(session) {
  await run('/usr/bin/open', ['-a', 'Cursor', session.cwd]);
  await new Promise((r) => setTimeout(r, 1200));
  await run('/usr/bin/open', [`cursor://anthropic.claude-code/open?session=${encodeURIComponent(session.id)}`]);
}
export async function newInCursor({ cwd, prompt }) {
  await run('/usr/bin/open', ['-a', 'Cursor', cwd]);
  await new Promise((r) => setTimeout(r, 1500));
  await run('/usr/bin/open', [`cursor://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`]);
}
// On the Mac: a Terminal window attached to a background session.
export async function openInTerminal(session) {
  const cmd = `cd ${JSON.stringify(session.cwd)} && ${JSON.stringify(CLAUDE)} attach ${session.short}`;
  await run('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, '-e', 'tell application "Terminal" to activate']);
}
