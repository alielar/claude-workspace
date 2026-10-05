# Fiches récapitulatives (PDF à envoyer aux leads)

Source HTML + logo ici, PDF généré dans `data/fiches/` (git-ignoré).

Régénérer un PDF :

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf="data/fiches/Fiche-recapitulative-easypeasy-36h-individuel.pdf" \
  "file://$PWD/fiches/fiche-36h-individuel.html"
```

Règles fixées par Ali le 2026-10-05 : fiche générique (aucun prénom), un pack 36h/699 € peut être
suivi par deux enfants ensemble sur le même ordinateur, Alma 4 ou 6 fois sans frais, crédits sans
date limite, rien sur l'enregistrement des leçons ni sur la rétractation.
