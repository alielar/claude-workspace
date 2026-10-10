// Agents Hub page: the session list on the left, the open session (or a new one) on the right.
// Every session can be chatted with: sessions the hub holds take the message at once; a Cursor,
// terminal or background session moves here when Ali sends it something.
// Phone: one column, list first, a session full screen with a back button.

import * as Dict from '/dictation.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(`ah.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(`ah.${k}`, JSON.stringify(v)); } catch {} } };
const isPhone = () => matchMedia('(max-width: 760px)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;

const ICON = {
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  more: '<svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/></svg>',
  send: '<svg viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>',
  stop: '<svg viewBox="0 0 16 16"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/></svg>',
  mic: '<svg viewBox="0 0 16 16"><rect x="6" y="1.8" width="4" height="8" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.3"/></svg>',
  phone: '<svg viewBox="0 0 16 16"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.2h2"/></svg>',
  editor: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.8"/><path d="M5 6.5 7 8.5 5 10.5M8.5 10.5h3"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M6 4v8M10 4v8"/></svg>',
  play: '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
  chev: '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>',
  claude: '<svg viewBox="0 0 16 16"><path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8"/></svg>',
  shield: '<svg viewBox="0 0 16 16"><path d="M8 1.8 2.8 3.8v4c0 3 2.2 5.4 5.2 6.4 3-1 5.2-3.4 5.2-6.4v-4z"/></svg>',
  ask: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.2v.1"/></svg>',
};

const WHERE = { hub: 'Here', cursor: 'Cursor', background: 'Background', terminal: 'Terminal', script: 'Script', desktop: 'Desktop app' };
const PHASE = { needs: 'Needs you', working: 'Working', done: 'Done', idle: 'Open', paused: 'Paused', old: 'Older' };
const GROUPS = ['needs', 'working', 'done', 'idle', 'paused', 'old'];

const state = {
  sessions: [], projects: [], prefs: {}, local: false, pushKey: null,
  project: store.get('project', 'all'),
  collapsed: store.get('collapsed', { old: true }),
  selected: null,        // session id, 'new', or null
  detail: null, messages: [], live: null, pending: [], keys: {}, menuOpen: false, qsel: {},
  draft: { prompt: store.get('draft', ''), where: 'hub', model: null, cwd: null },
};

// ── small helpers ────────────────────────────────────────────────────────────
function rel(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 172800) return 'Yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const elapsed = (ms) => { if (!ms) return ''; const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? `${Math.max(1, Math.floor((Date.now() - ms) / 1000))}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const clock = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
const hue = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// Two letters per project, unique across the projects on screen (ali-hub "AL", agents-hub "AG", Workspace "WS").
let monoCache = { key: '', map: {} };
function initials(name) {
  const names = [...new Set([...state.projects.map((p) => p.name), ...state.sessions.map((x) => x.project), name])].sort();
  const key = names.join('|');
  if (monoCache.key !== key) {
    const used = new Set(), map = {};
    for (const n of names) {
      const w = n.replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean), a = w[0] || n;
      const cons = a.slice(1).replace(/[aeiou]/gi, '');
      const cands = [a.slice(0, 2), w.length > 1 ? w[0][0] + w[1][0] : null, a[0] + (cons[0] || ''), a[0] + (cons[1] || ''), a[0] + a[a.length - 1]]
        .filter((c) => c && c.length === 2).map((c) => c.toUpperCase());
      map[n] = cands.find((c) => !used.has(c)) || cands[0]; used.add(map[n]);
    }
    monoCache = { key, map };
  }
  return monoCache.map[name] || String(name).slice(0, 2).toUpperCase();
}
const badge = (project, cls = '', inner = '') => `<span class="mono-badge ${cls}" style="--h:${hue(project)}" aria-hidden="true">${esc(initials(project))}${inner}</span>`;
const pillFor = (s) => {
  const label = s.phase === 'working' ? `Working ${elapsed(s.turnStart)}` : s.phase === 'idle' ? `Idle ${rel(s.lastAt)}` : s.phase === 'old' ? `Idle ${rel(s.lastAt)}` : PHASE[s.phase];
  return `<span class="pill ${s.phase}"><span class="dot ${s.phase}"></span>${esc(label)}</span>`;
};

// ── network ──────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error('login'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}
let toastTimer;
function toast(text, err = false) {
  const t = $('#toast'); t.textContent = text; t.className = `toast${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}
const fail = (e) => { if (e.message !== 'login') toast(e.message, true); };

// ── login ────────────────────────────────────────────────────────────────────
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#password').focus(); }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/login', { method: 'POST', body: { password: $('#password').value } }); $('#login').hidden = true; boot(); }
  catch (err) { const el = $('#login-error'); el.textContent = err.message; el.hidden = false; }
});

// ── routing ──────────────────────────────────────────────────────────────────
function resetDetail() { state.detail = null; state.messages = []; state.live = null; state.pending = []; state.keys = {}; state.qsel = {}; }
function go(sel, { replace = false } = {}) {
  if (sel !== state.selected) { resetDetail(); if (Dict.recording()) Dict.stop(); }
  state.selected = sel; state.menuOpen = false;
  const url = sel === 'new' ? '/new' : sel ? `/s/${sel}` : '/';
  if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState']({}, '', url);
  renderAll();
  if (sel && sel !== 'new') loadDetail();
}
function fromUrl() {
  const m = /^\/s\/([0-9a-f-]{36})/.exec(location.pathname);
  state.selected = m ? m[1] : location.pathname === '/new' ? 'new' : null;
}
addEventListener('popstate', () => { fromUrl(); resetDetail(); renderAll(); if (state.selected && state.selected !== 'new') loadDetail(); });

// ── data ─────────────────────────────────────────────────────────────────────
async function loadList() {
  const d = await api('/api/sessions');
  Object.assign(state, { sessions: d.sessions, projects: d.projects, prefs: d.prefs, local: d.local, pushKey: d.push });
  renderList();
  if (!state.selected || state.selected === 'new') { if (!$('#detail .new') && !(isPhone() && !state.selected)) renderDetail(); }
  setupAlerts();
}
async function loadDetail() {
  const id = state.selected; if (!id || id === 'new') return;
  try {
    const d = await api(`/api/sessions/${id}`);
    if (state.selected !== id) return;
    state.detail = d.session; state.messages = d.messages; state.live = d.live;
    // a message just sent stays on screen until the conversation file has it
    state.pending = state.pending.filter((p) => !d.messages.some((m) => m.role === 'user' && m.text === p.text) && Date.now() - p.at < 60_000);
    if (d.session.phase === 'done' && document.visibilityState === 'visible') {
      api(`/api/sessions/${id}/seen`, { method: 'POST' }).catch(() => {});
      const s = state.sessions.find((x) => x.id === id); if (s) s.phase = 'idle';
      state.detail.phase = 'idle'; renderList();
    }
    renderDetail();
  } catch (e) {
    if (e.message === 'That session has ended') { toast('That session has ended'); go(isPhone() ? null : 'new', { replace: true }); }
    else fail(e);
  }
}

// ── list ─────────────────────────────────────────────────────────────────────
const visibleSessions = () => state.sessions.filter((s) => state.project === 'all' || s.project === state.project);
const orderedVisible = () => { const v = visibleSessions(); return GROUPS.flatMap((g) => state.collapsed[g] ? [] : v.filter((s) => s.phase === g).sort((a, b) => b.lastAt - a.lastAt)); };
function preview(s) {
  if (s.phase === 'needs') return esc(s.waitingFor || 'Waiting for your answer');
  if (s.phase === 'working') return s.lastPrompt ? `<span class="who">You:</span> ${esc(s.lastPrompt)}` : 'Working';
  if (s.queued) return `<span class="who">Queued:</span> ${esc(s.queued)}`;
  if (s.error) return `<span class="who">Stopped:</span> ${esc(s.error)}`;
  return esc((s.lastText || s.lastPrompt || 'No messages yet').replace(/[#*`|>]/g, '').replace(/\s+/g, ' '));
}
function rowHtml(s) {
  const time = s.phase === 'working' ? elapsed(s.turnStart) : rel(s.lastAt);
  return `<a class="row phase-${s.phase}${state.selected === s.id ? ' selected' : ''}" href="/s/${s.id}" data-id="${s.id}">
    ${badge(s.project, '', `<span class="dot ${s.phase}" aria-label="${PHASE[s.phase]}"></span>`)}
    <span class="name">${esc(s.name)}</span>
    <span class="time">${esc(time)}</span>
    <span class="meta">${esc(state.project === 'all' ? `${s.project} · ` : '')}${WHERE[s.where] || s.where}${s.busy ? ' · updating' : ''}</span>
    <span class="preview">${preview(s)}</span>
  </a>`;
}
function renderList() {
  const all = state.sessions, v = visibleSessions();
  const n = (p) => all.filter((s) => s.phase === p).length;
  const pills = [];
  if (n('needs')) pills.push(`<span class="pill needs"><span class="dot needs"></span>${n('needs')} need${n('needs') === 1 ? 's' : ''} you</span>`);
  if (n('working')) pills.push(`<span class="pill working"><span class="dot working"></span>${n('working')} working</span>`);
  if (n('done')) pills.push(`<span class="pill done"><span class="dot done"></span>${n('done')} done</span>`);
  pills.push(`<span class="pill">${all.length} open</span>`);
  $('#summary').innerHTML = pills.join('');

  const counts = {}; for (const s of all) counts[s.project] = (counts[s.project] || 0) + 1;
  const projs = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  if (state.project !== 'all' && !counts[state.project]) state.project = 'all';
  $('#projects').innerHTML = [['all', 'All', all.length], ...projs.map((p) => [p, p, counts[p]])]
    .map(([k, label, c]) => `<button class="chip" role="tab" data-project="${esc(k)}" aria-selected="${state.project === k}">${esc(label)}<span class="count">${c}</span></button>`).join('');

  const html = GROUPS.map((g) => {
    const rows = v.filter((s) => s.phase === g).sort((a, b) => b.lastAt - a.lastAt);
    if (!rows.length) return '';
    const collapsed = !!state.collapsed[g];
    const extra = g === 'old' ? `<button class="act" data-close-old>Close all</button>` : '';
    return `<section class="group${collapsed ? ' collapsed' : ''}" data-group="${g}">
      <div class="group-head"><button class="toggle" data-toggle="${g}" aria-expanded="${!collapsed}">${ICON.down}${PHASE[g]} <span class="count">${rows.length}</span></button><span class="spacer"></span>${extra}</div>
      <div class="rows">${rows.map(rowHtml).join('')}</div>
    </section>`;
  }).join('');
  $('#list').innerHTML = html || `<div class="empty-list"><span>No sessions running</span><button class="btn primary small" data-new>${ICON.plus}New session</button></div>`;
}

$('#list').addEventListener('click', async (e) => {
  const row = e.target.closest('.row');
  if (row) { e.preventDefault(); go(row.dataset.id); return; }
  const t = e.target.closest('[data-toggle]');
  if (t) { const g = t.dataset.toggle; state.collapsed[g] = !state.collapsed[g]; store.set('collapsed', state.collapsed); renderList(); return; }
  if (e.target.closest('[data-new]')) return go('new');
  if (e.target.closest('[data-close-old]')) {
    const old = state.sessions.filter((s) => s.phase === 'old');
    if (!confirm(`Close ${old.length} session${old.length === 1 ? '' : 's'} idle for more than a day? Their conversations stay saved.`)) return;
    try { const r = await api('/api/close-old', { method: 'POST' }); toast(`Closed ${r.closed}${r.failed ? `, ${r.failed} could not be closed` : ''}`); loadList(); } catch (err) { fail(err); }
  }
});
$('#projects').addEventListener('click', (e) => {
  const c = e.target.closest('[data-project]'); if (!c) return;
  state.project = c.dataset.project; store.set('project', state.project); renderList();
});
$('#new-btn').addEventListener('click', () => go('new'));

// ── markdown (enough for Claude's answers: paragraphs, lists, code, tables, links) ──
function inline(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<code>$1</code>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
function md(src) {
  const lines = String(src).split('\n'), out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush(); const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush(); const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) { flush(); const lv = Math.min(4, h[1].length + 1); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      flush(); const ordered = /^\s*\d/.test(l); const items = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+[.)])\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    if (/^>\s?/.test(l)) {
      flush(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`); continue;
    }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l); i++;
  }
  flush();
  return out.join('');
}

// ── detail ───────────────────────────────────────────────────────────────────
function renderAll() {
  $('#app').classList.toggle('has-detail', !!state.selected);
  renderList(); renderDetail();
}

function renderDetail() {
  const pane = $('#detail');
  if (!state.selected || state.selected === 'new') {
    if (state.selected === 'new' || !isPhone()) { if (!pane.querySelector('.new')) renderNew(pane); }
    else pane.innerHTML = '';
    return;
  }
  const s = state.detail || state.sessions.find((x) => x.id === state.selected);
  if (!s) { pane.innerHTML = ''; return; }
  if (!pane.querySelector(`[data-session="${s.id}"]`)) {
    pane.innerHTML = `<div data-session="${s.id}" style="display:contents">
      <header class="d-head"></header>
      <div class="convo"><div class="convo-inner"><div class="msgs"></div><div class="live-slot"></div><div class="asks-slot"></div></div></div>
      <footer class="composer"></footer></div>`;
    state.keys = {};
  }
  renderHead(pane, s);
  renderConvo(pane, s);
  renderComposer(pane, s);
}

function renderHead(pane, s) {
  const actions = [];
  if (state.local && s.where !== 'background') actions.push(`<button class="btn small" data-act="open-cursor" title="${s.where === 'hub' ? 'Hand it back to Cursor' : 'Bring it up in Cursor'}">${ICON.editor}<span class="label">Open in Cursor</span></button>`);
  if (state.local && s.where === 'background') actions.push(`<button class="btn small" data-act="open-terminal">${ICON.editor}<span class="label">Terminal</span></button>`);
  const menu = [];
  if ((s.where === 'hub' || s.where === 'background') && s.alive) menu.push(`<button data-act="pause">${ICON.pause}Pause</button><div class="hint">Frees the Mac. Your next message wakes it.</div>`);
  if (s.where === 'background' && !s.alive) menu.push(`<button data-act="resume">${ICON.play}Resume</button>`);
  if (s.remote) menu.push(`<a href="${esc(s.remote)}" target="_blank" rel="noopener">${ICON.phone}Open in Claude app</a>`);
  menu.push(`<button data-act="copy">${ICON.copy}Copy resume command</button>`);
  menu.push('<hr>');
  menu.push(`<button class="danger" data-act="close">${s.where === 'background' ? ICON.trash : ICON.close}${s.where === 'background' ? 'Delete session' : 'Close session'}</button><div class="hint">The conversation stays saved.</div>`);
  const key = JSON.stringify([s.name, s.phase, s.where, s.project, s.alive, s.busy, state.menuOpen, state.local, s.phase === 'working' ? Math.floor((Date.now() - s.turnStart) / 1000) : 0, s.phase === 'idle' || s.phase === 'old' ? rel(s.lastAt) : '']);
  if (state.keys.head === key) return; state.keys.head = key;
  $('.d-head', pane).innerHTML = `
    <button class="btn ghost icon back" data-act="back" aria-label="Back">${ICON.back}</button>
    ${badge(s.project)}
    <div class="d-title">
      <h2>${esc(s.name)}</h2>
      <div class="d-sub">${pillFor(s)}<span class="rest">${esc(s.project)} · ${WHERE[s.where] || s.where}${s.busy ? ' · updating' : ''}</span></div>
    </div>
    <div class="d-actions">${actions.join('')}
      <div class="menu-wrap"><button class="btn small icon" data-act="menu" aria-label="More" aria-expanded="${state.menuOpen}">${ICON.more}</button>
        <div class="menu"${state.menuOpen ? '' : ' hidden'}>${menu.join('')}</div></div>
    </div>`;
}

function renderConvo(pane, s) {
  const box = $('.convo', pane);
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140 || !state.keys.msgs;
  const all = [...state.messages, ...state.pending.map((p) => ({ role: 'user', text: p.text, pending: true }))];
  const last = all[all.length - 1];
  const msgKey = `${s.id}:${all.length}:${last?.text?.length || 0}`;
  if (state.keys.msgs !== msgKey) {
    state.keys.msgs = msgKey;
    let prevRole = null;
    $('.msgs', pane).innerHTML = all.map((m) => {
      const out = m.role === 'user'
        ? `<div class="msg-user${m.text.startsWith('/') ? ' cmd' : ''}">${esc(m.text)}</div><div class="msg-time">${m.pending ? 'Sending' : clock(m.at)}</div>`
        : m.role === 'claude'
          ? `<div class="msg-claude${prevRole === 'claude' || prevRole === 'tools' ? ' cont' : ''}"><span class="avatar">${ICON.claude}</span><div class="md">${md(m.text)}</div></div>`
          : `<details class="msg-tools"><summary>${ICON.chev}${esc(m.text)}</summary><ul>${(m.detail || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`;
      prevRole = m.role;
      return out;
    }).join('') || '<div class="convo-empty">No messages yet</div>';
  }
  // what Claude is writing right now, the working line, an error
  const l = state.live;
  const working = s.phase === 'working' || l?.status === 'working' || l?.status === 'starting';
  let liveHtml = '';
  if (l?.partial) { const h = md(l.partial), at = h.lastIndexOf('</'); liveHtml += `<div class="msg-claude cont"><span class="avatar">${ICON.claude}</span><div class="md">${at > 0 ? h.slice(0, at) + '<span class="caret"></span>' + h.slice(at) : h}</div></div>`; }
  else if (working && !(l?.asks?.length)) liveHtml += `<div class="working-line"><span class="dot working"></span><span>${l?.status === 'starting' ? 'Starting' : 'Working'} ${elapsed(s.turnStart)}</span></div>`;
  if (l?.error && !working) liveHtml += `<div class="convo-error">${esc(l.error)}</div>`;
  const slot = $('.live-slot', pane);
  if (state.keys.live !== liveHtml) { state.keys.live = liveHtml; slot.innerHTML = liveHtml; }
  renderAsks(pane);
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function renderAsks(pane) {
  const asks = state.live?.asks || [];
  const key = asks.map((a) => a.id).join(',') + JSON.stringify(state.qsel);
  if (state.keys.asks === key) return; state.keys.asks = key;
  const slot = $('.asks-slot', pane);
  slot.innerHTML = asks.map((a) => {
    if (a.kind === 'question') {
      const qs = a.input.questions || [];
      const sel = state.qsel[a.id] || {};
      return `<form class="ask" data-ask="${esc(a.id)}" data-kind="question">
        <div class="ask-head">${ICON.ask}Claude asks</div>
        ${qs.map((q, qi) => `<div class="q-block"><div class="q-text">${esc(q.question)}</div><div class="q-opts">
          ${(q.options || []).map((o) => { const on = q.multiSelect ? (sel[qi] || []).includes(o.label) : sel[qi] === o.label; return `<button type="button" class="q-opt" data-q="${qi}" data-multi="${q.multiSelect ? 1 : 0}" data-label="${esc(o.label)}" aria-pressed="${on}"><b>${esc(o.label)}</b>${o.description && o.description !== o.label ? `<span>${esc(o.description)}</span>` : ''}</button>`; }).join('')}
          <input type="text" data-other="${qi}" placeholder="Other answer" autocomplete="off"></div></div>`).join('')}
        <div class="ask-actions"><span class="grow"></span><button class="btn primary" type="submit">Answer</button></div></form>`;
    }
    if (a.kind === 'plan') {
      return `<form class="ask" data-ask="${esc(a.id)}" data-kind="plan">
        <div class="ask-head">${ICON.ask}Plan ready</div>
        <div class="plan-body md">${md(a.input.plan || '')}</div>
        <input type="text" name="note" placeholder="What to change (to keep planning)" autocomplete="off">
        <div class="ask-actions"><button class="btn" type="button" data-deny>Keep planning</button><span class="grow"></span><button class="btn primary" type="submit">Approve plan</button></div></form>`;
    }
    return `<form class="ask" data-ask="${esc(a.id)}" data-kind="permission">
      <div class="ask-head">${ICON.shield}Needs your approval</div>
      <div class="ask-title">${esc(a.title)}</div>
      ${a.detail ? `<div class="ask-detail">${esc(a.detail)}</div>` : ''}
      ${a.command ? `<pre>${esc(a.command)}</pre>` : ''}
      <input type="text" name="note" placeholder="Note for Claude if you decline" autocomplete="off">
      <div class="ask-actions"><button class="btn soft-danger" type="button" data-deny>Decline</button><span class="grow"></span>
        ${a.canAlways ? '<button class="btn" type="button" data-always>Always allow</button>' : ''}<button class="btn primary" type="submit">Allow</button></div></form>`;
  }).join('');
}

function renderComposer(pane, s) {
  const foot = $('.composer', pane);
  const working = s.where === 'hub' && (s.phase === 'working' || state.live?.status === 'working' || state.live?.status === 'starting');
  const other = s.where !== 'hub';
  const otherBusy = other && (s.phase === 'working' || s.phase === 'needs');
  const rec = !!Dict.recording();
  const key = JSON.stringify([s.id, s.where, working, otherBusy, s.queued, rec, rec ? Dict.elapsedLabel() : '']);
  if (state.keys.comp === key) return;
  const firstPaint = state.keys.compId !== s.id;
  state.keys.comp = key; state.keys.compId = s.id;
  const keep = $('textarea', foot)?.value ?? '';
  const focused = document.activeElement === $('textarea', foot);
  const note = otherBusy ? `Claude is working in ${WHERE[s.where]}. Your message leaves when it is done, and the session moves here.`
    : other ? `Sending moves this session here from ${WHERE[s.where] === 'Background' ? 'the background' : WHERE[s.where]}.` : '';
  const ph = working ? 'Add to the conversation' : 'Message Claude';
  foot.innerHTML = `<div class="composer-inner">
    ${s.queued ? `<div class="queued"><span><b>Queued:</b> ${esc(s.queued)}</span><button class="btn ghost small" data-act="unqueue">Cancel</button></div>` : ''}
    <form class="box" data-form="message">
      <textarea rows="1" placeholder="${ph}" aria-label="Message"></textarea>
      <button class="btn ghost icon mic${rec ? ' rec' : ''}" type="button" data-mic aria-label="Dictate">${rec ? `${ICON.mic}${Dict.elapsedLabel()}` : ICON.mic}</button>
      ${working ? `<button class="btn icon" type="button" data-act="interrupt" aria-label="Stop Claude" title="Stop">${ICON.stop}</button>` : ''}
      <button class="btn primary icon" type="submit" aria-label="Send">${ICON.send}</button>
    </form>
    ${note ? `<div class="compose-note">${esc(note)}</div>` : ''}</div>`;
  const ta = $('textarea', foot); ta.value = keep; autosize(ta);
  if (focused || (firstPaint && !isTouch && !keep)) ta.focus();
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, innerHeight * 0.4)}px`; }

// ── events in the detail pane ────────────────────────────────────────────────
$('#detail').addEventListener('input', (e) => {
  if (e.target.matches('textarea')) autosize(e.target);
  if (e.target.id === 'new-prompt') { state.draft.prompt = e.target.value; store.set('draft', e.target.value); }
});
$('#detail').addEventListener('keydown', (e) => {
  if (!e.target.matches('textarea') || e.key !== 'Enter' || e.isComposing) return;
  const isNew = e.target.id === 'new-prompt';
  if ((isNew && (e.metaKey || e.ctrlKey)) || (!isNew && !isTouch && !e.shiftKey)) { e.preventDefault(); e.target.form.requestSubmit(); }
});
$('#detail').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'message') return sendMessage(form);
  if (form.dataset.form === 'new') return startNew(form);
  if (form.dataset.ask) return answerAsk(form, true, e.submitter);
});
async function sendMessage(form) {
  if (Dict.recording()) await Dict.stop();
  const ta = $('textarea', form), text = ta.value.trim(); if (!text) return;
  const s = state.detail; if (!s) return;
  ta.value = ''; autosize(ta);
  state.pending.push({ text, at: Date.now() });
  if (s.where === 'hub' && state.live) state.live.status = 'working';
  renderDetail();
  try {
    const r = await api(`/api/sessions/${s.id}/message`, { method: 'POST', body: { text } });
    if (r.queued) { toast('Queued. It leaves when Claude is done there.'); state.pending = state.pending.filter((p) => p.text !== text); }
    if (r.tookOver) toast(`Moved here from ${WHERE[s.where]}`);
    await loadList(); await loadDetail();
  } catch (err) { state.pending = state.pending.filter((p) => p.text !== text); ta.value = text; autosize(ta); fail(err); renderDetail(); }
}
async function answerAsk(form, allow, submitter) {
  const id = form.dataset.ask, kind = form.dataset.kind, s = state.detail;
  let body = { id, allow };
  if (kind === 'question') {
    const ask = state.live.asks.find((a) => a.id === id);
    const sel = state.qsel[id] || {}, answers = {};
    (ask.input.questions || []).forEach((q, qi) => {
      const other = form.querySelector(`[data-other="${qi}"]`)?.value.trim();
      const v = other || (Array.isArray(sel[qi]) ? sel[qi].join(', ') : sel[qi]);
      if (v) answers[q.question] = v;
    });
    if (!Object.keys(answers).length) { toast('Pick an answer', true); return; }
    body = { id, answers };
  } else {
    body.note = form.querySelector('[name=note]')?.value.trim() || '';
    body.always = submitter?.dataset.always !== undefined;
  }
  form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await api(`/api/sessions/${s.id}/answer`, { method: 'POST', body });
    state.live.asks = state.live.asks.filter((a) => a.id !== id); state.live.status = 'working'; delete state.qsel[id];
    state.keys.asks = null; renderDetail(); setTimeout(loadDetail, 400);
  } catch (err) { fail(err); loadDetail(); }
}
$('#detail').addEventListener('click', async (e) => {
  // question options
  const opt = e.target.closest('.q-opt');
  if (opt) {
    const id = opt.closest('[data-ask]').dataset.ask, qi = opt.dataset.q, label = opt.dataset.label;
    const sel = state.qsel[id] ||= {};
    if (opt.dataset.multi === '1') { const cur = sel[qi] || []; sel[qi] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]; }
    else sel[qi] = label;
    renderAsks($('#detail')); return;
  }
  if (e.target.closest('[data-deny]')) return answerAsk(e.target.closest('[data-ask]'), false);
  if (e.target.closest('[data-always]')) return answerAsk(e.target.closest('[data-ask]'), true, e.target.closest('[data-always]'));
  if (e.target.closest('[data-mic]')) {
    const target = () => $('#new-prompt') || $('#detail .composer textarea');
    return Dict.toggle({ target, toast, onChange: () => { state.keys.comp = null; if (state.selected === 'new') paintNewMic(); else renderDetail(); } });
  }
  const seg = e.target.closest('[data-seg] [data-v]');
  if (seg) { const k = seg.closest('[data-seg]').dataset.seg; state.draft[k] = seg.dataset.v; const t = $('#new-prompt')?.value; renderNew($('#detail')); if (t != null) $('#new-prompt').value = t; return; }

  const el = e.target.closest('[data-act]');
  if (!el) { if (state.menuOpen && !e.target.closest('.menu')) { state.menuOpen = false; renderDetail(); } return; }
  const act = el.dataset.act, s = state.detail;
  if (act === 'back') return go(null);
  if (act === 'menu') { state.menuOpen = !state.menuOpen; return renderDetail(); }
  state.menuOpen = false;
  if (!s) return;
  if (act === 'copy') {
    const cmd = `cd "${s.cwd}" && claude --resume ${s.id}`;
    try { await navigator.clipboard.writeText(cmd); toast('Copied'); } catch { prompt('Copy this command', cmd); }
    return renderDetail();
  }
  if (act === 'close') {
    const what = s.where === 'background' ? 'Delete this background session?' : s.where === 'hub' ? 'Close this session?' : `Close this session in ${WHERE[s.where] || 'its window'}?`;
    if (!confirm(`${what} The conversation stays saved.`)) return renderDetail();
  }
  const labels = { 'open-cursor': s.where === 'hub' ? 'Handed back to Cursor' : 'Opening in Cursor', 'open-terminal': 'Opening Terminal', pause: 'Paused', resume: 'Resumed', close: s.where === 'background' ? 'Deleted' : 'Closed', unqueue: 'Queued message cancelled', interrupt: 'Stopped' };
  el.disabled = true;
  try {
    await api(`/api/sessions/${s.id}/${act}`, { method: 'POST' });
    toast(labels[act] || 'Done');
    if (act === 'close') { go(isPhone() ? null : 'new', { replace: true }); loadList(); return; }
    await loadList(); await loadDetail();
  } catch (err) { fail(err); renderDetail(); }
});

// ── new session ──────────────────────────────────────────────────────────────
function renderNew(pane) {
  const d = state.draft, projs = state.projects;
  if (!d.cwd) d.cwd = (state.project !== 'all' && projs.find((p) => p.name === state.project)?.cwd) || state.prefs.lastCwd || projs[0]?.cwd;
  if (!d.model) d.model = state.prefs.lastModel || 'default';
  if (!state.local) d.where = 'hub';
  const seg = (name, opts, cur) => `<div class="seg" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const rec = !!Dict.recording();
  pane.innerHTML = `<div class="new"><form class="new-inner" data-form="new">
    <div class="hide-desk" style="margin:-4px 0 -10px -8px"><button type="button" class="btn ghost icon" data-act="back" aria-label="Back">${ICON.back}</button></div>
    <div class="new-hero"><h2>New session</h2></div>
    <div class="box"><textarea id="new-prompt" placeholder="What should Claude do?" aria-label="Task">${esc(d.prompt)}</textarea>
      <button class="btn ghost icon mic${rec ? ' rec' : ''}" type="button" data-mic aria-label="Dictate">${rec ? `${ICON.mic}${Dict.elapsedLabel()}` : ICON.mic}</button></div>
    <div class="field"><span>Project</span><div class="chips" data-seg="cwd">${projs.map((p) => `<button type="button" class="chip" data-v="${esc(p.cwd)}" aria-selected="${p.cwd === d.cwd}">${badge(p.name)}${esc(p.name)}</button>`).join('')}</div></div>
    <div class="seg-row">
      ${state.local ? `<div class="field"><span>Run</span>${seg('where', [['hub', 'Here'], ['cursor', 'In Cursor']], d.where)}</div>` : ''}
      <div class="field"><span>Model</span>${seg('model', [['default', 'Default'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']], d.model)}</div>
      <div class="grow"></div>
      <button class="btn primary" type="submit" style="height:42px;padding:0 20px">Start <kbd class="hide-phone">⌘↵</kbd></button>
    </div>
    ${d.where === 'cursor' ? '<p class="where-hint">Opens a new Claude panel in Cursor with this task.</p>' : ''}
  </form></div>`;
  const ta = $('#new-prompt'); autosize(ta);
  if (!isTouch && !rec) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function paintNewMic() {
  const b = $('#detail .new [data-mic]'); if (!b) return;
  const rec = !!Dict.recording();
  b.classList.toggle('rec', rec); b.innerHTML = rec ? `${ICON.mic}${Dict.elapsedLabel()}` : ICON.mic;
}
async function startNew(form) {
  if (Dict.recording()) await Dict.stop();
  const d = state.draft, prompt = $('#new-prompt').value.trim();
  if (!prompt) { toast('Say what Claude should do', true); return; }
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Starting';
  try {
    const r = await api('/api/sessions', { method: 'POST', body: { cwd: d.cwd, prompt, where: d.where, model: d.model } });
    d.prompt = ''; store.set('draft', '');
    if (r.where === 'cursor') { toast('Opened in Cursor'); renderNew($('#detail')); return; }
    await loadList();
    if (r.id) go(r.id); else renderNew($('#detail'));
  } catch (err) { fail(err); btn.disabled = false; btn.textContent = 'Start'; }
}

// ── keyboard ─────────────────────────────────────────────────────────────────
addEventListener('keydown', (e) => {
  const typing = e.target.matches('input, textarea');
  if (e.key === 'Escape') {
    if (state.menuOpen) { state.menuOpen = false; renderDetail(); return; }
    if (typing) { e.target.blur(); return; }
    if (state.selected) go(null);
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'c') { e.preventDefault(); go('new'); }
  if (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const list = orderedVisible(); if (!list.length) return;
    e.preventDefault();
    const i = list.findIndex((s) => s.id === state.selected);
    const next = e.key === 'j' || e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    go(list[next].id);
    $(`.row[data-id="${list[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  if ((e.key === 'r' || e.key === '/') && state.selected && state.selected !== 'new') { const ta = $('.composer textarea'); if (ta) { e.preventDefault(); ta.focus(); } }
});

// ── alerts (web push) ────────────────────────────────────────────────────────
const b64 = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
let swReg = null, alertsChecked = false;
async function setupAlerts() {
  if (alertsChecked || !state.pushKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  alertsChecked = true;
  swReg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  if (!swReg) return;
  const sub = await swReg.pushManager.getSubscription();
  if (sub && Notification.permission === 'granted') { api('/api/subscribe', { method: 'POST', body: sub.toJSON() }).catch(() => {}); return; }
  if (Notification.permission !== 'denied') $('#alerts').hidden = false;
}
$('#alerts').addEventListener('click', async () => {
  try {
    if (await Notification.requestPermission() !== 'granted') { toast('Alerts are blocked in this browser\'s settings', true); return; }
    const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(state.pushKey) });
    await api('/api/subscribe', { method: 'POST', body: sub.toJSON() });
    $('#alerts').hidden = true; toast('Alerts on');
  } catch (e) { fail(e); }
});

// ── start ────────────────────────────────────────────────────────────────────
// Faster refresh while the open session is the hub's and Claude is writing, so the answer streams in.
let tick = null, listAt = 0;
function schedule() {
  clearTimeout(tick);
  const s = state.detail, l = state.live;
  const streaming = s && s.where === 'hub' && (l?.status === 'working' || l?.status === 'starting' || s.phase === 'working');
  tick = setTimeout(async () => {
    if (document.visibilityState === 'visible') {
      try {
        if (!streaming || Date.now() - listAt > 2500) { listAt = Date.now(); await loadList(); }
        if (state.selected && state.selected !== 'new') await loadDetail();
      } catch {}
    }
    schedule();
  }, streaming ? 700 : 2500);
}
async function boot() {
  $('#app').hidden = false; fromUrl();
  $('#app').classList.toggle('has-detail', !!state.selected);
  try { await loadList(); } catch { return; }
  renderAll();
  if (state.selected && state.selected !== 'new') loadDetail();
  schedule();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadList().then(() => state.selected && state.selected !== 'new' && loadDetail()).catch(() => {}); });
matchMedia('(max-width: 760px)').addEventListener('change', renderAll);
boot();
