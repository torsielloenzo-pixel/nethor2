# Phase 1 — Couche de lecture et publication du planning

Sources inspectées : `planning-runtime.js` et `database/2026-10-05-planning-import-history-admin.sql` dans l'ancien dépôt.

## Tables et RPC identifiées dans le code

- `planning_weeks` : colonnes `week_start`, `data`, `week_label`, `source_file`, `source_path`, `updated_at`.
- `planning_import_history` : colonne `week_start`, nom de fichier, chemin d'archivage, date et auteur.
- RPC `planning_save_week_if_revision` : le code historique utilise une révision attendue et traite un statut de conflit.

## Fichier ajouté

`src/data/planning-repository.js` comporte lecture par semaine, consultation limitée de l'historique, préparation d'une publication optimiste et vérification après lecture.

Les lectures et écritures sont **entièrement déléguées à Supabase** ; aucun contournement de RLS ni clé service n'est intégré. Les permissions doivent être garanties côté serveur et leur configuration effective vérifiée avant connexion.

## À faire avant utilisation

- Confirmer les signatures et politiques RLS actuellement déployées dans Supabase.
- Vérifier l'isolation par magasin et par utilisateur selon les rôles.
- Ajouter la prévisualisation des différences et l'archivage original.
- Tester la concurrence réelle sur deux sessions et la relecture après publication.
- Contrôler l'atomicité entre stockage de fichier, version active et historique.
- Exécuter les tests unitaires et tests d'intégration en préproduction.

Aucune modification des données de production effectuée.
