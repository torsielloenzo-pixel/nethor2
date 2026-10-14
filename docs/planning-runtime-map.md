# Cartographie du véritable moteur de planning

Le fichier central identifié dans l'ancien dépôt est `planning-runtime.js`, distinct du raccourci `runtime/planning-quick-import.js`.

## Constats sur les 150 premières lignes

- Initialise Supabase et un modèle de semaine.
- Utilise les valeurs `g` et `b` comme tranches de travail de 15 minutes.
- Contient les fonctions `startOfWeek`, `totalForRow`, `planningProfileFor`, `planningVisibleModel`.
- Cache les salariés liés à des comptes désactivés en filtrant les lignes du modèle.
- Intègre des dépendances historiques au DOM, au routeur mobile et à la configuration des rôles.
- L'import réel apparaît dans ce fichier selon la recherche de `XLSX.read` et `importPlanningFiles` ; les fonctions complètes doivent encore être auditées.

## Architecture de reprise

Découper le code en modules indépendants : `excel-parser`, `planning-normalizer`, `schedule-analyzer`, `employee-linker`, `planning-repository`, `access-control`. La gestion des comptes désactivés doit être vérifiée côté serveur et pas seulement via filtrage de l'affichage.

La clé `sb_publishable_...` présente dans le code historique est une clé publique et ne doit pas être confondue avec une clé serveur secrète. Ne pas copier de secrets ou les paramètres historiques dans le nouveau dépôt.

État : cartographie seulement ; aucun module installé et aucun raccordement Supabase effectué.
