#requires -Version 5.1
<#
Nethor Sync 2: scan Windows Excel workbooks and optionally stage originals.
No planning is published by this script. Publication stays in Nethor2.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
  [switch]$DryRun,
  [switch]$PollOnly,
  [switch]$Scheduled
)
$ErrorActionPreference = "Stop"

function Read-JsonFile([string]$Path, $Fallback) {
  if (-not (Test-Path -LiteralPath $Path)) { return $Fallback }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function Save-JsonAtomic([string]$Path, $Value) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $temp = Join-Path $dir ([IO.Path]::GetRandomFileName() + ".tmp")
  try {
    $Value | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $Path -Force
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
}
function Get-BasePath([string]$Path) {
  if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
  return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Path))
}
function Get-SecretText([string]$Encrypted) {
  $secure = ConvertTo-SecureString -String $Encrypted
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}
function Get-RemoteSession($Settings, [string]$SecretPath) {
  if (-not (Test-Path -LiteralPath $SecretPath)) {
    throw "Connexion absente. Executer Connect-NethorSync.ps1 avec le compte gestionnaire."
  }
  $secretText = Get-Content -LiteralPath $SecretPath -Raw -Encoding UTF8
  $refresh = Get-SecretText $secretText.Trim()
  try {
    $headers = @{ apikey = [string]$Settings.publishableKey }
    $body = @{ refresh_token = $refresh } | ConvertTo-Json
    $auth = Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/auth/v1/token?grant_type=refresh_token") -Headers $headers -ContentType "application/json" -Body $body
    if (-not $auth.access_token -or -not $auth.refresh_token) { throw "Jetons Supabase incomplets." }
    $secured = ConvertTo-SecureString -String $auth.refresh_token -AsPlainText -Force
    try { $secured | ConvertFrom-SecureString | Set-Content -LiteralPath $SecretPath -Encoding UTF8 }
    finally { $secured.Dispose() }
    $headers.Authorization = "Bearer " + $auth.access_token
    $permission = Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/nethor2_my_planning_permission") -Headers $headers -ContentType "application/json" -Body "{}"
    if ([string]$permission -ne "manage") { throw "Ce compte ne possede pas le droit de gestion du planning." }
    return $auth.access_token
  } finally { $refresh = $null }
}

function Invoke-SyncRpc($Settings, [string]$Token, [string]$Method, $Params) {
  $headers = @{ apikey=[string]$Settings.publishableKey; Authorization="Bearer " + $Token }
  return Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/" + $Method) -Headers $headers -ContentType "application/json" -Body ($Params | ConvertTo-Json -Depth 6)
}
function Get-DeviceIdentity([string]$StateDir) {
  $bindingPath = Join-Path $StateDir "device-binding.json"
  $secretPath = Join-Path $StateDir "device-secret.dat"
  if (-not (Test-Path -LiteralPath $bindingPath) -or -not (Test-Path -LiteralPath $secretPath)) {
    throw "Le poste n'est pas configure. Executer Connect-NethorSync.ps1."
  }
  $device = Get-Content -LiteralPath $bindingPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $secret = Get-SecretText ((Get-Content -LiteralPath $secretPath -Raw -Encoding UTF8).Trim())
  if (-not $device.deviceId -or -not $device.generation -or -not $secret) {
    throw "Identite de poste incomplete."
  }
  return @{ id=[string]$device.deviceId; generation=[long]$device.generation; secret=$secret }
}
function Check-ActiveDevice($Settings,[string]$AccessToken,$Device) {
  return Invoke-SyncRpc $Settings $AccessToken 'nethor_sync_heartbeat' @{
    p_device_id=$Device.id
    p_secret=$Device.secret
    p_generation=$Device.generation
  }
}
function Upload-Candidate($Settings, [string]$Token, $File, [string]$Hash) {
  $name = [IO.Path]::GetFileName($File.Name)
  $safeName = [regex]::Replace($name, "[^a-zA-Z0-9._-]", "_")
  if ($safeName.Length -gt 85) {
    $safeName = $safeName.Substring(0,75) + [IO.Path]::GetExtension($safeName)
  }
  $key = "sync-inbox/" + $Hash.ToLowerInvariant() + "-" + $safeName
  $mime = switch ($File.Extension.ToLowerInvariant()) {
    ".xls"  { "application/vnd.ms-excel" }
    ".xlsm" { "application/vnd.ms-excel.sheet.macroenabled.12" }
    default { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  }
  $base = $Settings.supabaseUrl.TrimEnd("/") + "/storage/v1/object/planning-files/"
  $uri = $base + $key
  $headers = @{
    apikey = [string]$Settings.publishableKey
    Authorization = "Bearer " + $Token
    "x-upsert" = "false"
  }
  try {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType $mime -InFile $File.FullName | Out-Null
    return @{ status = "staged"; key = $key }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 409) { return @{ status = "already_staged"; key = $key } }
    throw
  }
}

# Une seule instance pour eviter la rotation simultanee du jeton Supabase.
$mutex = [System.Threading.Mutex]::new($false, "Local\NethorSync2")
if (-not $mutex.WaitOne(0)) {
  Write-Host "Nethor Sync 2 est deja en cours d'execution."
  exit 0
}
try {
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Configuration absente: copier config.example.json vers config.json."
}
$config = Read-JsonFile $ConfigPath $null
if (-not $config -or -not $config.rootPath) { throw "rootPath manquant dans la configuration." }
$root = Get-BasePath ([string]$config.rootPath)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Dossier Plannings introuvable: $root" }
$stateDir = if ($config.statePath) { Get-BasePath ([string]$config.statePath) } else { Join-Path $env:LOCALAPPDATA "NethorSync2" }
if (-not (Test-Path -LiteralPath $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
$manifestPath = Join-Path $stateDir "planning-manifest.json"
$reportPath = Join-Path $stateDir "sync-report.json"
$authPath = Join-Path $stateDir "auth.dat"
$previous = Read-JsonFile $manifestPath ([pscustomobject]@{ version = 1; files = @(); uploadedHashes = @() })
$previousByPath = @{}
$oldHashes = @{}
$uploaded = @{}
foreach ($entry in @($previous.files)) {
  if ($null -eq $entry -or -not $entry.path) { continue }
  $previousByPath[[string]$entry.path] = $entry
  if ($entry.sha256) { $oldHashes[[string]$entry.sha256] = $true }
}
foreach ($hash in @($previous.uploadedHashes)) {
  if ($hash) { $uploaded[[string]$hash] = $true }
}
$maxBytes = if ($config.maxFileMB) { [long]$config.maxFileMB * 1MB } else { 10MB }
$files = @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction Stop |
  Where-Object { $_.Extension.ToLowerInvariant() -in @(".xls", ".xlsx", ".xlsm") -and -not $_.Name.StartsWith("~$") -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
  Sort-Object FullName)
$entries = @()
$errors = @()

$token = $null
$device = $null
$manualVersion = [long]0
$networkEnabled = ($config.uploadEnabled -eq $true) -and (-not $DryRun)
if ($networkEnabled) {
  $token = Get-RemoteSession $config $authPath
  $device = Get-DeviceIdentity $stateDir
  # Le controle du serveur DOIT preceder meme la comparaison locale.
  $remote = Check-ActiveDevice $config $token $device
  $manualVersion = [long]$remote.manualRequestVersion
  if ($Scheduled -and $remote.mode -eq "manual") {
    Write-Host "Mode manuel actif sur Nethor : passage programme ignore."
    exit 0
  }
  if ($PollOnly -and -not $remote.pendingManual) {
    Write-Host "Aucune synchronisation manuelle demandee; dossier non analyse."
    exit 0
  }
}
foreach ($file in $files) {
  $relative = $file.FullName.Substring($root.TrimEnd("\").Length).TrimStart("\")
  $entry = [ordered]@{ path = $relative; size = $file.Length; modifiedUtc = $file.LastWriteTimeUtc.ToString("o"); sha256 = $null; status = "unread"; upload = "not_sent"; storageKey = $null }
  try {
    if ($file.Length -le 0 -or $file.Length -gt $maxBytes) {
      $entry.status = "invalid_size"
      $entries += [pscustomobject]$entry
      continue
    }
    if (((Get-Date).ToUniversalTime() - $file.LastWriteTimeUtc).TotalSeconds -lt 30) {
      $entry.status = "still_writing"
      $entries += [pscustomobject]$entry
      continue
    }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $entry.sha256 = $hash
    $old = $previousByPath[$relative]
    if ($null -ne $old -and $old.sha256 -eq $hash) { $entry.status = "unchanged" }
    elseif ($null -ne $old) { $entry.status = "modified" }
    elseif ($oldHashes.ContainsKey($hash)) { $entry.status = "moved_or_copied" }
    else { $entry.status = "new" }
    if ($uploaded.ContainsKey($hash)) {
      $entry.upload = "already_sent"
    } elseif ($networkEnabled) {

      # Le poste revoque ne peut poursuivre les transferts avec notre agent.
      $null = Check-ActiveDevice $config $token $device
      $result = Upload-Candidate $config $token $file $hash
      $entry.upload = $result.status
      $entry.storageKey = $result.key
      $uploaded[$hash] = $true
    } else { $entry.upload = "pending" }
  } catch {
    $entry.upload = "error"
    $errors += [pscustomobject]@{ file = $relative; reason = $_.Exception.Message }
  }
  $entries += [pscustomobject]$entry
}
$report = [ordered]@{
  generatedUtc = (Get-Date).ToUniversalTime().ToString("o")
  root = $root
  simulated = (-not $networkEnabled)
  scanned = $files.Count
  entries = $entries
  errors = $errors
}

if ($networkEnabled) {
  # Ne pas accuser reception d'une demande manuelle si l'operation a echoue.
  if ($errors.Count -eq 0) {
    $outcome = if (@($entries | Where-Object { $_.upload -eq "staged" }).Count -gt 0) { "transferred" }
               elseif ($files.Count -eq 0) { "no_files" } else { "unchanged" }
    $null = Invoke-SyncRpc $config $token 'nethor_sync_report' @{
      p_device_id=$device.id; p_secret=$device.secret
      p_generation=$device.generation; p_manual_version=$manualVersion
      p_result=$outcome; p_transferred=($outcome -eq "transferred")
    }
  } else {
    # Une erreur laisse la demande manuelle dans la file, sans fausse synchronisation reussie.
    try {
      $null = Invoke-SyncRpc $config $token 'nethor_sync_report' @{
        p_device_id=$device.id; p_secret=$device.secret
        p_generation=$device.generation; p_manual_version=0
        p_result="error"; p_transferred=$false
      }
    } catch { Write-Warning "Etat serveur non mis a jour: $($_.Exception.Message)" }
  }
}
Save-JsonAtomic $reportPath $report
if (-not $DryRun) {
  Save-JsonAtomic $manifestPath ([ordered]@{ version = 1; files = $entries; uploadedHashes = @($uploaded.Keys | Sort-Object) })
}
Write-Host ("Nethor Sync 2 - {0} fichier(s), {1} erreur(s), mode {2}" -f $files.Count,$errors.Count, $(if ($networkEnabled) { "envoi" } else { "simulation" }))
Write-Host "Rapport: $reportPath"
if ($errors.Count -gt 0) { exit 1 }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}

