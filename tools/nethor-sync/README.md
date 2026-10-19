# Nethor Sync 2 — Windows

Reprise de Nethor Sync Lite pour le dépôt **Nethor2**, sans dépendance Python.
La synchronisation **ne publie jamais** de planning dans `planning_weeks`.

## Architecture de sécurité

1. Windows scanne le dossier de plannings Excel et les sous-dossiers.
2. Le SHA-256 sert à distinguer fichier nouveau, inchangé, modifié, déplacé ou copié.
3. **Simulation par défaut** : aucun transfert réseau.
4. Après activation explicite, une session Supabase personnelle avec droit serveur `manage` dépose les originaux dans le bucket privé `planning-files`, sous `sync-inbox/<sha256>-<nom>.xls` (idem .xlsx/.xlsm).
5. L'administrateur ouvre **Nethor2 > Importer**, sélectionne un fichier reçu, contrôle l'analyse, coche la confirmation et publie via le RPC de révision existant.
6. La copie validée est archivée dans `nethor2/<semaine>/...`. Le fichier entrant n'est supprimé **qu'après** une publication vérifiée.

**Aucune clé service_role** ni secret permanent dans le dépôt. Le jeton de renouvellement est chiffré avec DPAPI Windows pour le compte connecté et reste dans `%LOCALAPPDATA%\NethorSync2\auth.dat`. Ne pas utiliser un compte partagé. La sécurité de l'accès distant dépend aussi des politiques RLS Supabase en vigueur.

## Mise en place

1. Télécharger le dossier `tools/nethor-sync` du dépôt sur le poste Windows dans un répertoire fixe et personnel ; ne pas placer les fichiers Excel dans GitHub.
2. Copier `config.example.json` en `config.json` et renseigner `rootPath`, par exemple `C:\Users\VOTRE_COMPTE\Desktop\Nethor Sync\Plannings`. Les sous-dossiers année/mois sont pris en compte. Le chemin relatif `Plannings` est aussi accepté.
3. Tester avec PowerShell 5.1 : `powershell.exe -NoProfile -File .\NethorSync.ps1 -DryRun`.
4. Consulter `%LOCALAPPDATA%\NethorSync2\sync-report.json` et vérifier `new`, `unchanged`, `modified`, `moved_or_copied`, `still_writing` ou `invalid_size`.
5. Si les résultats sont corrects, exécuter `Connect-NethorSync.ps1` et entrer le compte Nethor habilité (adresse e-mail ou identifiant), puis définir `uploadEnabled` à `true` dans la configuration.
6. Lancer `NethorSync.ps1` pour envoyer une première fois. Vérifier l'arrivée des fichiers dans Nethor2 avant de planifier.
7. Installer les deux tâches Windows avec `Installer-Sync.ps1` (ouverture de session, toutes les 3 heures). Les tâches sont exécutées avec les droits de l'utilisateur courant, sur le même profil Windows que `Connect-NethorSync.ps1`.

Pour désactiver les envois sans supprimer les tâches : `uploadEnabled=false`.
Pour retirer les tâches : utiliser le Planificateur de tâches Windows, noms `Nethor Sync 2 - ...`.

## Limites délibérées

- La lecture des feuilles et **des couleurs des anciens .xls** est réalisée lors de la prévisualisation Nethor2, pas par PowerShell. Sa compatibilité doit être confirmée sur un fichier réel anonymisé avant toute publication.
- Pas d'authentification machine/service : une session utilisateur active et habilitée est requise, avec renouvellement du jeton à chaque exécution. Si le jeton est révoqué ou expire, relancer `Connect-NethorSync.ps1`.
- L'état et le rapport sont locaux ; ne pas les partager publiquement. Les fichiers Excel originaux restent sur le PC.
- `Get-FileHash` détecte les doublons par contenu, pas seulement par nom. Un fichier en cours d'écriture depuis moins de 30 secondes est différé.
- Nethor2 conserve la confirmation humaine et vérifie les révisions concurrentes. Aucune modification de schéma ni du site de production n'est requise pour cette première intégration.
