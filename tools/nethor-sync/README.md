# Nethor Sync 2 — PC Windows (préproduction)

## Installation depuis Nethor2

Disponible pour **Administrateur** et **Point de vente** via la barre latérale, au-dessus de « Connecté à Nethor ».

1. Cliquer **Installer NethorSync** pour télécharger directement `NethorSync-Setup.exe` depuis GitHub Releases (plus de ZIP requis).
2. Lancer l'exécutable sur le PC Windows. Le programme propose le dossier `Bureau\\Nethor Sync` ; sélectionner par exemple `C:\\Users\\torsi\\Desktop\\Nethor Sync` et vérifier les sous-dossiers année/mois.
3. Entrer un compte Nethor de rôle Administrateur ou Point de vente, autorisé à gérer le planning, dans la fenêtre temporaire de connexion.
4. Après validation, les tâches Windows sont installées pour l'utilisateur courant et lancent l'agent sans fenêtre visible.
5. Les scripts sont installés sous `%LOCALAPPDATA%\\NethorSync2\\app`, pas dans le dossier des Excel. Aucun raccourci ni fenêtre résidente.

**Le navigateur ne peut pas installer un programme sur Windows sans une action locale de l'utilisateur.** L'installation est discrète ensuite mais reste visible dans le Planificateur Windows et dans les fichiers de l'utilisateur. Aucun pilote, service système ni élévation automatique n'est installé.

## Un seul ordinateur maître

La base Supabase enregistre :
- Un identifiant de poste, son nom, l'utilisateur ayant effectué la liaison et sa date ;
- Un secret propre à ce PC (seule l'empreinte SHA-256 est gardée en base) ;
- Une génération de liaison, changée lors d'une révocation administrateur ;
- La dernière vérification, le dernier transfert et la commande manuelle en attente.

L'identité du poste et son secret local sont stockés sous `%LOCALAPPDATA%\NethorSync2`, protégés par le chiffrement utilisateur DPAPI pour les jetons. L'ancien PC ne peut plus passer les contrôles du programme après une réinitialisation, même si ses fichiers Excel sont conservés.

**Réinstaller sur un deuxième PC sans délier le premier est refusé par le serveur.** L'administrateur doit d'abord utiliser **Paramètres > NethorSync > Réinitialiser la liaison**. Cela protège du retour des anciennes versions depuis un ordinateur de test.

## Un seul mode : automatique

- **Planification permanente** : lundi au samedi à 19 h, dimanche à 12 h, heure locale Windows (Europe/Paris).
- **Bouton « Synchroniser »** : déclenche une seule vérification ponctuelle, sans changer les horaires. Une nouvelle demande n'est pas empilée si une demande précédente attend encore un résultat.
- **Agent compatible MSI 2.1.3** : vérifie les demandes ponctuelles environ toutes les 5 minutes, sans processus d'écoute permanent.
- **Mise à jour nécessaire** : réexécuter `NethorSync-Setup.exe` version 2.1.3 sur le MSI pour transmettre les anciennes/nouvelles dates de modification des fichiers au moteur automatique.
- Les demandes ne peuvent être exécutées qu'avec le PC allumé, l'utilisateur Windows connecté et un accès Supabase fonctionnel.
- Une synchronisation calcule les empreintes SHA-256, dépose les fichiers modifiés dans le stockage privé, puis enregistre les versions Windows. Le serveur analyse et publie automatiquement **les vrais remplacements récents et valides**.

Le programme calcule une empreinte SHA-256 des fichiers `.xls`, `.xlsx`, `.xlsm` :
- **Même contenu déjà envoyé** : rien n'est retransmis.
- **Contenu modifié** : nouvelle empreinte, nouveau transfert.
- **Fichier déplacé ou renommé** : identifié par son empreinte ; aucun écrasement inutile.
- **Fichier incomplet/en cours de copie** : différé.

La synchronisation dépose les originaux dans le stockage **privé** `planning-files/sync-inbox`; aucun fichier n'est déposé sur GitHub. L'application Nethor2 affiche les fichiers en attente pour un administrateur ayant le droit `manage`.

## Publication automatique côté Supabase — fonctionne avec NethorSync 2.1.2

**Le poste Windows ne publie jamais les horaires directement.** Il continue à déposer les fichiers Excel .xls/.xlsx/.xlsm dans `planning-files/sync-inbox/` avec une empreinte SHA-256. C'est désormais la base Supabase, indépendante du PC et du navigateur, qui détecte les nouveaux dépôts.

- Une tâche serveur vérifie chaque minute les nouveaux fichiers du répertoire privé. Les dépôts **antérieurs à la date d'activation de cette fonction** ne sont jamais publiés rétroactivement.
- Seuls les fichiers déposés par le compte actif du MSI associé sont acceptés. Le serveur récupère le classeur, recalcule son empreinte SHA-256 et utilise le même lecteur Excel que l'import manuel.
- Seules les semaines déjà publiées dans Nethor2 peuvent être remplacées, après vérification de la date B2, des sept jours, des couleurs, du nom du planning et de la cohérence des employés et créneaux.
- Les semaines anciennes de plus d'une semaine ou futures de plus de dix semaines, les doublons et les fichiers dont la version est ambiguë sont ignorés sans changer les horaires.
- La dernière version publiée est protégée par verrouillage transactionnel et ordre des transferts. Un import manuel intervenu après le dépôt ne peut pas être effacé.
- L'état du résultat (`published`, `unchanged`, `skipped`, `rejected`, `failed`) est visible aux gestionnaires, et l'historique Nethor2 conserve l'ancien fichier.
- Les utilisateurs reçoivent la nouvelle semaine depuis la même table `planning_weeks`, avec les révisions et mécanismes de lecture existants.

**Limitation connue de la 2.1.2 :** Supabase connaît la date de **réception** du fichier, mais pas son horodatage Windows `LastWriteTimeUtc`. Un ancien fichier recopié après coup peut être transféré comme une nouveauté : il est impossible de prouver sa fraîcheur absolue à partir du seul dépôt. Les contrôles de période, de nom, de version déjà publiée et d'ordre des arrivées réduisent ce risque sans l'éliminer totalement. En cas de doute, vérifier le planning dans Nethor2.

Aucun ancien fichier ne peut être supprimé ou modifié sur le MSI par le traitement serveur. La 2.1.3 n'est pas requise.

## Désinstallation et transfert

Pour arrêter localement, désactiver les tâches « Nethor Sync 2 » dans le Planificateur Windows puis supprimer `%LOCALAPPDATA%\NethorSync2` après sauvegarde des rapports nécessaires. Pour libérer le poste depuis Nethor2, l'administrateur doit **réinitialiser la liaison dans les paramètres**. Cette action ne supprime pas les fichiers Excel d'origine.

## Tests

- `npm run check` : syntaxe JavaScript et tests des RPC frontend.
- `tests/nethor-sync-local.test.ps1` : simulation PowerShell pour les statuts new, unchanged, modified et moved_or_copied.
- Workflows GitHub Actions Windows et Node sur la branche de développement.
- Test réel de lecture sans publication : fichiers du magasin .xls et .xlsx décodés côté serveur ; essai SQL transactionnel annulé après validation, sans modifier la semaine visible.

## Diffusion Windows

L'installateur **2.1.2**, conservé pour compatibilité avec le MSI, est publié sous le nom [NethorSync-Setup.exe](https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync-Setup.exe). Le programme local reste un simple scanner et transporteur de fichiers. Les règles de publication évoluent sur Supabase, sans reconfiguration Windows.

Le logiciel est non signé : Smart App Control peut bloquer un nouvel exécutable. Ne désactivez pas les protections Windows pour l'installer. Seule l'exécution programmée est discrète : les tâches restent visibles dans le Planificateur Windows.
