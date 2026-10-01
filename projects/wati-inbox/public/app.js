// Wati Inbox client: inbox (/), thread (/t/<waId>), France TM (/tm). Login, push, theme, Claude drafts.
// Rebuilt 2026-09-30: drafts arrive by themselves when a lead writes; the screen shows one thing at a time.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const left = (h) => { const r = 24 - h; return r < 1 ? `${Math.max(1, Math.round(r * 60))} min` : `${Math.floor(r)} h`; };
const windowBadge = (open, h) => open ? `<span class="badge ${24 - h < 2 ? 'soon' : 'open'}">${left(h)} restantes</span>` : '<span class="badge closed">fermée · template</span>';
const fmtLeft = (iso) => { const s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000)); return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`; };
let toastTimer;
const toast = (msg) => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800); };
const splitBubbles = (text) => String(text || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copié' : 'Échec'; btn.classList.toggle('done', ok); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
  toast(ok ? 'Copié' : 'Copie impossible ici');
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { renderLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}

try { history.scrollRestoration = 'manual'; } catch {}
const go = (path) => { history.pushState(null, '', path); route(); };
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-nav]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });

// ── theme: auto (system) / light / dark, remembered on this device ───────────
const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'Thème : auto', light: 'Thème : clair', dark: 'Thème : sombre' };
const getTheme = () => { try { return THEMES.includes(localStorage.getItem('theme')) ? localStorage.getItem('theme') : 'auto'; } catch { return 'auto'; } };
function applyTheme(t) { if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('theme', t); } catch {} $('meta[name=theme-color]')?.setAttribute('content', (t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0e1113' : '#0f766e'); }
const themeButton = () => `<button id="theme" class="small">${THEME_LABEL[getTheme()]}</button>`;
const bindTheme = () => { const b = $('#theme'); if (b) b.onclick = () => { const t = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]; applyTheme(t); b.textContent = THEME_LABEL[t]; }; };
applyTheme(getTheme());

// ── login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `<div class="login card"><h1>Wati Inbox</h1>
    <form id="lf"><input name="password" type="password" placeholder="Mot de passe" autocomplete="current-password"><div class="row"><button class="primary">Entrer</button><span id="le" class="err"></span></div></form></div>`;
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
  if (perm !== 'granted') throw new Error('Notifications refusées');
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
  const label = { on: 'Notifications : activées', off: 'Activer les notifications', blocked: 'Notifications bloquées (réglages)', 'needs-install': "Notifications : ajoutez l'app à l'écran d'accueil", unsupported: 'Notifications indisponibles' }[s];
  return `<button id="pb" class="small" data-state="${s}" ${s === 'blocked' || s === 'unsupported' || s === 'needs-install' ? 'disabled' : ''}>${label}</button>`;
}
function bindPush() {
  const b = $('#pb'); if (!b) return;
  b.onclick = async () => { b.disabled = true; try { b.dataset.state === 'on' ? await disablePush() : await enablePush(); } catch (e) { toast(e.message); } route(); };
}
const setBadge = (n) => { try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {} };

// ── inbox ────────────────────────────────────────────────────────────────────
let inboxFilter = '';
const suggPill = (t) => t.suggesting === 'drafting' || t.suggesting === 'queued' ? '<span class="pill work">Claude rédige…</span>' : t.suggested === 'needs' ? '<span class="pill warn">question de Claude</span>' : t.suggested ? '<span class="pill ready">brouillon prêt</span>' : '';
let inboxCache = null;
async function renderInbox({ fromCache = false } = {}) {
  const { threads, tm, tbc = [], salesHub = '', plan = null } = fromCache && inboxCache ? inboxCache : (inboxCache = await api('/api/inbox'));
  const q = inboxFilter.trim().toLowerCase();
  const shown = q ? threads.filter((t) => (t.name || '').toLowerCase().includes(q) || t.wa_id.includes(q.replace(/\D/g, '') || '§')) : threads;
  const pending = shown.filter((t) => t.pending && !t.muted), done = shown.filter((t) => !t.pending || t.muted);
  setBadge(threads.filter((t) => t.pending && !t.muted).length);
  const row = (t) => `<a class="card lead-row" data-nav href="/t/${t.wa_id}">${t.pending && !t.muted ? '<span class="dot"></span>' : ''}<div class="who"><div class="name">${esc(t.name || t.wa_id)}${t.country === 'Switzerland' ? '<span class="pill">CHF</span>' : ''}${t.muted ? '<span class="pill">silencieux</span>' : ''}${suggPill(t)} <span class="muted small">${t.last_inbound_at ? ago(t.last_inbound_at) : ''}</span></div><div class="txt">${esc(t.last_text)}</div></div>${t.hoursSinceLead != null ? windowBadge(t.windowOpen, t.hoursSinceLead) : ''}</a>`;
  const digits = q.replace(/\D/g, '');
  const direct = /^\d{8,15}$/.test(digits) && !threads.some((t) => t.wa_id === digits) ? `<a class="card lead-row" data-nav href="/t/${digits}"><div class="who"><div class="name">Ouvrir +${digits}</div></div></a>` : '';
  const hub = tbc.length ? `<p class="section">Sales Hub — à traiter (${tbc.length})</p>${tbc.map((a) => `<a class="card lead-row tbc-row ${a.state}" data-nav href="/t/${a.wa_id}"><div class="who"><div class="name">${esc(a.name || a.wa_id)} <span class="pill ${a.state === 'paused' ? 'ready' : 'warn'}">${a.state === 'paused' ? 'en pause · relance à envoyer' : 'à mettre en pause'}</span></div><div class="txt">${esc(a.tpl)} à ${fmtTime(a.fires_at)} — ${esc(a.why || '')}</div></div></a>`).join('')}${salesHub ? `<a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Ouvrir le Sales Hub ↗</a>` : ''}` : '';
  const planCard = plan ? `<a class="card plan-home" data-nav href="/plan"><div class="who"><div class="name">Aujourd’hui${plan.todo ? ` <span class="pill warn">${plan.todo} à régler</span>` : ''}${plan.followups ? ` <span class="pill ready">${plan.followups} relance${plan.followups > 1 ? 's' : ''}</span>` : ''}${!plan.todo && !plan.followups ? ' <span class="pill">rien à faire</span>' : ''}</div><div class="txt">${plan.next?.length ? plan.next.map((i) => `${esc(i.name || i.wa_id)} · ${esc(i.title)}`).join(' — ') : `${plan.waits} à attendre · ${plan.oks} template${plan.oks > 1 ? 's' : ''} qui collent · ${plan.done} fait${plan.done > 1 ? 's' : ''}`}</div></div><span class="chev">›</span></a>` : '';
  app.innerHTML = `<header><h1>Wati Inbox${pending.length ? ` <span class="pill">${pending.length}</span>` : ''}</h1><a data-nav href="/tm" class="tmlink">France TM${tm?.unseen ? ` <span class="pill warn">${tm.unseen}</span>` : ''}</a><button id="rf" class="small">↻</button></header>
    <input class="search" id="q" placeholder="Nom ou numéro" value="${esc(inboxFilter)}" inputmode="search">${direct}
    ${planCard}${plan ? '' : hub}
    ${pending.length ? `<p class="section">À répondre (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Rien en attente</p>'}
    ${done.length ? `<p class="section">Répondu (${done.length})</p>${done.map(row).join('')}` : ''}
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
  toast(r.total > 1 ? `Bulle 1/${r.total} envoyée, les suivantes partent seules` : 'Envoyé');
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
    btn.dataset.armed = '1'; btn.textContent = 'Confirmer ?'; btn.classList.add('on');
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
  const key = `${d.messages.length}|${d.messages[d.messages.length - 1]?.id}|${d.suggestion?.id}|${st?.state}|${t.pending}|${t.muted}|${sending?.sent}|${sending?.error}|${d.learning?.state}|${d.lastLesson?.id}|${d.scheduled?.at}|${d.offerText}|${d.tbc?.alert?.id}|${d.tbc?.alert?.state}|${d.tbc?.next?.tpl}|${d.plan?.id}|${d.plan?.state}|${d.hub?.next?.template}|${d.hub?.paused}`;
  clearTimeout(threadTimer);
  if (d.stale || (sending && !sending.error) || d.scheduled) threadTimer = setTimeout(() => renderThread(waId, { quiet: true }).catch(() => {}), d.scheduled && !d.stale && !sending ? 15000 : 3000);
  if (quiet && key === lastThreadKey) return;
  lastThreadKey = key;
  const sameScreen = openedWaId === waId, y = window.scrollY;
  let lastDay = '';
  const msgs = d.messages.map((m) => { const day = fmtDay(m.at); const h = (day !== lastDay ? `<div class="day">${day}</div>` : '') + `<div class="msg ${m.who}${m.tpl ? ' tpl' : ''}">${esc(m.text)}<time>${fmtTime(m.at)}${m.tpl ? ' · automatique' : ''}</time></div>`; lastDay = day; return h; }).join('');
  const ctx = [t.stage && `<b>${esc(t.stage)}</b>`, t.meeting && `entretien ${esc(t.meeting)}`, t.country && `${esc(t.country)}${t.country === 'Switzerland' ? ' · <b>CHF</b>' : ''}`, d.offerText && `offre : ${esc(d.offerText)}`].filter(Boolean).join(' · ');
  const sug = d.suggestion, opts = sug?.options || [], o = opts[0] || null;
  const sendLock = !!sending && !sending.error;
  const D = d.windowOpen ? await loadDirs() : null;
  const has = (id) => dir.moves.includes(id);
  const od = offerDraft || d.offer || { format: '', level: '', hpw: '', months: '' };
  const tb = d.tbc || {}, al = tb.alert;

  // Sales Hub: the next automatic step, and the alert card when a step must be paused first.
  const hubLink = tb.salesHub ? `<a class="small" href="${esc(tb.salesHub)}" target="_blank" rel="noopener">Ouvrir le Sales Hub ↗</a>` : '';
  const hb = d.hub, pl = d.plan;
  const nx = hb ? (hb.realNext || hb.next) : null; // the Hub's `next` can be a step Ali unticked: prefer the first step still ahead
  const hubLine = hb ? `<div class="ctx">Sales Hub : <b>${esc(hb.status || '?')}</b>${hb.paused ? ' · <b>en pause</b>' : ''}${nx ? ` · prochain <b>${nx.step ? `#${nx.step} ` : ''}${esc(nx.template)}</b> ${Date.parse(nx.at) < Date.now() - 3600e3 ? '<span class="warn">(date passée)</span>' : `${fmtDay(nx.at)} ${fmtTime(nx.at)}`}${hb.paused ? ' (ne partira pas)' : ''}` : ' · plus de template prévu'}${hb.citf?.momentLocal ? ` · CITF ${esc(String(hb.citf.momentLocal).slice(0, 10))}${hb.citf.case ? ` (${esc(hb.citf.case)})` : ''}` : ''}</div>` : '';
  const nextLine = hb ? hubLine : tb.next && !al ? `<div class="ctx">Prochain automatique : <b>${esc(tb.next.tpl)}</b> à ${fmtTime(tb.next.firesAt)}${tb.leadWaiting ? ' (sauté tant que vous n’avez pas répondu)' : ''}</div>` : '';
  const planBox = pl ? planCardHtml(pl, { inThread: true, salesHub: tb.salesHub }) : '';
  const tbcBox = al ? `<div class="card tbc ${al.state}">
      <div class="opt-head">Sales Hub · ${esc(al.tpl)} part à ${fmtTime(al.fires_at)} (${fmtLeft(al.fires_at)})</div>
      <p class="small">${esc(al.why || '')}</p>
      <div class="row"><b class="small">1.</b> ${al.state === 'paused' ? '<span class="ok small">En pause (confirmé par vous)</span>' : `<button class="primary small" id="tbcpaused">J’ai mis en pause dans le Sales Hub</button>`}${hubLink}<button class="small" id="tbcignore">${al.state === 'paused' ? 'Fermer' : 'Laisser partir'}</button></div>
      ${!al.window_open ? `<div class="row"><b class="small">2.</b> <span class="small">Fenêtre fermée — template <b>${esc(tb.closedTemplate?.name || '')}</b> « ${esc(tb.closedTemplate?.text || '')} »</span>${al.state === 'paused' ? `<button class="primary small" id="tbctpl">Préparer ce template</button>` : ''}</div>`
        : al.bubbles?.length ? `<div class="row"><b class="small">2.</b> <span class="small">Relance${al.state === 'paused' ? '' : ' <span class="warn">(après la pause)</span>'}</span></div>
      <div class="opt ${al.state === 'paused' ? '' : 'locked'}">${al.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span>${al.state === 'paused' ? `<button class="small" data-tbccopy="${j}">Copier</button>` : ''}</div>`).join('')}
      ${al.state === 'paused' && d.windowOpen ? `<div class="acts"><button class="primary small" id="tbcsend" ${sendLock ? 'disabled' : ''}>Envoyer</button><button class="small" id="tbcuse">Modifier</button></div>` : ''}</div>` : ''}
    </div>` : '';

  // Claude: drafting / needs one thing from Ali / nothing to answer / the draft.
  let claude = '';
  if (threadBusy) claude = `<div class="card work"><span class="busy-dot"></span>Claude rédige… <span class="muted small">${esc(st.direction || '')}</span></div>`;
  else if (st?.state === 'error') claude = `<div class="card"><span class="err">Brouillon raté : ${esc(st.error)}</span> <button class="small" id="retry">Réessayer</button></div>`;
  else if (sug && sug.kind === 'needs') claude = `<div class="card needs"><div class="opt-head">Claude a besoin d’une précision</div><p>${esc(sug.needs || sug.note || '')}</p>
      ${/offre|format|niveau|heures|h\/sem|appel/i.test(sug.needs || '') ? offerBoxHtml(D, od, d, true) : ''}
      <textarea id="needs" placeholder="Votre précision">${esc(dir.instruction)}</textarea>
      <div class="row"><button class="primary" id="needsgo">Rédiger</button>${sug.why ? `<span class="muted small">${esc(sug.why)}</span>` : ''}</div></div>`;
  else if (sug && sug.kind === 'skip') claude = `<div class="card"><span class="muted small">Claude : rien à répondre — ${esc(sug.why || '')}</span> <button class="small" id="anyway">Rédiger quand même</button></div>`;
  else if (o && o.bubbles?.length) {
    // Editing = one field per bubble; each field is still its own WhatsApp message when sent.
    const fields = (arr, tag) => arr.map((b, j) => `<div class="eb"><textarea data-${tag}="${j}" rows="2">${esc(b)}</textarea><button class="small" data-${tag}del="${j}" title="Supprimer cette bulle">×</button></div>`).join('') + `<button class="small" data-${tag}add>+ bulle</button>`;
    claude = `<div class="card opt">
        <div class="opt-head">${o.later?.length ? 'Maintenant' : 'Brouillon'} <span class="muted">· ${sug.source === 'auto' ? 'Claude a choisi' : 'sur votre cap'}${sug.instruction ? ` · ${esc(sug.instruction)}` : ''}</span></div>
        ${sug.note ? `<p class="note small">${esc(sug.note)}</p>` : ''}
        ${draftEdit == null ? o.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copy="${j}">Copier</button></div>`).join('') : fields(draftEdit, 'eb')}
        <div class="acts">${d.windowOpen ? `<button class="primary small" data-send="0" ${sendLock ? 'disabled' : ''}>${draftEdit == null ? 'Envoyer' : 'Envoyer ces bulles'}</button><button class="small" data-use="0">${draftEdit == null ? 'Modifier' : 'Annuler'}</button>` : ''}<button class="small" data-copyall="0">Tout copier</button></div>
        ${o.why ? `<details><summary>Pourquoi</summary>${esc(o.why)}</details>` : ''}
      </div>`
      + (o.later?.length ? `<div class="card opt later">
        <div class="opt-head">Dans 5-10 min <span class="muted">· la bonne nouvelle de l’administration</span></div>
        ${laterEdit == null ? o.later.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copyl="${j}">Copier</button></div>`).join('') : fields(laterEdit, 'lb')}
        <div class="acts">${d.windowOpen ? `<button class="primary small" data-sendlater="0" ${d.scheduled ? 'disabled' : ''}>Programmer dans 7 min</button><button class="small" data-sendlaternow="0" ${sendLock ? 'disabled' : ''}>Envoyer maintenant</button>` : ''}<button class="small" id="laterEdit">${laterEdit == null ? 'Modifier' : 'Annuler'}</button><button class="small" data-copyalll="0">Tout copier</button></div>
      </div>` : '');
  }
  const learnLine = d.learning && (d.learning.state === 'waiting' || d.learning.state === 'learning') ? '<p class="muted small learn">Claude note ce que vous avez envoyé…</p>'
    : d.learning?.state === 'error' ? `<p class="err small">Leçon non notée : ${esc(d.learning.error)}</p>`
    : d.lastLesson && (!sug || d.lastLesson.at >= sug.created_at) ? `<p class="muted small learn">Appris ${ago(d.lastLesson.at)} : ${d.lastLesson.kind === 'confirmed' ? 'brouillon validé tel quel' : d.lastLesson.kind === 'lesson' ? `leçon — ${esc(d.lastLesson.title || '')}` : d.lastLesson.kind === 'minor' ? 'retouche notée' : 'rien à retenir'}</p>` : '';
  const schedBox = d.scheduled ? `<div class="card sending">Second temps dans ${fmtLeft(d.scheduled.at)} — « ${esc(d.scheduled.bubbles[0].slice(0, 80))}… » <button class="small" id="cancelsched">Annuler</button></div>` : '';
  const sendBox = sending ? `<div class="card sending ${sending.error ? 'failed' : ''}">${sending.error ? esc(sending.error) : `Envoi ${sending.sent}/${sending.total}`}</div>` : '';

  // Steering Claude (folded): the initial offer, the moves, a free consigne.
  const steer = d.windowOpen ? `<details class="card fold" id="steer" ${steerOpen ? 'open' : ''}><summary>${o ? 'Refaire le brouillon' : 'Demander un brouillon'} <span class="muted small">· orienter Claude</span></summary>
      ${offerBoxHtml(D, od, d, false)}
      <div class="chips">${D.moves.map((m) => chip('mv', m.id, m.label, has(m.id))).join('')}</div>
      ${has('downsell') ? `<div class="chips">${D.downsell.map((x) => chip('lvl', x.id, x.label, dir.level === x.id)).join('')}</div>` : ''}
      ${has('acompte') ? `<div class="chips">${D.acompte.map((a) => chip('lvl2', a, `${a} ${d.currency || '€'}`, dir.level2 === a)).join('')}</div>` : ''}
      ${has('delai') ? `<input id="until" placeholder="Jusqu’à quand ? (ex. demain 12h)" value="${esc(dir.until)}" style="margin-bottom:8px">` : ''}
      <textarea id="ins" placeholder="Précision pour Claude (facultatif)">${esc(dir.instruction)}</textarea>
      <div class="row"><button id="go" class="primary">Rédiger</button><span class="muted small">Rien coché = Claude choisit</span></div>
    </details>` : '';
  const tplBox = `<input id="tplq" placeholder="Filtrer"><select id="tpl" style="margin-top:8px"><option value="">Chargement…</option></select><div id="tplv" class="muted small" style="margin-top:8px;white-space:pre-wrap"></div><div id="tplp"></div><div class="row"><button class="primary" id="sendt" disabled>Envoyer le template</button><span id="stt"></span></div>`;
  const compose = d.windowOpen
    ? `<div class="card"><div class="emojis">${['😊', '👍', '😁', '🙂', '🙏', '💪', '✅', '🚀', '🎉', '😉'].map((e) => `<button class="small" data-emoji="${e}" type="button">${e}</button>`).join('')}</div><textarea id="tx" placeholder="Votre message — une ligne vide sépare deux bulles">${esc(composer)}</textarea><div class="row"><button class="primary" id="send" ${composer.trim() && !sendLock ? '' : 'disabled'}>Envoyer</button><button id="clr" class="small">Effacer</button><span id="st"></span></div></div>
       <details class="card fold"><summary>Envoyer un template</summary>${tplBox}</details>`
    : `<div class="card"><p class="muted small">${d.messages.length ? 'Fenêtre de 24h fermée : seul un template peut partir.' : 'Aucune conversation sur le numéro Sales : un template peut partir.'}</p>${tplBox}</div>`;

  app.innerHTML = `<header><a data-nav href="/">‹</a><h1>${esc(t.name || waId)} <span class="muted small">+${waId}</span></h1>${windowBadge(d.windowOpen, d.hoursSinceLead ?? 24)}<button id="hd" class="small ${t.pending ? 'primary' : ''}" ${t.pending ? '' : 'disabled'}>${t.pending ? 'Traité' : 'Traité ✓'}</button><button id="rf" class="small">↻</button></header>
    ${ctx ? `<div class="ctx">${ctx}</div>` : ''}${nextLine}
    <div class="thread">${msgs}</div>
    ${planBox}${tbcBox}${sendBox}${schedBox}${claude}${learnLine}${compose}${steer}
    <div class="row foot"><button id="mute" class="small">${t.muted ? 'Notifier à nouveau' : 'Ne plus notifier'}</button></div>`;
  if (sameScreen) window.scrollTo(0, y); else { openedWaId = waId; scrollToLast(); requestAnimationFrame(scrollToLast); }

  const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
  const askClaude = async (body) => { try { await api(`/api/thread/${waId}/suggest`, { method: 'POST', body }); toast('Claude rédige, environ une minute'); steerOpen = false; laterEdit = null; draftEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); } };
  // Sales Hub card
  if (al) {
    const tbcAct = async (action) => { try { await api(`/api/thread/${waId}/tbc`, { method: 'POST', body: { id: al.id, action } }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); } };
    if ($('#tbcpaused')) armed($('#tbcpaused'), 'J’ai mis en pause dans le Sales Hub', () => tbcAct('paused'));
    if ($('#tbcignore')) $('#tbcignore').onclick = () => tbcAct('ignore');
    document.querySelectorAll('[data-tbccopy]').forEach((b) => b.onclick = () => copyText(al.bubbles[Number(b.dataset.tbccopy)], b));
    if ($('#tbcsend')) armed($('#tbcsend'), 'Envoyer', async () => { $('#tbcsend').disabled = true; try { await sendBubbles(waId, al.bubbles, { alertId: al.id, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); $('#tbcsend').disabled = false; } });
    if ($('#tbctpl')) $('#tbctpl').onclick = () => { const sel = $('#tpl'); if (!sel) return; tbcTemplateAlert = al.id; const det = sel.closest('details'); if (det) det.open = true; sel.value = tb.closedTemplate.name; sel.dispatchEvent(new Event('change')); sel.scrollIntoView({ block: 'center' }); toast('Template prêt, vérifiez puis envoyez'); };
    if ($('#tbcuse')) $('#tbcuse').onclick = () => fillComposer(al.bubbles.join('\n\n'), { alertId: al.id });
  }
  // Claude cards
  if ($('#retry')) $('#retry').onclick = () => askClaude({ moves: [], instruction: '' });
  if ($('#anyway')) $('#anyway').onclick = () => askClaude({ moves: [], instruction: 'Réponds quand même, brièvement' });
  if ($('#needsgo')) $('#needsgo').onclick = async () => { const txt = $('#needs').value.trim(); if (!txt && !offerDraft) { toast('Écrivez la précision demandée'); return; } try { if (offerDraft?.format) await saveOffer(waId); } catch (e) { toast(e.message); return; } askClaude({ moves: [], instruction: txt }); };
  if ($('#needs')) $('#needs').oninput = (e) => { dir.instruction = e.target.value; };
  // one field per bubble while editing: read them back in order, drop the empty ones
  const readFields = (tag) => [...document.querySelectorAll(`textarea[data-${tag}]`)].map((ta) => ta.value.trim()).filter(Boolean);
  const bindFields = (tag, get, set) => {
    document.querySelectorAll(`textarea[data-${tag}]`).forEach((ta) => { ta.oninput = () => { get()[Number(ta.dataset[tag])] = ta.value; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }; ta.style.height = ta.scrollHeight + 'px'; });
    document.querySelectorAll(`[data-${tag}del]`).forEach((b) => b.onclick = () => { const arr = get(); arr.splice(Number(b.dataset[`${tag}del`]), 1); set(arr.length ? arr : ['']); redraw(); });
    const add = $(`[data-${tag}add]`); if (add) add.onclick = () => { set([...get(), '']); redraw(); };
  };
  const draftBubbles = () => draftEdit == null ? o.bubbles : readFields('eb');
  const sameAsDraft = (arr) => arr.length === o.bubbles.length && arr.every((x, i) => x === o.bubbles[i].trim());
  document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => copyText(o.bubbles[Number(b.dataset.copy)], b));
  document.querySelectorAll('[data-copyall]').forEach((b) => b.onclick = () => copyText(draftBubbles().join('\n\n'), b));
  document.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { draftEdit = draftEdit == null ? o.bubbles.slice() : null; redraw(); });
  bindFields('eb', () => draftEdit, (v) => { draftEdit = v; });
  document.querySelectorAll('[data-send]').forEach((b) => armed(b, draftEdit == null ? 'Envoyer' : 'Envoyer ces bulles', async () => { const bubbles = draftBubbles(); if (!bubbles.length) { toast('Aucune bulle'); return; } b.disabled = true; try { await sendBubbles(waId, bubbles, { suggestionId: sug.id, option: 0, edited: !sameAsDraft(bubbles) }); draftEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  // the second block: same editing, then scheduled or sent with the edited bubbles
  const laterBubbles = () => laterEdit == null ? o.later : readFields('lb');
  if ($('#laterEdit')) $('#laterEdit').onclick = () => { laterEdit = laterEdit == null ? o.later.slice() : null; redraw(); };
  bindFields('lb', () => laterEdit, (v) => { laterEdit = v; });
  document.querySelectorAll('[data-copyl]').forEach((b) => b.onclick = () => copyText(o.later[Number(b.dataset.copyl)], b));
  document.querySelectorAll('[data-copyalll]').forEach((b) => b.onclick = () => copyText(laterBubbles().join('\n\n'), b));
  document.querySelectorAll('[data-sendlater]').forEach((b) => armed(b, 'Programmer dans 7 min', async () => { const bubbles = laterBubbles(); if (!bubbles.length) { toast('Second temps vide'); return; } b.disabled = true; try { await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles, suggestionId: sug.id, option: 0, part: 'later', delayMs: 7 * 60_000 } }); toast('Le Mac l’enverra dans 7 min'); laterEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  document.querySelectorAll('[data-sendlaternow]').forEach((b) => armed(b, 'Envoyer maintenant', async () => { const bubbles = laterBubbles(); if (!bubbles.length) { toast('Second temps vide'); return; } b.disabled = true; try { await sendBubbles(waId, bubbles, { suggestionId: sug.id, option: 0, part: 'later' }); laterEdit = null; lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  if ($('#cancelsched')) $('#cancelsched').onclick = async () => { await api(`/api/thread/${waId}/cancel`, { method: 'POST' }); toast('Second temps annulé'); redraw(); };
  // steering panel
  if (d.windowOpen) {
    const det = $('#steer'); if (det) det.ontoggle = () => { steerOpen = det.open; };
    document.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => { const id = b.dataset.mv; dir.moves = has(id) ? dir.moves.filter((x) => x !== id) : [...dir.moves, id]; steerOpen = true; redraw(); });
    document.querySelectorAll('[data-lvl]').forEach((b) => b.onclick = () => { dir.level = dir.level === b.dataset.lvl ? '' : b.dataset.lvl; steerOpen = true; redraw(); });
    document.querySelectorAll('[data-lvl2]').forEach((b) => b.onclick = () => { dir.level2 = dir.level2 === b.dataset.lvl2 ? '' : b.dataset.lvl2; steerOpen = true; redraw(); });
    if ($('#until')) $('#until').oninput = (e) => { dir.until = e.target.value; };
    if ($('#ins')) $('#ins').oninput = (e) => { dir.instruction = e.target.value; };
    if ($('#go')) $('#go').onclick = async () => { if (has('downsell') && !dir.level) { toast('Downsell vers quoi ?'); return; } try { if (offerDraft?.format) await saveOffer(waId); } catch (e) { toast(e.message); return; } askClaude({ ...dir, instruction: dir.instruction.trim() }); };
    bindOffer(waId, d);
    document.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { const ta = $('#tx'); const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emoji + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emoji.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
    $('#tx').oninput = (e) => { composer = e.target.value; $('#send').disabled = !composer.trim() || sendLock; if (composerFrom) composerFrom.edited = composer !== (composerFrom.part === 'later' ? o?.later : o?.bubbles)?.join('\n\n'); };
    $('#clr').onclick = () => { composer = ''; composerFrom = null; $('#tx').value = ''; $('#send').disabled = true; };
    armed($('#send'), 'Envoyer', async () => {
      const bubbles = splitBubbles($('#tx').value);
      if (!bubbles.length) return;
      $('#send').disabled = true; $('#st').textContent = 'Envoi…';
      try { await sendBubbles(waId, bubbles, composerFrom ? { ...composerFrom, edited: composerFrom.edited ?? false } : {}); lastThreadKey = ''; route(); }
      catch (e) { $('#st').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#send').disabled = false; }
    });
  } else bindOffer(waId, d);
  $('#rf').onclick = async () => { await api(`/api/thread/${waId}/refresh`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); lastThreadKey = ''; route(); };
  bindPlanButtons(() => { lastThreadKey = ''; route(); });
  $('#mute').onclick = async () => { await api(`/api/thread/${waId}/mute`, { method: 'POST', body: { muted: !t.muted } }); lastThreadKey = ''; route(); };
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
    armed($('#sendt'), 'Envoyer le template', async () => {
      const params = Object.fromEntries([...document.querySelectorAll('#tplp input')].map((i) => [i.dataset.p, i.value]));
      $('#sendt').disabled = true; $('#stt').textContent = 'Envoi…';
      try { await api(`/api/thread/${waId}/template`, { method: 'POST', body: { template: sel.value, params, alertId: tbcTemplateAlert } }); tbcTemplateAlert = null; toast('Template envoyé'); lastThreadKey = ''; route(); }
      catch (e) { $('#stt').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#sendt').disabled = false; }
    });
  }
}

// The initial offer (what the lead was offered on the call), typed once per lead; every downsell is computed from it.
function offerBoxHtml(D, od, d, forceOpen) {
  if (!D) return '';
  const open = forceOpen || offerOpen;
  return `<div class="offer"><div class="row" style="margin:0"><span class="small"><b>Offre initiale</b> : ${d.offerText ? esc(d.offerText) : '<span class="warn">à renseigner</span>'}</span>${forceOpen ? '' : `<button class="small" id="offerbtn">${open ? 'Fermer' : (d.offer ? 'Modifier' : 'Renseigner')}</button>`}</div>
    ${open ? `<div class="chips" style="margin-top:8px">${D.formats.map((f) => chip('fmt', f.id, f.label, od.format === f.id)).join('')}</div>
    <div class="chips">${D.levels.map((l) => chip('lvlobj', l, `→ ${l}`, od.level === l)).join('')}</div>
    <div class="chips">${[2, 3, 4, 5, 6, 7].map((h) => chip('hpw', String(h), `${h}h/sem`, Number(od.hpw) === h)).join('')}</div>
    <div class="row"><input id="months" type="number" inputmode="numeric" placeholder="mois (auto)" value="${esc(od.months || '')}" style="max-width:130px">${forceOpen ? '' : `<button class="primary small" id="offersave">Enregistrer</button>`}${od.format && !forceOpen ? `<button class="small" id="offerclear">Effacer</button>` : ''}</div>` : ''}</div>`;
}
async function saveOffer(waId) { if (!offerDraft) return; offerDraft.months = $('#months')?.value || ''; await api(`/api/thread/${waId}/offer`, { method: 'POST', body: offerDraft }); offerOpen = false; offerDraft = null; }
function bindOffer(waId, d) {
  const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
  const ensure = () => { offerDraft ||= { ...(d.offer || { format: '', level: '', hpw: '', months: '' }) }; };
  if ($('#offerbtn')) $('#offerbtn').onclick = () => { offerOpen = !offerOpen; offerDraft = offerOpen ? { ...(d.offer || { format: '', level: '', hpw: '', months: '' }) } : null; steerOpen = true; redraw(); };
  document.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => { ensure(); offerDraft.format = b.dataset.fmt; offerDraft.months = ''; offerOpen = true; steerOpen = true; redraw(); });
  document.querySelectorAll('[data-lvlobj]').forEach((b) => b.onclick = () => { ensure(); offerDraft.level = offerDraft.level === b.dataset.lvlobj ? '' : b.dataset.lvlobj; offerOpen = true; steerOpen = true; redraw(); });
  document.querySelectorAll('[data-hpw]').forEach((b) => b.onclick = () => { ensure(); offerDraft.hpw = Number(b.dataset.hpw); offerDraft.months = ''; offerOpen = true; steerOpen = true; redraw(); });
  if ($('#offersave')) $('#offersave').onclick = async () => { if (!offerDraft?.format) { toast('Choisissez le format'); return; } try { await saveOffer(waId); toast('Offre enregistrée'); redraw(); } catch (e) { toast(e.message); } };
  if ($('#offerclear')) $('#offerclear').onclick = async () => { await api(`/api/thread/${waId}/offer`, { method: 'POST', body: {} }); offerOpen = false; offerDraft = null; redraw(); };
}

// ── Aujourd'hui: the day plan written by Claude from the Sales Hub and the conversations ──
const KIND = { pause: ['À mettre en pause', 'bad'], fix: ['À vérifier', 'warn'], followup: ['Relance', 'good'], wait: ['À attendre', ''], ok: ['Colle', 'ok'] };
const fmtWhen = (iso) => { if (!iso) return ''; const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? fmtTime(iso) : `${fmtDay(iso)} ${fmtTime(iso)}`; };
function planCardHtml(i, { inThread = false, salesHub = '' } = {}) {
  let [label, cls] = KIND[i.kind] || ['', ''];
  if (i.kind === 'pause') label = i.pause_scope === 'next' ? `Sauter ${i.skip_templates?.length > 1 ? i.skip_templates.length + ' templates' : '1 template'}` : 'Pause complète';
  const open = i.state === 'open';
  return `<div class="card plan ${i.kind} ${i.state}" data-plan="${i.id}">
    <div class="flag-head"><span><span class="pill ${cls}">${label}</span>${i.when_at ? ` <b class="small">${fmtWhen(i.when_at)}</b>` : ''}${!open ? ` <span class="muted small">· ${{ done: 'fait', dismissed: 'pas d’accord', replied: 'le lead a répondu', expired: 'passé', superseded: 'remplacé' }[i.state] || i.state}</span>` : ''}</span>${i.hub_next && i.kind !== 'followup' ? `<span class="muted small">${esc(i.hub_next)}${i.hub_next_at ? ` ${fmtWhen(i.hub_next_at)}` : ''}</span>` : ''}</div>
    ${inThread ? '' : `<a class="flag-who" data-nav href="/t/${i.wa_id}">${esc(i.name || i.wa_id)} · +${i.wa_id}</a>`}
    <div class="flag-title">${esc(i.title)}</div>
    ${i.why ? `<div class="small">${esc(i.why)}</div>` : ''}
    ${i.action ? `<div class="small action">→ ${esc(i.action)}</div>` : ''}
    ${i.kind === 'pause' && i.pause_scope === 'next' && i.skip_steps?.length ? `<div class="small">À décocher : <b>${i.skip_steps.map((x) => `${x.step ? `#${x.step} ` : ''}${esc(x.template)}${x.at ? ` · ${fmtWhen(x.at)}` : ''}`).join('</b> et <b>')}</b></div>` : ''}${i.kind === 'pause' && i.hub_paused_now ? '<div class="small ok">Le Hub indique ce lead en pause</div>' : ''}
    ${i.template ? `<div class="small">Template : <b>${esc(i.template)}</b></div>` : ''}
    ${i.bubbles?.length && !inThread ? `<div class="opt">${i.bubbles.map((b) => `<div class="b"><span>${esc(b)}</span></div>`).join('')}</div>` : i.bubbles?.length ? '<div class="muted small">Le brouillon est plus bas, prêt à envoyer</div>' : ''}
    ${open ? `<div class="acts"><button class="small primary" data-plandone="${i.id}">Fait</button><button class="small" data-plandismiss="${i.id}">Pas d’accord</button>${!inThread ? `<a class="small" data-nav href="/t/${i.wa_id}">Ouvrir</a>` : ''}${salesHub && (i.kind === 'pause' || i.kind === 'fix') ? `<a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Sales Hub ↗</a>` : ''}</div>` : `<div class="acts"><button class="small" data-planreopen="${i.id}">Rouvrir</button></div>`}
  </div>`;
}
function bindPlanButtons(after) {
  document.querySelectorAll('[data-plandone]').forEach((b) => b.onclick = async () => { await api(`/api/plan/${b.dataset.plandone}`, { method: 'POST', body: { state: 'done' } }); after(); });
  document.querySelectorAll('[data-planreopen]').forEach((b) => b.onclick = async () => { await api(`/api/plan/${b.dataset.planreopen}`, { method: 'POST', body: { state: 'open' } }); after(); });
  document.querySelectorAll('[data-plandismiss]').forEach((b) => b.onclick = async () => { const note = prompt('Pourquoi ce n’est pas le bon geste ? (facultatif, Claude s’en souviendra)') ?? null; if (note === null) return; await api(`/api/plan/${b.dataset.plandismiss}`, { method: 'POST', body: { state: 'dismissed', note } }); toast('Noté'); after(); });
}
async function renderPlan() {
  const { items, counts, status, hub, salesHub } = await api('/api/plan');
  const running = status.state === 'running';
  const open = items.filter((i) => i.state === 'open'), closed = items.filter((i) => i.state !== 'open' && i.state !== 'superseded');
  const sec = (title, list) => list.length ? `<p class="section">${title} (${list.length})</p>${list.map((i) => planCardHtml(i, { salesHub })).join('')}` : '';
  const byTime = (a, b) => String(a.when_at || a.hub_next_at || '9').localeCompare(String(b.when_at || b.hub_next_at || '9'));
  // Urgency first: a template to untick or a follow-up due within 3 h, then the rest of today, then older leads (meeting > 3 days ago, stuck or finished sequences) folded.
  const soon = Date.now() + 3 * 3600e3, dueAt = (i) => Date.parse(i.when_at || i.hub_next_at || 0) || 0;
  const act = open.filter((i) => i.kind !== 'ok' && i.kind !== 'wait');
  const todo = act.filter((i) => i.recent && dueAt(i) && dueAt(i) <= soon).sort(byTime);
  const later = act.filter((i) => i.recent && !(dueAt(i) && dueAt(i) <= soon)).sort(byTime);
  const older = act.filter((i) => !i.recent).sort(byTime);
  const wait = open.filter((i) => i.kind === 'wait').sort(byTime), ok = open.filter((i) => i.kind === 'ok');
  app.innerHTML = `<header><a data-nav href="/">‹</a><h1>Aujourd’hui <span class="muted small">${fmtDay(new Date().toISOString())}</span></h1><button id="replan" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Claude relit…' : 'Replanifier'}</button></header>
    <p class="muted small">${status.ready ? `Sales Hub lu ${hub.leadsAt ? ago(hub.leadsAt) : 'jamais'}${hub.error ? ` · <span class="err">${esc(hub.error)}</span>` : ''} · ${status.last ? `plan ${ago(status.last.at)}` : 'pas encore de plan'} · ${status.calls}/${status.max} relectures aujourd’hui` : 'Sales Hub non connecté (SALES_HUB_TOKEN)'}${status.last?.summary ? `<br>${esc(status.last.summary)}` : ''}</p>
    ${!open.length && !closed.length ? '<p class="muted center">Rien pour aujourd’hui</p>' : ''}
    ${sec('Maintenant', todo)}${sec('Plus tard aujourd’hui', later)}${sec('À attendre', wait)}
    ${older.length ? `<details class="card fold"><summary>Plus anciens (${older.length}) <span class="muted small">· séquences finies ou bloquées, à voir quand vous avez un moment</span></summary>${older.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${ok.length ? `<details class="card fold"><summary>Templates qui collent (${ok.length})</summary>${ok.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${closed.length ? `<details class="card fold"><summary>Terminé (${closed.length})</summary>${closed.map((i) => planCardHtml(i, { salesHub })).join('')}</details>` : ''}
    ${salesHub ? `<p class="center"><a class="small" href="${esc(salesHub)}" target="_blank" rel="noopener">Ouvrir le Sales Hub ↗</a></p>` : ''}`;
  $('#replan').onclick = async () => { $('#replan').disabled = true; try { await api('/api/plan/run', { method: 'POST' }); toast('Claude relit tous les leads, 2 à 5 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 2000); };
  bindPlanButtons(route);
}

// ── France TM: what Claude flagged on the booking bot ─────────────────────────
let tmOpen = new Set();
async function renderTm() {
  const { flags, status } = await api('/api/tm');
  const dismissed = flags.filter((f) => f.verdict === 'not_issue'), fresh = flags.filter((f) => !f.seen && !f.verdict), old = flags.filter((f) => f.seen && !f.verdict);
  const card = (f) => `<div class="card flag ${f.kind}" data-id="${f.id}"><div class="flag-head"><span class="pill ${f.verdict ? '' : f.kind === 'erreur' ? 'bad' : 'good'}">${f.verdict ? 'Pas une erreur' : f.kind === 'erreur' ? 'Erreur' : 'Amélioration'}</span><span class="muted small">${ago(f.at)}</span></div>
    <div class="flag-who">+${f.wa_id}${f.name ? ` · ${esc(f.name)}` : ''}</div>
    <div class="flag-title">${esc(f.title)}</div>
    ${f.detail ? `<div class="small">${esc(f.detail)}</div>` : ''}${f.quote ? `<div class="quote small">« ${esc(f.quote)} »</div>` : ''}
    <div class="acts"><button class="small" data-thread="${f.wa_id}">${tmOpen.has(f.wa_id) ? 'Masquer la conversation' : 'Voir la conversation'}</button>${f.verdict ? `<button class="small" data-notissue="${f.id}" data-v="0">Rétablir</button>` : `<button class="small" data-seen="${f.id}" data-v="${f.seen ? 0 : 1}">${f.seen ? 'Rouvrir' : 'Vu'}</button><button class="small" data-notissue="${f.id}" data-v="1">Pas une erreur</button>`}</div>
    <div class="tmthread" id="tmt-${f.wa_id}-${f.id}"></div></div>`;
  const running = status.state === 'running';
  app.innerHTML = `<header><a data-nav href="/">‹</a><h1>France TM <span class="muted small">bot de réservation</span></h1><button id="rv" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Relecture…' : 'Relire maintenant'}</button></header>
    ${status.last ? `<p class="muted small">Dernière relecture ${ago(status.last.at)} : ${status.last.threads} conversation(s), ${status.last.flags} signalement(s)${status.last.maxPerDay ? ` · ${status.last.runsToday}/${status.last.maxPerDay} aujourd’hui` : ''}${status.error ? ` <span class="err">Erreur : ${esc(status.error)}</span>` : ''}</p>` : ''}
    ${fresh.length ? fresh.map(card).join('') : '<p class="muted center">Rien à relire</p>'}
    ${old.length ? `<details class="card fold"><summary>Vus (${old.length})</summary>${old.map(card).join('')}</details>` : ''}
    ${dismissed.length ? `<details class="card fold"><summary>Pas une erreur (${dismissed.length}) <span class="muted small">· Claude ne signale plus ces cas</span></summary>${dismissed.map(card).join('')}</details>` : ''}`;
  $('#rv').onclick = async () => { $('#rv').disabled = true; try { await api('/api/tm/review', { method: 'POST' }); toast('Relecture lancée, 1 à 2 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 1500); };
  document.querySelectorAll('[data-seen]').forEach((b) => b.onclick = async () => { await api(`/api/tm/flag/${b.dataset.seen}`, { method: 'POST', body: { seen: b.dataset.v === '1' } }); route(); });
  document.querySelectorAll('[data-notissue]').forEach((b) => b.onclick = async () => { await api(`/api/tm/flag/${b.dataset.notissue}`, { method: 'POST', body: { notIssue: b.dataset.v === '1' } }); toast(b.dataset.v === '1' ? 'Noté : Claude ne signalera plus ce cas' : 'Signalement rétabli'); route(); });
  document.querySelectorAll('[data-thread]').forEach((b) => b.onclick = async () => {
    const wa = b.dataset.thread, box = b.closest('.flag').querySelector('.tmthread');
    if (tmOpen.has(wa) && box.innerHTML) { tmOpen.delete(wa); box.innerHTML = ''; b.textContent = 'Voir la conversation'; return; }
    tmOpen.add(wa); b.textContent = 'Masquer la conversation';
    const { messages } = await api(`/api/tm/thread/${wa}`);
    box.innerHTML = `<div class="thread">${messages.map((m) => `<div class="msg ${m.who === 'BOT' ? 'US' : 'LEAD'}">${esc(m.text)}<time>${fmtDay(m.at)} ${fmtTime(m.at)}${m.who === 'BOT' ? ' · bot' : ''}</time></div>`).join('')}</div>`;
  });
}

// ── router ───────────────────────────────────────────────────────────────────
async function route() {
  const m = /^\/t\/(\d+)/.exec(location.pathname);
  if (!m || m[1] !== openedWaId) { composer = ''; composerFrom = null; dir = emptyDir(); offerOpen = false; offerDraft = null; lastThreadKey = ''; threadBusy = false; laterEdit = null; draftEdit = null; steerOpen = false; tbcTemplateAlert = null; clearTimeout(threadTimer); if (!m) openedWaId = ''; }
  document.body.classList.add('busy');
  try { m ? await renderThread(m[1]) : location.pathname === '/tm' ? await renderTm() : location.pathname === '/plan' ? await renderPlan() : await renderInbox(); if (!m) window.scrollTo(0, 0); }
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
