# Nethor 2 — Aperçu fonctionnel V1

Refonte indépendante de Nethor, recentrée sur le planning. Cette version possède une **interface utilisable**, mais fonctionne **en mode démonstration** avec des données fictives par défaut. Aucun raccordement aux comptes réels ni écriture sur le Supabase de production n'est effectué.

## Ouvrir l'aperçu

- **Prévisualisation GitHub Pages** : `https://torsielloenzo-pixel.github.io/nethor2/` (si l'environnement Pages du dépôt privé est autorisé et configuré dans GitHub > Settings > Pages > Source: GitHub Actions).
- **Localement** : installer Node.js 20+, puis exécuter `npm run dev` et ouvrir `http://127.0.0.1:4173`.
- Sur mobile, ouvrir l'URL HTTPS GitHub Pages puis utiliser « Ajouter à l'écran d'accueil » lorsque le navigateur le permet.

Le dépôt reste privé. Attention : **un site GitHub Pages peut être accessible publiquement même si le dépôt est privé**. L'artefact de déploiement ne contient que les fichiers statiques de la démo, pas les scripts d'administration, les données réelles, les tests, les fichiers SQL, ni les secrets.

## Écrans déjà disponibles

- Vue d'ensemble : indicateurs, planning, couverture magasin et alertes.
- Planning : navigation par semaine, vues jour et semaine, horaire par collaborateur.
- Anomalies : contrôles de journées, courtes plages, longues coupures et écarts horaires.
- Équipe : filtrage, état d'association des personnes présentes dans la grille.
- Import Excel : sélection ou glisser-déposer, lecture locale des formats `.xls`, `.xlsx`, `.xlsm`, détection de la structure à 7 feuilles, aperçu des heures. Aucun envoi réseau du fichier ni publication.
- PWA : manifeste, service worker du code statique, icône.

Le parseur Excel dépend du lecteur SheetJS CE v0.20.3 chargé depuis le CDN officiel. Il **refuse l'import** si la couleur des créneaux n'est pas identifiable avec fiabilité. La compatibilité avec chaque ancien modèle `.xls` du magasin reste à tester sur des fichiers réels anonymisés.

## Sécurité et périmètre actuel

- Les personnes de l'aperçu (Camille, Alex, Morgan, Lou, Noa, Sam) sont **fictives**.
- La connexion à Supabase, les droits réels, la publication, la désactivation des comptes et la synchronisation automatique sont **désactivés** dans cette version.
- Les fichiers Excel sont uniquement conservés **en mémoire dans l'onglet courant** ; l'application ne les enregistre pas dans le cache du service worker.
- Le service worker n'intercepte que des chemins de ressources applicatives explicitement listés, **jamais les réponses API**.
- Les contrôles d'anomalies sont **indicatifs** et ne qualifient pas juridiquement un horaire.
- Aucun changement n'est appliqué au dépôt historique `nethor` ou au domaine `nethor.fr`.

### Important avant raccordement des comptes

Audit du 17 octobre 2026 : les tables `profiles`, `planning_weeks` et `planning_import_history` ont RLS activée, mais des politiques `ALL` utilisant `private.session_is_active()` existent. Les politiques PostgreSQL permissives pouvant se cumuler, il faut contrôler leur comportement réel avec un compte à privilèges minimaux avant de raccorder l'interface de préproduction. Ne pas considérer la présence de RLS seule comme une preuve d'isolation.

## Tests

```bash
npm run check
npm run dev
```

`npm run check` contrôle la syntaxe JavaScript et les tests unitaires des modules métiers existants.

## Travaux suivants

1. Valider les permissions/RLS et les rôles au moyen de tests de comptes réels en environnement de préproduction.
2. Vérifier le parseur sur les fichiers `.xls` historiques sans perdre les styles Excel.
3. Ajouter un flux de publication atomique, la traçabilité et les vérifications de concurrence.
4. Relier les profils/authentifications existants, uniquement après validation de l'accès par rôle.
5. Réaliser les essais de PWA sur iPhone et desktop.
