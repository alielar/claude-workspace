// Wati Inbox client: two screens (/ inbox, /t/<waId> thread), login, push toggle.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const left = (h) => { const r = 24 - h; return r < 1 ? `${Math.max(1, Math.round(r * 60))} min restantes` : `${Math.floor(r)} h restantes`; };

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
  return `<button id="pb" data-state="${s}" ${s === 'blocked' || s === 'unsupported' || s === 'needs-install' ? 'disabled' : ''}>${label}</button>`;
}
function bindPush() {
  const b = $('#pb'); if (!b) return;
  b.onclick = async () => { b.disabled = true; try { b.dataset.state === 'on' ? await disablePush() : await enablePush(); } catch (e) { alert(e.message); } route(); };
}

// ── inbox ────────────────────────────────────────────────────────────────────
async function renderInbox() {
  const { threads } = await api('/api/inbox');
  const pending = threads.filter((t) => t.pending), done = threads.filter((t) => !t.pending);
  const row = (t) => `<a class="card lead-row" data-nav href="/t/${t.wa_id}">${t.pending ? '<span class="dot"></span>' : ''}<div class="who"><div class="name">${esc(t.name || t.wa_id)} <span class="muted small">${t.last_inbound_at ? ago(t.last_inbound_at) : ''}</span></div><div class="txt">${esc(t.last_text)}</div></div><span class="badge ${t.windowOpen ? 'open' : 'closed'}">${t.windowOpen ? '24h' : 'template'}</span></a>`;
  app.innerHTML = `<header><h1>Wati Inbox</h1><button id="rf">↻</button></header>
    <div class="row" style="margin:0 0 12px">${await pushButton()}<span class="muted small">${threads.length ? '' : 'Aucune conversation encore — le Mac lit Wati toutes les 45 s.'}</span></div>
    ${pending.length ? `<p class="muted small">En attente de réponse (${pending.length})</p>${pending.map(row).join('')}` : '<p class="muted center">Aucun lead en attente.</p>'}
    ${done.length ? `<p class="muted small" style="margin-top:18px">Récents</p>${done.map(row).join('')}` : ''}`;
  $('#rf').onclick = route; bindPush();
}

// ── thread ───────────────────────────────────────────────────────────────────
let composer = '';
async function renderThread(waId) {
  const d = await api(`/api/thread/${waId}`);
  const t = d.thread;
  let lastDay = '';
  const msgs = d.messages.map((m) => { const day = fmtDay(m.at); const h = (day !== lastDay ? `<div class="day">${day}</div>` : '') + `<div class="msg ${m.who}">${esc(m.text)}<time>${fmtTime(m.at)}${m.tpl ? ' · template' : ''}</time></div>`; lastDay = day; return h; }).join('');
  const sugg = d.suggestion ? `<p class="muted small">Suggestions (${ago(d.suggestion.created_at)}) — touchez pour remplir</p>` + d.suggestion.options.map((o, i) => `<div class="card opt" data-i="${i}">${o.bubbles.map((b) => `<div class="b">${esc(b)}</div>`).join('')}${o.why ? `<details><summary>Pourquoi</summary>${esc(o.why)}</details>` : ''}</div>`).join('') : `<p class="muted small">Pas encore de suggestion — elles arrivent quand Claude Code veille sur le Mac.</p>`;
  const compose = d.windowOpen
    ? `<div class="card"><p class="muted small">Une bulle par paragraphe (ligne vide entre deux bulles).</p><textarea id="tx" placeholder="Votre réponse…">${esc(composer)}</textarea><div class="row"><button class="primary" id="send">Envoyer</button><button id="clr">Effacer</button><span id="st"></span></div></div>`
    : `<div class="card"><p class="muted small">Fenêtre de 24h fermée — seul un template peut partir.</p><select id="tpl"><option value="">Chargement des templates français…</option></select><div id="tplv" class="muted small" style="margin-top:8px;white-space:pre-wrap"></div><div id="tplp"></div><div class="row"><button class="primary" id="sendt" disabled>Envoyer le template</button><span id="st"></span></div></div>`;
  app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a><h1>${esc(t.name || waId)} <span class="muted small">+${waId}</span></h1><span class="badge ${d.windowOpen ? 'open' : 'closed'}">${d.windowOpen ? `ouverte · ${left(d.hoursSinceLead)}` : 'fermée'}</span></header>
    ${d.templatesSent.length ? `<p class="muted small">Templates envoyés depuis l'app : ${d.templatesSent.map((s) => `${s.name} (${fmtDay(s.at)})`).join(', ')}</p>` : ''}
    <div class="thread">${msgs}</div>${sugg}${compose}
    <div class="row"><button id="hd" ${t.pending ? '' : 'disabled'}>Marquer comme traité</button><button id="rf">↻ Actualiser</button></div>`;
  document.querySelectorAll('.opt').forEach((el) => el.onclick = () => { const o = d.suggestion.options[Number(el.dataset.i)]; composer = o.bubbles.join('\n\n'); if ($('#tx')) { $('#tx').value = composer; $('#tx').focus(); } });
  $('#rf').onclick = async () => { await api(`/api/thread/${waId}/refresh`, { method: 'POST' }); route(); };
  $('#hd').onclick = async () => { await api(`/api/thread/${waId}/handled`, { method: 'POST' }); route(); };
  if (d.windowOpen) {
    $('#tx').oninput = (e) => { composer = e.target.value; };
    $('#clr').onclick = () => { composer = ''; $('#tx').value = ''; };
    $('#send').onclick = async () => {
      const bubbles = $('#tx').value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      if (!bubbles.length) return;
      if (!confirm(`Envoyer ${bubbles.length} bulle(s) à ${t.name || waId} ?`)) return;
      $('#send').disabled = true; $('#st').textContent = 'Envoi…';
      try { await api(`/api/thread/${waId}/send`, { method: 'POST', body: { bubbles } }); composer = ''; route(); }
      catch (e) { $('#st').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#send').disabled = false; }
    };
  } else {
    const { templates } = await api('/api/templates');
    const sel = $('#tpl'); sel.innerHTML = '<option value="">Choisir un template…</option>' + templates.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
    sel.onchange = () => {
      const x = templates.find((y) => y.name === sel.value); $('#sendt').disabled = !x;
      $('#tplv').textContent = x ? x.body : '';
      $('#tplp').innerHTML = x ? x.params.map((p) => `<input data-p="${esc(p)}" placeholder="${esc(p)}" value="${p === 'name' ? esc((t.name || '').split(' ')[0]) : ''}" style="margin-top:8px">`).join('') : '';
    };
    $('#sendt').onclick = async () => {
      const params = Object.fromEntries([...document.querySelectorAll('#tplp input')].map((i) => [i.dataset.p, i.value]));
      if (!confirm(`Envoyer le template ${sel.value} à ${t.name || waId} ?`)) return;
      $('#sendt').disabled = true; $('#st').textContent = 'Envoi…';
      try { await api(`/api/thread/${waId}/template`, { method: 'POST', body: { template: sel.value, params } }); route(); }
      catch (e) { $('#st').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('#sendt').disabled = false; }
    };
  }
}

// ── router ───────────────────────────────────────────────────────────────────
async function route() {
  const m = /^\/t\/(\d+)/.exec(location.pathname);
  try { m ? await renderThread(m[1]) : await renderInbox(); }
  catch (e) { if (e.message !== 'login') app.innerHTML = `<header><a data-nav href="/">‹ Inbox</a></header><p class="err">${esc(e.message)}</p>`; }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/') route(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') route(); });
