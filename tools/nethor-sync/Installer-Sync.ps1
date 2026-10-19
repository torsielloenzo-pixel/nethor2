#requires -Version 5.1
# Installer apres avoir teste NethorSync.ps1 -DryRun.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path -LiteralPath $configPath)) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "config.example.json") -Destination $configPath
  Write-Host "Configuration creee: $configPath"
  Write-Host "Personnaliser rootPath avant de continuer."
  exit 0
}
$script = Join-Path $PSScriptRoot "NethorSync.ps1"
$exe = Join-Path $PSHOME "powershell.exe"
$command = '"' + $exe + '" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $script + '"'
& schtasks.exe /Create /F /SC HOURLY /MO 3 /TN "Nethor Sync 2 - Toutes les 3h" /TR $command
if ($LASTEXITCODE -ne 0) { throw "Echec creation tache toutes les 3 heures." }
& schtasks.exe /Create /F /SC ONLOGON /TN "Nethor Sync 2 - Ouverture de session" /TR $command
if ($LASTEXITCODE -ne 0) { throw "Echec creation tache ouverture de session." }
Write-Host "Deux taches planifiees pour l'utilisateur courant : ouverture de session et toutes les 3 heures."
Write-Host "Les envois restent desactives tant que config.json contient uploadEnabled=false."
