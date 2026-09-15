// Turns the French thread dump into transcript documents for a Claude Project.
// Conversations are grouped by WHAT HAPPENS IN THE TEXT, not by the CRM stage
// (CRM stages are unreliable: most "Sale" threads live on the other number).
import { readFileSync, writeFileSync } from 'node:fs';

const INTERNAL = new Set(['34695064884', '41788550527', '393755858639']);
const INTERNAL_NAME = /andrin|^test$|easypeasy|edueasy/i;
const threads = readFileSync('data/french/threads-full.jsonl', 'utf8').trim().split('\n')
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

const RX = {
  closing: /(bienvenue parmi nous|lien de paiement|vous êtes (bien )?inscrit|inscription (est )?(confirmée|validée)|résultats? d.admission|votre contrat|acompte|première mensualité|paiement (a été )?(reçu|validé)|j.ai (bien )?reçu (votre|le) (paiement|virement)|facture)/i,
  money: /(prix|tarifs?|combien (ça )?co[uû]te|co[uû]t|trop cher|budget|mensualit|alma|financement|cpf|opco|devis|réduction|remise|bourse|payer en|plusieurs fois|facilités? de paiement|pas les moyens)/i,
  time: /(pas le temps|trop occup|emploi du temps|je travaille beaucoup|manque de temps|pas de dispo)/i,
  trust: /(arnaque|sérieux|c.est fiable|garantie|remboursement|avis|escroc|confiance|méfian)/i,
  thirdParty: /(ma femme|mon mari|mon conjoint|ma conjointe|mes parents|en parler avec|mon employeur|\brh\b|drh|ma société|mon entreprise|opco)/i,
  defer: /(plus tard|l.année prochaine|le mois prochain|en septembre|en octobre|en janvier|pas maintenant|je reviendrai vers vous|rappelez-moi dans)/i,
  refusal: /(pas intéress|non merci|annuler ma demande|supprimer mon num|ne me contactez plus|stop)/i,
  booking: /(créneau|rendez-vous|entretien|je vous propose|dispo (lundi|mardi|mercredi|jeudi|vendredi)|\d{1,2}h\d{0,2})/i,
};

function analyse(t) {
  const lead = t.msgs.filter((m) => m.who === 'LEAD' && clean(m.text));
  const human = t.msgs.filter((m) => m.who === 'US' && !m.tpl && clean(m.text));
  const leadText = lead.map((m) => m.text).join('\n');
  const allText = t.msgs.map((m) => m.text || '').join('\n');
  return {
    lead: lead.length, human: human.length, turns: lead.length + human.length,
    closing: RX.closing.test(allText),
    money: RX.money.test(allText), moneyLead: RX.money.test(leadText),
    time: RX.time.test(leadText), trust: RX.trust.test(leadText),
    thirdParty: RX.thirdParty.test(leadText), defer: RX.defer.test(leadText),
    refusal: RX.refusal.test(leadText), booking: RX.booking.test(allText),
  };
}

// "Admin Account" is Ali's own Wati login: from March 2026 on it is the only
// operator answering on the France Sales number. Earlier months were written by
// other advisers (Manuel Peñas, Andrin Koller) under the personas Juliette/Leyla.
const ALI = 'Admin Account';
const aliMsgs = (t) => t.msgs.filter((m) => m.who === 'US' && !m.tpl && m.op === ALI && clean(m.text)).length;

const responsive = threads
  .filter((t) => !INTERNAL.has(t.phone) && !INTERNAL_NAME.test(t.name || ''))
  .map((t) => ({ ...t, a: analyse(t), ali: aliMsgs(t) }))
  .filter((t) => t.a.lead >= 3 && t.a.human >= 2)
  .sort((a, b) => b.a.turns - a.a.turns);

const mine = responsive.filter((t) => t.ali >= 2);
const team = responsive.filter((t) => t.ali < 2);
console.log(`responsive: ${responsive.length} · écrites par Ali: ${mine.length} · par d'autres conseillers: ${team.length}`);

const GROUPS = [
  ['A-CLOSINGS', 'Conversations qui vont jusqu\'au paiement, au contrat ou à l\'admission', (t) => t.a.closing],
  ['B-PRICE-AND-FINANCING', 'Le lead parle argent : prix, budget, mensualités, financement, devis', (t) => t.a.moneyLead || t.a.money],
  ['C-OBJECTIONS-NON-PRIX', 'Objections autres que le prix : temps, confiance, décision à deux, niveau', (t) => t.a.time || t.a.trust || t.a.thirdParty],
  ['D-REPORTS-ET-REFUS', 'Leads qui repoussent à plus tard ou refusent', (t) => t.a.defer || t.a.refusal],
  ['E-PRISE-DE-RDV', 'Échanges centrés sur la prise et la tenue du rendez-vous', () => true],
];

function tagsOf(t) {
  return Object.entries({ closing: 'closing', money: 'prix', time: 'objection-temps', trust: 'objection-confiance',
    thirdParty: 'décision-à-deux', defer: 'report', refusal: 'refus', booking: 'rdv' })
    .filter(([k]) => t.a[k]).map(([, v]) => v).join(', ');
}
function render(t, n) {
  const first = String(t.msgs[0]?.at || '').slice(0, 10);
  const last = String(t.msgs[t.msgs.length - 1]?.at || '').slice(0, 10);
  const head = `\n---\n\n## ${n}. ${t.name || 'Sans nom'} · +${t.phone}\n` +
    `CRM: ${t.stage || 'inconnu'} · ${first} → ${last} · ${t.a.lead} messages du lead / ${t.a.human} réponses humaines · Thèmes: ${tagsOf(t) || 'aucun'}\n\n`;
  const body = t.msgs.filter((m) => clean(m.text)).map((m) => {
    const who = m.who === 'LEAD' ? 'LEAD'
      : m.tpl ? 'NOUS (auto)'
      : m.op === 'Admin Account' ? 'ALI'
      : `CONSEILLER${m.op ? ' (' + m.op + ')' : ''}`;
    return `[${String(m.at).slice(0, 16).replace('T', ' ')}] ${who}: ${clean(m.text)}`;
  }).join('\n');
  return head + body + '\n';
}

const SOURCE = process.argv.includes('--team') ? team : mine;
const SUFFIX = process.argv.includes('--team') ? '-equipe' : '';
const assigned = new Set();
const manifest = [];
for (const [label, desc, test] of GROUPS) {
  const group = SOURCE.filter((t) => !assigned.has(t.phone) && test(t));
  group.forEach((t) => assigned.add(t.phone));
  if (!group.length) continue;
  let out = `# Transcripts ${label}\n\n${desc}.\n\n` +
    `Source : conversations WhatsApp réelles du numéro France Sales (+33 6 73 55 59 77), leads francophones, extraites le 2026-09-15.\n` +
    `${group.length} conversations, de la plus nourrie à la moins nourrie.\n` +
    `LEAD = le prospect · NOUS = réponse écrite par Ali · NOUS (auto) = template automatique.\n`;
  group.forEach((t, i) => { out += render(t, i + 1); });
  const file = `playbook/transcripts-${label.toLowerCase()}${SUFFIX}.md`;
  writeFileSync(file, out);
  manifest.push({ label, file, n: group.length, kb: Math.round(out.length / 1024) });
}

manifest.forEach((m) => console.log(`  ${String(m.n).padStart(4)} · ${String(m.kb).padStart(5)} KB · ${m.file}`));
