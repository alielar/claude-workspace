// Wati calls, ported from lead.mjs / send.mjs / check-templates.mjs in "Wati outreach".

const BASE = (process.env.WATI_ENDPOINT || '').replace(/\/+$/, '');
const TOKEN = (process.env.WATI_TOKEN || '').replace(/^Bearer\s+/i, '');
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// Numbers we treat as French-speaking leads (same list as refresh-fr-threads.mjs).
export const FR = /^(33|32|41|212|213|216|221|225|229|237|241|242|243|261|509|590|594|596|262|687|689)/;

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.status === 429) throw new Error('Wati rate limit — wait a minute.');
  if (!res.ok) throw new Error(`Wati ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Wati sent unreadable data: ${text.slice(0, 120)}`); }
}

// CRM record of one contact (v3 API), the fields lead.mjs prints.
export async function getContact(waId) {
  const res = await fetch(`https://eu-api.wati.io/api/ext/v3/contacts/${waId}`, { headers: H });
  if (!res.ok) return null;
  const c = await res.json();
  const param = (n) => (c.custom_params || []).find((x) => x.name === n)?.value || '';
  return { name: c.name || param('name') || '', stage: param('lead_stage'), meeting: param('meeting_date'), country: param('country'), email: param('email') };
}

// Contacts most recently updated first (Wati sorts getContacts by lastUpdated desc).
export async function recentContacts(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const r = await call(`/api/v1/getContacts?pageSize=100&pageNumber=${p}`);
    const list = r.contact_list || [];
    out.push(...list.map((c) => ({ waId: String(c.wAid || c.phone || ''), name: c.fullName || c.firstName || '', last: c.lastUpdated || '' })));
    if (list.length < 100) break;
  }
  return out;
}

// Broadcast (template) items carry the text in finalText and have no owner flag;
// a FAILED one is shown as such so the app never pretends it went out.
const normalise = (m) => {
  const tpl = !!m.templateId || m.eventType === 'broadcastMessage';
  let text = m.text || m.finalText || (m.type && m.type !== 'text' ? `(${m.type})` : '');
  if (m.eventType === 'broadcastMessage' && m.statusString === 'FAILED') text = `ÉCHEC template — ${m.failedDetail || 'raison inconnue'}`;
  return {
    id: m.id,
    at: m.created || new Date(Number(m.timestamp) * 1000).toISOString(),
    who: m.owner || m.eventType === 'broadcastMessage' ? 'US' : 'LEAD',
    text, kind: m.type || (tpl ? 'template' : 'text'), tpl, op: m.operatorName || '',
    status: m.statusString || '',
  };
};

// Full conversation on the France Sales number, oldest first. Empty entries are receipts.
export async function getThread(waId, maxPages = 6) {
  const msgs = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await call(`/api/v1/getMessages/${waId}?pageSize=100&pageNumber=${p}`);
    const items = r.messages?.items || [];
    msgs.push(...items.filter((m) => m.eventType === 'message' || m.eventType === 'broadcastMessage').map(normalise));
    if (items.length < 100) break;
  }
  return msgs.filter((m) => String(m.text).trim()).sort((a, b) => a.at.localeCompare(b.at));
}

// Free-text reply, only valid while the lead's 24h window is open.
export async function sendText(waId, text) {
  const r = await call(`/api/v1/sendSessionMessage/${waId}?messageText=${encodeURIComponent(text)}`, { method: 'POST' });
  if (r.result !== true && r.result !== 'success') throw new Error(r.info || r.message || JSON.stringify(r).slice(0, 200));
  return r;
}

let tplCache = { at: 0, list: [] };
export async function frenchTemplates() {
  if (Date.now() - tplCache.at < 3600e3 && tplCache.list.length) return tplCache.list;
  const all = [];
  for (let p = 1; p <= 30; p++) {
    const r = await call(`/api/v1/getMessageTemplates?pageSize=100&pageNumber=${p}`);
    const items = r.messageTemplates || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  const lang = (t) => String(t.language?.key || t.language?.text || t.language || '').toLowerCase();
  tplCache = {
    at: Date.now(),
    list: all.filter((t) => t.status === 'APPROVED' && lang(t).startsWith('fr'))
      .map((t) => ({ name: t.elementName, body: t.body || t.bodyOriginal || '', params: (t.customParams || []).map((p) => p.paramName) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return tplCache.list;
}

export async function sendTemplate(waId, templateName, params) {
  const r = await call('/api/v1/sendTemplateMessages', {
    method: 'POST',
    body: {
      template_name: templateName,
      broadcast_name: `${templateName}_inbox_${new Date().toISOString().slice(0, 10)}`,
      receivers: [{ whatsappNumber: waId, customParams: Object.entries(params).map(([name, value]) => ({ name, value })) }],
    },
  });
  if (r.result !== true && r.result !== 'success') throw new Error(JSON.stringify(r.errors || r).slice(0, 300));
  return r;
}
