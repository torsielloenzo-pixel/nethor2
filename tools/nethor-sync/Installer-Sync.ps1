#requires -Version 5.1
<#
Installateur local interactif : installation discrète dans %LOCALAPPDATA%.
Lancement manuel nécessaire : un site web ne peut pas installer un programme Windows sans consentement.
#>
[CmdletBinding()]
param([string]$PlanningFolder = "")
$ErrorActionPreference = "Stop"
$target = Join-Path $env:LOCALAPPDATA "NethorSync2\app"
$state = Join-Path $env:LOCALAPPDATA "NethorSync2"
if (-not $PlanningFolder) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Selectionnez le dossier racine des plannings Excel (annees et mois inclus)."
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw "Installation annulee : dossier non selectionne." }
  $PlanningFolder = $dialog.SelectedPath
}
$root = [IO.Path]::GetFullPath($PlanningFolder)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Le dossier de plannings n'existe pas." }
if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Force -Path $target | Out-Null }
foreach ($name in @("NethorSync.ps1","Connect-NethorSync.ps1","config.example.json")) {
  $source = Join-Path $PSScriptRoot $name
  $destination = Join-Path $target $name
  if (-not (Test-Path -LiteralPath $source)) { throw "Fichier manquant : $name. Extraire d'abord le dossier ZIP." }
  if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($destination)) {
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}
$configPath = Join-Path $target "config.json"
$config = if (Test-Path -LiteralPath $configPath) {
  Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  Get-Content -LiteralPath (Join-Path $target "config.example.json") -Raw -Encoding UTF8 | ConvertFrom-Json
}
$config.rootPath = $root
$config.statePath = $state
$config.uploadEnabled = $false
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
# L'authentification prouve que le compte est admin / point-de-vente,
# et le verrou serveur refuse tout second poste jusqu'a reset administrateur.
& (Join-Path $target "Connect-NethorSync.ps1") -ConfigPath $configPath
if (-not $?) { throw "Liaison Supabase echouee. Aucune tache installee." }
$config.uploadEnabled = $true
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
$exe = Join-Path $PSHOME "powershell.exe"
$script = Join-Path $target "NethorSync.ps1"
function Add-Task([string]$Name,[string]$Args,[string[]]$Schedule) {
  $command = '"' + $exe + '" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '" ' + $Args
  & schtasks.exe /Create /F /TN $Name /TR $command @Schedule
  if ($LASTEXITCODE -ne 0) { throw "Installation de la tache Windows impossible: $Name" }
}
# Supprimer l'ancien passage toutes les 3 heures (conservé par Nethor Sync Lite).
& schtasks.exe /Delete /F /TN "Nethor Sync 2 - Toutes les 3h" 2>$null | Out-Null
& schtasks.exe /Delete /F /TN "Nethor Sync 2 - Ouverture de session" 2>$null | Out-Null
Add-Task "Nethor Sync 2 - Lundi-Samedi" "-Scheduled" @("/SC","WEEKLY","/D","MON,TUE,WED,THU,FRI,SAT","/ST","19:00")
Add-Task "Nethor Sync 2 - Dimanche" "-Scheduled" @("/SC","WEEKLY","/D","SUN","/ST","12:00")
Add-Task "Nethor Sync 2 - Controle Manuel" "-PollOnly" @("/SC","MINUTE","/MO","5")
Write-Host "Nethor Sync 2 installe et lie sur $([Environment]::MachineName)."
Write-Host "Dossier controle : $root"
Write-Host "Automatique lundi-samedi 19 h, dimanche 12 h; demande manuelle verifiee toutes les 5 min."
Write-Host "Les fichiers sont transmis pour verification; publication automatique non activee."
