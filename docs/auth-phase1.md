# Audit Auth et règles de raccordement (phase 1)

Sources inspectées dans l'ancien dépôt :
- `database/2026-10-03-security-foundation.sql`
- `auth/auth-session.js`
- `database/2026-10-05-planning-import-history-admin.sql`

## Vérifié dans le code existant

- La table `public.profiles` est utilisée pour obtenir le rôle et le champ `account_enabled`.
- Une migration ajoute le champ `sessions_valid_after` pour l'invalidation de session.
- La fonction RPC `public.nethor_security_context()` expose notamment `authenticated`, `session_active` et `role`.
- La fonction historique de connexion vérifie un profil après authentification.

## Module ajouté

`src/auth/session-gate.js` exécute : contrôle utilisateur via `auth.getUser()`, vérification RPC de session active, lecture du profil autorisé et contrôle explicite de `account_enabled === true`.

C'est une vérification d'affichage et de navigation côté client, **pas une garantie de sécurité**. Le client doit rester soumis aux policies RLS et aux validations serveur. Le module n'expose aucune clé de service ni aucune donnée de comptes.

## À confirmer impérativement

- Existence et signatures effectives des fonctions dans l'instance Supabase actuelle, non seulement dans les migrations Git.
- Permissions RLS pour les tables planning et profiles.
- Politique de révocation effective des sessions et impossibilité d'écrire après désactivation.
- Compatibilité CORS et URL autorisées avant l'ouverture d'un domaine de préproduction.
- Cas où `account_enabled` est NULL dans les données historiques : le module refuse volontairement l'accès jusqu'à vérification.
- Les rôles et sous-rôles doivent être chargés depuis les droits validés par le serveur, pas à partir de simples chaînes de caractères pour les opérations sensibles.

Aucun compte, schéma ou enregistrement Supabase modifié. Aucun branchement sur production.
