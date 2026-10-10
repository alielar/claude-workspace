// Live sessions held by the hub itself, the way Cursor's Claude panel holds its own: one Claude
// Code process per conversation, driven through Anthropic's Agent SDK (the toolkit the Cursor
// extension is built on), with Ali's own `claude` program and login, so it is billed like Cursor.
// The page chats with it, sees Claude's answer as it is written, and answers its approvals and
// questions. A session the hub took over from Cursor keeps its conversation (same session id).
//
// data/live.json remembers every hub session (id, folder, model) so a session whose process was
// let go (hub restart, Pause) is still listed and wakes up with the next message.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE = process.env.CLAUDE_BIN || join(homedir(), '.nvm/versions/node/v24.14.0/bin/claude');
const FILE = 'data/live.json';
const MODELS = { sonnet: 'sonnet', haiku: 'haiku', opus: 'opus' };

const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } };
let known = load();                      // [{ id, cwd, model, at }]
const saveKnown = () => writeFileSync(FILE, JSON.stringify(known, null, 1));
export const remembered = () => known;
export const isHub = (id) => known.some((k) => k.id === id);
export function forget(id) { known = known.filter((k) => k.id !== id); saveKnown(); }
function remember(id, cwd, model) {
  known = [...known.filter((k) => k.id !== id), { id, cwd, model: model || null, at: Date.now() }]; saveKnown();
}

const running = new Map();               // id → Live
export const live = (id) => running.get(id) || null;
export const allLive = () => [...running.values()];
let onEvent = () => {};
export function onLiveEvent(fn) { onEvent = fn; }

// Claude's own words for an approval, when the SDK does not hand us a sentence.
function askTitle(tool, input) {
  if (tool === 'Bash') return `Run: ${input.description || String(input.command || '').slice(0, 140)}`;
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return `Edit ${String(input.file_path || input.notebook_path || '').split('/').pop()}`;
  if (tool === 'WebFetch') return `Open ${input.url}`;
  if (tool === 'WebSearch') return `Search the web: ${input.query}`;
  return `Use ${tool.replace(/^mcp__/, '').replace(/__/g, ' · ')}`;
}

class Live {
  constructor({ cwd, resume = null, model = null }) {
    this.cwd = cwd; this.id = resume; this.model = model;
    this.status = 'starting'; this.partial = ''; this.asks = new Map(); this.error = null;
    this.turnStart = null; this.lastAt = Date.now(); this.closed = false; this.inbox = [];
    this.abort = new AbortController();
    this.ready = new Promise((ok, ko) => { this._ok = ok; this._ko = ko; });
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; // the subscription, like Cursor
    this.q = query({
      prompt: this.input(),
      options: {
        cwd, resume: resume || undefined, model: MODELS[model] || undefined,
        pathToClaudeCodeExecutable: CLAUDE, settingSources: ['user', 'project', 'local'],
        includePartialMessages: true, abortController: this.abort, env,
        canUseTool: (tool, input, opts) => this.ask(tool, input, opts),
      },
    });
    this.pump();
  }

  async *input() {
    while (!this.closed) {
      if (this.inbox.length) { yield this.inbox.shift(); continue; }
      await new Promise((r) => { this.wake = r; });
    }
  }

  send(text) {
    this.inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    if (this.status !== 'working') this.turnStart = Date.now();
    this.status = 'working'; this.error = null; this.lastAt = Date.now();
    this.wake?.(); onEvent(this, 'working');
  }

  async pump() {
    try {
      for await (const m of this.q) {
        this.lastAt = Date.now();
        if (m.type === 'system' && m.subtype === 'init') {
          this.id = m.session_id; this.model = this.model || null; this.permissionMode = m.permissionMode;
          running.set(this.id, this); remember(this.id, this.cwd, this.model); this._ok(this);
          if (this.status === 'starting') this.status = 'idle';
        } else if (m.type === 'stream_event') {
          const e = m.event;
          if (e.type === 'message_start') this.partial = '';
          else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') this.partial += e.delta.text;
          this.status = 'working';
        } else if (m.type === 'assistant') {
          this.partial = ''; this.status = 'working';
        } else if (m.type === 'result') {
          this.partial = ''; this.status = 'idle'; this.lastResult = { at: Date.now(), turnStart: this.turnStart };
          if (m.subtype !== 'success' || m.is_error) this.error = (m.errors || []).join(' ') || m.result || 'Claude stopped with an error';
          onEvent(this, 'done');
        }
      }
    } catch (e) {
      if (!this.closed) { this.error = e.message; console.error(`live ${this.id || 'new'}:`, e.message); }
      this._ko(e);
    } finally {
      this.status = 'ended'; this.closed = true;
      for (const a of this.asks.values()) a.resolve({ behavior: 'deny', message: 'Session closed' });
      this.asks.clear();
      if (this.id && running.get(this.id) === this) running.delete(this.id);
      onEvent(this, 'ended');
    }
  }

  // An approval, a question (AskUserQuestion) or a plan (ExitPlanMode): parked until Ali answers on the page.
  ask(tool, input, opts) {
    const kind = tool === 'AskUserQuestion' ? 'question' : tool === 'ExitPlanMode' ? 'plan' : 'permission';
    return new Promise((resolve) => {
      const id = opts.toolUseID || Math.random().toString(36).slice(2);
      const a = {
        id, kind, tool, input, resolve, at: Date.now(),
        title: kind === 'question' ? (input.questions?.[0]?.question || 'Claude has a question') : kind === 'plan' ? 'Plan ready for your review' : (opts.title || askTitle(tool, input)), detail: opts.description || opts.decisionReason || null,
        command: tool === 'Bash' ? String(input.command || '') : null,
        canAlways: !!(opts.suggestions && opts.suggestions.length) && !opts.suppressAlwaysAllowRule, suggestions: opts.suggestions,
      };
      this.asks.set(id, a); onEvent(this, 'ask');
      opts.signal?.addEventListener('abort', () => { if (this.asks.delete(id)) onEvent(this, 'ask-gone'); });
    });
  }

  answer(id, ans) {
    const a = this.asks.get(id); if (!a) throw new Error('That question was already answered');
    this.asks.delete(id);
    let r;
    if (a.kind === 'question') r = { behavior: 'allow', updatedInput: { ...a.input, answers: ans.answers || {} } };
    else if (ans.allow) r = { behavior: 'allow', updatedInput: a.input, ...(ans.always && a.canAlways ? { updatedPermissions: a.suggestions } : {}) };
    else r = { behavior: 'deny', message: ans.note ? `Ali: ${ans.note}` : (a.kind === 'plan' ? 'Ali wants to keep planning.' : 'Ali declined this.') };
    a.resolve(r); onEvent(this, 'answered');
  }

  async interrupt() { try { await this.q.interrupt(); } catch (e) { console.error('interrupt:', e.message); } }

  close() {
    if (this.closed) return;
    this.closed = true; this.wake?.();
    try { this.abort.abort(); } catch {}
  }

  view() {
    return {
      status: this.status, partial: this.partial, error: this.error, permissionMode: this.permissionMode || null,
      asks: [...this.asks.values()].map(({ resolve, suggestions, ...a }) => a),
    };
  }
}

// Start a new conversation, or wake/take over an existing one, then send `text`.
export async function open({ cwd, resume = null, model = null, text }) {
  if (resume && running.has(resume)) { const l = running.get(resume); if (text) l.send(text); return l; }
  const l = new Live({ cwd, resume, model: model || known.find((k) => k.id === resume)?.model || null });
  if (text) l.send(text);
  const timeout = new Promise((_, ko) => setTimeout(() => ko(new Error('Claude did not start within 60 s')), 60_000));
  await Promise.race([l.ready, timeout]);
  return l;
}

// Let the process go; the conversation stays (and the session stays listed unless forgotten).
export function release(id, { forgetIt = false } = {}) {
  running.get(id)?.close(); running.delete(id);
  if (forgetIt) forget(id);
}
export function releaseAll() { for (const l of running.values()) l.close(); running.clear(); }
