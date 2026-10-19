# Nethor Sync 2 — PC Windows (préproduction)

## Installation depuis Nethor2

Disponible pour **Administrateur** et **Point de vente** via la barre latérale, au-dessus de « Connecté à Nethor ».

1. Cliquer **Installer NethorSync** pour télécharger directement `NethorSync2-Setup.exe` depuis GitHub Releases (plus de ZIP requis).
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

## Modes de fonctionnement

- **Automatique :** lundi au samedi à 19h, dimanche à 12h, à l'heure locale Windows (configurer le PC sur le fuseau Paris).
- **Manuel :** envoi d'une demande depuis la barre latérale; l'agent la détecte au plus tard lors de son prochain contrôle Windows toutes les 5 minutes (s'il est allumé et connecté).
- Les modes sont réglables dans les paramètres du site. Le mode manuel suspend les exécutions programmées, mais conserve l'écoute des demandes manuelles.
- Aucune promesse d'exécution à l'heure exacte si le PC est éteint, en veille ou hors ligne.

Le programme calcule une empreinte SHA-256 des fichiers `.xls`, `.xlsx`, `.xlsm` :
- **Même contenu déjà envoyé** : rien n'est retransmis.
- **Contenu modifié** : nouvelle empreinte, nouveau transfert.
- **Fichier déplacé ou renommé** : identifié par son empreinte ; aucun écrasement inutile.
- **Fichier incomplet/en cours de copie** : différé.

La synchronisation dépose les originaux dans le stockage **privé** `planning-files/sync-inbox`; aucun fichier n'est déposé sur GitHub. L'application Nethor2 affiche les fichiers en attente pour un administrateur ayant le droit `manage`.

## Publication des plannings : sécurité

**Important : la mise en ligne forcée automatique des plannings n'est pas activée.** Elle demandera la validation du lecteur des styles BIFF/OLE pour les fichiers historiques `.xls`, des dates en B2 et des sept feuilles, ainsi qu'une publication transactionnelle protégée par le verrou de poste. À ce stade, seul le transfert est automatique ; l'administrateur prévisualise puis publie sur Nethor2. L'application évite un écrasement silencieux si un autre planning a été modifié entre la prévisualisation et la validation.

La date indiquée dans l'état du logiciel est la dernière **vérification** (ou le dernier transfert, affiché séparément), et non la garantie que l'ancienne semaine a été publiée.

## Désinstallation et transfert

Pour arrêter localement, désactiver les tâches « Nethor Sync 2 » dans le Planificateur Windows puis supprimer `%LOCALAPPDATA%\NethorSync2` après sauvegarde des rapports nécessaires. Pour libérer le poste depuis Nethor2, l'administrateur doit **réinitialiser la liaison dans les paramètres**. Cette action ne supprime pas les fichiers Excel d'origine.

## Tests

- `npm run check` : syntaxe JavaScript et tests des RPC frontend.
- `tests/nethor-sync-local.test.ps1` : simulation PowerShell pour les statuts new, unchanged, modified et moved_or_copied.
- Workflows GitHub Actions Windows et Node sur la branche de développement.
- Aucun test de publication réelle d'un classeur du magasin n'a été réalisé avec cette version.

## Diffusion Windows

Compilé sous Windows avec Inno Setup depuis `NethorSync2.iss` puis publié à l'adresse stable : https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync2-Setup.exe. Les commits modifiant `tools/nethor-sync` reconstruisent le fichier.

L'application est **non signée** (avertissement SmartScreen possible), et reste visible dans les applications installées, le Planificateur de tâches et les processus Windows. L'agent n'est pas un programme furtif : seules ses exécutions régulières n'affichent pas de console.
