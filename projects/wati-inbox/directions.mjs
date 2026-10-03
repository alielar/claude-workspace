// What Ali picks before Claude drafts (rebuilt 2026-09-29 evening, from the count of his own moves in
// 1 882 messages): a handful of MOVES that can be combined, the initial OFFER stored per lead so every
// downsell is computed from it, and a free consigne. Wording follows ../Wati outreach/playbook/00-QUICK.md.

// ── the initial offer (what the lead was offered on the call) ─────────────────
export const FORMATS = {
  '270h': { hours: 270, price: 2700, guarantee: true, label: '270h · 2 700 €' },
  '180h': { hours: 180, price: 1800, guarantee: true, label: '180h · 1 800 €' },
  '90h': { hours: 90, price: 990, guarantee: true, label: '90h · 990 €' },
  '96h': { hours: 96, price: 990, guarantee: false, label: '96h · 990 € (no guarantee)' },
  '48h': { hours: 48, price: 583, guarantee: false, label: '48h · 583 (no guarantee)' },
  '24h': { hours: 24, price: 294, guarantee: false, label: '24h · 294 (no guarantee)' }, // validé par Ali le 30/09/2026, tous marchés
};
export const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const below = (lvl) => LEVELS[Math.max(0, LEVELS.indexOf(lvl) - 1)] || lvl;
export const monthsFor = (hours, hpw) => hours && hpw ? Math.ceil(hours / (hpw * 4.33)) : null; // 180h at 4h/sem → 11 mois, 90h → 6
// Currency by market (Ali, 30/09/2026): same figures everywhere, € for France/Belgium, CHF for Switzerland.
export const currencyFor = (country) => /^(switzerland|suisse|schweiz|ch)$/i.test(String(country || '').trim()) ? 'CHF' : '€';
const money = (n, cur = '€') => n == null ? '[PRIX]' : `${n} ${cur}`;
const monthly = (price, cur = '€') => price == null ? '[MENSUALITÉ]' : `${Math.round(price / 10 * 100) / 100} ${cur}/mois en 10 fois`.replace('.', ',');

// offer = { format, level, hpw, months } as saved on the thread. Returns a one-line description.
export function describeOffer(o, cur = '€') {
  if (!o?.format || !FORMATS[o.format]) return '';
  const f = FORMATS[o.format];
  const m = o.months || monthsFor(f.hours, o.hpw);
  return `${o.format}${o.level ? ` → ${o.level}` : ''}${o.hpw ? ` · ${o.hpw}h/sem` : ''}${m ? ` · ${m} mois` : ''} · ${money(f.price, cur)}${f.price ? ` (${monthly(f.price, cur)})` : ''}${f.guarantee ? ' · garantie' : ' · sans garantie'}`;
}

// The downsell target computed from the offer: same hours/week, hours halved or fixed, level one jump lower.
export function downsellFrom(o, target, cur = '€') {
  const f = FORMATS[target]; if (!f) return null;
  const hpw = o?.hpw || null;
  const level = target === '90h' ? (o?.level ? below(o.level) : '[NIVEAU]') : target === '96h' ? 'A2/B1' : null;
  const months = monthsFor(f.hours, hpw);
  return { format: target, level, hpw, months, price: f.price, guarantee: f.guarantee,
    text: `${target}${level ? ` → ${level}` : ' (speaking / anglais général, pas de niveau visé)'}${hpw ? ` · ${hpw}h/sem` : ''}${months ? ` · ${months} mois` : ''} · ${money(f.price, cur)}${f.price ? ` (${monthly(f.price, cur)})` : ''}${f.guarantee ? ' · garantie conservée' : ' · SANS garantie'}` };
}

// ── the moves (multi-select) ───────────────────────────────────────────────────
export const MOVES = [
  { id: 'admin', label: 'Administration (2 steps)', hint: 'Deux blocs, script de référence d’Ali (2026-10-03), à reprendre tel quel en adaptant les crochets. MAINTENANT (2 bulles) : « Pas de souci, la date limite était ce soir, mais je comprends qu’avec [sa raison précise] ce n’est pas possible, du coup je vérifie et je vais essayer avec l’administration pour voir ce que je peux faire pour vous » / « Je reviens vers vous très vite » — jamais « bien sûr, on peut ». DANS 5-10 MIN (`later`, 2 bulles) : « Bonne nouvelle, j’ai pu avoir la confirmation et l’accord de l’administration pour votre dossier 👍 » / « Ils ont prolongé votre délai jusqu’à [demain 15h] pour que vous ayez le temps de finaliser l’inscription, le lien est le même que sur le mail d’admission que vous avez reçu le jour de notre entretien, vous pensez pouvoir finaliser ça [demain] sans problème ? ». Ce qui a été obtenu (délai, format, place tenue) suit les autres moves cochés. S’il y a un lien mis à jour : le lien, puis « Est-ce qu’il fonctionne bien de votre côté ? » à la place de « le lien est le même… ». Toujours « ils ont prolongé », jamais « je vous ai étendu ». Le second bloc ne pose qu’une question, dans sa dernière bulle ; l’emoji 👍 de la bonne nouvelle est le seul.' },
  { id: 'downsell', label: 'Downsell', hint: 'Format plus petit, présenté comme le format qui correspond à sa situation (un changement d’objectif), jamais comme une remise, une promo ni un article de catalogue — aucune tournure qui sonne « on pousse la vente ». Ancrer contre l’offre initiale : heures et prix nouveaux contre les anciens, la nouvelle mensualité en 10 fois contre l’actuelle, le niveau visé qui change, la garantie conservée ou perdue. Ne cite les heures/semaine ou la durée que si le lead a posé la question ou si ça répond à son blocage. Si le blocage (prix, financement) est déjà connu, ne pas le redemander : proposer directement le palier suivant. Script 990 € de 04-CAS-APPRIS (« On a aussi un format plus léger : … »).', sub: 'downsell' },
  { id: 'delai', label: 'Extend the deadline', hint: 'Gratuit, toujours via l’administration (« ils ont prolongé la validité de votre invitation jusqu’à … »), jamais « je vous ai étendu ». Concession datée et bornée à l’échéance qu’Ali indique.', input: 'Jusqu’à quand ? (ex. demain 12h)' },
  { id: 'acompte', label: 'Deposit', hint: 'Tenir la place avec un acompte, le reste au démarrage ou selon l’échéancier. 196 € en première offre, 96 € seulement en seconde concession ou quand le blocage est le timing (veille du 27/09). On tient une place, jamais un prix.', sub: 'acompte' },
  { id: 'paiement', label: 'Payment', hint: 'Étaler (Alma : 3, 4 fois sans frais, 6 fois avec carte de crédit, 10 fois = 180 €/mois sur 1 800 €, 99 €/mois sur 990 €) ou débloquer un paiement qui échoue : réponse technique immédiate, zéro argument commercial, proposer de réessayer en 6 ou 4 fois, MasterCard échoue parfois, Visa passe. Lead suisse : mêmes montants en francs suisses (CHF), échelonnement via HeyLight (4 ou 6 fois), jamais Alma.' },
  { id: 'demarrage', label: 'Start later', hint: 'On s’inscrit maintenant, la date de démarrage se choisit après. Ne jamais citer une date de rentrée de soi-même. Si le lead demande une date : rester souple — c’est flexible, il choisit son démarrage après l’inscription, et si besoin on peut faire une demande interne au support étudiant pour démarrer en dehors des dates officielles. Sans inscription : liste d’attente 10-12 mois, sans garantie. Pas de downsell si le seul problème est le calendrier.' },
  { id: 'relance', label: 'Follow-up', hint: 'Lead silencieux : jamais de reproche, ré-ouvrir avec quelque chose de nouveau, une seule question, un seul message de pression par jour. Soir de deadline 20h : rappel court à 20h-20h30. Lendemain (Hub en pause) : le matin, point clair (deadline passée, peut-être encore possible aujourd’hui via l’administration, sinon la place est libérée) ; sans réponse, un seul message ferme vers 18h30-19h ; ensuite rien sauf une vraie nouvelle ouverture.' },
  { id: 'doux', label: 'Low pressure', hint: 'Le lead demande du temps ou a fixé sa propre prochaine étape : on enlève la pression, on ne plaide pas la place — « pas de souci, prenez le temps qu’il vous faut… », une bulle chaleureuse, pas de question de clôture, pas de deadline. S’il préfère attendre : prendre acte, dire la conséquence (liste d’attente 10 à 12 mois, sans garantie de date de démarrage), lui laisser le prochain contact. S’il a juste besoin de temps : lui demander quand il pourrait décider, pour vérifier avec l’administration.' },
  { id: 'cloture', label: 'Close', hint: 'Deux refus clairs ou demande d’être laissé tranquille : on arrête de vendre, clôture chaleureuse, porte ouverte, sans question ; « plein succès », jamais « bonne chance ». Dire dans note de marquer le lead.' },
];
export const DOWNSELL = ['90h', '96h', '48h', '24h', 'heures'];
export const DOWNSELL_LABELS = { '90h': '90h · 990 guarantee', '96h': '96h · 990 no guarantee', '48h': '48h · 583', '24h': '24h · 294', heures: 'Fewer h/week' };
export const ACOMPTE = ['196', '96'];

// Turns Ali's picks into one readable line (stored, shown on the phone) and the guidance block for the prompt.
// cur = '€' or 'CHF' (currencyFor(thread.country)): every figure in the block carries the lead's currency.
export function describeDirection(d = {}, offer = null, cur = '€') {
  const moves = (Array.isArray(d.moves) ? d.moves : String(d.moves || '').split(',')).map((x) => x.trim()).filter((x) => MOVES.some((m) => m.id === x));
  const ins = String(d.instruction || '').trim().slice(0, 600);
  // A consigne that asks for the administration mechanism in words counts as the move (Ali, 2026-10-03: « give me the two batches
  // of bubbles also when I only type the instruction, not only when I tick the button »).
  if (!moves.includes('admin') && /administr|deux (temps|étapes|parties|blocs|messages)|2 (temps|étapes|parties|blocs)|two[- ]?(step|part|batch)|second (bloc|temps|message)|bonne nouvelle/i.test(ins)) moves.unshift('admin');
  const parts = [], lines = [];
  for (const id of moves) {
    const m = MOVES.find((x) => x.id === id);
    let label = m.label, hint = m.hint;
    if (id === 'downsell') {
      const lvl = DOWNSELL.includes(d.level) ? d.level : '';
      if (lvl === 'heures') { label += ' → moins d’heures/semaine'; hint += ' Ici : même nombre total d’heures, moins d’heures par semaine (minimum 2h), la durée s’allonge, la mensualité peut baisser — ce n’est pas un changement de format.'; }
      else if (lvl) { const t = downsellFrom(offer, lvl, cur); label += ` → ${lvl} · ${FORMATS[lvl].price} ${cur}${FORMATS[lvl].guarantee ? ' garantie' : ' sans garantie'}`; hint += ` Cible : ${t.text}.${offer?.format ? ` Contre l’offre initiale : ${describeOffer(offer, cur)}.` : ' (Offre initiale non renseignée : laisse [CROCHETS] pour le niveau et la durée d’origine.)'}${lvl === '48h' || lvl === '24h' ? ' Anticiper l’objection volume : resituer les heures dans un objectif précis (speaking, anglais général), pas un niveau complet.' : ''}`; }
      else hint += ' Niveau de downsell non précisé : choisis le cran juste en dessous de l’offre initiale.';
    }
    if (id === 'acompte' && ACOMPTE.includes(d.level2)) { label += ` → ${d.level2} ${cur}`; hint += ` Ici : ${d.level2} ${cur}.`; }
    if (id === 'delai' && String(d.until || '').trim()) { label += ` → ${String(d.until).trim()}`; hint += ` Échéance donnée par Ali : « ${String(d.until).trim()} ».`; }
    parts.push(label); lines.push(`- **${label}** — ${hint}`);
  }
  if (ins) { parts.push(`Consigne : ${ins}`); lines.push(`- Consigne libre d'Ali (prioritaire sur tout le reste) : « ${ins} »`); }
  const twoStep = moves.includes('admin');
  let block = lines.join('\n') + (lines.length ? '\n' : '');
  block += `Devise du lead : ${cur} — tous les montants dans les bulles en ${cur}, jamais dans une autre devise.\n`;
  if (moves.length > 1) block += `Ali a combiné ${moves.length} moves : une seule réponse cohérente qui les enchaîne dans cet ordre (l’accusé de réception d’abord, la concession ensuite, la question à la fin)${twoStep ? ', répartie entre le bloc MAINTENANT et le bloc DANS 5-10 MIN' : ''}.\n`;
  if (twoStep) block += 'Réponds avec `bubbles` = le bloc MAINTENANT et `later` = le bloc DANS 5-10 MIN (2 à 3 bulles chacun).\n';
  else block += 'Pas de second temps : `later` reste vide.\n';
  return { text: parts.join(' · '), block, moves, twoStep };
}
