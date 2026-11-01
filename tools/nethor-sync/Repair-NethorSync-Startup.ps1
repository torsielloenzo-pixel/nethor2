#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$app=Join-Path $env:LOCALAPPDATA 'NethorSync2\app'
foreach($name in @('NethorSyncRunner.vbs','Register-NethorSyncTasks.ps1')) {
  if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name) -PathType Leaf)) {throw "Correctif incomplet : $name"}
}
foreach($name in @('NethorSync.ps1','Watch-NethorSync.ps1','config.json')) {
  if(-not (Test-Path -LiteralPath (Join-Path $app $name) -PathType Leaf)) {throw "Installation existante introuvable : $name"}
}
if(-not (Test-Path -LiteralPath (Join-Path (Split-Path $app -Parent) 'device-binding.json'))) {throw 'Liaison du poste absente : correctif interrompu.'}
$backup=Join-Path (Split-Path $app -Parent) ('startup-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($name in @('NethorSyncRunner.vbs','Register-NethorSyncTasks.ps1')) {
  $old=Join-Path $app $name
  if(Test-Path -LiteralPath $old) {Copy-Item -LiteralPath $old -Destination (Join-Path $backup $name) -Force}
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $old -Force
}
& (Join-Path $app 'Register-NethorSyncTasks.ps1') -AppPath $app
if(-not $?) {throw 'Enregistrement des tâches Windows non confirmé.'}
Write-Host 'Correctif applique. Surveillance automatique active pour la session Windows.'
Write-Host "Sauvegarde : $backup"
