# Phase 1 — Reprise de l'importation Excel

## Vérifié dans l'ancien code

Source : `planning-runtime.js`, fonction `readPlanningFile`.

- Sept feuilles nommées LUNDI à DIMANCHE.
- Date du lundi en B2 ; noms du personnel en B4 et lignes suivantes.
- Créneaux des colonnes C à BH (58 créneaux de 15 minutes).
- Une cellule peut porter une couleur **sans valeur** : il faut impérativement conserver le style.
- Ancien format de modèle : `version:4`, `weekStart`, `employees`, `days`, `slotMinutes:15`, `slotCount:58`.
- Couleurs historiques : `g` vert, `b` bleu, `r` rouge, `y` jaune, `o` orange.

## Ce qui a été ajouté dans nethor2

- `src/import/excel-structure.js` : extrait la structure des feuilles et les grilles, avec lecteur XLSX et résolveur de couleur injectés.
- `tests/excel-structure.test.js` : quatre cas unitaires (feuilles, longueur, feuille absente, cellule renseignée non résolue, couleur reconnue).

Les tests ne sont pas encore exécutés en environnement CI, et la compatibilité réelle des styles .xls n'est **pas confirmée**.

## Conditions avant import réel

1. Fournir une implémentation vérifiée de `resolveColor`, y compris la lecture BIFF/OLE des styles .xls.
2. Tester sur une copie anonymisée d'un fichier .xls réel du magasin.
3. Confirmer la compatibilité des styles .xlsx, des lignes fusionnées et des récapitulatifs contractuels.
4. Ne jamais envoyer un classeur en base avant prévisualisation, analyse et confirmation.
5. Tester les règles d'autorisation serveur et la sauvegarde atomique.

Le dossier `nethor2` reste indépendant de la production.
