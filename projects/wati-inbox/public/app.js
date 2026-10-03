// Wati Inbox client: inbox (/), thread (/t/<waId>), France TM (/tm). Login, push, theme, Claude drafts.
// Rebuilt 2026-09-30: drafts arrive by themselves when a lead writes; the screen shows one thing at a time.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const left = (h) => { const r = 24 - h; return r < 1 ? `${Math.max(1, Math.round(r * 60))} min` : `${Math.floor(r)} h`; };
const windowBadge = (open, h) => open ? `<span class="badge ${24 - h < 2 ? 'soon' : 'open'}">${left(h)} left</span>` : '<span class="badge closed">closed · template only</span>';
const fmtLeft = (iso) => { const s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000)); return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`; };
let toastTimer;
const toast = (msg) => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800); };
const splitBubbles = (text) => String(text || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
const EMOJIS = ['😊', '👍', '😁', '🙂', '🙏', '💪', '✅', '🚀', '🎉', '😉'];

async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copied' : 'Failed'; btn.classList.toggle('done', ok); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
  toast(ok ? 'Copied' : 'Could not copy here');
}

// Dictation (Ali, 2026-10-01): a microphone button on each note-for-Claude field. Tap to start (red, pulsing, with the
// elapsed time), tap again to stop; on the laptop the recording goes on while another window has the focus. The text
// appears progressively while he speaks: the browser cuts the speech at pauses (≈0.7 s of silence) and sends each
// piece as 16 kHz mono WAV to the Mac (Whisper large-v3-turbo, local); the piece being spoken is transcribed every
// 2.5 s as a provisional text, replaced by the final one at the pause. Previous text gives the model its context.
let rec = null; // { field, ctx, stream, src, node, rate, startedAt, timer, base, segs: [{id, text, final}], seg: chunks of the current piece, ... }
const COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const MIC_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8 21h8"/></svg>';
const micLabel = (field) => rec && rec.field === field ? `${MIC_ICON}<span>${Math.floor((Date.now() - rec.startedAt) / 60000)}:${String(Math.floor((Date.now() - rec.startedAt) / 1000) % 60).padStart(2, '0')}</span>` : `${MIC_ICON}<span>${rec ? 'Busy' : 'Dictate'}</span>`;
const micHtml = (field) => `<button class="small mic${rec && rec.field === field ? ' rec' : ''}" type="button" data-mic="${field}" title="Dictate">${micLabel(field)}</button>`;
const micPaint = () => document.querySelectorAll('[data-mic]').forEach((b) => { b.innerHTML = micLabel(b.dataset.mic); b.classList.toggle('rec', !!rec && rec.field === b.dataset.mic); });
const bindMic = () => document.querySelectorAll('[data-mic]').forEach((b) => { b.onclick = () => micToggle(b.dataset.mic); });
// A piece ends after 0.55 s of silence; while speaking, a provisional text (fast model) is asked every 0.9 s, one at a time.
const SEG_SILENCE_MS = 550, SEG_MIN_MS = 600, SEG_MAX_MS = 15000, INTERIM_MS = 900, VOICE_RMS = 0.012;
// The recorder stops by itself: 90 s without a voice, or 10 min in all (Ali, 2026-10-03: a dictation left on for 21 min
// kept feeding room noise to Whisper, which filled the box with "okay okay thank you").
const MIC_IDLE_STOP_MS = 90_000, MIC_MAX_MS = 10 * 60_000;
async function micToggle(field) {
  if (rec) { if (rec.field !== field) { toast('Stop the other dictation first'); return; } return micStop(); }
  if (!navigator.mediaDevices?.getUserMedia) { toast('No microphone access in this browser'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const ta = $(`#${field}`);
    const base = (ta ? ta.value : dir.instruction).trim();
    rec = { field, ctx, stream, src, node, rate: ctx.sampleRate, startedAt: Date.now(), base, segs: [], seg: [], segMs: 0, segVoice: false, lastVoiceAt: 0, lastInterimAt: 0, interimBusy: false, nextId: 1, inflight: 0 };
    rec.timer = setInterval(micPaint, 1000);
    node.onaudioprocess = (e) => { if (rec && rec.field === field) micFrame(e.inputBuffer.getChannelData(0)); };
    src.connect(node); node.connect(ctx.destination);
    micPaint();
  } catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone refused. Allow it in the browser settings' : `Microphone: ${e.message}`); }
}
// One audio frame (≈85 ms at 48 kHz): accumulate, detect voice, cut a piece at a pause, ask for a provisional text meanwhile.
function micFrame(samples) {
  const r = rec; const now = Date.now();
  if (now - r.startedAt >= MIC_MAX_MS) { toast('Dictation stopped after 10 min'); micStop(); return; }
  if (now - (r.lastVoiceAt || r.startedAt) >= MIC_IDLE_STOP_MS) { toast('Dictation stopped: no voice for 90 s'); micStop(); return; }
  let s = 0; for (let i = 0; i < samples.length; i += 4) s += samples[i] * samples[i];
  const rms = Math.sqrt(s / (samples.length / 4));
  r.seg.push(new Float32Array(samples)); r.segMs += (samples.length / r.rate) * 1000;
  if (rms > VOICE_RMS) { r.segVoice = true; r.lastVoiceAt = now; }
  if (!r.segVoice) { if (r.segMs > 4000) { r.seg = []; r.segMs = 0; } return; } // silence only: drop it, keep the buffer small
  const pause = now - r.lastVoiceAt >= SEG_SILENCE_MS;
  if ((pause && r.segMs >= SEG_MIN_MS) || r.segMs >= SEG_MAX_MS) micCut(true);
  else if (now - r.lastInterimAt >= INTERIM_MS && !r.interimBusy && r.segMs >= SEG_MIN_MS) micCut(false);
}
// Send the current piece: final = it ends here (a pause), provisional = still being spoken, resent later.
function micCut(final) {
  const r = rec;
  const wav = toWav16k(r.seg, r.rate);
  let seg = r.segs.find((x) => x.id === r.curId && !x.final);
  if (!seg) { seg = { id: r.nextId++, text: '', final: false }; r.segs.push(seg); r.curId = seg.id; }
  if (final) { seg.final = true; r.seg = []; r.segMs = 0; r.segVoice = false; r.curId = null; } else { r.lastInterimAt = Date.now(); r.interimBusy = true; }
  const prev = r.segs.filter((x) => x.final && x.id < seg.id && x.text).map((x) => x.text).join(' ').slice(-200);
  const run = ++seg.run || (seg.run = 1);
  r.inflight++;
  // fast=1: the small model for the provisional text; the final text of a piece uses the big one. The language (fr or
  // en, Ali's two) is picked on the first piece and then passed along for the whole dictation.
  fetch(`/api/transcribe?prompt=${encodeURIComponent(prev)}${final ? '' : '&fast=1'}${r.lang ? `&lang=${r.lang}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
    .then(async (res) => { const d = await res.json().catch(() => ({})); if (res.status === 401) { renderLogin(); throw new Error('login'); } if (!res.ok) throw new Error(d.error || `Error ${res.status}`); return d; })
    .then((d) => { if (!r.lang && d.language) r.lang = d.language; if (run === seg.run || final) seg.text = (d.text || '').trim(); micRender(r); })
    .catch((e) => { if (final) toast(e.message); })
    .finally(() => { r.inflight--; if (!final) r.interimBusy = false; if (!rec && r.inflight === 0 && r.done) r.done(); });
}
// Field = what was there + every piece in order (provisional ones included, so the text grows as he speaks).
function micRender(r) {
  const text = [r.base, ...r.segs.map((x) => x.text).filter(Boolean)].filter(Boolean).join(' ');
  dir.instruction = text;
  const ta = $(`#${r.field}`);
  if (ta && ta.value !== text) { ta.value = text; ta.scrollTop = ta.scrollHeight; }
}
async function micStop() {
  const r = rec; rec = null; clearInterval(r.timer);
  try { r.src.disconnect(); r.node.disconnect(); r.stream.getTracks().forEach((t) => t.stop()); await r.ctx.close(); } catch {}
  micPaint();
  if (r.segVoice && r.segMs >= 300) { rec = r; micCut(true); rec = null; } // the last piece, cut by the tap
  if (r.inflight) { toast('Finishing…'); await new Promise((ok) => { r.done = ok; setTimeout(ok, 20000); }); }
  micRender(r);
  const ta = $(`#${r.field}`); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  if (!r.segs.some((x) => x.text)) toast('Nothing heard');
}
// Float32 chunks at the device rate → 16 kHz mono 16-bit WAV (simple box-filter downsampling, fine for speech).
function toWav16k(chunks, rate) {
  let n = 0; for (const c of chunks) n += c.length;
  const all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = rate / 16000, len = Math.floor(all.length / ratio), out = new Int16Array(len);
  for (let i = 0; i < len; i++) { const a = Math.floor(i * ratio), b = Math.min(all.length, Math.max(a + 1, Math.floor((i + 1) * ratio))); let s = 0; for (let j = a; j < b; j++) s += all[j]; const v = Math.max(-1, Math.min(1, s / (b - a))); out[i] = v < 0 ? v * 32768 : v * 32767; }
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
  const str = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, out.length * 2, true);
  new Int16Array(buf, 44).set(out);
  return buf;
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { renderLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

try { history.scrollRestoration = 'manual'; } catch {}
// Where a conversation was opened from (home, Aujourd'hui, France TM): its back arrow returns there, not always home.
let cameFrom = '/';
const go = (path) => { if (/^\/t\//.test(path) && !/^\/t\//.test(location.pathname)) cameFrom = location.pathname; history.pushState(null, '', path); route(); };
const backHref = () => (/^\/(plan|tm)$/.test(cameFrom) ? cameFrom : '/');
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-nav]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });

// ── theme: auto (system) / light / dark, remembered on this device ───────────
const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
const getTheme = () => { try { return THEMES.includes(localStorage.getItem('theme')) ? localStorage.getItem('theme') : 'auto'; } catch { return 'auto'; } };
function applyTheme(t) { if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('theme', t); } catch {} $('meta[name=theme-color]')?.setAttribute('content', (t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0e1113' : '#0f766e'); }
const themeButton = () => `<button id="theme" class="small">${THEME_LABEL[getTheme()]}</button>`;
const bindTheme = () => { const b = $('#theme'); if (b) b.onclick = () => { const t = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]; applyTheme(t); b.textContent = THEME_LABEL[t]; }; };
applyTheme(getTheme());

// ── login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `<div class="login card"><h1>Wati Inbox</h1>
    <form id="lf"><input name="password" type="password" placeholder="Password" autocomplete="current-password"><div class="row"><button class="primary">Sign in</button><span id="le" class="err"></span></div></form></div>`;
  $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/login', { method: 'POST', body: { password: e.target.password.value } }); route(); } catch (err) { $('#le').textContent = err.message; } };
}

// ── push ─────────────────────────────────────────────────────────────────────
const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return /iPhone|iPad/.test(navigator.userAgent) && !standalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return 'off';
  const { endpoints } = await api('/api/push');
  return endpoints.includes(sub.endpoint) ? 'on' : 'off';
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refused');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/api/push');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }));
  await api('/api/push', { method: 'POST', body: sub.toJSON() });
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/api/push', { method: 'DELETE', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
}
async function pushButton() {
  const s = await pushState();
  const label = { on: 'Notifications: on', off: 'Turn on notifications', blocked: 'Notifications blocked (settings)', 'needs-install': 'Notifications: add the app to your home screen', unsupported: 'Notifications unavailable' }[s];
  return `<button id="pb" class="small" data-state="${s}" ${s === 'blocked' || s === 'unsupported' || s === 'needs-install' ? 'disabled' : ''}>${label}</button>`;
}
function bindPush() {
  const b = $('#pb'); if (!b) return;
  b.onclick = async () => { b.disabled = true; try { b.dataset.state === 'on' ? await disablePush() : await enablePush(); } catch (e) { toast(e.message); } route(); };
}
const setBadge = (n) => { try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {} };

// ── inbox ────────────────────────────────────────────────────────────────────
let inboxFilter = '';
const suggPill = (t) => t.suggesting === 'drafting' || t.suggesting === 'queued' ? '<span class="pill work">Claude is drafting…</span>' : t.suggested === 'needs' ? '<span class="pill warn">Claude has a question</span>' : t.suggested ? '<span class="pill ready">draft ready</span>' : '';
let inboxCache = null;
async function renderInbox({ fromCache = false } = {}) {
  const { threads, tm, tbc = [], salesHub = '', plan = null } = fromCache && inboxCache ? inboxCache : (inboxCache = await api('/api/inbox'));
  const q = inboxFilter.trim().toLowerCase();
  const shown = q ? threads.filter((t) => (t.name || '').toLowerCase().includes(q) || t.wa_id.includes(q.replace(/\D/g, '') || '§')) : threads;
  const pending = shown.filter((t) => t.pending && !t.muted), done = shown.filter((t) => !t.pending || t.muted);
  setBadge(threads.filter((t) => t.pending && !t.muted).length);
  const row = (t) => `<a class="card lead-row" data-nav href="/t/${t.wa_id}">${t.pending && !t.muted ? '<span class="dot"></span>' : ''}<div class="who"><div class="name">${esc(t.name || t.wa_id)}${t.country === 'Switzerland' ? '<span class="pill">CHF</span>' : ''}${t.muted ? '<span class="pill">muted</span>' : ''}${suggPill(t)} <span class="muted small">${t.last_inbound_at ? ago(t.last_inbound_at) : ''}</span></div><div class="txt">${esc(t.last_text)}</div></div>${t.hoursSinceLead != null ? windowBadge(t.windowOpen, t.hoursSinceLead) : ''}</a>`;
  const digits = q.replace(/\D/g, '');
  const direct = /^\d{8,15}$/.test(digits) && !threads.some((t) => t.wa_id === digits) ? `<a class="card lead-row" data-nav href="/t/${digits}"><div class="who"><div class="name">Open +${digits}</div></div></a>` : '';
  const hub = tbc.length ? `<p class="section">Sales Hub: to handle (${tbc.length})</p>${tbc.map((a) => `<a class="card lead-row tbc-row ${a.state}" data-nav href="/t/${a.wa_id}"><div class="who"><div class="name">${esc(a.name || a.wa_id)} <span class="pill ${a.state === 'paused' ? 'ready' : 'warn'}">${a.state === 'paused' ? 'paused · follow-up to send' : 'to pause'}</span></div><div class="txt">${esc(a.tpl)} at ${fmtTime(a.fires_at)}: ${esc(a.why || '')}</div></div></a>`).join('')}${salesHub ? `<a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Open the Sales Hub ↗</a>` : ''}` : '';
  const planCard = plan ? `<a class="card plan-home" data-nav href="/plan"><div class="who"><div class="name">Today${plan.todo ? ` <span class="pill warn">${plan.todo} to handle</span>` : ''}${plan.followups ? ` <span class="pill ready">${plan.followups} follow-up${plan.followups > 1 ? 's' : ''}</span>` : ''}${!plan.todo && !plan.followups ? ' <span class="pill">nothing to do</span>' : ''}</div><div class="txt">${plan.next?.length ? plan.next.map((i) => `${esc(i.name || i.wa_id)} · ${esc(i.title)}`).join(' | ') : `${plan.waits} waiting · ${plan.oks} template${plan.oks > 1 ? 's' : ''} fine · ${plan.done} done`}</div></div><span class="chev">›</span></a>` : '';
  app.innerHTML = `<header><h1>Wati Inbox${pending.length ? ` <span class="pill">${pending.length}</span>` : ''}</h1><a data-nav href="/tm" class="tmlink">France TM${tm?.unseen ? ` <span class="pill warn">${tm.unseen}</span>` : ''}</a><button id="rf" class="small">↻</button></header>
    <input class="search" id="q" placeholder="Name or number" value="${esc(inboxFilter)}" inputmode="search">${direct}
    ${planCard}${plan ? '' : hub}
    ${pending.length ? `<p class="section">To answer (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Nothing waiting</p>'}
    ${done.length ? `<p class="section">Answered (${done.length})</p>${done.map(row).join('')}` : ''}
    <div class="row foot">${await pushButton()}${themeButton()}</div>`;
  $('#rf').onclick = route; bindPush(); bindTheme();
  $('#q').oninput = (e) => { inboxFilter = e.target.value; const pos = e.target.selectionStart; renderInbox({ fromCache: true }).then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); }); };
}

// ── thread ───────────────────────────────────────────────────────────────────
let composer = '', composerFrom = null, lastThreadKey = '', threadBusy = false, openedWaId = '', tbcTemplateAlert = null, laterEdit = null, draftEdit = null, steerOpen = false; // draftEdit / laterEdit = arrays of bubbles being edited in place, one field each
const emptyDir = () => ({ moves: [], level: '', level2: '', until: '', instruction: '' });
let dir = emptyDir(), offerOpen = false, offerDraft = null, threadTimer = null, dirs = null;
const loadDirs = async () => (dirs ||= await api('/api/directions'));
const chip = (name, id, label, on) => `<button type="button" class="chip ${on ? 'sel' : ''}" data-${name}="${esc(id)}">${esc(label)}</button>`;
async function sendBubbles(waId, bubbles, meta = {}) {
  if (!bubbles.length) return false;
  const r = await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles, ...meta } });
  composer = ''; composerFrom = null;
  toast(r.total > 1 ? `Bubble 1/${r.total} sent, the others follow by themselves` : 'Sent');
  return true;
}
function scrollToLast() {
  const th = $('.thread'); if (!th) return;
  const last = th.lastElementChild; if (!last) return;
  const y = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 120;
  window.scrollTo(0, Math.max(0, y));
}
const typing = () => /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName || '');
// Two taps for anything that reaches the lead: first arms, second sends.
function armed(btn, label, fn) {
  if (!btn) return;
  let t;
  btn.onclick = () => {
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('on'); return fn(); }
    btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm'; btn.classList.add('on');
    t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('on'); }, 3500);
  };
}
const fillComposer = (text, from) => { composer = text; composerFrom = from; const ta = $('#tx'); if (ta) { ta.value = composer; $('#send').disabled = false; ta.focus(); ta.scrollIntoView({ block: 'center' }); } };

async function renderThread(waId, { quiet = false } = {}) {
  if (quiet && typing()) return; // Ali is writing: a redraw would close the keyboard
  const d = await api(`/api/thread/${waId}`);
  if (!location.pathname.startsWith(`/t/${waId}`)) return; // he left the screen while we were loading
  const t = d.thread;
  const st = d.suggesting;
  threadBusy = !!st && (st.state === 'queued' || st.state === 'drafting');
  const sending = d.sending;
  const key = `${d.messages.length}|${d.messages[d.messages.length - 1]?.id}|${d.suggestion?.id}|${d.suggestion?.edited ? JSON.stringify(d.suggestion.edited).length : 0}|${st?.state}|${t.pending}|${t.muted}|${sending?.sent}|${sending?.error}|${d.learning?.state}|${d.lastLesson?.id}|${d.scheduled?.at}|${d.scheduledMissed?.id}|${d.offerText}|${d.tbc?.alert?.id}|${d.tbc?.alert?.state}|${d.tbc?.next?.tpl}|${d.plan?.id}|${d.plan?.state}|${(d.plans || []).map((i) => i.id).join(',')}|${d.hub?.next?.template}|${d.hub?.paused}`;
  clearTimeout(threadTimer);
  if (d.stale || (sending && !sending.error) || d.scheduled) threadTimer = setTimeout(() => renderThread(waId, { quiet: true }).catch(() => {}), d.scheduled && !d.stale && !sending ? 15000 : 3000);
  if (quiet && key === lastThreadKey) return;
  lastThreadKey = key;
  const sameScreen = openedWaId === waId, y = window.scrollY;
  let lastDay = '';
  const msgs = d.messages.map((m) => { const day = fmtDay(m.at); const h = (day !== lastDay ? `<div class="day">${day}</div>` : '') + `<div class="msg ${m.who}${m.tpl ? ' tpl' : ''}">${esc(m.text)}<time>${fmtTime(m.at)}${m.tpl ? ' · automated' : ''}</time></div>`; lastDay = day; return h; }).join('');
  const ctx = [t.stage && `<b>${esc(t.stage)}</b>`, t.meeting && `meeting ${esc(t.meeting)}`, t.country && `${esc(t.country)}${t.country === 'Switzerland' ? ' · <b>CHF</b>' : ''}`, d.offerText && `offer: ${esc(d.offerText)}`].filter(Boolean).join(' · ');
  // orig = Claude's draft (what the learning compares with); o = what is shown and sent: Ali's saved edit when there is one.
  const sug = d.suggestion, opts = sug?.options || [], orig = opts[0] || null;
  const o = orig ? { ...orig, bubbles: sug.edited?.bubbles || orig.bubbles, later: sug.edited?.later || orig.later || [] } : null;
  const sendLock = !!sending && !sending.error;
  const D = d.windowOpen ? await loadDirs() : null;
  const has = (id) => dir.moves.includes(id);
  const od = offerDraft || d.offer || { format: '', level: '', hpw: '', months: '' };
  const tb = d.tbc || {}, al = null; // the old Sales Hub alert card is retired (2026-10-01): the day plan replaced it

  // Sales Hub: the next automatic step, and the alert card when a step must be paused first.
  const hubLink = tb.salesHub ? `<a class="small" href="${esc(tb.salesHub)}" target="_blank" rel="noopener">Open the Sales Hub ↗</a>` : '';
  const hb = d.hub, pl = d.plan;
  const nx = hb ? (hb.realNext || hb.next) : null; // the Hub's `next` can be a step Ali unticked: prefer the first step still ahead
  const hubLine = hb ? `<div class="ctx">Sales Hub: <b>${esc(hb.status || '?')}</b>${hb.paused ? ' · <b>paused</b>' : ''}${nx ? ` · next <b>${nx.step ? `#${nx.step} ` : ''}${esc(nx.template)}</b> ${Date.parse(nx.at) < Date.now() - 3600e3 ? '<span class="warn">(date passed)</span>' : `${fmtDay(nx.at)} ${fmtTime(nx.at)}`}${hb.paused ? ' (will not be sent)' : ''}` : ' · no template scheduled'}${hb.citf?.momentLocal ? ` · CITF ${esc(String(hb.citf.momentLocal).slice(0, 10))}${hb.citf.case ? ` (${esc(hb.citf.case)})` : ''}` : ''}</div>` : '';
  const nextLine = hb ? hubLine : tb.next && !al ? `<div class="ctx">Next automated: <b>${esc(tb.next.tpl)}</b> at ${fmtTime(tb.next.firesAt)}${tb.leadWaiting ? ' (skipped until you reply)' : ''}</div>` : '';
  const planBox = (d.plans?.length ? d.plans : pl ? [pl] : []).map((i) => planCardHtml(i, { inThread: true, salesHub: tb.salesHub })).join(''); // every open card of the lead: the Hub action and the next steps
  const tbcBox = al ? `<div class="card tbc ${al.state}">
      <div class="opt-head">Sales Hub · ${esc(al.tpl)} leaves at ${fmtTime(al.fires_at)} (${fmtLeft(al.fires_at)})</div>
      <p class="small">${esc(al.why || '')}</p>
      <div class="row"><b class="small">1.</b> ${al.state === 'paused' ? '<span class="ok small">Paused (confirmed by you)</span>' : `<button class="primary small" id="tbcpaused">I paused it in the Sales Hub</button>`}${hubLink}<button class="small" id="tbcignore">${al.state === 'paused' ? 'Close' : 'Let it go'}</button></div>
      ${!al.window_open ? `<div class="row"><b class="small">2.</b> <span class="small">Window closed, template <b>${esc(tb.closedTemplate?.name || '')}</b> « ${esc(tb.closedTemplate?.text || '')} »</span>${al.state === 'paused' ? `<button class="primary small" id="tbctpl">Prepare this template</button>` : ''}</div>`
        : al.bubbles?.length ? `<div class="row"><b class="small">2.</b> <span class="small">Follow-up${al.state === 'paused' ? '' : ' <span class="warn">(after the pause)</span>'}</span></div>
      <div class="opt ${al.state === 'paused' ? '' : 'locked'}">${al.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span>${al.state === 'paused' ? `<button class="small" data-tbccopy="${j}">Copy</button>` : ''}</div>`).join('')}
      ${al.state === 'paused' && d.windowOpen ? `<div class="acts"><button class="primary small" id="tbcsend" ${sendLock ? 'disabled' : ''}>Envoyer</button><button class="small" id="tbcuse">Modifier</button></div>` : ''}</div>` : ''}
    </div>` : '';

  // Claude: drafting / needs one thing from Ali / nothing to answer / the draft.
  let claude = '';
  if (threadBusy) claude = `<div class="card work"><span class="busy-dot"></span>Claude is drafting… <span class="muted small">${esc(st.direction || '')}</span></div>`;
  else if (st?.state === 'error') claude = `<div class="card"><span class="err">Draft failed: ${esc(st.error)}</span> <button class="small" id="retry">Retry</button></div>`;
  else if (sug && sug.kind === 'needs') claude = `<div class="card needs"><div class="opt-head">Claude needs one detail</div><p>${esc(sug.needs || sug.note || '')}</p>
      ${/offre|format|niveau|heures|h\/sem|appel/i.test(sug.needs || '') ? offerBoxHtml(D, od, d, true) : ''}
      <textarea id="needs" placeholder="Your answer">${esc(dir.instruction)}</textarea>
      <div class="row"><button class="primary" id="needsgo">Draft</button>${micHtml('needs')}${sug.why ? `<span class="muted small">${esc(sug.why)}</span>` : ''}</div></div>`;
  // "Nothing to answer": one tap sends a single emoji as the reply (Wati's API has no WhatsApp reaction, Ali 2026-10-01).
  else if (sug && sug.kind === 'skip') claude = `<div class="card"><span class="muted small">Claude: nothing to answer. ${esc(sug.why || '')}</span> <button class="small" id="anyway">Draft anyway</button>
      ${d.windowOpen ? `<div class="emojis" style="margin-top:8px">${['🙏', '👍', '😊', '🎉', '💪', '✅'].map((e) => `<button class="small" data-react="${e}" type="button" title="Send ${e} as the reply">${e}</button>`).join('')}<span class="muted small">· sends the emoji as a message</span></div>` : ''}</div>`;
  else if (o && o.bubbles?.length) {
    // Editing = one field per bubble; each field is still its own WhatsApp message when sent.
    // Editing (Ali, 2026-10-01): emojis go into the bubble being edited; Save keeps the edit as the draft itself, on
    // every device, so he sends from here, never through the composer below. Claude's original stays for the learning.
    const emojiRow = `<div class="emojis">${EMOJIS.map((e) => `<button class="small" data-emojie="${e}" type="button">${e}</button>`).join('')}</div>`;
    const fields = (arr, tag) => emojiRow + arr.map((b, j) => `<div class="eb"><textarea data-${tag}="${j}" rows="2">${esc(b)}</textarea><button class="small" data-${tag}del="${j}" title="Remove this bubble">×</button></div>`).join('') + `<button class="small" data-${tag}add>+ bubble</button>`;
    const editedTag = (part) => sug.edited?.[part] ? ' · <b>edited by you</b>' : '';
    claude = `<div class="card opt">
        <div class="opt-head">${o.later?.length ? 'Now' : 'Draft'} <span class="muted">· ${sug.source === 'auto' ? 'Claude chose' : sug.source === 'plan' ? 'from today’s plan' : 'on your steer'}${sug.instruction ? ` · ${esc(sug.instruction)}` : ''}${editedTag('bubbles')}</span></div>
        ${sug.note ? `<p class="note small">${esc(sug.note)}</p>` : ''}
        ${draftEdit == null ? o.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span></div>`).join('') : fields(draftEdit, 'eb')}
        <div class="acts">${draftEdit != null ? `<button class="primary small" data-ebsave>Save</button>` : ''}${d.windowOpen ? `<button class="${draftEdit == null ? 'primary ' : ''}small" data-send="0" ${sendLock ? 'disabled' : ''}>${draftEdit == null ? 'Send' : 'Send these bubbles'}</button><button class="small" data-use="0">${draftEdit == null ? 'Edit' : 'Cancel'}</button>${draftEdit == null ? `<button class="small ${steerOpen ? 'on' : ''}" id="redo">Redo</button>` : ''}` : ''}${draftEdit == null && sug.edited?.bubbles ? `<button class="small" data-ebreset>Claude’s version</button>` : ''}</div>
        ${o.later?.length && d.windowOpen && draftEdit == null && laterEdit == null && !d.scheduled ? `<div class="acts"><button class="small" id="sendall" ${sendLock ? 'disabled' : ''}>Send all · part 2 in 7 min</button></div>` : ''}
        ${o.why ? `<details><summary>Why</summary>${esc(o.why)}</details>` : ''}
      </div>`
      + (o.later?.length ? `<div class="card opt later">
        <div class="opt-head">In 5-10 min <span class="muted">· the good news from the administration${d.thread?.last_inbound_at && sug.created_at < d.thread.last_inbound_at ? ' · the lead wrote since, step 2 still to send' : ''}${editedTag('later')}</span></div>
        ${laterEdit == null ? o.later.map((b, j) => `<div class="b"><span>${esc(b)}</span></div>`).join('') : fields(laterEdit, 'lb')}
        <div class="acts">${laterEdit != null ? `<button class="primary small" data-lbsave>Save</button>` : ''}${d.windowOpen ? `<button class="${laterEdit == null ? 'primary ' : ''}small" data-sendlater="0" ${d.scheduled ? 'disabled' : ''}>Schedule in 7 min</button><button class="small" data-sendlaternow="0" ${sendLock ? 'disabled' : ''}>Send now</button>` : ''}<button class="small" id="laterEdit">${laterEdit == null ? 'Edit' : 'Cancel'}</button></div>
      </div>` : '');
  }
  const learnLine = d.learning && (d.learning.state === 'waiting' || d.learning.state === 'learning') ? '<p class="muted small learn">Claude is noting what you sent…</p>'
    : d.learning?.state === 'error' ? `<p class="err small">Lesson not saved: ${esc(d.learning.error)}</p>`
    : d.lastLesson && (!sug || d.lastLesson.at >= sug.created_at) ? `<p class="muted small learn">Learned ${ago(d.lastLesson.at)}: ${d.lastLesson.kind === 'confirmed' ? 'draft sent as is' : d.lastLesson.kind === 'lesson' ? `lesson: ${esc(d.lastLesson.title || '')}` : d.lastLesson.kind === 'minor' ? 'small edit noted' : 'nothing to keep'}</p>` : '';
  const schedBox = d.scheduled ? `<div class="card sending">Second part in ${fmtLeft(d.scheduled.at)}: « ${esc(d.scheduled.bubbles[0].slice(0, 80))}… » <button class="small" id="cancelsched">Cancel</button></div>` : '';
  // A delayed send the app could not make (it was down at the time): never silent (Boris, 2026-10-03).
  const missedBox = d.scheduledMissed ? `<div class="card sending failed"><b>Part 2 was NOT sent</b> at ${fmtTime(d.scheduledMissed.at)}: the app was not running. Send it by hand from the « In 5-10 min » card below, or dismiss.<div class="acts"><button class="small" id="missedseen">Dismiss</button></div></div>` : '';
  const sendBox = sending ? `<div class="card sending ${sending.error ? 'failed' : ''}">${sending.error ? esc(sending.error) : `Sending ${sending.sent}/${sending.total}`}</div>` : '';

  // Steering Claude (folded): the initial offer, the moves, a free consigne.
  const steerBody = d.windowOpen ? `${offerBoxHtml(D, od, d, false)}
      <div class="chips">${D.moves.map((m) => chip('mv', m.id, m.label, has(m.id))).join('')}</div>
      ${has('downsell') ? `<div class="chips">${D.downsell.map((x) => chip('lvl', x.id, x.label, dir.level === x.id)).join('')}</div>` : ''}
      ${has('acompte') ? `<div class="chips">${D.acompte.map((a) => chip('lvl2', a, `${a} ${d.currency || '€'}`, dir.level2 === a)).join('')}</div>` : ''}
      ${has('delai') ? `<input id="until" placeholder="Until when? (e.g. tomorrow 12h)" value="${esc(dir.until)}" style="margin-bottom:8px">` : ''}
      <textarea id="ins" placeholder="Note for Claude (optional)">${esc(dir.instruction)}</textarea>
      <div class="row"><button id="go" class="primary">Draft</button>${micHtml('ins')}<span class="muted small">Nothing ticked = Claude chooses</span></div>` : '';
  // With a draft on screen (Ali, 2026-10-02): « Redo » sits next to Edit and opens the panel right under the draft.
  const hasDraft = !!(o && o.bubbles?.length && !threadBusy);
  const steer = !d.windowOpen ? '' : hasDraft ? (steerOpen ? `<div class="card" id="steer"><div class="opt-head">Redo the draft <span class="muted">· steer Claude</span></div>${steerBody}</div>` : '')
    : `<details class="card fold" id="steer" ${steerOpen ? 'open' : ''}><summary>Ask for a draft <span class="muted small">· steer Claude</span></summary>${steerBody}</details>`;
  const tplBox = `<input id="tplq" placeholder="Filter"><select id="tpl" style="margin-top:8px"><option value="">Loading…</option></select><div id="tplv" class="muted small" style="margin-top:8px;white-space:pre-wrap"></div><div id="tplp"></div><div class="row"><button class="primary" id="sendt" disabled>Send the template</button><span id="stt"></span></div>`;
  const compose = d.windowOpen
    ? `<div class="card"><div class="emojis">${EMOJIS.map((e) => `<button class="small" data-emoji="${e}" type="button">${e}</button>`).join('')}</div><textarea id="tx" placeholder="Your message. An empty line separates two bubbles">${esc(composer)}</textarea><div class="row"><button class="primary" id="send" ${composer.trim() && !sendLock ? '' : 'disabled'}>Send</button><span id="st"></span></div></div>
       <details class="card fold"><summary>Send a template</summary>${tplBox}</details>`
    : `<div class="card"><p class="muted small">${d.messages.length ? '24h window closed: only a template can be sent.' : 'No conversation on the Sales number: a template can be sent.'}</p>${tplBox}</div>`;

  app.innerHTML = `<header><a data-nav href="${backHref()}">‹</a><h1>${esc(t.name || waId)} <button class="icon" id="copynum" title="Copy +${waId}" aria-label="Copy the number">${COPY_ICON}</button></h1>${windowBadge(d.windowOpen, d.hoursSinceLead ?? 24)}<button id="hd" class="small ${t.pending ? 'primary' : ''}" ${t.pending ? '' : 'disabled'}>${t.pending ? 'Handled' : 'Handled ✓'}</button></header>
    ${ctx ? `<div class="ctx">${ctx}</div>` : ''}${nextLine}
    <div class="thread">${msgs}</div>
    ${planBox}${tbcBox}${sendBox}${missedBox}${schedBox}${claude}${hasDraft ? steer : ''}${learnLine}${compose}${hasDraft ? '' : steer}`;
  if (sameScreen) window.scrollTo(0, y); else { openedWaId = waId; scrollToLast(); requestAnimationFrame(scrollToLast); }

  // Copy the lead's number from the header icon (Ali, 2026-10-03: the icon instead of the number itself).
  if ($('#copynum')) $('#copynum').onclick = async () => { const b = $('#copynum'); try { await navigator.clipboard.writeText(`+${waId}`); b.classList.add('done'); toast('Number copied'); } catch { toast(`+${waId}`); } setTimeout(() => b.classList.remove('done'), 1400); };
  const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
  const askClaude = async (body) => { try { await api(`/api/thread/${waId}/suggest`, { method: 'POST', body }); toast('Claude is drafting, about a minute'); steerOpen = false; laterEdit = null; draftEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); } };
  // Sales Hub card
  if (al) {
    const tbcAct = async (action) => { try { await api(`/api/thread/${waId}/tbc`, { method: 'POST', body: { id: al.id, action } }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); } };
    if ($('#tbcpaused')) armed($('#tbcpaused'), 'I paused it in the Sales Hub', () => tbcAct('paused'));
    if ($('#tbcignore')) $('#tbcignore').onclick = () => tbcAct('ignore');
    document.querySelectorAll('[data-tbccopy]').forEach((b) => b.onclick = () => copyText(al.bubbles[Number(b.dataset.tbccopy)], b));
    if ($('#tbcsend')) armed($('#tbcsend'), 'Send', async () => { $('#tbcsend').disabled = true; try { await sendBubbles(waId, al.bubbles, { alertId: al.id, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); $('#tbcsend').disabled = false; } });
    if ($('#tbctpl')) $('#tbctpl').onclick = () => { const sel = $('#tpl'); if (!sel) return; tbcTemplateAlert = al.id; const det = sel.closest('details'); if (det) det.open = true; sel.value = tb.closedTemplate.name; sel.dispatchEvent(new Event('change')); sel.scrollIntoView({ block: 'center' }); toast('Template ready, check then send'); };
    if ($('#tbcuse')) $('#tbcuse').onclick = () => fillComposer(al.bubbles.join('\n\n'), { alertId: al.id });
  }
  // Claude cards
  if ($('#retry')) $('#retry').onclick = () => askClaude({ moves: [], instruction: '' });
  if ($('#anyway')) $('#anyway').onclick = () => askClaude({ moves: [], instruction: 'Réponds quand même, brièvement' });
  document.querySelectorAll('[data-react]').forEach((b) => armed(b, b.dataset.react, async () => { b.disabled = true; try { await sendBubbles(waId, [b.dataset.react], { suggestionId: sug.id, option: 0, reaction: true }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  if ($('#needsgo')) $('#needsgo').onclick = async () => { const txt = $('#needs').value.trim(); if (!txt && !offerDraft) { toast('Type the detail Claude asked for'); return; } try { if (offerDraft?.format) await saveOffer(waId); } catch (e) { toast(e.message); return; } askClaude({ moves: [], instruction: txt }); };
  if ($('#needs')) $('#needs').oninput = (e) => { dir.instruction = e.target.value; };
  bindMic();
  // one field per bubble while editing: read them back in order, drop the empty ones
  const readFields = (tag) => [...document.querySelectorAll(`textarea[data-${tag}]`)].map((ta) => ta.value.trim()).filter(Boolean);
  const bindFields = (tag, get, set) => {
    // Enter while editing = Save (like editing a message in Slack); Shift+Enter keeps a line break. Enter never sends.
    document.querySelectorAll(`textarea[data-${tag}]`).forEach((ta) => { ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $(`[data-${tag}save]`)?.click(); } }; });
    document.querySelectorAll(`textarea[data-${tag}]`).forEach((ta) => { ta.oninput = () => { get()[Number(ta.dataset[tag])] = ta.value; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }; ta.style.height = ta.scrollHeight + 'px'; });
    document.querySelectorAll(`[data-${tag}del]`).forEach((b) => b.onclick = () => { const arr = get(); arr.splice(Number(b.dataset[`${tag}del`]), 1); set(arr.length ? arr : ['']); redraw(); });
    const add = $(`[data-${tag}add]`); if (add) add.onclick = () => { set([...get(), '']); redraw(); };
  };
  const draftBubbles = () => draftEdit == null ? o.bubbles : readFields('eb');
  const sameAsDraft = (arr) => !!orig && arr.length === orig.bubbles.length && arr.every((x, i) => x === orig.bubbles[i].trim()); // against Claude's version: that is what the learning wants to know
  document.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { draftEdit = draftEdit == null ? o.bubbles.slice() : null; redraw(); });
  bindFields('eb', () => draftEdit, (v) => { draftEdit = v; });
  // Save = the edit becomes the draft (server side, every device); "Claude's version" = back to the original.
  const saveEdit = async (part, arr) => { if (!arr.length) { toast('No bubble'); return; } try { await api(`/api/thread/${waId}/edit`, { method: 'POST', body: { suggestionId: sug.id, [part]: arr } }); toast('Saved'); if (part === 'bubbles') draftEdit = null; else laterEdit = null; redraw(); } catch (e) { toast(e.message); } };
  if ($('[data-ebsave]')) $('[data-ebsave]').onclick = () => saveEdit('bubbles', readFields('eb'));
  if ($('[data-lbsave]')) $('[data-lbsave]').onclick = () => saveEdit('later', readFields('lb'));
  if ($('[data-ebreset]')) $('[data-ebreset]').onclick = async () => { try { await api(`/api/thread/${waId}/edit`, { method: 'POST', body: { suggestionId: sug.id, bubbles: [] } }); redraw(); } catch (e) { toast(e.message); } };
  // Emojis while editing: into the bubble last touched (or the first one), at the cursor.
  let lastEditTa = null;
  document.querySelectorAll('textarea[data-eb], textarea[data-lb]').forEach((ta) => { ta.addEventListener('focus', () => { lastEditTa = ta; }); });
  document.querySelectorAll('[data-emojie]').forEach((b) => b.onclick = () => { const row = b.closest('.card'); const ta = (lastEditTa && row.contains(lastEditTa)) ? lastEditTa : row.querySelector('textarea[data-eb], textarea[data-lb]'); if (!ta) return; const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emojie + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emojie.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
  document.querySelectorAll('[data-send]').forEach((b) => armed(b, draftEdit == null ? 'Send' : 'Send these bubbles', async () => { const bubbles = draftBubbles(); if (!bubbles.length) { toast('No bubble'); return; } b.disabled = true; try { await sendBubbles(waId, bubbles, { suggestionId: sug.id, option: 0, edited: !sameAsDraft(bubbles) }); draftEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  // the second block: same editing, then scheduled or sent with the edited bubbles
  const laterBubbles = () => laterEdit == null ? o.later : readFields('lb');
  if ($('#laterEdit')) $('#laterEdit').onclick = () => { laterEdit = laterEdit == null ? o.later.slice() : null; redraw(); };
  bindFields('lb', () => laterEdit, (v) => { laterEdit = v; });
  document.querySelectorAll('[data-sendlater]').forEach((b) => armed(b, 'Schedule in 7 min', async () => { const bubbles = laterBubbles(); if (!bubbles.length) { toast('Second part is empty'); return; } b.disabled = true; try { await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles, suggestionId: sug.id, option: 0, part: 'later', delayMs: 7 * 60_000 } }); toast('The Mac will send it in 7 min'); laterEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  document.querySelectorAll('[data-sendlaternow]').forEach((b) => armed(b, 'Send now', async () => { const bubbles = laterBubbles(); if (!bubbles.length) { toast('Second part is empty'); return; } b.disabled = true; try { await sendBubbles(waId, bubbles, { suggestionId: sug.id, option: 0, part: 'later' }); laterEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  if ($('#redo')) $('#redo').onclick = () => { steerOpen = !steerOpen; redraw(); if (steerOpen) requestAnimationFrame(() => $('#steer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  // Both parts at once: part 2 is put on the Mac's 7-min timer first (a send in progress blocks new requests), then part 1 leaves.
  armed($('#sendall'), 'Send all · part 2 in 7 min', async () => {
    const now = draftBubbles(), later = laterBubbles(); if (!now.length || !later.length) { toast('A part is empty'); return; }
    $('#sendall').disabled = true;
    try { await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles: later, suggestionId: sug.id, option: 0, part: 'later', delayMs: 7 * 60_000 } }); }
    catch (e) { toast(e.message); $('#sendall').disabled = false; return; }
    try { await sendBubbles(waId, now, { suggestionId: sug.id, option: 0, edited: !sameAsDraft(now) }); toast('Part 1 sent, part 2 leaves in 7 min'); }
    catch (e) { await api(`/api/thread/${waId}/cancel`, { method: 'POST' }).catch(() => {}); toast(`Not sent, part 2 cancelled: ${e.message}`); }
    lastThreadKey = ''; route();
  });
  if ($('#missedseen')) $('#missedseen').onclick = async () => { await api(`/api/thread/${waId}/missed-seen`, { method: 'POST' }); redraw(); };
  if ($('#cancelsched')) $('#cancelsched').onclick = async () => { await api(`/api/thread/${waId}/cancel`, { method: 'POST' }); toast('Second part cancelled'); redraw(); };
  // steering panel
  if (d.windowOpen) {
    const det = $('details#steer'); if (det) det.ontoggle = () => { steerOpen = det.open; };
    document.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => { const id = b.dataset.mv; dir.moves = has(id) ? dir.moves.filter((x) => x !== id) : [...dir.moves, id]; steerOpen = true; redraw(); });
    document.querySelectorAll('[data-lvl]').forEach((b) => b.onclick = () => { dir.level = dir.level === b.dataset.lvl ? '' : b.dataset.lvl; steerOpen = true; redraw(); });
    document.querySelectorAll('[data-lvl2]').forEach((b) => b.onclick = () => { dir.level2 = dir.level2 === b.dataset.lvl2 ? '' : b.dataset.lvl2; steerOpen = true; redraw(); });
    if ($('#until')) $('#until').oninput = (e) => { dir.until = e.target.value; };
    if ($('#ins')) $('#ins').oninput = (e) => { dir.instruction = e.target.value; };
    if ($('#go')) $('#go').onclick = async () => { if (has('downsell') && !dir.level) { toast('Downsell to what?'); return; } try { if (offerDraft?.format) await saveOffer(waId); } catch (e) { toast(e.message); return; } askClaude({ ...dir, instruction: dir.instruction.trim() }); };
    bindOffer(waId, d);
    document.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { const ta = $('#tx'); const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emoji + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emoji.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
    $('#tx').oninput = (e) => { composer = e.target.value; $('#send').disabled = !composer.trim() || sendLock; if (composerFrom) composerFrom.edited = composer !== (composerFrom.part === 'later' ? orig?.later : orig?.bubbles)?.join('\n\n'); };
    armed($('#send'), 'Send', async () => {
      const bubbles = splitBubbles($('#tx').value);
      if (!bubbles.length) return;
      $('#send').disabled = true; $('#st').textContent = 'Sending…';
      try { await sendBubbles(waId, bubbles, composerFrom ? { ...composerFrom, edited: composerFrom.edited ?? false } : {}); lastThreadKey = ''; route(); }
      catch (e) { $('#st').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#send').disabled = false; }
    });
  } else bindOffer(waId, d);
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); lastThreadKey = ''; route(); };
  bindPlanButtons(() => { lastThreadKey = ''; route(); });
  {
    const { templates } = await api('/api/templates');
    const sel = $('#tpl'); if (!sel) return;
    const fill = (q) => { const list = templates.filter((x) => !q || x.name.includes(q) || x.body.toLowerCase().includes(q)); sel.innerHTML = `<option value="">${list.length} templates</option>` + list.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join(''); };
    fill('');
    $('#tplq').oninput = (e) => fill(e.target.value.trim().toLowerCase());
    sel.onchange = () => {
      const x = templates.find((y) => y.name === sel.value); $('#sendt').disabled = !x;
      $('#tplv').textContent = x ? x.body : '';
      $('#tplp').innerHTML = x ? x.params.map((p) => `<input data-p="${esc(p)}" placeholder="${esc(p)}" value="${p === 'name' ? esc((t.name || '').split(' ')[0]) : ''}" style="margin-top:8px">`).join('') : '';
    };
    armed($('#sendt'), 'Send the template', async () => {
      const params = Object.fromEntries([...document.querySelectorAll('#tplp input')].map((i) => [i.dataset.p, i.value]));
      $('#sendt').disabled = true; $('#stt').textContent = 'Sending…';
      try { await api(`/api/thread/${waId}/template`, { method: 'POST', body: { template: sel.value, params, alertId: tbcTemplateAlert } }); tbcTemplateAlert = null; toast('Template sent'); lastThreadKey = ''; route(); }
      catch (e) { $('#stt').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#sendt').disabled = false; }
    });
  }
}

// The initial offer (what the lead was offered on the call), typed once per lead; every downsell is computed from it.
// Months from the product page's table (server: MONTHS), formula fallback for formats without a row.
function monthsOf(D, od) { const hours = parseInt(od.format, 10), hpw = Number(od.hpw); if (!hours || !hpw) return ''; return D?.months?.[hours]?.[hpw] ?? Math.ceil(hours / (hpw * 4.33)); }
function offerBoxHtml(D, od, d, forceOpen) {
  if (!D) return '';
  const open = forceOpen || offerOpen;
  return `<div class="offer"><div class="row" style="margin:0"><span class="small"><b>Initial offer</b>: ${d.offerText ? esc(d.offerText) : '<span class="warn">to fill in</span>'}</span>${forceOpen ? '' : `<button class="small" id="offerbtn">${open ? 'Close' : (d.offer ? 'Edit' : 'Fill in')}</button>`}</div>
    ${open ? `<div class="chips" style="margin-top:8px">${D.formats.map((f) => chip('fmt', f.id, f.label, od.format === f.id)).join('')}</div>
    <div class="chips">${D.levels.map((l) => chip('lvlobj', l, `→ ${l}`, od.level === l)).join('')}</div>
    <div class="chips">${[2, 3, 4, 5, 6, 7].map((h) => chip('hpw', String(h), `${h}h/week`, Number(od.hpw) === h)).join('')}</div>
    <div class="row">${od.format && od.hpw ? `<span class="small">≈ <b>${monthsOf(D, od)}</b> months</span>` : '<span class="muted small">months follow from the format and the hours/week</span>'}${forceOpen ? '' : `<button class="primary small" id="offersave">Save</button>`}${od.format && !forceOpen ? `<button class="small" id="offerclear">Clear</button>` : ''}</div>` : ''}</div>`;
}
async function saveOffer(waId) { if (!offerDraft) return; offerDraft.months = ''; await api(`/api/thread/${waId}/offer`, { method: 'POST', body: offerDraft }); offerOpen = false; offerDraft = null; }
function bindOffer(waId, d) {
  const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
  const ensure = () => { offerDraft ||= { ...(d.offer || { format: '', level: '', hpw: '', months: '' }) }; };
  if ($('#offerbtn')) $('#offerbtn').onclick = () => { offerOpen = !offerOpen; offerDraft = offerOpen ? { ...(d.offer || { format: '', level: '', hpw: '', months: '' }) } : null; steerOpen = true; redraw(); };
  document.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => { ensure(); offerDraft.format = b.dataset.fmt; offerDraft.months = ''; offerOpen = true; steerOpen = true; redraw(); });
  document.querySelectorAll('[data-lvlobj]').forEach((b) => b.onclick = () => { ensure(); offerDraft.level = offerDraft.level === b.dataset.lvlobj ? '' : b.dataset.lvlobj; offerOpen = true; steerOpen = true; redraw(); });
  document.querySelectorAll('[data-hpw]').forEach((b) => b.onclick = () => { ensure(); offerDraft.hpw = Number(b.dataset.hpw); offerDraft.months = ''; offerOpen = true; steerOpen = true; redraw(); });
  if ($('#offersave')) $('#offersave').onclick = async () => { if (!offerDraft?.format) { toast('Pick the format'); return; } try { await saveOffer(waId); toast('Offer saved'); redraw(); } catch (e) { toast(e.message); } };
  if ($('#offerclear')) $('#offerclear').onclick = async () => { await api(`/api/thread/${waId}/offer`, { method: 'POST', body: {} }); offerOpen = false; offerDraft = null; redraw(); };
}

// ── Aujourd'hui: the day plan written by Claude from the Sales Hub and the conversations ──
const KIND = { pause: ['To pause', 'bad'], resume: ['Resume automation', 'warn'], fix: ['To check', 'warn'], followup: ['Follow-up', 'good'], wait: ['Wait', ''], ok: ['Fine', 'ok'] };
const fmtWhen = (iso) => { if (!iso) return ''; const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? fmtTime(iso) : `${fmtDay(iso)} ${fmtTime(iso)}`; };
// The « Do » block of a plan card (Ali, 2026-10-03): one line per instruction, read at a glance — the Hub action,
// then every template to untick and to keep on its own line with its time. Nothing said twice: the mechanics come
// from skip/keep steps, Claude's `action` only adds what is not ticking (a message time, a status change).
function planDoHtml(i) {
  const step = (x) => `<b>${x.step ? `#${x.step} ` : ''}${esc(x.template)}</b>${x.at ? ` <span class="muted">${fmtWhen(x.at)}</span>` : ''}`;
  const list = (lbl, steps) => steps?.length ? `<div class="lines"><span class="lbl">${lbl}</span><div>${steps.map((x) => `<div>${step(x)}</div>`).join('')}</div></div>` : '';
  const extra = String(i.action || '').replace(/^Hub: (full pause|untick|lift the pause)[^·]*(· |$)/, '').trim(); // older cards carried the mechanics in the text
  const rows = [];
  if (i.kind === 'resume') { rows.push(`<div><span class="lbl">Hub</span><div>Lift the pause${i.hub_paused_now ? '' : ' <span class="ok">(the Hub shows it lifted)</span>'}</div></div>`); rows.push(list('Untick', i.skip_steps)); rows.push(list('Keep', i.keep_steps)); }
  else if (i.kind === 'pause' && i.pause_scope === 'next') { rows.push(list('Untick', i.skip_steps)); rows.push(`<div><span class="lbl"></span><div class="muted">the rest goes out normally</div></div>`); if (i.hub_paused_now) rows.push(`<div><span class="lbl">Hub</span><div class="ok">shows this lead as paused</div></div>`); }
  else if (i.kind === 'pause') rows.push(`<div><span class="lbl">Hub</span><div>Full pause${i.hub_next && i.hub_next_at ? `, before <b>${esc(i.hub_next)}</b> <span class="muted">${fmtWhen(i.hub_next_at)}</span>` : ''}${i.hub_paused_now ? ' <span class="ok">(the Hub shows it paused)</span>' : ''}</div></div>`);
  if (extra) rows.push(`<div><span class="lbl">${i.kind === 'pause' || i.kind === 'resume' ? 'Then' : 'Do'}</span><div>${esc(extra)}</div></div>`);
  return rows.filter(Boolean).length ? `<div class="do small">${rows.filter(Boolean).join('')}</div>` : '';
}
function planCardHtml(i, { inThread = false, salesHub = '' } = {}) {
  let [label, cls] = KIND[i.kind] || ['', ''];
  if (i.kind === 'pause') label = i.pause_scope === 'next' ? `Untick ${i.skip_templates?.length > 1 ? i.skip_templates.length + ' templates' : '1 template'}` : 'Full pause';
  const open = i.state === 'open';
  return `<div class="card plan ${i.kind} ${i.state}" data-plan="${i.id}">
    <div class="flag-head"><span><span class="pill ${cls}">${label}</span>${i.when_at ? ` <b class="small">${fmtWhen(i.when_at)}</b>` : ''}${!open ? ` <span class="muted small">· ${{ done: 'done', dismissed: 'done differently', replied: 'lead replied', expired: 'expired', superseded: 'replaced' }[i.state] || i.state}</span>` : ''}</span>${i.hub_next && i.kind !== 'followup' ? `<span class="muted small">${esc(i.hub_next)}${i.hub_next_at ? ` ${fmtWhen(i.hub_next_at)}` : ''}</span>` : ''}</div>
    ${inThread ? '' : `<a class="flag-who" data-nav href="/t/${i.wa_id}">${esc(i.name || i.wa_id)} · +${i.wa_id}</a>`}
    <div class="flag-title">${esc(i.title)}</div>
    ${planDoHtml(i)}
    ${i.why ? `<div class="muted small why">${esc(i.why)}</div>` : ''}
    ${i.template ? `<div class="small">Template: <b>${esc(i.template)}</b></div>` : ''}
    ${i.bubbles?.length && !inThread ? `<div class="opt">${i.bubbles.map((b) => `<div class="b"><span>${esc(b)}</span></div>`).join('')}</div>` : i.bubbles?.length ? '<div class="muted small">The draft is below, ready to send</div>' : ''}
    ${open ? `<div class="acts"><button class="small primary" data-plandone="${i.id}">Done</button><button class="small" data-plandismiss="${i.id}">I did it differently</button><button class="small" data-plancopy="+${i.wa_id}">Copy number</button>${salesHub ? `<a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Sales Hub ↗</a>` : ''}${!inThread ? `<a class="small" data-nav href="/t/${i.wa_id}">Open</a>` : ''}</div>` : `<div class="acts"><button class="small" data-planreopen="${i.id}">Reopen</button></div>`}
  </div>`;
}
function bindPlanButtons(after) {
  document.querySelectorAll('[data-plandone]').forEach((b) => b.onclick = async () => { await api(`/api/plan/${b.dataset.plandone}`, { method: 'POST', body: { state: 'done' } }); after(); });
  document.querySelectorAll('[data-planreopen]').forEach((b) => b.onclick = async () => { await api(`/api/plan/${b.dataset.planreopen}`, { method: 'POST', body: { state: 'open' } }); after(); });
  document.querySelectorAll('[data-planignore]').forEach((b) => b.onclick = async () => { if (!confirm('No more cards for this lead, for good?')) return; await api('/api/plan/ignore', { method: 'POST', body: { waId: b.dataset.planignore } }); toast('Lead removed from the plan'); after(); });
  // "I did it differently" (Ali, 2026-10-01): what he did instead is required, it is what the next judgements learn from.
  document.querySelectorAll('[data-plandismiss]').forEach((b) => b.onclick = async () => { const note = (prompt('What did you do instead, and why? Claude learns from it') ?? '').trim(); if (!note) return; await api(`/api/plan/${b.dataset.plandismiss}`, { method: 'POST', body: { state: 'dismissed', note } }); toast('Noted, Claude will learn from it'); after(); });
  document.querySelectorAll('[data-plancopy]').forEach((b) => b.onclick = () => copyText(b.dataset.plancopy, b));
}
async function renderPlan() {
  const { items, counts, status, hub, salesHub, citf = [], tomorrow = [] } = await api('/api/plan');
  const running = status.state === 'running';
  const open = items.filter((i) => i.state === 'open'), closed = items.filter((i) => i.state !== 'open' && i.state !== 'superseded');
  const sec = (title, list) => list.length ? `<p class="section">${title} (${list.length})</p>${list.map((i) => planCardHtml(i, { salesHub })).join('')}` : '';
  const byTime = (a, b) => String(a.when_at || a.hub_next_at || '9').localeCompare(String(b.when_at || b.hub_next_at || '9'));
  // Urgency first: a template to untick or a follow-up due within 3 h, then the rest of today, then older leads (meeting > 3 days ago, stuck or finished sequences) folded.
  const soon = Date.now() + 3 * 3600e3, dueAt = (i) => Date.parse(i.when_at || i.hub_next_at || 0) || 0;
  const act = open.filter((i) => i.kind !== 'ok' && i.kind !== 'wait');
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const live = (i) => dueAt(i) && dueAt(i) >= Date.now() - 3600e3; // a date more than an hour in the past is stale, not urgent
  const todo = act.filter((i) => live(i) && dueAt(i) <= soon).sort(byTime); // a deadline within 3 h wins over age
  const later = act.filter((i) => !todo.includes(i) && ((live(i) && dueAt(i) <= endOfDay.getTime()) || i.recent)).sort(byTime);
  const older = act.filter((i) => !todo.includes(i) && !later.includes(i)).sort(byTime);
  const wait = open.filter((i) => i.kind === 'wait').sort(byTime), ok = open.filter((i) => i.kind === 'ok');
  app.innerHTML = `<header><a data-nav href="/">‹</a><h1>Today <span class="muted small">${fmtDay(new Date().toISOString())}</span></h1><button id="replan" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Claude is reviewing…' : 'Replan'}</button></header>
    <p class="muted small">${status.ready ? `Sales Hub read ${hub.leadsAt ? ago(hub.leadsAt) : 'never'}${hub.error ? ` · <span class="err">${esc(hub.error)}</span>` : ''} · ${status.last ? `plan ${ago(status.last.at)}` : 'no plan yet'} · ${status.calls}/${status.max} reviews today` : 'Sales Hub not connected (SALES_HUB_TOKEN)'}${status.last?.summary ? `<br>${esc(status.last.summary)}` : ''}</p>
    ${citf.length ? `<p class="muted small">Resuming today (CITF): ${citf.map((c) => `<a data-nav href="/t/${c.wa_id}">${esc(c.name)}</a> ${fmtTime(c.at)}${c.case ? ` (${esc(c.case)})` : ''}${c.passed ? ' · sent' : ''}`).join(' · ')}</p>` : ''}
    ${!open.length && !closed.length ? '<p class="muted center">Nothing for today</p>' : ''}
    ${sec('Now', todo)}${sec('Later today', later)}${sec('Waiting', wait)}
    ${tomorrow.length ? `<details class="card fold" data-fold="tomorrow" ${planFolds.has('tomorrow') ? 'open' : ''}><summary>Tomorrow (${tomorrow.length}) <span class="muted small">· next steps already planned</span></summary>${tomorrow.sort(byTime).map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${older.length ? `<details class="card fold" data-fold="older" ${planFolds.has('older') ? 'open' : ''}><summary>Older (${older.length}) <span class="muted small">· finished or stuck sequences, when you have a moment</span></summary>${older.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${ok.length ? `<details class="card fold" data-fold="ok" ${planFolds.has('ok') ? 'open' : ''}><summary>Templates that fit (${ok.length})</summary>${ok.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${closed.length ? `<details class="card fold" data-fold="done" ${planFolds.has('done') ? 'open' : ''}><summary>Done (${closed.length})</summary>${closed.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${salesHub ? `<p class="center"><a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Open the Sales Hub ↗</a></p>` : ''}`;
  // The folded sections stay as Ali left them across refreshes (Done tapped, 45 s tick).
  document.querySelectorAll('[data-fold]').forEach((d) => { d.ontoggle = () => { d.open ? planFolds.add(d.dataset.fold) : planFolds.delete(d.dataset.fold); }; });
  $('#replan').onclick = async () => { $('#replan').disabled = true; try { await api('/api/plan/run', { method: 'POST' }); toast('Claude is reviewing every lead, 2 to 5 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 2000); };
  bindPlanButtons(route);
}
const planFolds = new Set();

// ── France TM: what Claude flagged on the booking bot ─────────────────────────
let tmOpen = new Set();
async function renderTm() {
  const { flags, status } = await api('/api/tm');
  const dismissed = flags.filter((f) => f.verdict === 'not_issue'), fresh = flags.filter((f) => !f.seen && !f.verdict), old = flags.filter((f) => f.seen && !f.verdict);
  const card = (f) => `<div class="card flag ${f.kind}" data-id="${f.id}"><div class="flag-head"><span class="pill ${f.verdict ? '' : f.kind === 'erreur' ? 'bad' : 'good'}">${f.verdict ? 'Not an error' : f.kind === 'erreur' ? 'Error' : 'Improvement'}</span><span class="muted small">${ago(f.at)}</span></div>
    <div class="flag-who">+${f.wa_id}${f.name ? ` · ${esc(f.name)}` : ''}</div>
    <div class="flag-title">${esc(f.title)}</div>
    ${f.detail ? `<div class="small">${esc(f.detail)}</div>` : ''}${f.quote ? `<div class="quote small">« ${esc(f.quote)} »</div>` : ''}
    <div class="acts"><button class="small" data-thread="${f.wa_id}">${tmOpen.has(f.wa_id) ? 'Hide conversation' : 'View conversation'}</button>${f.verdict ? `<button class="small" data-notissue="${f.id}" data-v="0">Restore</button>` : `<button class="small" data-seen="${f.id}" data-v="${f.seen ? 0 : 1}">${f.seen ? 'Reopen' : 'Seen'}</button><button class="small" data-notissue="${f.id}" data-v="1">Not an error</button>`}</div>
    <div class="tmthread" id="tmt-${f.wa_id}-${f.id}"></div></div>`;
  const running = status.state === 'running';
  app.innerHTML = `<header><a data-nav href="/">‹</a><h1>France TM <span class="muted small">booking bot</span></h1><button id="rv" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Reviewing…' : 'Review now'}</button></header>
    ${status.last ? `<p class="muted small">Last review ${ago(status.last.at)}: ${status.last.threads} conversation(s), ${status.last.flags} flag(s)${status.last.maxPerDay ? ` · ${status.last.runsToday}/${status.last.maxPerDay} today` : ''}${status.error ? ` <span class="err">Error: ${esc(status.error)}</span>` : ''}</p>` : ''}
    ${fresh.length ? fresh.map(card).join('') : '<p class="muted center">Nothing to review</p>'}
    ${old.length ? `<details class="card fold"><summary>Seen (${old.length})</summary>${old.map(card).join('')}</details>` : ''}
    ${dismissed.length ? `<details class="card fold"><summary>Not an error (${dismissed.length}) <span class="muted small">· Claude no longer flags these</span></summary>${dismissed.map(card).join('')}</details>` : ''}`;
  $('#rv').onclick = async () => { $('#rv').disabled = true; try { await api('/api/tm/review', { method: 'POST' }); toast('Review started, 1 to 2 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 1500); };
  document.querySelectorAll('[data-seen]').forEach((b) => b.onclick = async () => { await api(`/api/tm/flag/${b.dataset.seen}`, { method: 'POST', body: { seen: b.dataset.v === '1' } }); route(); });
  document.querySelectorAll('[data-notissue]').forEach((b) => b.onclick = async () => { await api(`/api/tm/flag/${b.dataset.notissue}`, { method: 'POST', body: { notIssue: b.dataset.v === '1' } }); toast(b.dataset.v === '1' ? 'Noted: Claude will not flag this again' : 'Flag restored'); route(); });
  document.querySelectorAll('[data-thread]').forEach((b) => b.onclick = async () => {
    const wa = b.dataset.thread, box = b.closest('.flag').querySelector('.tmthread');
    if (tmOpen.has(wa) && box.innerHTML) { tmOpen.delete(wa); box.innerHTML = ''; b.textContent = 'View conversation'; return; }
    tmOpen.add(wa); b.textContent = 'Hide conversation';
    const { messages } = await api(`/api/tm/thread/${wa}`);
    box.innerHTML = `<div class="thread">${messages.map((m) => `<div class="msg ${m.who === 'BOT' ? 'US' : 'LEAD'}">${esc(m.text)}<time>${fmtDay(m.at)} ${fmtTime(m.at)}${m.who === 'BOT' ? ' · bot' : ''}</time></div>`).join('')}</div>`;
  });
}

// ── router ───────────────────────────────────────────────────────────────────
let lastRoutedPath = null;
async function route() {
  const m = /^\/t\/(\d+)/.exec(location.pathname);
  if (!m || m[1] !== openedWaId) { composer = ''; composerFrom = null; dir = emptyDir(); offerOpen = false; offerDraft = null; lastThreadKey = ''; threadBusy = false; laterEdit = null; draftEdit = null; steerOpen = false; tbcTemplateAlert = null; clearTimeout(threadTimer); if (!m) openedWaId = ''; }
  document.body.classList.add('busy');
  // Scroll to the top only when arriving on a page; a refresh of the same page (Done tapped, 45 s tick) keeps the
  // position and the open sections (Ali, 2026-10-01: "it gets me on top and closes the accordion").
  const samePage = location.pathname === lastRoutedPath; lastRoutedPath = location.pathname;
  const y = window.scrollY;
  try { m ? await renderThread(m[1]) : location.pathname === '/tm' ? await renderTm() : location.pathname === '/plan' ? await renderPlan() : await renderInbox(); if (!m) { if (samePage) requestAnimationFrame(() => window.scrollTo(0, y)); else window.scrollTo(0, 0); } }
  catch (e) { if (e.message !== 'login') app.innerHTML = `<header><a data-nav href="/">‹</a></header><p class="err">${esc(e.message)}</p>`; }
  finally { document.body.classList.remove('busy'); }
}
route();
// Background refresh while the app is on screen: open thread every 30 s (every 8 s while Claude is drafting), inbox every minute.
let ticks = 0;
setInterval(() => { if (document.visibilityState !== 'visible') return; ticks++; const m = /^\/t\/(\d+)/.exec(location.pathname); if (m && (threadBusy || ticks % 4 === 0)) renderThread(m[1], { quiet: true }).catch(() => {}); }, 8_000);
setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/' && !typing()) route(); }, 60_000);
setInterval(() => { if (document.visibilityState === 'visible' && (location.pathname === '/tm' || location.pathname === '/plan') && !typing()) route(); }, 45_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const m = /^\/t\/(\d+)/.exec(location.pathname); m ? renderThread(m[1], { quiet: true }).catch(() => {}) : route(); } });
