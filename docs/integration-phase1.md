# Phase 1 — Aperçu d'import, sans publication

Le nouveau fichier `src/import/import-preview.js` combine les modules internes de calcul des heures et d'association des salariés.

## Pipeline prévu

1. `readPlanningFile` lit le classeur avec son lecteur XLSX et son résolveur de couleurs.
2. `buildImportPreview` fournit un aperçu des sept jours, des salariés, des horaires, des écarts contractuels et des associations de comptes.
3. L'aperçu n'écrit jamais dans Supabase. `readyForPublish` reste volontairement à `false`.
4. La publication reste une opération distincte et autorisée après validation de l'archive originale, des permissions serveur et de la révision.

## Limitations connues

- Le lecteur moderne de couleurs RGB n'assure pas la récupération des styles BIFF/OLE des .xls historiques.
- Les contrats sont passés explicitement, jamais devinés à partir du nom du salarié.
- Les anomalies légales, les demandes de congé réelles, les différences de versions, les chevauchements complexes et la couverture du magasin ne sont pas encore tous intégrés à cet aperçu.
- Le pipeline n'a pas encore été testé avec un fichier réel anonymisé.
- Un compte non lié n'empêche pas le calcul, mais bloque la décision automatique de publication par conception.

Aucune écriture en production, aucun raccordement ni migration.
