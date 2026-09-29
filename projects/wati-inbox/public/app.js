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
  const { threads, tm } = fromCache && inboxCache ? inboxCache : (inboxCache = await api('/api/inbox'));
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
    ${pending.length ? `<p class="muted small">En attente de réponse (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Aucun lead en attente.</p>'}
    ${done.length ? `<p class="muted small" style="margin-top:18px">Répondu, fenêtre encore ouverte (${done.length})</p>${done.map(row).join('')}` : ''}`;
  $('#rf').onclick = route; bindPush();
  $('#q').oninput = (e) => { inboxFilter = e.target.value; const pos = e.target.selectionStart; renderInbox({ fromCache: true }).then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); }); };
}

// ── thread ───────────────────────────────────────────────────────────────────
let composer = '', composerFrom = null, lastThreadKey = '', threadBusy = false, openedWaId = '';
// The cap Ali picks before Claude drafts (objective, downsell/acompte level, tone, free consigne). Kept across redraws.
let dir = { objective: '', level: '', tone: 'standard', instruction: '' };
let dirs = null;
const loadDirs = async () => (dirs ||= await api('/api/directions'));
const chip = (name, o, cur) => `<button type="button" class="chip ${o.id === cur ? 'sel' : ''}" data-${name}="${o.id}">${esc(o.label)}</button>`;
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
  const key = `${d.messages.length}|${d.messages[d.messages.length - 1]?.id}|${d.suggestion?.id}|${st?.state}|${t.pending}|${t.muted}|${sending?.sent}|${sending?.error}|${d.learning?.state}|${d.lastLesson?.id}`;
  // Something is still moving (Wati being re-read, bubbles going out): look again in a few seconds.
  clearTimeout(threadTimer);
  if (d.stale || (sending && !sending.error)) threadTimer = setTimeout(() => renderThread(waId, { quiet: true }).catch(() => {}), 3000);
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
  const objective = D?.objectives.find((o) => o.id === dir.objective) || null;
  const levelList = objective?.levels === true ? D.downsell : objective?.levels === 'acompte' ? D.acompte : null;
  // Where the reply is heading: Ali picks, then Claude drafts along that line. No draft happens by itself.
  const panel = d.windowOpen ? `<div class="card cap ${threadBusy ? 'busy' : ''}">
      <p class="muted small">Où va la réponse ?</p>
      <div class="chips">${D.objectives.map((o) => chip('obj', o, dir.objective)).join('')}</div>
      ${levelList ? `<p class="muted small">${objective.levels === true ? 'Jusqu’où ?' : 'Quel acompte ?'}</p><div class="chips">${levelList.map((o) => chip('lvl', o, dir.level)).join('')}</div>` : ''}
      <div class="chips tones">${D.tones.map((o) => chip('tone', o, dir.tone)).join('')}</div>
      <textarea id="ins" placeholder="Précision pour Claude (facultatif) : un chiffre à mentionner, ce qu’il a dit à l’appel, ce qu’il faut éviter…" ${threadBusy ? 'disabled' : ''}>${esc(dir.instruction)}</textarea>
      <div class="row"><button id="go" class="primary ${threadBusy ? 'busy' : ''}" ${threadBusy ? 'disabled' : ''}>${threadBusy ? (st.state === 'drafting' ? 'Claude rédige… (≈ 1 min)' : 'Claude va rédiger…') : (opts.length ? 'Refaire avec ce cap' : 'Rédiger la réponse')}</button>${st?.state === 'error' ? `<span class="err small">Échec : ${esc(st.error)} — réessayez</span>` : `<span class="muted small">${threadBusy ? esc(st.direction || '') : 'Claude lit la conversation et le playbook'}</span>`}</div>
    </div>` : '';
  // What the app learned from the last send on this thread (confirmed = sent as drafted; lesson = logged in 04-CAS-APPRIS).
  const learnLine = d.learning && (d.learning.state === 'waiting' || d.learning.state === 'learning')
    ? '<p class="muted small learn">Claude note ce que vous avez envoyé…</p>'
    : d.learning?.state === 'error' ? `<p class="err small">Leçon non notée : ${esc(d.learning.error)}</p>`
    : d.lastLesson && (!d.suggestion || d.lastLesson.at >= d.suggestion.created_at) ? `<p class="muted small learn">Appris ${ago(d.lastLesson.at)} : ${d.lastLesson.kind === 'confirmed' ? 'brouillon validé tel quel' : d.lastLesson.kind === 'lesson' ? `leçon notée — ${esc(d.lastLesson.title || '')}` : d.lastLesson.kind === 'minor' ? 'retouche notée' : 'rien à retenir'}</p>` : '';
  const sugg = (opts.length
    ? `<p class="muted small">Brouillon de Claude · ${ago(d.suggestion.created_at)}${d.suggestion.source === 'chat' ? ' · depuis le chat' : ''}</p>`
      + (d.suggestion.instruction ? `<p class="consigne small">${esc(d.suggestion.instruction)}</p>` : '')
      + (d.suggestion.note ? `<p class="note small">À savoir : ${esc(d.suggestion.note)}</p>` : '')
      + opts.map((o, i) => `<div class="card opt" data-i="${i}">${o.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copy="${i}:${j}">Copier</button></div>`).join('')}${o.why ? `<details><summary>Pourquoi</summary>${esc(o.why)}</details>` : ''}<div class="acts">${d.windowOpen ? `<button class="primary small" data-send="${i}" ${sendLock ? 'disabled' : ''}>Envoyer telle quelle</button><button class="small" data-use="${i}">Modifier avant envoi</button>` : ''}<button class="small" data-copyall="${i}">Tout copier</button></div></div>`).join('')
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
    ${ctx ? `<div class="ctx">${ctx}</div>` : ''}
    <div class="thread">${msgs}</div>
    ${panel}${sendBox}${sugg}${compose}
    <div class="row"><button id="hd" class="small" ${t.pending ? '' : 'disabled'}>Marquer comme traité</button><button id="mute" class="small">${t.muted ? 'Réactiver les notifications' : 'Ne plus notifier ce lead'}</button><button id="rf" class="small">↻</button></div>`;
  // A redraw of the same conversation keeps the scroll; a fresh open lands on the newest message.
  if (sameScreen) window.scrollTo(0, y); else { openedWaId = waId; scrollToLast(); requestAnimationFrame(scrollToLast); }
  if (d.windowOpen) {
    const redraw = () => { lastThreadKey = ''; renderThread(waId).catch((e) => toast(e.message)); };
    document.querySelectorAll('[data-obj]').forEach((b) => b.onclick = () => { dir.objective = dir.objective === b.dataset.obj ? '' : b.dataset.obj; dir.level = ''; redraw(); });
    document.querySelectorAll('[data-lvl]').forEach((b) => b.onclick = () => { dir.level = dir.level === b.dataset.lvl ? '' : b.dataset.lvl; redraw(); });
    document.querySelectorAll('[data-tone]').forEach((b) => b.onclick = () => { dir.tone = b.dataset.tone; redraw(); });
    $('#ins').oninput = (e) => { dir.instruction = e.target.value; };
    $('#go').onclick = async () => {
      if (!dir.objective && !dir.instruction.trim()) { toast('Choisissez un cap, ou écrivez une consigne'); return; }
      if (objective?.levels && !dir.level) { toast(objective.levels === true ? 'Jusqu’où on descend ?' : 'Quel acompte ?'); return; }
      $('#go').disabled = true; $('#go').textContent = 'Demande envoyée…';
      try { await api(`/api/thread/${waId}/suggest`, { method: 'POST', body: { ...dir, instruction: dir.instruction.trim() } }); toast('Claude rédige — environ une minute'); lastThreadKey = ''; route(); }
      catch (e) { toast(e.message); $('#go').disabled = false; }
    };
  }
  document.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.use); composer = opts[i].bubbles.join('\n\n'); composerFrom = { suggestionId: d.suggestion.id, option: i }; if ($('#tx')) { $('#tx').value = composer; $('#send').disabled = false; $('#tx').focus(); $('#tx').scrollIntoView({ block: 'center' }); } });
  document.querySelectorAll('[data-send]').forEach((b) => armed(b, 'Envoyer telle quelle', async () => { const i = Number(b.dataset.send); b.disabled = true; try { await sendBubbles(waId, opts[i].bubbles, { suggestionId: d.suggestion.id, option: i, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { const [i, j] = b.dataset.copy.split(':').map(Number); copyText(opts[i].bubbles[j], b); });
  document.querySelectorAll('[data-copyall]').forEach((b) => b.onclick = () => copyText(opts[Number(b.dataset.copyall)].bubbles.join('\n\n'), b));
  $('#rf').onclick = async () => { await api(`/api/thread/${waId}/refresh`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#mute').onclick = async () => { await api(`/api/thread/${waId}/mute`, { method: 'POST', body: { muted: !t.muted } }); lastThreadKey = ''; route(); };
  if (d.windowOpen) {
    document.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { const ta = $('#tx'); const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emoji + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emoji.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
    $('#tx').oninput = (e) => { composer = e.target.value; $('#send').disabled = !composer.trim() || sendLock; if (composerFrom) composerFrom.edited = composer !== opts[composerFrom.option]?.bubbles.join('\n\n'); };
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
  const card = (f) => `<div class="card flag ${f.kind}" data-id="${f.id}"><div class="flag-head"><span class="pill ${f.kind === 'erreur' ? 'bad' : 'good'}">${f.kind === 'erreur' ? 'Erreur' : 'Amélioration'}</span><span class="muted small">${ago(f.at)}</span></div>
    <div class="flag-who">+${f.wa_id}${f.name ? ` · ${esc(f.name)}` : ''}</div>
    <div class="flag-title">${esc(f.title)}</div>
    ${f.detail ? `<div class="small">${esc(f.detail)}</div>` : ''}${f.quote ? `<div class="quote small">« ${esc(f.quote)} »</div>` : ''}
    <div class="acts"><button class="small" data-thread="${f.wa_id}">${tmOpen.has(f.wa_id) ? 'Masquer la conversation' : 'Voir la conversation'}</button><button class="small" data-seen="${f.id}" data-v="${f.seen ? 0 : 1}">${f.seen ? 'Remettre à traiter' : 'Vu'}</button></div>
    <div class="tmthread" id="tmt-${f.wa_id}-${f.id}"></div></div>`;
  const running = status.state === 'running';
  app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a><h1>France TM <span class="muted small">bot de réservation</span></h1><button id="rv" class="small ${running ? 'busy' : ''}" ${running ? 'disabled' : ''}>${running ? 'Relecture…' : 'Relire maintenant'}</button></header>
    <p class="muted small">Claude relit toutes les 2 h les conversations du numéro télémarketing (+33671283778) et signale ce que le bot fait mal ou pourrait faire mieux.${status.last ? ` Dernière relecture ${ago(status.last.at)} : ${status.last.threads} conversation(s), ${status.last.flags} signalement(s).` : ''}${status.error ? ` <span class="err">Dernière erreur : ${esc(status.error)}</span>` : ''}</p>
    ${fresh.length ? fresh.map(card).join('') : '<p class="muted center">Rien à traiter.</p>'}
    ${old.length ? `<details class="card"><summary>Déjà vus (${old.length})</summary>${old.map(card).join('')}</details>` : ''}`;
  $('#rv').onclick = async () => { $('#rv').disabled = true; try { await api('/api/tm/review', { method: 'POST' }); toast('Relecture lancée — 1 à 2 minutes'); } catch (e) { toast(e.message); } setTimeout(route, 1500); };
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
  if (!m) { composer = ''; composerFrom = null; dir = { objective: '', level: '', tone: 'standard', instruction: '' }; lastThreadKey = ''; threadBusy = false; openedWaId = ''; clearTimeout(threadTimer); }
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
