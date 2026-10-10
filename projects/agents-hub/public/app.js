// Agents Hub page: the session list on the left, the open session (or a new one) on the right.
// Phone: one column, list first, a session full screen with a back button.

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
  phone: '<svg viewBox="0 0 16 16"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.2h2"/></svg>',
  editor: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6"/><path d="M5 6.5 7 8.5 5 10.5M8.5 10.5h3"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M6 4v8M10 4v8"/></svg>',
  play: '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
  chev: '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>',
};

const WHERE = { cursor: 'Cursor', background: 'Background', terminal: 'Terminal', script: 'Script', desktop: 'Desktop app' };
const PHASE = { needs: 'Needs you', working: 'Working', done: 'Done', idle: 'Open', paused: 'Paused', old: 'Older' };
const GROUPS = ['needs', 'working', 'done', 'idle', 'paused', 'old'];

const state = {
  sessions: [], projects: [], prefs: {}, local: false, pushKey: null,
  project: store.get('project', 'all'),
  collapsed: store.get('collapsed', { old: true }),
  selected: null,        // session id, 'new', or null
  detail: null, messages: [], convoKey: '', composerKey: '', menuOpen: false,
  draft: { prompt: store.get('draft', ''), where: 'background', model: null, cwd: null },
};

// ── time ─────────────────────────────────────────────────────────────────────
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
const elapsed = (ms) => { if (!ms) return ''; const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? 'just started' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const clock = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

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
function go(sel, { replace = false } = {}) {
  state.selected = sel; state.menuOpen = false;
  if (sel !== state.detail?.id) { state.detail = null; state.messages = []; state.convoKey = ''; state.composerKey = ''; }
  const url = sel === 'new' ? '/new' : sel ? `/s/${sel}` : '/';
  if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState']({}, '', url);
  renderAll();
  if (sel && sel !== 'new') loadDetail();
}
function fromUrl() {
  const m = /^\/s\/([0-9a-f-]{36})/.exec(location.pathname);
  state.selected = m ? m[1] : location.pathname === '/new' ? 'new' : null;
}
addEventListener('popstate', () => { fromUrl(); state.detail = null; state.convoKey = ''; state.composerKey = ''; renderAll(); if (state.selected && state.selected !== 'new') loadDetail(); });

// ── data ─────────────────────────────────────────────────────────────────────
async function loadList() {
  const d = await api('/api/sessions');
  Object.assign(state, { sessions: d.sessions, projects: d.projects, prefs: d.prefs, local: d.local, pushKey: d.push });
  renderList();
  if (state.selected && state.selected !== 'new') {
    const s = state.sessions.find((x) => x.id === state.selected);
    if (s && state.detail) { state.detail = { ...state.detail, ...s }; renderDetail(); }
  } else if (!state.detail) renderDetail();
  setupAlerts();
}
async function loadDetail() {
  const id = state.selected; if (!id || id === 'new') return;
  try {
    const d = await api(`/api/sessions/${id}`);
    if (state.selected !== id) return;
    state.detail = d.session; state.messages = d.messages;
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
function visibleSessions() {
  return state.sessions.filter((s) => state.project === 'all' || s.project === state.project);
}
function orderedVisible() {
  const v = visibleSessions();
  return GROUPS.flatMap((g) => state.collapsed[g] ? [] : v.filter((s) => s.phase === g).sort((a, b) => b.lastAt - a.lastAt));
}
function preview(s) {
  if (s.phase === 'needs') return esc(s.waitingFor ? `Waiting: ${s.waitingFor}` : (s.lastText || 'Waiting for you'));
  if (s.phase === 'working') return s.lastPrompt ? `<span class="who">You:</span> ${esc(s.lastPrompt)}` : 'Working';
  if (s.queued) return `<span class="who">Queued:</span> ${esc(s.queued)}`;
  return esc((s.lastText || s.lastPrompt || 'No messages yet').replace(/[#*`|>]/g, '').replace(/\s+/g, ' '));
}
function rowHtml(s) {
  const time = s.phase === 'working' ? elapsed(s.turnStart) : rel(s.lastAt);
  return `<a class="row phase-${s.phase}${state.selected === s.id ? ' selected' : ''}" href="/s/${s.id}" data-id="${s.id}">
    <span class="dot ${s.phase}" aria-label="${PHASE[s.phase]}"></span>
    <span class="name">${esc(s.name)}</span>
    <span class="time">${esc(time)}</span>
    <span class="meta">${esc(state.project === 'all' ? `${s.project} · ` : '')}${WHERE[s.where] || s.where}${s.busy ? ' · …' : ''}</span>
    <span class="preview">${preview(s)}</span>
  </a>`;
}
function renderList() {
  const all = state.sessions, v = visibleSessions();
  const n = (p, list = all) => list.filter((s) => s.phase === p).length;
  const parts = [];
  if (n('needs')) parts.push(`<b class="n-needs">${n('needs')}</b> need${n('needs') === 1 ? 's' : ''} you`);
  if (n('working')) parts.push(`<b class="n-working">${n('working')}</b> working`);
  if (n('done')) parts.push(`<b>${n('done')}</b> done`);
  parts.push(`<b>${all.length}</b> open`);
  $('#summary').innerHTML = parts.join(' · ');

  const counts = {}; for (const s of all) counts[s.project] = (counts[s.project] || 0) + 1;
  const projs = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  if (state.project !== 'all' && !counts[state.project]) state.project = 'all';
  $('#projects').innerHTML = [['all', 'All', all.length], ...projs.map((p) => [p, p, counts[p]])]
    .map(([k, label, c]) => `<button class="chip" role="tab" data-project="${esc(k)}" aria-selected="${state.project === k}">${esc(label)}<span class="count">${c}</span></button>`).join('');

  const html = GROUPS.map((g) => {
    const rows = v.filter((s) => s.phase === g).sort((a, b) => b.lastAt - a.lastAt);
    if (!rows.length) return '';
    const collapsed = !!state.collapsed[g];
    const extra = g === 'old' ? `<button data-close-old>Close all</button>` : '';
    return `<section class="group${collapsed ? ' collapsed' : ''}" data-group="${g}">
      <div class="group-head"><button class="toggle" data-toggle="${g}" aria-expanded="${!collapsed}">${ICON.down}</button>${PHASE[g]} <span class="count">${rows.length}</span><span class="spacer"></span>${extra}</div>
      <div class="rows">${rows.map(rowHtml).join('')}</div>
    </section>`;
  }).join('');
  $('#list').innerHTML = html || `<div class="empty-list">No sessions running.<br><br><button class="btn primary small" data-new>${ICON.plus}New session</button></div>`;
}

$('#list').addEventListener('click', async (e) => {
  const row = e.target.closest('.row');
  if (row) { e.preventDefault(); go(row.dataset.id); return; }
  const t = e.target.closest('[data-toggle]');
  if (t) { const g = t.dataset.toggle; state.collapsed[g] = !state.collapsed[g]; store.set('collapsed', state.collapsed); renderList(); return; }
  if (e.target.closest('[data-new]')) return go('new');
  if (e.target.closest('[data-close-old]')) {
    const old = state.sessions.filter((s) => s.phase === 'old');
    if (!confirm(`Close ${old.length} session${old.length === 1 ? '' : 's'} idle for more than a day? Their conversations stay saved and /resume brings them back.`)) return;
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
    if (h) { flush(); out.push(`<h${h[1].length + 1 > 4 ? 4 : h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1 > 4 ? 4 : h[1].length + 1}>`); i++; continue; }
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
  if (!s) { pane.innerHTML = '<div class="new"><div class="new-inner"><p class="lede">Loading…</p></div></div>'; return; }

  if (!pane.querySelector(`[data-session="${s.id}"]`)) {
    pane.innerHTML = `<div data-session="${s.id}" style="display:contents">
      <header class="d-head"></header><div class="banner-slot"></div>
      <div class="convo"><div class="convo-inner"></div></div><footer class="composer"></footer></div>`;
  }
  renderHead(pane, s);
  renderBanner(pane, s);
  renderConvo(pane, s);
  renderComposer(pane, s);
}

function stateLabel(s) {
  if (s.phase === 'working') return `Working ${elapsed(s.turnStart)}`;
  if (s.phase === 'needs') return 'Needs you';
  if (s.phase === 'done') return 'Done';
  if (s.phase === 'paused') return 'Paused';
  return `Idle ${rel(s.lastAt)}`;
}
function renderHead(pane, s) {
  const bg = s.where === 'background';
  const actions = [];
  if (bg && state.local) actions.push(`<button class="btn small" data-act="open-terminal" title="Open it in a Terminal window">${ICON.editor}<span class="label">Terminal</span></button>`);
  if (bg && s.remote) actions.push(`<a class="btn small" href="${esc(s.remote)}" target="_blank" rel="noopener" title="Follow and answer in the Claude app (works on the phone)">${ICON.phone}<span class="label">Claude app</span></a>`);
  const menu = [];
  if (bg && s.phase !== 'paused') menu.push(`<button data-act="pause">${ICON.pause}Pause</button>`);
  if (bg && s.phase === 'paused') menu.push(`<button data-act="resume">${ICON.play}Resume</button>`);
  menu.push(`<button data-act="copy">${ICON.copy}Copy resume command</button>`);
  menu.push('<hr>');
  if (bg) menu.push(`<button class="danger" data-act="close">${ICON.trash}Delete session</button><div class="hint">The conversation stays saved.</div>`);
  else menu.push(`<button class="danger" data-act="close">${ICON.close}Close session</button><div class="hint">Ends it in ${WHERE[s.where] || 'its window'}. The conversation stays saved.</div>`);

  $('.d-head', pane).innerHTML = `
    <button class="btn ghost icon back" data-act="back" aria-label="Back">${ICON.back}</button>
    <div class="d-title">
      <h2>${esc(s.name)}</h2>
      <div class="d-sub"><span class="dot ${s.phase}"></span><span class="state ${s.phase}">${esc(stateLabel(s))}</span><span class="rest">· ${esc(s.project)} · ${WHERE[s.where] || s.where}${s.busy ? ' · updating…' : ''}</span></div>
    </div>
    <div class="d-actions">${actions.join('')}
      <div class="menu-wrap"><button class="btn small icon" data-act="menu" aria-label="More" aria-expanded="${state.menuOpen}">${ICON.more}</button>
        <div class="menu"${state.menuOpen ? '' : ' hidden'}>${menu.join('')}</div></div>
    </div>`;
}
function renderBanner(pane, s) {
  const slot = $('.banner-slot', pane);
  if (s.phase !== 'needs') { slot.innerHTML = ''; return; }
  const where = s.where === 'cursor' && state.local ? `<button class="btn small" data-act="open-cursor">Answer in Cursor</button>` : s.remote ? `<a class="btn small" href="${esc(s.remote)}" target="_blank" rel="noopener">Answer in Claude app</a>` : s.where === 'background' && state.local ? `<button class="btn small" data-act="open-terminal">Answer in Terminal</button>` : '';
  slot.innerHTML = `<div class="banner needs"><span class="dot needs"></span><span class="grow"><b>Waiting for you</b>${s.waitingFor ? `: ${esc(s.waitingFor)}` : ''}</span>${where}</div>`;
}
function renderConvo(pane, s) {
  const box = $('.convo', pane), inner = $('.convo-inner', pane);
  const last = state.messages[state.messages.length - 1];
  const key = `${state.messages.length}:${last?.text?.length || 0}:${s.phase}`;
  const work = $('.working-line', inner);
  if (key === state.convoKey) { if (work) work.lastElementChild.textContent = `Working ${elapsed(s.turnStart)}`; return; }
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || !state.convoKey;
  state.convoKey = key;
  const html = state.messages.map((m) => {
    if (m.role === 'user') return `<div class="msg-user${m.text.startsWith('/') ? ' cmd' : ''}">${esc(m.text)}</div><div class="msg-time right">${clock(m.at)}</div>`;
    if (m.role === 'claude') return `<div class="msg-claude md">${md(m.text)}</div>`;
    return `<details class="msg-tools"><summary>${ICON.chev}${esc(m.text)}</summary><ul>${(m.detail || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`;
  }).join('');
  const tail = s.phase === 'working' ? `<div class="working-line"><span class="dot working"></span><span>Working ${elapsed(s.turnStart)}</span></div>` : '';
  inner.innerHTML = (html || '<p class="lede" style="color:var(--muted)">No messages yet.</p>') + tail;
  if (nearBottom) box.scrollTop = box.scrollHeight;
}
function renderComposer(pane, s) {
  const foot = $('.composer', pane);
  const key = `${s.id}:${s.where}:${s.phase === 'working' || s.phase === 'needs'}:${s.phase === 'paused'}:${s.queued || ''}:${state.local}`;
  if (key === state.composerKey) return;
  state.composerKey = key;
  if (s.where !== 'background') {
    const btns = [];
    if (s.where === 'cursor' && state.local) btns.push(`<button class="btn small" data-act="open-cursor">${ICON.editor}Open in Cursor</button>`);
    if (s.remote) btns.push(`<a class="btn small${state.local ? '' : ' primary'}" href="${esc(s.remote)}" target="_blank" rel="noopener">${ICON.phone}Reply in Claude app</a>`);
    foot.innerHTML = `<div class="composer-inner foot-note"><span>This session lives in ${WHERE[s.where] || 'another window'}.</span>${btns.join('')}</div>`;
    return;
  }
  const keep = $('textarea', foot)?.value || '';
  const busyTurn = s.phase === 'working' || s.phase === 'needs';
  const ph = busyTurn ? 'Claude is working. Your message leaves when it is done.' : s.phase === 'paused' ? 'Message to wake it up' : 'Message Claude';
  foot.innerHTML = `<div class="composer-inner">
    ${s.queued ? `<div class="queued"><span><b>Queued:</b> ${esc(s.queued)}</span><button class="btn ghost small" data-act="unqueue">Cancel</button></div>` : ''}
    <form class="box" data-form="message"><textarea rows="1" placeholder="${ph}" aria-label="Message"></textarea>
    <button class="btn primary icon" type="submit" aria-label="Send">${ICON.send}</button></form></div>`;
  const ta = $('textarea', foot); ta.value = keep; autosize(ta);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, innerHeight * 0.4)}px`; }

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
  if (form.dataset.form === 'message') {
    const ta = $('textarea', form), text = ta.value.trim(); if (!text) return;
    const btn = $('button', form); btn.disabled = true;
    try {
      const r = await api(`/api/sessions/${state.selected}/message`, { method: 'POST', body: { text } });
      ta.value = ''; autosize(ta);
      toast(r.queued ? 'Queued. It leaves when Claude is done.' : 'Sent');
      state.composerKey = ''; await loadList(); loadDetail();
    } catch (err) { fail(err); } finally { btn.disabled = false; }
  }
  if (form.dataset.form === 'new') startNew(form);
});
$('#detail').addEventListener('click', async (e) => {
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
    const what = s.where === 'background' ? 'Delete this background session?' : `Close this session in ${WHERE[s.where] || 'its window'}?`;
    if (!confirm(`${what} The conversation stays saved.`)) return renderDetail();
  }
  const labels = { 'open-cursor': 'Opening in Cursor', 'open-terminal': 'Opening Terminal', pause: 'Paused', resume: 'Resumed', close: s.where === 'background' ? 'Deleted' : 'Closed', unqueue: 'Queued message cancelled' };
  el.disabled = true;
  try {
    await api(`/api/sessions/${s.id}/${act}`, { method: 'POST' });
    toast(labels[act] || 'Done');
    if (act === 'close') { go(isPhone() ? null : 'new', { replace: true }); loadList(); return; }
    state.composerKey = ''; await loadList(); loadDetail();
  } catch (err) { fail(err); renderDetail(); }
});

// ── new session ──────────────────────────────────────────────────────────────
function renderNew(pane) {
  const d = state.draft;
  const projs = state.projects;
  if (!d.cwd) d.cwd = (state.project !== 'all' && projs.find((p) => p.name === state.project)?.cwd) || state.prefs.lastCwd || projs[0]?.cwd;
  if (!d.model) d.model = state.prefs.lastModel || 'default';
  if (!state.local) d.where = 'background';
  const seg = (name, opts, cur) => `<div class="seg" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  pane.innerHTML = `<div class="new"><form class="new-inner" data-form="new">
    <div class="hide-desk" style="display:flex;align-items:center;gap:6px;margin:-4px 0 -6px -8px"><button type="button" class="btn ghost icon" data-act="back" aria-label="Back">${ICON.back}</button></div>
    <h2>New session</h2>
    <label class="box"><textarea id="new-prompt" placeholder="What should Claude do?" aria-label="Task">${esc(d.prompt)}</textarea></label>
    <div class="field"><span>Project</span><div class="chips" data-seg="cwd">${projs.map((p) => `<button type="button" class="chip" data-v="${esc(p.cwd)}" aria-selected="${p.cwd === d.cwd}">${esc(p.name)}</button>`).join('')}</div></div>
    <div class="seg-row">
      ${state.local ? `<div class="field"><span>Run in</span>${seg('where', [['background', 'Background'], ['cursor', 'Cursor']], d.where)}</div>` : ''}
      <div class="field"><span>Model</span>${seg('model', [['default', 'Default'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']], d.model)}</div>
      <div class="grow"></div>
      <button class="btn primary" type="submit">Start <kbd class="hide-phone">⌘↵</kbd></button>
    </div>
    <p class="where-hint">${d.where === 'cursor' ? 'Opens a new Claude panel in Cursor with this task.' : 'Runs on the Mac without a window. Follow it, reply, pause or stop it here.'}</p>
  </form></div>`;
  const ta = $('#new-prompt'); autosize(ta);
  if (!isTouch) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
$('#detail').addEventListener('click', (e) => {
  const b = e.target.closest('[data-seg] [data-v]'); if (!b) return;
  const key = b.closest('[data-seg]').dataset.seg; state.draft[key] = b.dataset.v;
  const keepText = $('#new-prompt')?.value; renderNew($('#detail'));
  if (keepText != null) $('#new-prompt').value = keepText;
});
async function startNew(form) {
  const d = state.draft, prompt = $('#new-prompt').value.trim();
  if (!prompt) { toast('Say what Claude should do', true); return; }
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Starting…';
  try {
    const r = await api('/api/sessions', { method: 'POST', body: { cwd: d.cwd, prompt, where: d.where, model: d.model } });
    d.prompt = ''; store.set('draft', '');
    if (r.where === 'cursor') { toast('Opened in Cursor'); renderNew($('#detail')); return; }
    toast('Started');
    await loadList();
    if (r.id) go(r.id); else { renderNew($('#detail')); }
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
  if (e.key === 'r' && state.selected && state.selected !== 'new') { const ta = $('.composer textarea'); if (ta) { e.preventDefault(); ta.focus(); } }
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
    $('#alerts').hidden = true; toast('Alerts on: you hear when a session needs you or finishes');
  } catch (e) { fail(e); }
});

// ── start ────────────────────────────────────────────────────────────────────
let ticker = null;
async function boot() {
  $('#app').hidden = false; fromUrl();
  $('#app').classList.toggle('has-detail', !!state.selected);
  try { await loadList(); } catch { return; }
  renderAll();
  if (state.selected && state.selected !== 'new') loadDetail();
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    loadList().catch(() => {});
    if (state.selected && state.selected !== 'new') loadDetail();
  }, 2500);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadList().then(() => state.selected && state.selected !== 'new' && loadDetail()).catch(() => {}); });
matchMedia('(max-width: 760px)').addEventListener('change', renderAll);
boot();
