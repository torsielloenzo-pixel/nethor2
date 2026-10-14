# Phase 1 — Audit initial

Modules inspectés dans le dépôt historique `nethor` :

- `runtime/planning-anomaly-core.js` : calcul des différences contractuelles, journées longues, courtes séquences de travail, coupures, conflits d'absence et couverture réduite. Dépend du modèle historique avec tranches de 15 minutes ; réemploi soumis à adaptation et tests.
- `runtime/planning-quick-import.js` : charge `planning.html?quick-import=1` dans une iframe et invoque `importPlanningFiles` ; trop couplé à l'ancienne interface pour être transplanté directement.
- `auth/auth-session.js` : dépend de thèmes, d'icônes, de plateformes et de redirections anciennes ; préférer une couche Auth simplifiée après audit du schéma Supabase et des politiques RLS.
- `supabase/functions/planning-import-audit/index.ts` : vérifie la session et l'auteur de l'import puis complète l'historique. Les domaines et tables sont spécifiques à l'environnement historique.

## Suite

1. Identifier le véritable parseur Excel dans la page Planning et ses dépendances.
2. Vérifier les modèles comptes/profils et les politiques Supabase sans écriture en base.
3. Créer un module autonome de calcul des anomalies, doté de tests.
4. Construire une interface de prévisualisation d'import indépendante de la page historique.

Aucun module n'est encore certifié compatible. Aucun changement de production ni migration n'est effectué.
