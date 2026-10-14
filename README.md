# Nethor 2

Application interne de gestion des plannings du personnel, reconstruite sur une base légère et maintenable.

## Périmètre V1

- Authentification, comptes existants et rôles.
- Association entre un utilisateur et son identité dans le planning.
- Planning jour/semaine (mobile et desktop).
- Import de fichiers Excel .xls et .xlsx.
- Analyse des horaires, volumes hebdomadaires et anomalies.
- Historique et traçabilité des imports.
- PWA installable avec cache applicatif maîtrisé.

**Hors périmètre :** chat, promotions, personnalisation/thèmes, scanner, fiches articles, défis, boutique, fruits et légumes, boulangerie, sondages, animations.

## Principes

1. Ne pas modifier le dépôt historique `nethor` ni le site en production pendant la reconstruction.
2. Réutiliser seulement les règles métier vérifiées, pas l'ensemble des scripts historiques.
3. Ne jamais exposer les clés privées Supabase ou données RH dans GitHub.
4. Valider la connexion aux comptes existants et les règles RLS avant toute migration de données.
5. Import en deux temps : aperçu/analyse, puis validation explicite et publication atomique.
6. Les plannings publiés sont versionnés. En cas d'échec, conserver la dernière version valide.
7. Isoler l'ancien cache PWA : aucune redirection automatique index/home, service worker versionné avec stratégie d'activation contrôlée.

## Étapes

- [x] Créer le dépôt privé et le cadrage.
- [ ] Auditer l'authentification et le schéma Supabase de Nethor.
- [ ] Extraire/tester le parseur Excel et le moteur d'anomalies.
- [ ] Construire l'interface mobile/desktop minimale.
- [ ] Tester les flux de publication, les comptes et la PWA.
- [ ] Préparer un environnement de préproduction indépendant.
- [ ] Basculer le domaine uniquement après validation.

Voir [docs/architecture.md](docs/architecture.md) pour les règles de conception.

> État : cadrage initial. Aucun déploiement ni migration des comptes n'est encore effectué.
