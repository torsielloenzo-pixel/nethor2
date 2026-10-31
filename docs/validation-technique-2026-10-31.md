# Validation technique NETHOR2 — 31/10/2026

> Branche de validation : `validation/phase-1-20261031`
>
> Ce document distingue les constats vérifiés, les correctifs préparés et les tests encore requis. Aucun correctif Supabase sensible décrit ici ne doit être considéré comme déployé tant que la migration correspondante n'a pas été validée puis appliquée.

## Statuts

- **VALIDÉ** : contrôle statique / base effectué et résultat conforme.
- **À CORRIGER** : défaut confirmé.
- **BLOQUANT** : peut rendre l'application indisponible, incohérente ou afficher une version non garantie.
- **À TESTER** : nécessite un test d'intégration ou un appareil/navigateur réel.
- **PRÉPARÉ** : correctif présent sur la branche de validation, non fusionné / non déployé.

## Matrice de validation

| Priorité | Statut | Constat vérifié | Action |
|---|---|---|---|
| Écrans blancs / démarrage | PRÉPARÉ | Le loader de démarrage pouvait rester affiché indéfiniment si le module principal ou une ressource critique ne terminait pas son chargement. | Watchdog de démarrage + écran de reprise + bouton Réessayer dans `index.html`. |
| Navigation | À TESTER | Les gardes `canNavigate` et la revérification de session sont présentes. | Tester changements de rôle, rotation mobile/desktop, retour focus, historique navigateur. |
| Cache / hors connexion | À CORRIGER | Le SW ne met pas en cache Supabase ni les données RH. En revanche `cache.addAll(SHELL)` rend l'installation du SW atomique : une ressource manquante fait échouer l'installation. | Définir un noyau obligatoire + audit automatique de la liste SHELL avant publication. |
| Rechargements | VALIDÉ / À TESTER | Le rechargement PWA est déclenché au `controllerchange`, après demande de mise à jour. Les vérifications focus/visibility ne rechargent pas la page. | Test réel update SW + perte/reprise réseau + focus. |
| Recherche collaborateurs | À CORRIGER | La recherche Équipe porte uniquement sur les personnes du planning de la semaine chargée. | Créer un index collaborateurs autorisé et recherche indépendante de la semaine courante. |
| Permissions Supabase / RLS | VALIDÉ PARTIEL | `planning_weeks` est protégé par session active + permissions module. `profiles` ne donne UPDATE authentifié que sur les colonnes de préférences UI. Plusieurs fonctions SECURITY DEFINER restent à inventorier fonction par fonction. | Maintenir matrice RLS/RPC et réduire les grants non nécessaires. |
| Désactivation / révocation | VALIDÉ STATIQUEMENT | Désactivation : bannissement Auth + `sessions_valid_after` + suppression `auth.sessions`. `session_is_active` vérifie le `session_id` JWT contre `auth.sessions`. | Test destructif uniquement avec compte de test dédié. |
| Récupération / auth | À CORRIGER | Réponse générique anti-énumération, preuve SHA-256 et suivi de demande présents. L'adresse de récupération n'est pas vérifiée par preuve de propriété. Limitation publique surtout par utilisateur. | Vérification e-mail + réauthentification sensible + rate limiting renforcé. |
| Dernière version des horaires | BLOQUANT / PRÉPARÉ | Un remplacement avec SHA différent mais même `modified_at` peut échapper au trigger. Les semaines publiées via flux `change` ont souvent `sourceModifiedAt` mais pas `sourceUploadedAt`, ce qui empêchait le contrôle cloud de secours. | Migration `20261031_nethor_sync_latest_version_validation.sql` préparée, non déployée. |
| Semaines manquantes | BLOQUANT | 09/11/2026 et 16/11/2026 absentes. Les fichiers existent mais le parseur les a rejetés : `Lecture des styles incomplète : LUNDI ligne 13 colonne 3`. | Examiner les fichiers XLS réels / style de C13 et définir une règle d'import sûr. |
| Imports partiels | PRÉPARÉ | Le parseur exige 7 feuilles et 58 créneaux, mais utilisait les lignes employés de LUNDI sur tous les jours sans vérifier le nom de la ligne. | Contrôle d'alignement inter-feuilles ajouté + test unitaire. |
| Modifications d'horaires consultables | À CORRIGER | `planning_day_revisions` conserve date/heure/type de révision mais pas le modèle précédent et nouveau. | Ajouter snapshots/diffs versionnés avant de créer l'UI de comparaison. |
| Cohérence Jour / Semaine / Année | VALIDÉ PARTIEL | Jour et Semaine dérivent du même modèle semaine. Année interroge les semaines publiées et revient à la semaine du jour sélectionné. | Réparer test PWA obsolète (préparé) puis tests d'intégration réels. |
| Mobile / Desktop / PWA réels | À TESTER | Contrôles statiques et unitaires disponibles, mais aucun test E2E authentifié réel n'a encore été exécuté dans cette phase. | Matrice Chrome/Edge Desktop, Safari/Chrome mobile, PWA installée, online/offline/update. |

## Défauts critiques confirmés

### 1. Fraîcheur NethorSync

Deux chemins pouvaient manquer une nouvelle version :

1. Le trigger `nethor_sync_auto_queue_change` exigeait un `modified_at` strictement supérieur. Un fichier dont le contenu change mais dont Windows conserve le même mtime pouvait donc être ignoré malgré un SHA-256 différent.
2. Le contrôle cloud ne rescannait correctement une semaine déjà publiée depuis `sync-inbox` que lorsque le modèle contenait `sourceUploadedAt`. Les publications provenant du flux `change` contiennent plutôt `sourceModifiedAt`.

La migration de validation corrige ces deux cas et requalifie aussi un job historique `missing_week_only` déjà marqué « semaine publiée » afin que son contenu soit réellement comparé à la version active.

### 2. Semaines du 09/11 et 16/11

Les fichiers sont présents côté NethorSync, mais les traitements ont été rejetés de façon explicite et fail-closed :

`Lecture du planning refusée : Lecture des styles incomplète : LUNDI ligne 13 colonne 3`

Aucune donnée ne doit être inventée pour contourner cette erreur. Le fichier source doit être inspecté avant d'assouplir le parseur.

### 3. Historique des modifications

Le système sait qu'une journée a été révisée mais ne conserve pas encore suffisamment d'information pour reconstruire de manière fiable l'avant/après des horaires. Une nouvelle structure de versionnement est requise.

## Correctifs présents sur cette branche

- `index.html` : reprise visible si le démarrage reste bloqué.
- `src/import/excel-structure.js` : contrôle des collaborateurs sur chaque feuille.
- `tests/excel-structure.test.js` : test du décalage de collaborateurs.
- `tests/planning-year.test.js` : test de cache PWA décorrélé d'un ancien nom de cache.
- `supabase/migrations/20261031_nethor_sync_latest_version_validation.sql` : correctif de détection/reprise de la dernière version.

## Conditions avant fusion

1. Tous les tests Node du dépôt doivent être verts.
2. La migration Supabase doit être testée sans publier automatiquement une ancienne archive.
3. Les semaines 09/11 et 16/11 doivent rester rejetées tant que leur style Excel n'est pas compris ou validé.
4. Un compte de test doit confirmer la révocation immédiate après désactivation.
5. Une PWA installée doit être testée avec mise à jour, réseau coupé, reprise réseau et redémarrage.
6. Un test Desktop et un test Mobile doivent valider Jour/Semaine/Année sur les mêmes données.
