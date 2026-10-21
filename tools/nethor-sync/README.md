# Nethor Sync 2 — PC Windows

## Installation depuis Nethor2

Disponible pour **Administrateur** et **Point de vente** via la barre latérale, au-dessus de « Connecté à Nethor ».

1. Cliquer **Installer NethorSync** pour télécharger directement `NethorSync-Setup.exe` depuis GitHub Releases (plus de ZIP requis).
2. Lancer l'exécutable sur le PC Windows. Le programme propose le dossier `Bureau\\Nethor Sync` ; sélectionner par exemple `C:\\Users\\torsi\\Desktop\\Nethor Sync` et vérifier les sous-dossiers année/mois.
3. Entrer un compte Nethor de rôle Administrateur ou Point de vente, autorisé à gérer le planning, dans la fenêtre temporaire de connexion.
4. Après validation, les tâches Windows sont installées pour l'utilisateur courant et lancent l'agent sans fenêtre visible.
5. Les scripts sont installés sous `%LOCALAPPDATA%\\NethorSync2\\app`, pas dans le dossier des Excel. Aucun raccourci ni fenêtre résidente.

**Le navigateur ne peut pas installer un programme sur Windows sans une action locale de l'utilisateur.** L'installation est discrète ensuite mais reste visible dans le Planificateur Windows et dans les fichiers de l'utilisateur. Aucun pilote, service système ni élévation automatique n'est installé.

## Mises a jour automatiques depuis la 2.1.7

Après l'installation unique de NethorSync **2.1.7**, Windows crée une tâche
**Nethor Sync 2 - Mises a jour** : elle vérifie la version à l'ouverture de
session et toutes les quatre heures, sans fenêtre de commande.

- **Supabase** est la source d'autorisation : RPC `nethor_sync_update_manifest`, canal `stable`, version, adresse du binaire et SHA-256.
- **GitHub Releases** héberge le binaire versionné. Il n'est accepté que si l'adresse correspond strictement au dépôt Nethor et à la version annoncée ET si le SHA-256 correspond exactement au manifeste Supabase.
- Si la version est identique ou plus ancienne, **aucun téléchargement** ni installation n'a lieu.
- Si une synchronisation Excel est active, la mise à jour est différée jusqu'à une future vérification (mutex Windows partagé).
- La nouvelle installation s'effectue en mode **AUTOUPDATE** sans nouvelle connexion ni choix de dossier. Elle ne relance pas `Installer-Sync.ps1`, ne supprime pas `config.json`, les tokens DPAPI, les manifests locaux ou les fichiers Excel.
- Les scripts de la version précédente sont sauvegardés localement. Si l'installation échoue ou si le numéro installé ne correspond pas à la version attendue, les scripts précédents sont restaurés au mieux.
- Les événements et erreurs de mise à jour sont conservés dans `%LOCALAPPDATA%\\NethorSync2\\update-report.json` ; les états de mise à jour confirmés sont également remontés dans `private.nethor_sync_update_events` via une RPC authentifiée, sans secrets ni chemins.
- Après la première installation, les versions suivantes pourront être distribuées **sans relancer le téléchargement manuel**, à condition de publier un paquet compatible versionné puis d'autoriser son SHA-256 dans Supabase.

**Important :** le contrôle est déclenché uniquement lorsque le poste Windows
est allumé, que le compte utilisateur de la tâche est connecté et que le
réseau est disponible. Les mises à jour sont contrôlées par Supabase, mais
**le fichier EXE est téléchargé sur GitHub Releases**, pas stocké dans Supabase.
L'exécutable n'est pas signé par certificat Windows ; le SHA-256 protège
contre une altération du paquet par rapport au manifeste autorisé, mais ne
remplace pas la signature Authenticode. Une panne du planificateur ou une
corruption totale de l'updater pourrait nécessiter une intervention manuelle.

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
- **Correctif Windows 2.1.8 et diagnostic automatique** : disponible depuis « Installer NethorSync », « Télécharger la correction » et Paramètres. Conserve la planification 19 h / 12 h et le contrôle des demandes toutes les cinq minutes, sans écoute permanente.
- **Correctif des doublons** : vérifie dans Supabase qu'un fichier est déjà archivé avant de tenter de l'envoyer. Les codes HTTP 400/409 ne sont considérés comme des doublons que si le serveur confirme la présence de l'objet exact. La liaison existante et les Excel ne sont pas supprimés.
- Les demandes ne peuvent être exécutées qu'avec le PC allumé, l'utilisateur Windows connecté et un accès Supabase fonctionnel.
- Une synchronisation calcule les empreintes SHA-256, dépose les fichiers modifiés dans le stockage privé, puis enregistre les versions Windows. Le serveur analyse et publie automatiquement **les vrais remplacements récents et valides**.

Le programme calcule une empreinte SHA-256 des fichiers `.xls`, `.xlsx`, `.xlsm` :
- **Même contenu déjà envoyé** : rien n'est retransmis.
- **Contenu modifié** : nouvelle empreinte, nouveau transfert.
- **Fichier déplacé ou renommé** : identifié par son empreinte ; aucun écrasement inutile.
- **Fichier incomplet/en cours de copie** : différé.

La synchronisation dépose les originaux dans le stockage **privé** `planning-files/sync-inbox`; aucun fichier n'est déposé sur GitHub. L'application Nethor2 affiche les fichiers en attente pour un administrateur ayant le droit `manage`.

## Deux programmations totalement indépendantes

**NethorSync 2.1.8 (Windows)** : conserve la synchronisation des fichiers à 19 h (lundi–samedi) et 12 h (dimanche), plus le contrôle ponctuel demandé par un gestionnaire depuis l'application. L'audit cloud ne déclenche jamais ce scanner et ne nécessite aucune session Windows ouverte.

**Supabase (site / PWA, serveur)** : contrôle tous les fichiers Excel présents dans `planning-files/sync-inbox/` aux horaires 00 h, 04 h, 08 h, 12 h, 16 h et 20 h UTC. La planification fonctionne indépendamment du fuseau horaire de Windows et du changement d'heure en France. Elle compare les dernières versions conservées aux semaines déjà publiées, puis peut automatiquement publier les plannings différents avec les protections du moteur serveur. Les fichiers archivés trop anciens ne sont pas réappliqués.

**Après chaque contrôle Windows terminé et chaque nouveau transfert** : le scanner de stockage existant s'exécute toutes les minutes, déclenche une lecture Excel sur les nouvelles versions et les publie si elles sont recevables. Le contrôle toutes les quatre heures fait une seconde vérification autonome des fichiers déjà stockés, même sans nouvel envoi du MSI.

L'écran NethorSync Mobile/PWA affiche séparément les heures de l'audit Supabase, sa dernière exécution, le nombre de fichiers examinés et le résultat (publié, rejeté, en attente) ainsi que la dernière transmission Windows. Le résultat d'un audit ne signifie pas qu'une nouvelle synchronisation Windows s'est produite.

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

Aucun ancien fichier ne peut être supprimé ou modifié sur le MSI par le traitement serveur. La première installation locale 2.1.7 ou ultérieure est requise pour activer les mises à jour automatiques ; la publication automatique des plannings reste exclusivement côté Supabase.

## Désinstallation et transfert

Pour arrêter localement, désactiver les tâches « Nethor Sync 2 » dans le Planificateur Windows puis supprimer `%LOCALAPPDATA%\NethorSync2` après sauvegarde des rapports nécessaires. Pour libérer le poste depuis Nethor2, l'administrateur doit **réinitialiser la liaison dans les paramètres**. Cette action ne supprime pas les fichiers Excel d'origine.

## Tests

- `npm run check` : syntaxe JavaScript et tests des RPC frontend.
- `tests/nethor-sync-local.test.ps1` : simulation PowerShell pour les statuts new, unchanged, modified et moved_or_copied.
- Workflows GitHub Actions Windows et Node sur la branche de développement.
- Test réel de lecture sans publication : fichiers du magasin .xls et .xlsx décodés côté serveur ; essai SQL transactionnel annulé après validation, sans modifier la semaine visible.

## Diffusion Windows

À partir de la 2.1.6, chaque échec Windows envoie automatiquement à Supabase un rapport regroupant l’étape, le code HTTP et les volumes d’erreurs, sans chemins, noms de fichiers ni jetons. Les gestionnaires consultent les 30 derniers jours depuis Paramètres → NethorSync. Si l’authentification ou le réseau sont totalement indisponibles, le diagnostic détaillé reste local jusqu’au rétablissement de la connexion.

L'installateur compatible **2.1.8**, construit sur le socle Windows 2.1.1/2.1.2, est publié sous le nom [NethorSync-Setup.exe](https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync-Setup.exe). Le programme local reste un simple scanner et transporteur de fichiers. Le correctif 2.1.8 prend en charge les objets déjà stockés, sans forcer une nouvelle liaison. Les règles de publication évoluent séparément sur Supabase.

Le logiciel est non signé : Smart App Control peut bloquer un nouvel exécutable. Ne désactivez pas les protections Windows pour l'installer. Seule l'exécution programmée est discrète : les tâches restent visibles dans le Planificateur Windows.

### Correctif du 21 octobre 2026 — 2.1.8
Le traitement `nethor_sync_record_file_changes` pouvait recevoir depuis Windows PowerShell 5.1 un corps JSON incorrect pour certains noms de fichiers et chemins contenant des caractères non ASCII. Les journaux PostgREST montraient `PGRST102` (corps JSON mal formé). La 2.1.8 convertit et valide le JSON localement, l'envoie comme octets UTF-8 explicites avec `charset=utf-8` et lit le numéro de version réellement installé depuis `NethorSync-Version.txt`. Le paquet est disponible via le lien principal de Nethor2 et via le canal de mise à jour Supabase (SHA-256 épinglé). Aucun planning publié n'a été modifié par le déploiement.
