// What Ali picks before Claude drafts (rebuilt 2026-09-29 evening, from the count of his own moves in
// 1 882 messages): a handful of MOVES that can be combined, the initial OFFER stored per lead so every
// downsell is computed from it, and a free consigne. Wording follows ../Wati outreach/playbook/00-QUICK.md.

// ── the initial offer (what the lead was offered on the call) ─────────────────
export const FORMATS = {
  '270h': { hours: 270, price: 2700, guarantee: true, label: '270h · 2 700 €' },
  '180h': { hours: 180, price: 1800, guarantee: true, label: '180h · 1 800 €' },
  '90h': { hours: 90, price: 990, guarantee: true, label: '90h · 990 €' },
  '96h': { hours: 96, price: 990, guarantee: false, label: '96h · 990 € (sans garantie)' },
  '48h': { hours: 48, price: 583, guarantee: false, label: '48h · 583 € (sans garantie)' },
  '24h': { hours: 24, price: null, guarantee: false, label: '24h · prix à confirmer' },
};
export const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const below = (lvl) => LEVELS[Math.max(0, LEVELS.indexOf(lvl) - 1)] || lvl;
export const monthsFor = (hours, hpw) => hours && hpw ? Math.ceil(hours / (hpw * 4.33)) : null; // 180h at 4h/sem → 11 mois, 90h → 6
const eur = (n) => n == null ? '[PRIX]' : `${n} €`;
const monthly = (price) => price == null ? '[MENSUALITÉ]' : `${Math.round(price / 10 * 100) / 100} €/mois en 10 fois`.replace('.', ',');

// offer = { format, level, hpw, months } as saved on the thread. Returns a one-line description.
export function describeOffer(o) {
  if (!o?.format || !FORMATS[o.format]) return '';
  const f = FORMATS[o.format];
  const m = o.months || monthsFor(f.hours, o.hpw);
  return `${o.format}${o.level ? ` → ${o.level}` : ''}${o.hpw ? ` · ${o.hpw}h/sem` : ''}${m ? ` · ${m} mois` : ''} · ${eur(f.price)}${f.price ? ` (${monthly(f.price)})` : ''}${f.guarantee ? ' · garantie' : ' · sans garantie'}`;
}

// The downsell target computed from the offer: same hours/week, hours halved or fixed, level one jump lower.
export function downsellFrom(o, target) {
  const f = FORMATS[target]; if (!f) return null;
  const hpw = o?.hpw || null;
  const level = target === '90h' ? (o?.level ? below(o.level) : '[NIVEAU]') : target === '96h' ? 'A2/B1' : null;
  const months = monthsFor(f.hours, hpw);
  return { format: target, level, hpw, months, price: f.price, guarantee: f.guarantee,
    text: `${target}${level ? ` → ${level}` : ' (speaking / anglais général, pas de niveau visé)'}${hpw ? ` · ${hpw}h/sem` : ''}${months ? ` · ${months} mois` : ''} · ${eur(f.price)}${f.price ? ` (${monthly(f.price)})` : ''}${f.guarantee ? ' · garantie conservée' : ' · SANS garantie'}` };
}

// ── the moves (multi-select) ───────────────────────────────────────────────────
export const MOVES = [
  { id: 'admin', label: 'Administration (2 temps)', hint: 'Deux blocs. MAINTENANT : accuser réception, puis « dans certains cas précis on peut… je vérifie ça avec l’administration, je reviens vers vous très vite » — jamais « bien sûr, on peut ». DANS 5-10 MIN (`later`) : « Bonne nouvelle, je viens d’avoir la confirmation écrite de l’administration : … » + ce qui a été obtenu (le format, le délai, la place tenue — selon les autres moves cochés) + le lien mis à jour si un lien existe, suivi de « Est-ce qu’il fonctionne bien de votre côté ? », puis « Dites-moi quand c’est fait pour que je vous envoie la suite ». Le second bloc ne pose qu’une question, dans sa dernière bulle.' },
  { id: 'downsell', label: 'Downsell', hint: 'Format plus petit, cadré comme un changement d’objectif, jamais une remise ni un article de catalogue. Toujours ancrer contre l’offre initiale : heures et prix nouveaux contre les anciens, la nouvelle mensualité en 10 fois contre l’actuelle, le niveau visé qui change, la garantie conservée ou perdue, et la durée aux mêmes heures/semaine. Script 990 € de 04-CAS-APPRIS (« On a aussi un format plus léger : … »).', sub: 'downsell' },
  { id: 'delai', label: 'Prolonger le délai', hint: 'Gratuit, toujours via l’administration (« ils ont prolongé la validité de votre invitation jusqu’à … »), jamais « je vous ai étendu ». Concession datée et bornée à l’échéance qu’Ali indique.', input: 'Jusqu’à quand ? (ex. demain 12h)' },
  { id: 'acompte', label: 'Acompte', hint: 'Tenir la place avec un acompte, le reste au démarrage ou selon l’échéancier. 196 € en première offre, 96 € seulement en seconde concession ou quand le blocage est le timing (veille du 27/09). On tient une place, jamais un prix.', sub: 'acompte' },
  { id: 'paiement', label: 'Paiement', hint: 'Étaler (Alma : 3, 4 fois sans frais, 6 fois avec carte de crédit, 10 fois = 180 €/mois sur 1 800 €, 99 €/mois sur 990 €) ou débloquer un paiement qui échoue : réponse technique immédiate, zéro argument commercial, proposer de réessayer en 6 ou 4 fois, MasterCard échoue parfois, Visa passe. Lead suisse : francs suisses, montant à confirmer.' },
  { id: 'demarrage', label: 'Démarrage plus tard', hint: 'On s’inscrit maintenant, la date de démarrage se choisit après (rentrées 28 sept., 26 oct., 23 nov.). Sans inscription : liste d’attente 10-12 mois, sans garantie. Pas de downsell si le seul problème est le calendrier.' },
  { id: 'relance', label: 'Relance', hint: 'Lead silencieux : jamais de reproche, ré-ouvrir avec quelque chose de nouveau, une seule question, un seul message de pression par jour.' },
  { id: 'doux', label: 'Basse pression', hint: 'Le lead demande du temps ou a fixé sa propre prochaine étape : on enlève la pression, on ne plaide pas la place — « pas de souci, prenez le temps qu’il vous faut… », une bulle chaleureuse, pas de question de clôture, pas de deadline.' },
  { id: 'cloture', label: 'Clôture', hint: 'Deux refus clairs ou demande d’être laissé tranquille : on arrête de vendre, clôture chaleureuse, porte ouverte, sans question ; « plein succès », jamais « bonne chance ». Dire dans note de marquer le lead.' },
];
export const DOWNSELL = ['90h', '96h', '48h', '24h', 'heures'];
export const DOWNSELL_LABELS = { '90h': '90h · 990 € garantie', '96h': '96h · 990 € sans garantie', '48h': '48h · 583 €', '24h': '24h · prix ?', heures: 'Moins d’h/semaine' };
export const ACOMPTE = ['196', '96'];

// Turns Ali's picks into one readable line (stored, shown on the phone) and the guidance block for the prompt.
export function describeDirection(d = {}, offer = null) {
  const moves = (Array.isArray(d.moves) ? d.moves : String(d.moves || '').split(',')).map((x) => x.trim()).filter((x) => MOVES.some((m) => m.id === x));
  const ins = String(d.instruction || '').trim().slice(0, 600);
  const parts = [], lines = [];
  for (const id of moves) {
    const m = MOVES.find((x) => x.id === id);
    let label = m.label, hint = m.hint;
    if (id === 'downsell') {
      const lvl = DOWNSELL.includes(d.level) ? d.level : '';
      if (lvl === 'heures') { label += ' → moins d’heures/semaine'; hint += ' Ici : même nombre total d’heures, moins d’heures par semaine (minimum 2h), la durée s’allonge, la mensualité peut baisser — ce n’est pas un changement de format.'; }
      else if (lvl) { const t = downsellFrom(offer, lvl); label += ` → ${DOWNSELL_LABELS[lvl]}`; hint += ` Cible : ${t.text}.${offer?.format ? ` Contre l’offre initiale : ${describeOffer(offer)}.` : ' (Offre initiale non renseignée : laisse [CROCHETS] pour le niveau et la durée d’origine.)'}${lvl === '24h' ? ' Prix du 24h hors catalogue : laisse [PRIX] et [MENSUALITÉ], ne l’invente pas.' : ''}${lvl === '48h' || lvl === '24h' ? ' Anticiper l’objection volume : resituer les heures dans un objectif précis (speaking, anglais général), pas un niveau complet.' : ''}`; }
      else hint += ' Niveau de downsell non précisé : choisis le cran juste en dessous de l’offre initiale.';
    }
    if (id === 'acompte' && ACOMPTE.includes(d.level2)) { label += ` → ${d.level2} €`; hint += ` Ici : ${d.level2} €.`; }
    if (id === 'delai' && String(d.until || '').trim()) { label += ` → ${String(d.until).trim()}`; hint += ` Échéance donnée par Ali : « ${String(d.until).trim()} ».`; }
    parts.push(label); lines.push(`- **${label}** — ${hint}`);
  }
  if (ins) { parts.push(`Consigne : ${ins}`); lines.push(`- Consigne libre d'Ali (prioritaire sur tout le reste) : « ${ins} »`); }
  const twoStep = moves.includes('admin');
  let block = lines.join('\n') + (lines.length ? '\n' : '');
  if (moves.length > 1) block += `Ali a combiné ${moves.length} moves : une seule réponse cohérente qui les enchaîne dans cet ordre (l’accusé de réception d’abord, la concession ensuite, la question à la fin)${twoStep ? ', répartie entre le bloc MAINTENANT et le bloc DANS 5-10 MIN' : ''}.\n`;
  if (twoStep) block += 'Réponds avec `bubbles` = le bloc MAINTENANT et `later` = le bloc DANS 5-10 MIN (2 à 3 bulles chacun).\n';
  else block += 'Pas de second temps : `later` reste vide.\n';
  return { text: parts.join(' · '), block, moves, twoStep };
}
