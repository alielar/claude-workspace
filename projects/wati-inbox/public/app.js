// Wati Inbox client: two screens (/ inbox, /t/<waId> thread), login, push toggle, Claude suggestions.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const left = (h) => { const r = 24 - h; return r < 1 ? `${Math.max(1, Math.round(r * 60))} min` : `${Math.floor(r)} h`; };
const windowBadge = (open, h) => open ? `<span class="badge ${24 - h < 2 ? 'soon' : 'open'}">${left(h)} restantes</span>` : '<span class="badge closed">fermée · template</span>';
let toastTimer;
const toast = (msg) => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800); };

async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copié' : 'Échec'; btn.classList.toggle('done', ok); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
  toast(ok ? 'Copié — collez dans WhatsApp' : 'Copie impossible ici');
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

// ── login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `<div class="login card"><h1>Wati Inbox</h1><p class="muted">Mot de passe de l'app (dans le fichier .env sur le Mac).</p>
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
  const label = { on: 'Notifications activées', off: 'Activer les notifications', blocked: 'Notifications bloquées dans les réglages', 'needs-install': "Ajoutez l'app à l'écran d'accueil pour les notifications", unsupported: 'Notifications non disponibles ici' }[s];
  return `<button id="pb" class="small" data-state="${s}" ${s === 'blocked' || s === 'unsupported' || s === 'needs-install' ? 'disabled' : ''}>${label}</button>`;
}
function bindPush() {
  const b = $('#pb'); if (!b) return;
  b.onclick = async () => { b.disabled = true; try { b.dataset.state === 'on' ? await disablePush() : await enablePush(); } catch (e) { toast(e.message); } route(); };
}
// Unread count on the home-screen icon (iOS 16.4+ installed web apps).
const setBadge = (n) => { try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {} };

// ── inbox ────────────────────────────────────────────────────────────────────
let inboxFilter = '';
const suggPill = (t) => t.suggesting === 'drafting' || t.suggesting === 'queued' ? '<span class="pill work">Claude rédige…</span>' : t.suggested ? '<span class="pill ready">brouillon prêt</span>' : '';
let inboxCache = null;
async function renderInbox({ fromCache = false } = {}) {
  const { threads, tm, tbc = [], salesHub = '' } = fromCache && inboxCache ? inboxCache : (inboxCache = await api('/api/inbox'));
  const q = inboxFilter.trim().toLowerCase();
  const shown = q ? threads.filter((t) => (t.name || '').toLowerCase().includes(q) || t.wa_id.includes(q.replace(/\D/g, '') || '§')) : threads;
  const pending = shown.filter((t) => t.pending && !t.muted), done = shown.filter((t) => !t.pending || t.muted);
  setBadge(threads.filter((t) => t.pending && !t.muted).length);
  const row = (t) => `<a class="card lead-row" data-nav href="/t/${t.wa_id}">${t.pending && !t.muted ? '<span class="dot"></span>' : ''}<div class="who"><div class="name">${esc(t.name || t.wa_id)}${t.country === 'Switzerland' ? '<span class="pill">CHF</span>' : ''}${t.muted ? '<span class="pill">silencieux</span>' : ''}${suggPill(t)} <span class="muted small">${t.last_inbound_at ? ago(t.last_inbound_at) : ''}</span></div><div class="txt">${esc(t.last_text)}</div></div>${t.hoursSinceLead != null ? windowBadge(t.windowOpen, t.hoursSinceLead) : ''}</a>`;
  const digits = q.replace(/\D/g, '');
  const direct = /^\d{8,15}$/.test(digits) && !threads.some((t) => t.wa_id === digits) ? `<a class="card lead-row" data-nav href="/t/${digits}"><div class="who"><div class="name">Ouvrir la conversation +${digits}</div><div class="txt">Nouveau numéro — template si la fenêtre est fermée, message libre sinon</div></div></a>` : '';
  app.innerHTML = `<header><h1>Wati Inbox${pending.length ? ` <span class="pill">${pending.length}</span>` : ''}</h1><a data-nav href="/tm" class="tmlink">France TM${tm?.unseen ? ` <span class="pill warn">${tm.unseen}</span>` : ''}</a><button id="rf" class="small">↻</button></header>
    <input class="search" id="q" placeholder="Nom, ou numéro collé (ex. +33 6 12 34 56 78)" value="${esc(inboxFilter)}" inputmode="search">${direct}
    <div class="row" style="margin:0 0 12px">${await pushButton()}<span class="muted small">${threads.length ? 'Fenêtres ouvertes seulement — un numéro collé ouvre n’importe quelle conversation.' : 'Aucune fenêtre ouverte — le Mac lit Wati toutes les 45 s.'}</span></div>
    ${tbc.length ? `<p class="muted small">Sales Hub — automatisation à traiter (${tbc.length})</p>${tbc.map((a) => `<a class="card lead-row tbc-row ${a.state}" data-nav href="/t/${a.wa_id}"><div class="who"><div class="name">${esc(a.name || a.wa_id)} <span class="pill ${a.state === 'paused' ? 'ready' : 'warn'}">${a.state === 'paused' ? 'en pause · relance à envoyer' : a.kind === 'fit' ? 'à mettre en pause' : 'template imminent'}</span></div><div class="txt">${esc(a.tpl)} part à ${fmtTime(a.fires_at)} — ${esc(a.why || '')}</div></div></a>`).join('')}${salesHub ? `<a class="small muted" href="${esc(salesHub)}" target="_blank" rel="noopener">Ouvrir le Sales Hub ↗</a>` : ''}` : ''}
    ${pending.length ? `<p class="muted small">En attente de réponse (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Aucun lead en attente.</p>'}
    ${done.length ? `<p class="muted small" style="margin-top:18px">Répondu, fenêtre encore ouverte (${done.length})</p>${done.map(row).join('')}` : ''}`;
  $('#rf').onclick = route; bindPush();
  $('#q').oninput = (e) => { inboxFilter = e.target.value; const pos = e.target.selectionStart; renderInbox({ fromCache: true }).then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); }); };
}

// ── thread ───────────────────────────────────────────────────────────────────
let composer = '', composerFrom = null, lastThreadKey = '', threadBusy = false, openedWaId = '';
// What Ali picks before Claude drafts: moves (multi-select), the downsell / acompte level, the deadline, a free consigne. Kept across redraws.
const emptyDir = () => ({ moves: [], level: '', level2: '', until: '', instruction: '' });
let dir = emptyDir();
let dirs = null, offerOpen = false, offerDraft = null;
const loadDirs = async () => (dirs ||= await api('/api/directions'));
const chip = (name, id, label, on) => `<button type="button" class="chip ${on ? 'sel' : ''}" data-${name}="${esc(id)}">${esc(label)}</button>`;
const fmtLeft = (iso) => { const s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000)); return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`; };
async function sendBubbles(waId, bubbles, meta = {}) {
  if (!bubbles.length) return false;
  const r = await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles, ...meta } });
  composer = ''; composerFrom = null;
  toast(r.total > 1 ? `Bulle 1/${r.total} envoyée — les suivantes partent toutes seules` : 'Envoyé');
  return true;
}
// First open of a conversation: the newest message just under the header, the suggestions right below it.
function scrollToLast() {
  const last = document.querySelector('.thread .msg:last-child') || $('.thread');
  if (!last) return;
  const top = last.getBoundingClientRect().top + window.scrollY - ($('header')?.offsetHeight || 0) - 6;
  window.scrollTo(0, Math.max(0, top));
}
const typing = () => /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName || '');
// Two taps to send: the first turns the button into "Confirmer …" for 5 s, the second sends.
// (Browser confirm() pop-ups get silently blocked after a few uses, which looked like a dead button.)
function armed(btn, label, fn) {
  btn.onclick = async () => {
    if (btn.dataset.armed) { clearTimeout(btn._t); delete btn.dataset.armed; btn.textContent = label; await fn(); return; }
    btn.dataset.armed = '1'; const was = btn.textContent; btn.textContent = `Confirmer : ${label.toLowerCase()}`;
    btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; }, 5000);
  };
}
let threadTimer;
async function renderThread(waId, { quiet = false } = {}) {
  if (quiet && typing()) return; // Ali is writing: a redraw would close the keyboard
  const d = await api(`/api/thread/${waId}`);
  if (!location.pathname.startsWith(`/t/${waId}`)) return; // he left the screen while we were loading
  const t = d.thread;
  const st = d.suggesting;
  threadBusy = !!st && (st.state === 'queued' || st.state === 'drafting');
  const sending = d.sending;
  const key = `${d.messages.length}|${d.messages[d.messages.length - 1]?.id}|${d.suggestion?.id}|${st?.state}|${t.pending}|${t.muted}|${sending?.sent}|${sending?.error}|${d.learning?.state}|${d.lastLesson?.id}|${d.scheduled?.at}|${d.offerText}|${d.tbc?.alert?.id}|${d.tbc?.alert?.state}|${d.tbc?.next?.tpl}`;
  // Something is still moving (Wati being re-read, bubbles going out): look again in a few seconds.
  clearTimeout(threadTimer);
  if (d.stale || (sending && !sending.error) || d.scheduled) threadTimer = setTimeout(() => renderThread(waId, { quiet: true }).catch(() => {}), d.scheduled && !d.stale && !sending ? 15000 : 3000);
  if (quiet && key === lastThreadKey) return; // background refresh: nothing changed, keep the screen as is
  lastThreadKey = key;
  const sameScreen = openedWaId === waId, y = window.scrollY;
  let lastDay = '';
  const msgs = d.messages.map((m) => { const day = fmtDay(m.at); const h = (day !== lastDay ? `<div class="day">${day}</div>` : '') + `<div class="msg ${m.who}">${esc(m.text)}<time>${fmtTime(m.at)}${m.tpl ? ' · template' : ''}</time></div>`; lastDay = day; return h; }).join('');
  const ctx = [t.stage && `<b>${esc(t.stage)}</b>`, t.meeting && `entretien ${esc(t.meeting)}`, t.country && `${esc(t.country)}${t.country === 'Switzerland' ? ' · <b>prix en CHF</b>' : ''}`, d.templatesSent.length && `templates app : ${d.templatesSent.map((s) => esc(s.name)).join(', ')}`].filter(Boolean).join(' · ');
  const opts = d.suggestion?.options || [];
  const sendLock = !!sending && !sending.error; // bubbles still going out: no second send meanwhile
  // Suggestion button: idle → ask; queued/drafting → progress; error → retry with the reason.
  const D = d.windowOpen ? await loadDirs() : null;
  const has = (id) => dir.moves.includes(id);
  // The initial offer (from the call), typed once per lead: every downsell is computed from it.
  const od = offerDraft || d.offer || { format: '', level: '', hpw: '', months: '' };
  const offerBox = d.windowOpen ? `<div class="card offer">
      <div class="row" style="margin:0"><span class="small"><b>Offre initiale</b> : ${d.offerText ? esc(d.offerText) : '<span class="warn">non renseignée</span>'}</span><button class="small" id="offerbtn">${offerOpen ? 'Fermer' : (d.offer ? 'Modifier' : 'Renseigner')}</button></div>
      ${offerOpen ? `<div class="chips" style="margin-top:8px">${D.formats.map((f) => chip('fmt', f.id, f.label, od.format === f.id)).join('')}</div>
      <div class="chips">${D.levels.map((l) => chip('lvlobj', l, `→ ${l}`, od.level === l)).join('')}</div>
      <div class="chips">${[2, 3, 4, 5, 6, 7].map((h) => chip('hpw', String(h), `${h}h/sem`, Number(od.hpw) === h)).join('')}</div>
      <div class="row"><input id="months" type="number" inputmode="numeric" placeholder="mois (auto)" value="${esc(od.months || '')}" style="max-width:130px"><button class="primary small" id="offersave">Enregistrer</button>${od.format ? `<button class="small" id="offerclear">Effacer</button>` : ''}</div>` : ''}
    </div>` : '';
  // Moves are combinable: Ali ticks what the reply must do, Claude writes it. No draft happens by itself.
  const panel = d.windowOpen ? `<div class="card cap ${threadBusy ? 'busy' : ''}">
      <p class="muted small">Que fait la réponse ? (plusieurs possibles)</p>
      <div class="chips">${D.moves.map((m) => chip('mv', m.id, m.label, has(m.id))).join('')}</div>
      ${has('downsell') ? `<p class="muted small">Downsell vers</p><div class="chips">${D.downsell.map((o) => chip('lvl', o.id, o.label, dir.level === o.id)).join('')}</div>` : ''}
      ${has('acompte') ? `<p class="muted small">Acompte</p><div class="chips">${D.acompte.map((a) => chip('lvl2', a, `${a} €`, dir.level2 === a)).join('')}</div>` : ''}
      ${has('delai') ? `<input id="until" placeholder="Jusqu’à quand ? (ex. demain 12h)" value="${esc(dir.until)}" style="margin-bottom:8px">` : ''}
      <textarea id="ins" placeholder="Précision pour Claude (facultatif) : ce qu’il a dit à l’appel, un chiffre, ce qu’il faut éviter…" ${threadBusy ? 'disabled' : ''}>${esc(dir.instruction)}</textarea>
      <div class="row"><button id="go" class="primary ${threadBusy ? 'busy' : ''}" ${threadBusy ? 'disabled' : ''}>${threadBusy ? (st.state === 'drafting' ? 'Claude rédige… (≈ 1 min)' : 'Claude va rédiger…') : (opts.length ? 'Refaire' : 'Rédiger la réponse')}</button>${st?.state === 'error' ? `<span class="err small">Échec : ${esc(st.error)} — réessayez</span>` : `<span class="muted small">${threadBusy ? esc(st.direction || '') : (dir.moves.length ? '' : 'Rien coché = réponse simple à son message')}</span>`}</div>
    </div>` : '';
  // Sales Hub automation: the next step that will fire, and the alert card (pause there first, then the follow-up).
  const tb = d.tbc || {}, al = tb.alert;
  const hubLink = tb.salesHub ? `<a class="small" href="${esc(tb.salesHub)}" target="_blank" rel="noopener">Ouvrir le Sales Hub ↗</a>` : '';
  const nextLine = tb.next && !al ? `<div class="ctx tbc-next">Prochain automatique (Sales Hub) : <b>${esc(tb.next.tpl)}</b> à ${fmtTime(tb.next.firesAt)}${tb.leadWaiting ? ' — sauté tant que vous n’avez pas répondu' : ''}</div>` : '';
  const tbcBox = al ? `<div class="card tbc ${al.state}">
      <div class="opt-head">${al.kind === 'fit' ? 'Automatisation à mettre en pause' : 'Template imminent'} <span class="muted">· ${esc(al.tpl)} part à ${fmtTime(al.fires_at)} (${fmtLeft(al.fires_at)})</span></div>
      <p class="small">${esc(al.why || '')}</p>
      ${al.tpl_text ? `<p class="muted small quote">« ${esc(al.tpl_text.replace('{name}', (t.name || '').split(' ')[0] || 'X').replace('{owner}', 'Ali'))} »</p>` : ''}
      <div class="row"><b class="small">1.</b> ${al.state === 'paused' ? '<span class="ok small">En pause dans le Sales Hub (confirmé par vous)</span>' : `<button class="primary small" id="tbcpaused">J’ai mis en pause dans le Sales Hub</button>`}${hubLink}<button class="small" id="tbcignore">${al.state === 'paused' ? 'Fermer' : 'Laisser partir'}</button></div>
      ${al.kind === 'fit' && al.bubbles?.length ? `<div class="row" style="margin-bottom:4px"><b class="small">2.</b> <span class="small">Relance manuelle${al.state === 'paused' ? '' : ' — <span class="warn">bloquée tant que la pause n’est pas confirmée</span>'}</span></div>
      <div class="opt ${al.state === 'paused' ? '' : 'locked'}">${al.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span>${al.state === 'paused' ? `<button class="small" data-tbccopy="${j}">Copier</button>` : ''}</div>`).join('')}
      ${al.state === 'paused' && d.windowOpen ? `<div class="acts"><button class="primary small" id="tbcsend" ${sendLock ? 'disabled' : ''}>Envoyer telle quelle</button><button class="small" id="tbcuse">Modifier avant envoi</button></div>` : al.state === 'paused' && !d.windowOpen ? '<p class="warn small">Fenêtre de 24h fermée : passez par le sélecteur de templates ci-dessous.</p>' : ''}</div>` : ''}
    </div>` : '';
  // The second block of an administration two-step, already handed to the Mac.
  const schedBox = d.scheduled ? `<div class="card sending">Second temps programmé : part dans ${fmtLeft(d.scheduled.at)} — « ${esc(d.scheduled.bubbles[0].slice(0, 80))}… » <button class="small" id="cancelsched">Annuler</button></div>` : '';
  // What the app learned from the last send on this thread (confirmed = sent as drafted; lesson = logged in 04-CAS-APPRIS).
  const learnLine = d.learning && (d.learning.state === 'waiting' || d.learning.state === 'learning')
    ? '<p class="muted small learn">Claude note ce que vous avez envoyé…</p>'
    : d.learning?.state === 'error' ? `<p class="err small">Leçon non notée : ${esc(d.learning.error)}</p>`
    : d.lastLesson && (!d.suggestion || d.lastLesson.at >= d.suggestion.created_at) ? `<p class="muted small learn">Appris ${ago(d.lastLesson.at)} : ${d.lastLesson.kind === 'confirmed' ? 'brouillon validé tel quel' : d.lastLesson.kind === 'lesson' ? `leçon notée — ${esc(d.lastLesson.title || '')}` : d.lastLesson.kind === 'minor' ? 'retouche notée' : 'rien à retenir'}</p>` : '';
  const sugg = (opts.length
    ? `<p class="muted small">Brouillon de Claude · ${ago(d.suggestion.created_at)}${d.suggestion.source === 'chat' ? ' · depuis le chat' : ''}</p>`
      + (d.suggestion.instruction ? `<p class="consigne small">${esc(d.suggestion.instruction)}</p>` : '')
      + (d.suggestion.note ? `<p class="note small">À savoir : ${esc(d.suggestion.note)}</p>` : '')
      + opts.map((o, i) => `<div class="card opt" data-i="${i}">${o.later?.length ? '<div class="opt-head">Maintenant</div>' : ''}${o.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copy="${i}:${j}">Copier</button></div>`).join('')}${o.why ? `<details><summary>Pourquoi</summary>${esc(o.why)}</details>` : ''}<div class="acts">${d.windowOpen ? `<button class="primary small" data-send="${i}" ${sendLock ? 'disabled' : ''}>Envoyer telle quelle</button><button class="small" data-use="${i}">Modifier avant envoi</button>` : ''}<button class="small" data-copyall="${i}">Tout copier</button></div></div>`
        + (o.later?.length ? `<div class="card opt later" data-i="${i}"><div class="opt-head">Dans 5-10 min <span class="muted">· la « bonne nouvelle » de l’administration</span></div>${o.later.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copyl="${i}:${j}">Copier</button></div>`).join('')}<div class="acts">${d.windowOpen ? `<button class="primary small" data-sendlater="${i}" ${d.scheduled ? 'disabled' : ''}>Programmer dans 7 min</button><button class="small" data-sendlaternow="${i}" ${sendLock ? 'disabled' : ''}>Envoyer maintenant</button><button class="small" data-uselater="${i}">Modifier</button>` : ''}<button class="small" data-copyalll="${i}">Tout copier</button></div></div>` : '')).join('')
    : (threadBusy ? '<p class="muted small">Claude lit la conversation et le playbook, le brouillon arrive ici dans environ une minute — une notification vous préviendra.</p>' : ''))
    + learnLine;
  const tplBox = `<input id="tplq" placeholder="Filtrer les templates (ex. followup, noshow)"><select id="tpl" style="margin-top:8px"><option value="">Chargement des templates français…</option></select><div id="tplv" class="muted small" style="margin-top:8px;white-space:pre-wrap"></div><div id="tplp"></div><div class="row"><button class="primary" id="sendt" disabled>Envoyer le template</button><span id="stt"></span></div>`;
  const sendBox = sending
    ? `<div class="card sending ${sending.error ? 'failed' : ''}">${sending.error ? esc(sending.error) : `Envoi ${sending.sent}/${sending.total} — les bulles partent une par une, 5 à 10 s entre chaque`}</div>`
    : '';
  const compose = d.windowOpen
    ? `<div class="card"><p class="muted small">Une bulle par paragraphe (ligne vide entre deux bulles).</p><div class="emojis">${['😊','👍','😁','🙂','🙏','💪','✅','🚀','🎉','😉'].map((e) => `<button class="small" data-emoji="${e}" type="button">${e}</button>`).join('')}</div><textarea id="tx" placeholder="Votre réponse…">${esc(composer)}</textarea><div class="row"><button class="primary" id="send" ${composer.trim() && !sendLock ? '' : 'disabled'}>Envoyer</button><button id="clr">Effacer</button><span id="st"></span></div></div><details class="card"><summary>Envoyer un template à la place</summary>${tplBox}</details>`
    : `<div class="card"><p class="muted small">${d.messages.length ? 'Fenêtre de 24h fermée — seul un template peut partir.' : 'Aucune conversation lisible pour ce numéro (jamais écrit sur le numéro Sales, ou lead TM) — un template peut partir.'}</p>${tplBox}</div>`;
  app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a><h1>${esc(t.name || waId)} <span class="muted small">+${waId}</span></h1>${windowBadge(d.windowOpen, d.hoursSinceLead ?? 24)}</header>
    ${ctx ? `<div class="ctx">${ctx}</div>` : ''}${nextLine}
    <div class="thread">${msgs}</div>
    ${tbcBox}${offerBox}${panel}${sendBox}${schedBox}${sugg}${compose}
    <div class="row"><button id="hd" class="small" ${t.pending ? '' : 'disabled'}>Marquer comme traité</button><button id="mute" class="small">${t.muted ? 'Réactiver les notifications' : 'Ne plus notifier ce lead'}</button><button id="rf" class="small">↻</button></div>`;
  // A redraw of the same conversation keeps the scroll; a fresh open lands on the newest message.
  if (sameScreen) window.scrollTo(0, y); else { openedWaId = waId; scrollToLast(); requestAnimationFrame(scrollToLast); }
  if (d.windowOpen) {
    const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
    document.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => { const id = b.dataset.mv; dir.moves = has(id) ? dir.moves.filter((x) => x !== id) : [...dir.moves, id]; redraw(); });
    document.querySelectorAll('[data-lvl]').forEach((b) => b.onclick = () => { dir.level = dir.level === b.dataset.lvl ? '' : b.dataset.lvl; redraw(); });
    document.querySelectorAll('[data-lvl2]').forEach((b) => b.onclick = () => { dir.level2 = dir.level2 === b.dataset.lvl2 ? '' : b.dataset.lvl2; redraw(); });
    if ($('#until')) $('#until').oninput = (e) => { dir.until = e.target.value; };
    $('#ins').oninput = (e) => { dir.instruction = e.target.value; };
    $('#go').onclick = async () => {
      if (!dir.moves.length && !dir.instruction.trim()) { toast('Cochez un move, ou écrivez une consigne'); return; }
      if (has('downsell') && !dir.level) { toast('Downsell vers quoi ?'); return; }
      $('#go').disabled = true; $('#go').textContent = 'Demande envoyée…';
      try { await api(`/api/thread/${waId}/suggest`, { method: 'POST', body: { ...dir, instruction: dir.instruction.trim() } }); toast('Claude rédige — environ une minute'); lastThreadKey = ''; route(); }
      catch (e) { toast(e.message); $('#go').disabled = false; }
    };
    // initial offer
    $('#offerbtn').onclick = () => { offerOpen = !offerOpen; offerDraft = offerOpen ? { ...(d.offer || { format: '', level: '', hpw: '', months: '' }) } : null; redraw(); };
    document.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => { offerDraft.format = b.dataset.fmt; offerDraft.months = ''; redraw(); });
    document.querySelectorAll('[data-lvlobj]').forEach((b) => b.onclick = () => { offerDraft.level = offerDraft.level === b.dataset.lvlobj ? '' : b.dataset.lvlobj; redraw(); });
    document.querySelectorAll('[data-hpw]').forEach((b) => b.onclick = () => { offerDraft.hpw = Number(b.dataset.hpw); offerDraft.months = ''; redraw(); });
    if ($('#offersave')) $('#offersave').onclick = async () => { if (!offerDraft.format) { toast('Choisissez le format'); return; } offerDraft.months = $('#months').value; try { await api(`/api/thread/${waId}/offer`, { method: 'POST', body: offerDraft }); offerOpen = false; offerDraft = null; toast('Offre enregistrée'); redraw(); } catch (e) { toast(e.message); } };
    if ($('#offerclear')) $('#offerclear').onclick = async () => { await api(`/api/thread/${waId}/offer`, { method: 'POST', body: {} }); offerOpen = false; offerDraft = null; redraw(); };
    if ($('#cancelsched')) $('#cancelsched').onclick = async () => { await api(`/api/thread/${waId}/cancel`, { method: 'POST' }); toast('Second temps annulé'); redraw(); };
    // the second block
    document.querySelectorAll('[data-sendlater]').forEach((b) => armed(b, 'Programmer dans 7 min', async () => { const i = Number(b.dataset.sendlater); b.disabled = true; try { await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles: opts[i].later, suggestionId: d.suggestion.id, option: i, part: 'later', delayMs: 7 * 60_000 } }); toast('Le Mac l’enverra dans 7 min'); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
    document.querySelectorAll('[data-sendlaternow]').forEach((b) => armed(b, 'Envoyer maintenant', async () => { const i = Number(b.dataset.sendlaternow); b.disabled = true; try { await sendBubbles(waId, opts[i].later, { suggestionId: d.suggestion.id, option: i, part: 'later', edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
    document.querySelectorAll('[data-uselater]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.uselater); composer = opts[i].later.join('\n\n'); composerFrom = { suggestionId: d.suggestion.id, option: i, part: 'later' }; if ($('#tx')) { $('#tx').value = composer; $('#send').disabled = false; $('#tx').focus(); $('#tx').scrollIntoView({ block: 'center' }); } });
    document.querySelectorAll('[data-copyl]').forEach((b) => b.onclick = () => { const [i, j] = b.dataset.copyl.split(':').map(Number); copyText(opts[i].later[j], b); });
    document.querySelectorAll('[data-copyalll]').forEach((b) => b.onclick = () => copyText(opts[Number(b.dataset.copyalll)].later.join('\n\n'), b));
  }
  document.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.use); composer = opts[i].bubbles.join('\n\n'); composerFrom = { suggestionId: d.suggestion.id, option: i }; if ($('#tx')) { $('#tx').value = composer; $('#send').disabled = false; $('#tx').focus(); $('#tx').scrollIntoView({ block: 'center' }); } });
  document.querySelectorAll('[data-send]').forEach((b) => armed(b, 'Envoyer telle quelle', async () => { const i = Number(b.dataset.send); b.disabled = true; try { await sendBubbles(waId, opts[i].bubbles, { suggestionId: d.suggestion.id, option: i, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { const [i, j] = b.dataset.copy.split(':').map(Number); copyText(opts[i].bubbles[j], b); });
  document.querySelectorAll('[data-copyall]').forEach((b) => b.onclick = () => copyText(opts[Number(b.dataset.copyall)].bubbles.join('\n\n'), b));
  if (al) {
    const tbcAct = async (action) => { try { await api(`/api/thread/${waId}/tbc`, { method: 'POST', body: { id: al.id, action } }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); } };
    if ($('#tbcpaused')) armed($('#tbcpaused'), 'J’ai mis en pause dans le Sales Hub', () => tbcAct('paused'));
    if ($('#tbcignore')) $('#tbcignore').onclick = () => tbcAct('ignore');
    document.querySelectorAll('[data-tbccopy]').forEach((b) => b.onclick = () => copyText(al.bubbles[Number(b.dataset.tbccopy)], b));
    if ($('#tbcsend')) armed($('#tbcsend'), 'Envoyer telle quelle', async () => { $('#tbcsend').disabled = true; try { await sendBubbles(waId, al.bubbles, { alertId: al.id, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); $('#tbcsend').disabled = false; } });
    if ($('#tbcuse')) $('#tbcuse').onclick = () => { composer = al.bubbles.join('\n\n'); composerFrom = { alertId: al.id }; if ($('#tx')) { $('#tx').value = composer; $('#send').disabled = false; $('#tx').focus(); $('#tx').scrollIntoView({ block: 'center' }); } };
  }
  $('#rf').onclick = async () => { await api(`/api/thread/${waId}/refresh`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#mute').onclick = async () => { await api(`/api/thread/${waId}/mute`, { method: 'POST', body: { muted: !t.muted } }); lastThreadKey = ''; route(); };
  if (d.windowOpen) {
    document.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { const ta = $('#tx'); const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emoji + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emoji.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
    $('#tx').oninput = (e) => { composer = e.target.value; $('#send').disabled = !composer.trim() || sendLock; if (composerFrom) composerFrom.edited = composer !== (composerFrom.part === 'later' ? opts[composerFrom.option]?.later : opts[composerFrom.option]?.bubbles)?.join('\n\n'); };
    $('#clr').onclick = () => { composer = ''; composerFrom = null; $('#tx').value = ''; $('#send').disabled = true; };
    armed($('#send'), 'Envoyer', async () => {
      const bubbles = $('#tx').value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      if (!bubbles.length) return;
      $('#send').disabled = true; $('#st').textContent = 'Envoi…';
      try { await sendBubbles(waId, bubbles, composerFrom ? { ...composerFrom, edited: composerFrom.edited ?? false } : {}); lastThreadKey = ''; route(); }
      catch (e) { $('#st').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#send').disabled = false; }
    });
  }
  {
    const { templates } = await api('/api/templates');
    const sel = $('#tpl'); if (!sel) return;
    const fill = (q) => { const list = templates.filter((x) => !q || x.name.includes(q) || x.body.toLowerCase().includes(q)); sel.innerHTML = `<option value="">${list.length} template(s) — choisir…</option>` + list.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join(''); };
    fill('');
    $('#tplq').oninput = (e) => fill(e.target.value.trim().toLowerCase());
    sel.onchange = () => {
      const x = templates.find((y) => y.name === sel.value); $('#sendt').disabled = !x;
      $('#tplv').textContent = x ? x.body : '';
      $('#tplp').innerHTML = x ? x.params.map((p) => `<input data-p="${esc(p)}" placeholder="${esc(p)}" value="${p === 'name' ? esc((t.name || '').split(' ')[0]) : ''}" style="margin-top:8px">`).join('') : '';
    };
    armed($('#sendt'), 'Envoyer le template', async () => {
      const params = Object.fromEntries([...document.querySelectorAll('#tplp input')].map((i) => [i.dataset.p, i.value]));
      $('#sendt').disabled = true; $('#stt').textContent = 'Envoi… (vérification Meta, ~5 s)';
      try { await api(`/api/thread/${waId}/template`, { method: 'POST', body: { template: sel.value, params } }); toast('Template envoyé'); lastThreadKey = ''; route(); }
      catch (e) { $('#stt').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#sendt').disabled = false; }
    });
  }
}

// ── France TM: what Claude flagged on the booking bot ─────────────────────────
let tmOpen = new Set();
async function renderTm() {
  const { flags, status } = await api('/api/tm');
  const fresh = flags.filter((f) => !f.seen), old = flags.filter((f) => f.seen);
  const card = (f) => `<div class="card flag ${f.kind}" data-id="${f.id}"><div class="flag-head"><span class="pill ${f.kind === 'erreur' ? 'bad' : 'good'}">${f.kind === 'erreur' ? 'Error' : 'Improvement'}</span><span class="muted small">${ago(f.at)}</span></div>
    <div class="flag-who">+${f.wa_id}${f.name ? ` · ${esc(f.name)}` : ''}</div>
    <div class="flag-title">${esc(f.title)}</div>
    ${f.detail ? `<div class="small">${esc(f.detail)}</div>` : ''}${f.quote ? `<div class="quote small">« ${esc(f.quote)} »</div>` : ''}
    <div class="acts"><button class="small" data-thread="${f.wa_id}">${tmOpen.has(f.wa_id) ? 'Hide conversation' : 'Show conversation'}</button><button class="small" data-seen="${f.id}" data-v="${f.seen ? 0 : 1}">${f.seen ? 'Reopen' : 'Seen'}</button></div>
    <div class="tmthread" id="tmt-${f.wa_id}-${f.id}"></div></div>`;
  const running = status.state === 'running';
  app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a><h1>France TM <span class="muted small">booking bot</span></h1><button id="rv" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Reviewing…' : 'Review now'}</button></header>
    <p class="muted small">Up to 3 times a day (9h–21h), Claude reads the telemarketing conversations (+33671283778) and flags what the bot got wrong or could do better.${status.last ? ` Last review ${ago(status.last.at)}: ${status.last.threads} conversation(s), ${status.last.flags} flag(s)${status.last.maxPerDay ? ` · ${status.last.runsToday}/${status.last.maxPerDay} reviews today` : ''}.` : ''}${status.skipped ? ` Skipped: ${esc(status.skipped)}.` : ''}${status.error ? ` <span class="err">Last error: ${esc(status.error)}</span>` : ''}</p>
    ${fresh.length ? fresh.map(card).join('') : '<p class="muted center">Nothing to review.</p>'}
    ${old.length ? `<details class="card"><summary>Seen (${old.length})</summary>${old.map(card).join('')}</details>` : ''}`;
  $('#rv').onclick = async () => { $('#rv').disabled = true; try { await api('/api/tm/review', { method: 'POST' }); toast('Review started — 1 to 2 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 1500); };
  document.querySelectorAll('[data-seen]').forEach((b) => b.onclick = async () => { await api(`/api/tm/flag/${b.dataset.seen}`, { method: 'POST', body: { seen: b.dataset.v === '1' } }); route(); });
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
  if (!m) { composer = ''; composerFrom = null; dir = emptyDir(); offerOpen = false; offerDraft = null; lastThreadKey = ''; threadBusy = false; openedWaId = ''; clearTimeout(threadTimer); }
  document.body.classList.add('busy');
  try { m ? await renderThread(m[1]) : location.pathname === '/tm' ? await renderTm() : await renderInbox(); if (!m) window.scrollTo(0, 0); }
  catch (e) { if (e.message !== 'login') app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a></header><p class="err">${esc(e.message)}</p>`; }
  finally { document.body.classList.remove('busy'); }
}
route();
// Background refresh while the app is on screen: open thread every 30 s (every 8 s while Claude is drafting),
// inbox every 60 s. A thread only redraws if something changed.
let ticks = 0;
setInterval(() => { if (document.visibilityState !== 'visible') return; ticks++; const m = /^\/t\/(\d+)/.exec(location.pathname); if (m && (threadBusy || ticks % 4 === 0)) renderThread(m[1], { quiet: true }).catch(() => {}); }, 8_000);
setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/') route(); }, 60_000);
setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/tm' && !typing()) route(); }, 45_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const m = /^\/t\/(\d+)/.exec(location.pathname); m ? renderThread(m[1], { quiet: true }).catch(() => {}) : route(); } });
