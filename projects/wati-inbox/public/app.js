// Wati notifications — notification-only mode. Login, the push toggle, and a short status.
const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { renderLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}
function renderLogin() {
  app.innerHTML = `<div class="login card"><h1>Wati notifications</h1><p class="muted">Mot de passe de l'app (dans le fichier .env sur le Mac).</p>
    <form id="lf"><input type="password" name="password" placeholder="Mot de passe" autofocus><div class="row"><button class="primary">Entrer</button><span class="err" id="le"></span></div></form></div>`;
  $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/login', { method: 'POST', body: { password: e.target.password.value } }); render(); } catch (err) { $('#le').textContent = err.message; } };
}
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
async function render() {
  try {
    const st = await api('/api/status');
    const s = await pushState();
    const label = { on: 'Notifications activées sur cet appareil', off: 'Activer les notifications', blocked: 'Notifications bloquées dans les réglages', 'needs-install': "Ajoutez l'app à l'écran d'accueil pour les notifications", unsupported: 'Notifications non disponibles ici' }[s];
    app.innerHTML = `<header><h1>Wati notifications</h1></header>
      <div class="card"><button id="pb" class="primary" data-state="${s}" ${['blocked', 'unsupported', 'needs-install'].includes(s) ? 'disabled' : ''}>${label}</button>
      <p class="muted small" style="margin:10px 0 0">${st.devices} appareil(s) abonné(s) · dernière lecture de Wati ${ago(st.lastPoll)} · une notification par message reçu sur le numéro France Sales, touchez-la pour ouvrir Wati.</p></div>
      ${st.recent.length ? `<p class="muted small">Derniers messages reçus</p>${st.recent.map((r) => `<div class="card"><b>${esc(r.name)}</b> <span class="muted small">${ago(r.at)}</span><div class="muted small">${esc(r.text)}</div></div>`).join('')}` : ''}`;
    $('#pb').onclick = async () => { $('#pb').disabled = true; try { s === 'on' ? await disablePush() : await enablePush(); } catch (e) { alert(e.message); } render(); };
  } catch (e) { if (e.message !== 'login') app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
render();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
