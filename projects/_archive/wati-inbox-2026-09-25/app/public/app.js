// Wati Inbox client: two screens (/ inbox, /t/<waId> thread), login, push toggle.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const left = (h) => { const r = 24 - h; return r < 1 ? `${Math.max(1, Math.round(r * 60))} min` : `${Math.floor(r)} h`; };
const windowBadge = (open, h) => open ? `<span class="badge ${24 - h < 2 ? 'soon' : 'open'}">${left(h)} restantes</span>` : '<span class="badge closed">fermée · template</span>';
let toastTimer;
const toast = (msg) => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800); };

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = 'Copié'; setTimeout(() => { btn.textContent = old; }, 1200); }
}

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { renderLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}
const go = (path) => { history.pushState(null, '', path); route(); };
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-nav]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });

// ── login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `<div class="login card"><h1>Wati Inbox</h1><p class="muted">Mot de passe de l'app (dans le fichier .env sur le Mac).</p>
    <form id="lf"><input type="password" name="password" placeholder="Mot de passe" autofocus><div class="row"><button class="primary">Entrer</button><span class="err" id="le"></span></div></form></div>`;
  $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/login', { method: 'POST', body: { password: e.target.password.value } }); route(); } catch (err) { $('#le').textContent = err.message; } };
}

// ── push ─────────────────────────────────────────────────────────────────────
const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function pushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  const info = await api('/api/push');
  return info.endpoints.includes(sub.endpoint) ? 'on' : 'off';
}
async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/api/push');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
  await api('/api/push', { method: 'POST', body: { subscription: sub.toJSON() } });
}
async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
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
async function renderInbox() {
  const { threads } = await api('/api/inbox');
  const q = inboxFilter.trim().toLowerCase();
  const shown = q ? threads.filter((t) => (t.name || '').toLowerCase().includes(q) || t.wa_id.includes(q.replace(/\D/g, '') || '§')) : threads;
  const pending = shown.filter((t) => t.pending && !t.muted), done = shown.filter((t) => !t.pending || t.muted);
  setBadge(threads.filter((t) => t.pending && !t.muted).length);
  const row = (t) => `<a class="card lead-row" data-nav href="/t/${t.wa_id}">${t.pending && !t.muted ? '<span class="dot"></span>' : ''}<div class="who"><div class="name">${esc(t.name || t.wa_id)}${t.country === 'Switzerland' ? '<span class="pill">CHF</span>' : ''}${t.muted ? '<span class="pill">silencieux</span>' : ''} <span class="muted small">${t.last_inbound_at ? ago(t.last_inbound_at) : ''}</span></div><div class="txt">${esc(t.last_text)}</div></div>${t.hoursSinceLead != null ? windowBadge(t.windowOpen, t.hoursSinceLead) : ''}</a>`;
  const digits = q.replace(/\D/g, '');
  const direct = /^\d{8,15}$/.test(digits) && !threads.some((t) => t.wa_id === digits) ? `<a class="card lead-row" data-nav href="/t/${digits}"><div class="who"><div class="name">Ouvrir la conversation +${digits}</div><div class="txt">Nouveau numéro — template si la fenêtre est fermée, message libre sinon</div></div></a>` : '';
  app.innerHTML = `<header><h1>Wati Inbox${pending.length ? ` <span class="pill">${pending.length}</span>` : ''}</h1><button id="rf" class="small">↻</button></header>
    <input class="search" id="q" placeholder="Nom, ou numéro collé (ex. +33 6 12 34 56 78)" value="${esc(inboxFilter)}" inputmode="search">${direct}
    <div class="row" style="margin:0 0 12px">${await pushButton()}<span class="muted small">${threads.length ? '' : 'Aucune conversation encore — le Mac lit Wati toutes les 45 s.'}</span></div>
    ${pending.length ? `<p class="muted small">En attente de réponse (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Aucun lead en attente.</p>'}
    ${done.length ? `<p class="muted small" style="margin-top:18px">Récents</p>${done.map(row).join('')}` : ''}`;
  $('#rf').onclick = route; bindPush();
  $('#q').oninput = (e) => { inboxFilter = e.target.value; clearTimeout(window._qt); window._qt = setTimeout(() => { const pos = e.target.selectionStart; renderInbox().then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); }); }, 250); };
}

// ── thread ───────────────────────────────────────────────────────────────────
let composer = '', composerFrom = null, lastThreadKey = '';
async function sendBubbles(waId, bubbles, meta = {}) {
  if (!bubbles.length) return false;
  await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles, ...meta } });
  composer = ''; composerFrom = null; toast('Envoyé');
  return true;
}
// Two taps to send: the first turns the button into "Confirmer …" for 5 s, the second sends.
// (Browser confirm() pop-ups get silently blocked after a few uses, which looked like a dead button.)
function armed(btn, label, fn) {
  btn.onclick = async () => {
    if (btn.dataset.armed) { clearTimeout(btn._t); delete btn.dataset.armed; btn.textContent = label; await fn(); return; }
    btn.dataset.armed = '1'; const was = btn.textContent; btn.textContent = `Confirmer : ${label.toLowerCase()}`;
    btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; }, 5000);
  };
}
async function renderThread(waId, { quiet = false } = {}) {
  const d = await api(`/api/thread/${waId}`);
  const t = d.thread;
  const key = `${d.messages.length}|${d.messages[d.messages.length - 1]?.id}|${d.suggestion?.id}|${d.wanted}|${t.pending}|${t.muted}`;
  if (quiet && key === lastThreadKey) return; // background refresh: nothing changed, keep the screen as is
  lastThreadKey = key;
  let lastDay = '';
  const msgs = d.messages.map((m) => { const day = fmtDay(m.at); const h = (day !== lastDay ? `<div class="day">${day}</div>` : '') + `<div class="msg ${m.who}">${esc(m.text)}<time>${fmtTime(m.at)}${m.tpl ? ' · template' : ''}</time></div>`; lastDay = day; return h; }).join('');
  const ctx = [t.stage && `<b>${esc(t.stage)}</b>`, t.meeting && `entretien ${esc(t.meeting)}`, t.country && `${esc(t.country)}${t.country === 'Switzerland' ? ' · <b>prix en CHF</b>' : ''}`, d.templatesSent.length && `templates app : ${d.templatesSent.map((s) => esc(s.name)).join(', ')}`].filter(Boolean).join(' · ');
  const opts = d.suggestion?.options || [];
  const askBtn = `<button id="ask" class="small" ${d.wanted ? 'disabled' : ''}>${d.wanted ? 'Suggestion demandée — en attente de Claude' : (opts.length ? 'Nouvelle suggestion' : 'Demander une suggestion')}</button>`;
  const sugg = opts.length
    ? `<p class="muted small">Suggestions (${ago(d.suggestion.created_at)})</p>` + opts.map((o, i) => `<div class="card opt" data-i="${i}">${o.bubbles.map((b, j) => `<div class="b"><span>${esc(b)}</span><button class="small" data-copy="${i}:${j}">Copier</button></div>`).join('')}${o.why ? `<details><summary>Pourquoi</summary>${esc(o.why)}</details>` : ''}<div class="acts">${d.windowOpen ? `<button class="primary small" data-send="${i}">Envoyer telle quelle</button>` : ''}<button class="small" data-use="${i}">Modifier avant envoi</button><button class="small" data-copyall="${i}">Tout copier</button></div></div>`).join('')
    : `<p class="muted small">Pas encore de suggestion — elles arrivent quand Claude Code veille sur le Mac.</p>`;
  const tplBox = `<input id="tplq" placeholder="Filtrer les templates (ex. followup, noshow)"><select id="tpl" style="margin-top:8px"><option value="">Chargement des templates français…</option></select><div id="tplv" class="muted small" style="margin-top:8px;white-space:pre-wrap"></div><div id="tplp"></div><div class="row"><button class="primary" id="sendt" disabled>Envoyer le template</button><span id="stt"></span></div>`;
  const compose = d.windowOpen
    ? `<div class="card"><p class="muted small">Une bulle par paragraphe (ligne vide entre deux bulles).</p><div class="emojis">${['😊','👍','😁','🙂','🙏','💪','✅','🚀','🎉','😉'].map((e) => `<button class="small" data-emoji="${e}" type="button">${e}</button>`).join('')}</div><textarea id="tx" placeholder="Votre réponse…">${esc(composer)}</textarea><div class="row"><button class="primary" id="send" ${composer.trim() ? '' : 'disabled'}>Envoyer</button><button id="clr">Effacer</button><span id="st"></span></div></div><details class="card"><summary>Envoyer un template à la place</summary>${tplBox}</details>`
    : `<div class="card"><p class="muted small">${d.messages.length ? 'Fenêtre de 24h fermée — seul un template peut partir.' : 'Aucune conversation lisible pour ce numéro (jamais écrit sur le numéro Sales, ou lead TM) — un template peut partir.'}</p>${tplBox}</div>`;
  app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a><h1>${esc(t.name || waId)} <span class="muted small">+${waId}</span></h1>${windowBadge(d.windowOpen, d.hoursSinceLead ?? 24)}</header>
    ${ctx ? `<div class="ctx">${ctx}</div>` : ''}
    <div class="thread">${msgs}</div>
    <div class="row" style="margin:6px 0 10px">${askBtn}</div>${sugg}${compose}
    <div class="row"><button id="hd" class="small" ${t.pending ? '' : 'disabled'}>Marquer comme traité</button><button id="mute" class="small">${t.muted ? 'Réactiver les notifications' : 'Ne plus notifier ce lead'}</button><button id="rf" class="small">↻</button></div>`;
  $('#ask').onclick = async () => { $('#ask').disabled = true; try { await api(`/api/thread/${waId}/suggest`, { method: 'POST' }); toast('Demande envoyée à Claude'); route(); } catch (e) { toast(e.message); } };
  document.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.use); composer = opts[i].bubbles.join('\n\n'); composerFrom = { suggestionId: d.suggestion.id, option: i }; if ($('#tx')) { $('#tx').value = composer; $('#send').disabled = false; $('#tx').focus(); $('#tx').scrollIntoView({ block: 'center' }); } });
  document.querySelectorAll('[data-send]').forEach((b) => armed(b, 'Envoyer telle quelle', async () => { const i = Number(b.dataset.send); b.disabled = true; try { await sendBubbles(waId, opts[i].bubbles, { suggestionId: d.suggestion.id, option: i, edited: false }); lastThreadKey = ''; route(); } catch (e) { toast(e.message); b.disabled = false; } }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { const [i, j] = b.dataset.copy.split(':').map(Number); copyText(opts[i].bubbles[j], b); });
  document.querySelectorAll('[data-copyall]').forEach((b) => b.onclick = () => copyText(opts[Number(b.dataset.copyall)].bubbles.join('\n\n'), b));
  $('#rf').onclick = async () => { await api(`/api/thread/${waId}/refresh`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); lastThreadKey = ''; route(); };
  $('#mute').onclick = async () => { await api(`/api/thread/${waId}/mute`, { method: 'POST', body: { muted: !t.muted } }); lastThreadKey = ''; route(); };
  if (d.windowOpen) {
    document.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { const ta = $('#tx'); const a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + b.dataset.emoji + ta.value.slice(z); ta.selectionStart = ta.selectionEnd = a + b.dataset.emoji.length; ta.focus(); ta.dispatchEvent(new Event('input')); });
    $('#tx').oninput = (e) => { composer = e.target.value; $('#send').disabled = !composer.trim(); if (composerFrom) composerFrom.edited = composer !== opts[composerFrom.option]?.bubbles.join('\n\n'); };
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
    const sel = $('#tpl');
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
  // Open at the end of the conversation (the newest message), not at the top.
  if (!quiet) requestAnimationFrame(() => { const last = document.querySelector('.thread .msg:last-child'); (last || $('.thread')).scrollIntoView({ block: 'start' }); });
}

// ── router ───────────────────────────────────────────────────────────────────
async function route() {
  const m = /^\/t\/(\d+)/.exec(location.pathname);
  if (!m) { composer = ''; composerFrom = null; lastThreadKey = ''; }
  try { m ? await renderThread(m[1]) : await renderInbox(); }
  catch (e) { if (e.message !== 'login') app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a></header><p class="err">${esc(e.message)}</p>`; }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
// Background refresh while the app is on screen: inbox every 60 s, open thread every 30 s (only redraws if something changed).
setInterval(() => { if (document.visibilityState !== 'visible') return; const m = /^\/t\/(\d+)/.exec(location.pathname); if (m) renderThread(m[1], { quiet: true }).catch(() => {}); }, 30_000);
setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/') route(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const m = /^\/t\/(\d+)/.exec(location.pathname); m ? renderThread(m[1], { quiet: true }).catch(() => {}) : route(); } });
