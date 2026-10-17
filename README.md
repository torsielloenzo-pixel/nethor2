# Nethor 2 — Version officielle (V1)

Application interne de gestion des plannings, distincte de l'ancien dépôt `nethor`.

## Accès

- [Ouvrir Nethor 2](https://torsielloenzo-pixel.github.io/nethor2/)
- [Tests GitHub Actions](https://github.com/torsielloenzo-pixel/nethor2/actions)
- [Déploiement GitHub Pages](https://github.com/torsielloenzo-pixel/nethor2/actions/workflows/preview-pages.yml)

Le code est publié via GitHub Pages. **L'URL du site peut être publique même lorsque le dépôt est privé**, mais toutes les données du planning nécessitent une session autorisée dans Supabase. Ne jamais ajouter de secrets, de données RH, ni de fichiers Excel au dépôt.

## Fonctionnalités raccordées

- Connexion aux **comptes Nethor existants**, via Supabase Auth.
- Contrôle de session active, compte non désactivé et permissions Planning via RPC serveur.
- Lecture des semaines réelles `planning_weeks` (accès sous RLS).
- Navigation jour/semaine, total par collaborateur et indicateur de couverture.
- Détection indicative de créneaux très courts, longues coupures, longues journées et écarts contractuels.
- Lecture des noms de planning avec association aux comptes visibles; modification des associations par un administrateur.
- Import Excel `.xls`, `.xlsx`, `.xlsm` : lecture locale, prévisualisation et validation explicite.
- Publication réservée au droit `manage`, protégée par le RPC existant `planning_save_week_if_revision`.
- Upload original dans le bucket privé `planning-files` puis vérification de la version publiée. Historique des fichiers accessible aux administrateurs via les tables et policies déjà existantes.
- PWA : manifest et cache strictement limité au code de l'application (aucune session, aucun fichier RH, aucune réponse API en cache).

## Points à tester avant adoption complète

1. Connexion réelle avec un compte de chaque rôle (administrateur, point de vente, responsable et employé), ainsi qu'avec un compte désactivé.
2. Export `.xls` représentatif des plannings historiques, en particulier **la lecture des couleurs Excel**. L'import échoue volontairement si un style est ambigu, pour éviter de publier des horaires erronés.
3. Publication réelle d'un fichier validé, archivage, traçabilité, puis téléchargement de l'archive avec un compte administrateur. **Aucun import RH de production n'a été déclenché automatiquement au déploiement.**
4. Vérifier les autorisations `view` / `operate` / `manage` avec des sessions d'utilisateurs réelles, ainsi que les profils désactivés. Le filtrage visuel des noms désactivés dépend des profils accessibles au client; l'isolation des données doit être réévaluée si l'exigence est de supprimer l'accès à ces noms dans toute l'API historique.
5. Tests navigateur sur Chrome, iPhone et installation PWA.
6. Vérification des paramètres GitHub Pages : préférer **Source: GitHub Actions** afin d'éviter la coexistence avec le workflow automatique « pages build and deployment ».

Le déploiement réussi ne constitue **pas** une validation complète du parcours d'authentification et d'import réel. Les fonctions et les accès ne doivent pas être considérés comme certifiés sans tests avec des comptes habilités.

## Développement et tests

```bash
npm run check
npm run dev
```

`npm run check` vérifie la syntaxe et les tests du domaine. La version hébergée GitHub Pages utilise le workflow `preview-pages.yml`, qui ne déploie que les ressources web nécessaires.

## Architecture

La base historique Supabase est réutilisée sans migration destructive. La fonction `public.nethor2_my_planning_permission()` a été ajoutée comme RPC en lecture seule pour vérifier la permission Planning de la session active. Elle utilise `SECURITY INVOKER`, n'est accessible qu'au rôle `authenticated`, et son résultat n'autorise pas lui-même une écriture : le contrôle serveur du RPC de publication reste nécessaire.
