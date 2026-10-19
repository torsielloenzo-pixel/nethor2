#requires -Version 5.1
<#
NethorSync 2 - configuration Windows et reprise d'installation.
Le dossier des classeurs Excel n'est jamais modifié.
Les diagnostics restent locaux et ne contiennent ni mot de passe ni jeton.
#>
[CmdletBinding()]
param([string]$PlanningFolder = '')
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:LOCALAPPDATA 'NethorSync2'
$target = Join-Path $state 'app'
$resultPath = Join-Path $state 'install-result.txt'
$tracePath = Join-Path $state 'install-log.txt'
$stage = 'Preparation'
if (-not (Test-Path -LiteralPath $state)) { New-Item -ItemType Directory -Path $state -Force | Out-Null }
# Le fichier resultat du precedent essai ne doit pas etre affiche de nouveau.
'Configuration en cours.' | Set-Content -LiteralPath $resultPath -Encoding UTF8

function Safe-Message([string]$Value) {
  $s = [string]$Value
  $s = [regex]::Replace($s,'(?i)Bearer\s+[a-z0-9._~+/-]+=*','Bearer [masque]')
  $s = [regex]::Replace($s,'(?i)sb_(secret|publishable)_[a-z0-9_-]+','cle [masquee]')
  $s = [regex]::Replace($s,'(?i)(refresh_token|access_token|password)\s*["=:]+\s*[^,\s}]+','$1=[masque]')
  return (($s -replace '[\r\n]+',' ') -replace '\s{2,}',' ').Trim()
}
function Trace-Stage([string]$Name) {
  $script:stage = $Name
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Add-Content -LiteralPath $tracePath -Value ('[' + $stamp + '] ' + $Name) -Encoding UTF8
  Write-Host ('NethorSync - ' + $Name)
}
function Finish-Failure([string]$Reason) {
  $safe = Safe-Message $Reason
  if (-not $safe) { $safe = 'Erreur non detaillee.' }
  $description = 'Etape : ' + $stage + [Environment]::NewLine +
    'Cause : ' + $safe + [Environment]::NewLine +
    'Journal : ' + $tracePath
  $description | Set-Content -LiteralPath $resultPath -Encoding UTF8
  Add-Content -LiteralPath $tracePath -Value ('ECHEC ' + $stage + ' : ' + $safe) -Encoding UTF8
  [Console]::Error.WriteLine($description)
}
try {
  Trace-Stage 'Verification du dossier de plannings'
  if (-not $PlanningFolder) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Selectionnez le dossier contenant les plannings Excel.'
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) {
      throw "Installation annulee : dossier non selectionne."
    }
    $PlanningFolder = $dialog.SelectedPath
  }
  $root = [IO.Path]::GetFullPath($PlanningFolder)
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    throw ('Dossier de plannings introuvable : ' + $root)
  }
  Trace-Stage 'Verification des fichiers du programme'
  if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
  foreach ($name in @('NethorSync.ps1','Connect-NethorSync.ps1','Verify-NethorSyncBinding.ps1',
                      'Register-NethorSyncTasks.ps1','NethorSyncRunner.vbs','config.example.json')) {
    $src = Join-Path $PSScriptRoot $name
    $dst = Join-Path $target $name
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
      throw ('Composant manquant : ' + $name + '. Relancer le nouvel installateur EXE.')
    }
    if ([IO.Path]::GetFullPath($src) -ne [IO.Path]::GetFullPath($dst)) {
      Copy-Item -LiteralPath $src -Destination $dst -Force
    }
  }
  Trace-Stage 'Enregistrement du dossier'
  $configPath = Join-Path $target 'config.json'
  $sourceConfig = if (Test-Path -LiteralPath $configPath) { $configPath } else { Join-Path $target 'config.example.json' }
  $config = Get-Content -LiteralPath $sourceConfig -Raw -Encoding UTF8 | ConvertFrom-Json
  $config.rootPath = $root
  $config.statePath = $state
  # Aucune transmission avant la fin de la configuration.
  $config.uploadEnabled = $false
  $config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8

  $authPath = Join-Path $state 'auth.dat'
  $devicePath = Join-Path $state 'device-binding.json'
  $secretPath = Join-Path $state 'device-secret.dat'
  $verified = $false
  if ((Test-Path -LiteralPath $authPath) -and
      (Test-Path -LiteralPath $devicePath) -and
      (Test-Path -LiteralPath $secretPath)) {
    Trace-Stage 'Reprise de la liaison deja presente sur ce PC'
    try {
      & (Join-Path $target 'Verify-NethorSyncBinding.ps1') -ConfigPath $configPath
      if (-not $?) { throw 'Verification de liaison non confirmee.' }
      $verified = $true
    } catch {
      Add-Content -LiteralPath $tracePath -Value (
        'La reprise automatique a echoue : ' + (Safe-Message $_.Exception.Message) +
        '. Une nouvelle connexion sera proposee.') -Encoding UTF8
    }
  }
  if (-not $verified) {
    Trace-Stage 'Connexion au compte Nethor et association du poste'
    & (Join-Path $target 'Connect-NethorSync.ps1') -ConfigPath $configPath
    if (-not $?) { throw 'La connexion au compte Nethor n a pas pu etre confirmee.' }
  }
  Trace-Stage 'Activation des horaires Windows'
  & (Join-Path $target 'Register-NethorSyncTasks.ps1') -AppPath $target
  if (-not $?) { throw 'Le Planificateur Windows a refuse les taches.' }

  Trace-Stage 'Activation du transfert vers Nethor'
  $config.uploadEnabled = $true
  $config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
  'Installation terminee. Poste lie, horaires actifs.' | Set-Content -LiteralPath $resultPath -Encoding UTF8
  Trace-Stage 'Termine'
  Write-Host ('NethorSync installe sur ' + [Environment]::MachineName)
  Write-Host ('Dossier des plannings : ' + $root)
  exit 0
} catch {
  # L'upload reste desactive lorsque la configuration est inachevee.
  try {
    if (Test-Path -LiteralPath $configPath) {
      $broken = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $broken.uploadEnabled = $false
      $broken | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
    }
  } catch { }
  Finish-Failure $_.Exception.Message
  exit 1
}
