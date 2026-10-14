# Architecture cible — Nethor 2

## Navigation

| Page | Employé | Responsable | Point de vente | Administrateur |
| --- | --- | --- | --- | --- |
| Accueil / Mon planning | Oui | Oui | Oui | Oui |
| Planning équipe | Selon droits existants | Oui | Oui | Oui |
| Anomalies | Non | Lecture selon droits | Oui | Oui |
| Importation et historique | Non | Selon droits | Selon droits | Oui |
| Équipe / comptes | Son profil | Selon droits | Selon droits | Oui |
| Paramètres PWA | Oui | Oui | Oui | Oui |

**Important :** cette matrice est une proposition à comparer aux permissions réelles, pas une politique de sécurité déployée.

## Import Excel

1. Réception locale du fichier et vérification de format, taille et structure.
2. Normalisation des noms, jours, dates, heures, pauses et cellules fusionnées.
3. Prévisualisation exhaustive des employés/colonnes détectés.
4. Association contrôlée des noms Excel aux profils (avec signalement des homonymes).
5. Calcul des horaires et lancement des règles d'anomalies.
6. Affichage des changements par rapport au planning publié.
7. Validation autorisée ; enregistrement d'une version immutable et activation atomique.
8. Historique : nom du fichier, auteur, date, empreinte, période, corrections et version précédente.

Ne jamais écraser la version active pendant le parsing ni afficher une importation partielle comme publiée.

## Anomalies initiales

- Date ou jour incohérent, horaire absent ou invalide.
- Heure de fin antérieure à l'heure de début, selon règle nuit explicite.
- Chevauchements individuels.
- Durée et pauses non conformes à la configuration.
- Écart aux heures contractuelles, affiché en information ou alerte selon paramétrage.
- Employé inconnu ou association ambiguë.
- Colonnes ou salariés disparus entre deux imports.

Les règles relatives à la durée du travail doivent être vérifiées avant activation, sans supposer qu'un écart contractuel est nécessairement une infraction.

## Authentification / données

- Conserver les identifiants Auth existants si l'audit confirme un raccordement compatible.
- Contrôler les politiques RLS côté base pour chaque action sensible ; masquer un bouton ne suffit pas.
- Désactiver un compte via la logique serveur : invalider les sessions, empêcher les nouvelles connexions, masquer des vues actives sans supprimer l'historique.
- Séparer identités Auth, profils, contrats, alias Excel, versions de planning, horaires, anomalies et journaux d'audit.
- Tester sur une base séparée ou un environnement de test ; aucune migration destructive directe.

## PWA

- Manifeste, icônes et installation pour mobile/desktop.
- Shell applicatif en cache ; données personnelles et sessions hors cache public.
- Vérification à l'ouverture et à la reprise de l'app ; actualisation maîtrisée sans boucle de rechargement.
- Gestion explicite du hors-ligne : dernier planning consulté seulement si stockage local autorisé et sécurisé, avec statut de fraîcheur.
- Vérifications sur iOS Safari/PWA, Chrome desktop et mode déconnecté.

## Réemploi ciblé depuis l'ancien dépôt

Fichiers candidats à examiner, **non encore repris** :

- `runtime/planning-anomaly-core.js`
- `runtime/planning-quick-import.js`
- `supabase/functions/planning-import-audit/index.ts`
- `auth/auth-session.js`

Les dépendances, contrats de données et contraintes de sécurité doivent être revus avant copie.

## Politique de déploiement

Le dépôt `nethor2` reste indépendant de `nethor`. Ne pas connecter `nethor.fr` tant que l'authentification, le planning, l'import, les anomalies et la PWA ne sont pas validés en préproduction.
