// The "cap" Ali picks before Claude drafts (2026-09-29): where the reply is heading. Each entry has
// the label shown on the phone and the guidance Claude receives. Rungs and wording follow
// ../Wati outreach/playbook/00-QUICK.md and 05-PRINCIPES-conversation.md — keep them in step.

export const OBJECTIVES = [
  { id: 'isoler', label: 'Isoler le blocage', hint: 'Question ouverte pour identifier le vrai frein : « Qu’est-ce qui vous fait hésiter exactement : le prix, le timing, la méthode, ou autre chose ? ». Pas de rappel de deadline, pas de concession.' },
  { id: 'motivation', label: 'Vérifier la motivation', hint: 'Barreau 2 de l’échelle : « Indépendamment du prix, seriez-vous intéressé(e) et motivé(e) à suivre les leçons ? ». Aucune concession avant sa réponse.' },
  { id: 'etaler', label: 'Étaler le paiement', hint: 'Barreau 1 : paiement en plusieurs fois sans frais via Alma — 10 fois = 180 €/mois sur 1 800 €, 99 €/mois sur 990 €. Pas de baisse de prix.' },
  { id: 'budget', label: 'Demander le budget', hint: 'Barreau 3 : « Quel budget pouvez-vous investir ? » puis « total ou mensuel ? ». Ne proposer aucun format avant sa réponse.' },
  { id: 'downsell', label: 'Downsell', hint: 'Barreau 4 : format plus petit cadré comme un changement d’objectif, jamais une remise. Nommer le niveau visé, les heures et le prix contre l’original, la nouvelle mensualité contre l’actuelle, garantie conservée ou non. Suivre le script 990 € de 04-CAS-APPRIS (« On a aussi un format plus léger… »).', levels: true },
  { id: 'admin_format', label: 'Format plus court via l’administration', hint: 'Le lead (ou nous) évoque un format plus court : jamais « bien sûr on peut ». D’abord « dans certains cas précis on peut proposer un format plus court, je vérifie avec l’administration », la confirmation viendra dans un second message.' },
  { id: 'admin_delai', label: 'Prolonger le délai via l’administration', hint: 'Barreau 6, gratuit : jamais « je vous ai étendu la deadline » — « je vérifie ce qui est possible avec l’administration », puis « ils ont réactivé le lien ». Concession datée et bornée.' },
  { id: 'bonne_nouvelle', label: 'Bonne nouvelle + lien', hint: 'La concession annoncée est confirmée : « Bonne nouvelle, je viens d’avoir la confirmation écrite de l’administration… » + le lien, suivi de « Est-ce qu’il fonctionne bien ? » et « Dites-moi quand c’est fait pour que je vous envoie la suite ». Zéro tour de parole inutile.' },
  { id: 'demarrage', label: 'Démarrage plus tard', hint: 'Barreau 7 : on s’inscrit maintenant, on choisit sa date de démarrage après (rentrées 28 sept., 26 oct., 23 nov.). Sans inscription : liste d’attente 10-12 mois, sans garantie. Pas de downsell si le seul problème est le calendrier.' },
  { id: 'acompte', label: 'Acompte pour bloquer la place', hint: 'Barreau 8 : acompte pour tenir la place — 196 € en première offre, 96 € seulement en seconde concession, jamais l’inverse. On tient une place, jamais un prix. Blocage lié au timing (pas au prix) : voir la veille du 27/09 dans 04-CAS-APPRIS.', levels: 'acompte' },
  { id: 'inscription', label: 'Pousser à finaliser', hint: 'Lead prêt ou enthousiaste : aucune concession, droit à l’action — le lien, « Vous pouvez finaliser maintenant ? » / « Vous comptez vous inscrire d’ici quand ? ».' },
  { id: 'info', label: 'Répondre à une question', hint: 'Répondre précisément à la question posée (paiement, lien, programme, garantie, charge de travail), dire où trouver l’info, renvoyer le lien si utile, finir par une question liée à la sienne. Pas d’argument commercial en plus.' },
  { id: 'relance', label: 'Relancer un silence', hint: 'Lead silencieux : jamais de reproche, ré-ouvrir avec quelque chose de nouveau (une info, une question ouverte), un seul message de pression par jour maximum.' },
  { id: 'basse_pression', label: 'Enlever la pression', hint: 'Le lead demande du temps ou a fixé sa propre prochaine étape : on enlève la pression, on ne plaide pas la place — « pas de souci, prenez le temps qu’il vous faut… je reviens vers vous la semaine prochaine ». Une bulle chaleureuse, sans question de clôture.' },
  { id: 'post_vente', label: 'Déjà client', hint: 'Lead déjà inscrit qui pose une question logistique : une seule bulle factuelle, sans salutation ni question de clôture, renvoyer vers le support étudiant si pertinent (04-CAS-APPRIS, 27/09).' },
  { id: 'cloture', label: 'Clôture polie', hint: 'Deux refus clairs ou demande d’être laissé tranquille : on arrête de vendre, clôture chaleureuse, porte ouverte, sans question. Dire dans note de marquer le lead.' },
  { id: 'libre', label: 'Autre', hint: 'Suivre la consigne libre d’Ali ci-dessous.' },
];

export const DOWNSELL_LEVELS = [
  { id: '90h', label: '90h / 990 € avec garantie', hint: 'Depuis 180h/1 800 € vers 90h/990 € (1 saut de niveau, à partir de A2), garantie satisfait ou remboursé conservée, 99 €/mois en 10 fois. Script 990 € de 04-CAS-APPRIS.' },
  { id: '96h', label: '96h / 990 € sans garantie', hint: 'Lead A0/A1 : 96h starter vers A2/B1 à 990 €, SANS garantie, 99 €/mois en 10 fois. Dire clairement que ce format n’a pas la garantie.' },
  { id: 'heures', label: 'Moins d’heures par semaine', hint: 'Barreau 5 : même total d’heures, moins d’heures par semaine (minimum 2h), la durée s’allonge, la mensualité peut baisser. Ce n’est pas un changement de format.' },
  { id: 'repli', label: 'Format de repli (60h / 48h / 36h)', hint: 'Dernier cran, sans garantie, uniquement validé par Ali : 60h/737 €, 48h/583 €, 36h/434 € (prix début 2026, à confirmer). Anticiper l’objection volume : resituer les heures dans un objectif précis, pas un niveau complet.' },
];

export const ACOMPTE_LEVELS = [
  { id: '196', label: '196 €', hint: 'Acompte 196 € (première offre).' },
  { id: '96', label: '96 €', hint: 'Acompte 96 € (seconde concession, après le 196 € refusé, ou blocage lié au timing).' },
];

export const TONES = [
  { id: 'standard', label: 'Ton normal', hint: '' },
  { id: 'doux', label: 'Basse pression', hint: 'Ton bas, sans urgence, sans deadline, sans question insistante.' },
  { id: 'ferme', label: 'Ferme (deadline)', hint: 'Deadline du jour : factuel et clair, la capacité est limitée, jamais gonflé, un seul message de pression ce jour.' },
];

// Turns what Ali picked into a readable line (stored, shown on the phone) and the guidance block for the prompt.
export function describeDirection(d = {}) {
  const obj = OBJECTIVES.find((o) => o.id === d.objective);
  const level = obj?.levels === true ? DOWNSELL_LEVELS.find((l) => l.id === d.level) : obj?.levels === 'acompte' ? ACOMPTE_LEVELS.find((l) => l.id === d.level) : null;
  const tone = TONES.find((t) => t.id === d.tone && t.id !== 'standard');
  const ins = String(d.instruction || '').trim().slice(0, 600);
  const parts = [];
  if (obj) parts.push(`Cap : ${obj.label}${level ? ` → ${level.label}` : ''}`);
  if (tone) parts.push(`Ton : ${tone.label}`);
  if (ins) parts.push(`Consigne : ${ins}`);
  const text = parts.join(' · ');
  let block = '';
  if (obj) block += `- Objectif choisi par Ali : **${obj.label}${level ? ` → ${level.label}` : ''}**. ${obj.hint}${level ? ` ${level.hint}` : ''}\n`;
  if (tone) block += `- Ton demandé : ${tone.label}. ${tone.hint}\n`;
  if (ins) block += `- Consigne libre d'Ali (prioritaire sur tout le reste) : « ${ins} »\n`;
  return { text, block, objective: obj?.id || null };
}
