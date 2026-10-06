// Leads who received the CPF question (cpf-campaign.mjs). Their replies get their own inbox section and a closing
// draft: thank them, note the answer, no selling (Ali, 2026-10-06).

import fs from 'node:fs';

const PLAN = new URL('./data/cpf-plan.json', import.meta.url);
let cache = { mtime: 0, sent: new Map() };

// waId → ISO time the CPF template went out, null when it was not sent to that lead.
export function cpfSentAt(waId) {
  try {
    const m = fs.statSync(PLAN).mtimeMs;
    if (m !== cache.mtime) {
      const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
      cache = { mtime: m, sent: new Map(plan.leads.filter((r) => r.status === 'sent' && r.sentAt).map((r) => [r.phone, r.sentAt])) };
    }
  } catch { return null; }
  return cache.sent.get(String(waId)) || null;
}

// The lead wrote after receiving the CPF question.
export const isCpfReply = (t) => { const s = cpfSentAt(t.wa_id); return !!(s && t.last_inbound_at && new Date(t.last_inbound_at) > new Date(s)); };

export const CPF_DRAFT = `
## Réponse à notre question CPF : on conclut, on ne vend pas
Ce lead avait refusé l'offre. Nous lui avons envoyé le template \`cpf_question\` (« si vous pouviez utiliser votre CPF pour financer notre programme d'anglais, est-ce que vous seriez plus ouvert pour commencer ? »). C'est une question pour mesurer l'intérêt, pas une relance commerciale. Il vient de répondre.
Rédige UNE réponse de clôture, 1 ou 2 bulles courtes : prendre note et remercier (« C'est bien noté, merci beaucoup pour votre retour »), éventuellement une phrase chaleureuse qui ferme l'échange. Pas d'offre, pas de prix, pas de relance, pas de question, aucune promesse sur le CPF (aujourd'hui nous ne pouvons pas l'encaisser). Ne réponds jamais \`skip\` sauf message vide.
Si le lead pose une vraie question (comment utiliser son CPF, un prix, une date…), ne réponds pas à sa place : mets dans \`needs\` la question pour Ali, aucune bulle.
Mets \`cloture\` dans \`moves\`.
`;
