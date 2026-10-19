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

## Publication automatique sécurisée

Depuis la version **2.1.3**, NethorSync enregistre le chemin relatif, l'empreinte SHA-256 et les dates de dernière modification Windows de chaque version. Après un transfert et l'enregistrement de ce changement, Supabase crée un travail de publication automatique. Le serveur télécharge l'original, recalcule l'empreinte et utilise le même décodeur de planning Excel (date B2, 7 jours, collaborateurs et couleurs) que l'import manuel.

**La publication ne se fait que si toutes ces conditions sont remplies :**

- L'événement est un vrai remplacement (`replaced`) d'un même fichier déjà observé par NethorSync, et non une première découverte, une copie ou un déplacement.
- La date de modification Windows est strictement plus récente que celle de la version précédente, dans une fenêtre de 14 jours.
- Le classeur d'origine est lisible : 7 journées, au maximum 200 salariés, horaires et couleurs cohérents ; aucun style inconnu ne doit être deviné.
- La semaine existe déjà en base (au moins une version initiale publiée manuellement) ; elle n'a pas été remplacée entre-temps par une version plus récente.
- Le poste et le compte qui lui est lié sont toujours autorisés.

À défaut, le fichier reste archivé mais n'est pas publié. La décision est enregistrée (`published`, `unchanged`, `skipped`, `rejected`) dans l'historique de publication, accessible aux rôles Administrateur et Point de vente. Chaque publication utilise les mêmes tables, révisions, jours lus et historique que le planning manuel.

Les fichiers déjà présents avant l'activation ne sont **pas publiés rétroactivement**. Les semaines nouvelles, jamais publiées auparavant, attendent une première importation manuelle. Les pièces jointes ne sont jamais modifiées ni supprimées par NethorSync.

La mise à jour 2.1.3 garde la connexion Windows/DPAPI et les tâches planifiées de la 2.1.1 compatible, sans installer l'écoute permanente 2.2.0.

## Désinstallation et transfert

Pour arrêter localement, désactiver les tâches « Nethor Sync 2 » dans le Planificateur Windows puis supprimer `%LOCALAPPDATA%\NethorSync2` après sauvegarde des rapports nécessaires. Pour libérer le poste depuis Nethor2, l'administrateur doit **réinitialiser la liaison dans les paramètres**. Cette action ne supprime pas les fichiers Excel d'origine.

## Tests

- `npm run check` : syntaxe JavaScript et tests des RPC frontend.
- `tests/nethor-sync-local.test.ps1` : simulation PowerShell pour les statuts new, unchanged, modified et moved_or_copied.
- Workflows GitHub Actions Windows et Node sur la branche de développement.
- Test réel de lecture sans publication : fichiers du magasin .xls et .xlsx décodés côté serveur ; essai SQL transactionnel annulé après validation, sans modifier la semaine visible.

## Diffusion Windows

L'installateur compatible **2.1.3**, destiné au MSI, est publié sous le nom [NethorSync-Setup.exe](https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync-Setup.exe). Le workflow de compatibilité conserve le socle Inno Setup 2.1.1 et importe les scripts corrigés depuis main, afin de ne pas réintroduire l'écoute permanente 2.2.0.

Le logiciel est non signé : Smart App Control peut bloquer un nouvel exécutable. Ne désactivez pas les protections Windows pour l'installer. Seule l'exécution programmée est discrète : les tâches restent visibles dans le Planificateur Windows.
