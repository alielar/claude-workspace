// Sales Hub — read-only access to the FR automations (Mateo, 2026-10-01). GET only, French market only.
// Limits: 30 calls/min, 600/h; on 429 wait Retry-After. Token lives in .env (SALES_HUB_TOKEN), never in code.
//
//   node --env-file=.env hub.mjs                 check the access: counts, a sample lead, the templates
//   node --env-file=.env hub.mjs +33612345678    one lead and its next 5 steps

const BASE = (process.env.SALES_HUB_API || 'https://hub.easypeasyfluent.com/api/ext/v1/automations').replace(/\/$/, '');
const TOKEN = process.env.SALES_HUB_TOKEN || '';
export const hubReady = () => !!TOKEN;

async function get(path, params = {}) {
  if (!TOKEN) throw new Error('SALES_HUB_TOKEN manquant dans .env');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  if (r.status === 429) { const wait = Number(r.headers.get('retry-after') || 10); const e = new Error(`Sales Hub: trop d'appels, réessayer dans ${wait} s`); e.retryAfter = wait; throw e; }
  if (!r.ok) throw new Error(`Sales Hub ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export const hubLeads = () => get('/leads');
export const hubLead = (phone) => get('/leads', { phone: String(phone).startsWith('+') ? phone : `+${String(phone).replace(/\D/g, '')}` });
export const hubUpcoming = (leadId) => get(`/leads/${encodeURIComponent(leadId)}/upcoming`);
export const hubTemplates = () => get('/templates');

if (process.argv[1] && process.argv[1].endsWith('hub.mjs')) {
  const phone = process.argv[2];
  try {
    if (phone) {
      const lead = await hubLead(phone);
      console.log(JSON.stringify(lead, null, 2));
      const rows = Array.isArray(lead) ? lead : lead.leads || lead.data || [lead];
      const id = rows[0]?.id || rows[0]?.leadId;
      if (id) console.log('\nupcoming:', JSON.stringify(await hubUpcoming(id), null, 2));
    } else {
      const leads = await hubLeads();
      const rows = Array.isArray(leads) ? leads : leads.leads || leads.data || [];
      console.log(`leads: ${rows.length}`);
      const by = {}; for (const l of rows) by[l.status] = (by[l.status] || 0) + 1;
      console.log('by status:', JSON.stringify(by));
      console.log('sample:', JSON.stringify(rows[0], null, 2));
      const tpl = await hubTemplates();
      const steps = Array.isArray(tpl) ? tpl : tpl.templates || tpl.steps || tpl.data || [];
      console.log(`templates: ${steps.length}${tpl.watiAsOf ? ` (WATI read ${tpl.watiAsOf})` : ''}`);
      for (const s of steps) console.log(` - ${s.template || s.name || s.templateName} · day ${s.day} ${s.time || ''} ${s.anchor ? `(${s.anchor})` : ''} ${s.enabled === false ? 'OFF' : ''}`);
    }
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
}
