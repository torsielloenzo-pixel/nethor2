#requires -Version 5.1
<#
Nethor Sync 2: scan Windows Excel workbooks and optionally stage originals.
No planning is published by this script. Publication stays in Nethor2.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = "",
  [switch]$DryRun,
  [switch]$PollOnly,
  [switch]$Scheduled
)
$ErrorActionPreference = "Stop"
# PSScriptRoot n est pas toujours initialise lors de l evaluation des valeurs
# par defaut des parametres PowerShell. Resoudre le chemin dans le corps du script.
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath "config.json"
}

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
    # PowerShell 5.1 peut envoyer les chaines JSON avec le jeu Latin-1 implicite.
    # Toujours encoder explicitement les octets UTF-8 sans BOM.
    $bytes = [System.Text.UTF8Encoding]::new($false, $true).GetBytes($body)
    $auth = Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/auth/v1/token?grant_type=refresh_token") -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bytes
    if (-not $auth.access_token -or -not $auth.refresh_token) { throw "Jetons Supabase incomplets." }
    $secured = ConvertTo-SecureString -String $auth.refresh_token -AsPlainText -Force
    try { $secured | ConvertFrom-SecureString | Set-Content -LiteralPath $SecretPath -Encoding UTF8 }
    finally { $secured.Dispose() }
    $headers.Authorization = "Bearer " + $auth.access_token
    $permission = Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/nethor2_my_planning_permission") -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes("{}"))
    if ([string]$permission -ne "manage") { throw "Ce compte ne possede pas le droit de gestion du planning." }
    return $auth.access_token
  } finally { $refresh = $null }
}

function ConvertTo-SyncUtf8JsonBytes($Value) {
  # Une conversion profonde conserve les noms Excel et chemins Windows accents.
  # ConvertTo-Json emet un texte Unicode valide, sans transcodage implicite HTTP.
  $json = ConvertTo-Json -InputObject $Value -Depth 12 -Compress
  if ([string]::IsNullOrWhiteSpace($json)) { throw "NETHOR_SYNC_EMPTY_JSON" }
  $null = ConvertFrom-Json -InputObject $json -ErrorAction Stop
  return ,([System.Text.UTF8Encoding]::new($false,$true).GetBytes($json))
}
function Get-SyncClientVersion {
  $versionPath=Join-Path $PSScriptRoot 'NethorSync-Version.txt'
  if (Test-Path -LiteralPath $versionPath -PathType Leaf) {
    $version=(Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8).Trim()
    if ($version -match '^2[.]1[.][0-9]{1,2}
# Telemetrie privee, sans chemin de fichier ni message d'exception brut.
# Les erreurs detaillees restent exclusivement dans sync-report.json local.
$script:diagnosticGroups = @{}
$script:syncStage = 'startup'
function Get-SafeSyncError($Failure,[string]$Stage) {
  $status = $null
  try {
    if ($Failure.Exception.Response) {
      $rawStatus = [int]$Failure.Exception.Response.StatusCode
      if ($rawStatus -ge 100 -and $rawStatus -le 599) { $status=$rawStatus }
    }
  } catch {}
  $code = 'unexpected'
  if ($null -ne $status) {
    if ($status -eq 401 -or $status -eq 403) { $code='authorization' }
    elseif ($status -eq 400 -or $status -eq 409 -or $status -eq 422) { $code='request_rejected' }
    else { $code='http_error' }
  } elseif ($Failure.Exception -is [System.TimeoutException]) {
    $code='timeout'
  } elseif ($Failure.Exception -is [System.Net.WebException]) {
    if ($Failure.Exception.Status -eq [System.Net.WebExceptionStatus]::Timeout) { $code='timeout' }
    else { $code='network' }
  } elseif ($Stage -eq 'file_scan') {
    $code='file_access'
  }
  return @{ stage=$Stage; code=$code; httpStatus=$status }
}
function Add-SafeSyncError($Failure,[string]$Stage) {
  $info=Get-SafeSyncError $Failure $Stage
  $groupKey=$info.stage+'|'+$info.code+'|'+$info.httpStatus
  if (-not $script:diagnosticGroups.ContainsKey($groupKey)) {
    $script:diagnosticGroups[$groupKey]=@{
      stage=$info.stage; code=$info.code; count=0
    }
    if ($null -ne $info.httpStatus) {
      $script:diagnosticGroups[$groupKey].httpStatus=$info.httpStatus
    }
  }
  $script:diagnosticGroups[$groupKey].count++
}
function Send-SafeSyncDiagnostic($Settings,[string]$Token,$Device,[int]$Scanned,[int]$Failed,[int]$Transferred) {
  if (-not $Token -or -not $Device -or $Failed -lt 1 -or
      $script:diagnosticGroups.Count -lt 1) { return }
  try {
    $groups=@($script:diagnosticGroups.Values | Sort-Object { -[int]$_.count } |
      Select-Object -First 12)
    $primary=$groups[0]
    $majorStage=[string]$primary.stage
    $majorCode=if ($script:diagnosticGroups.Count -gt 1) { 'mixed' } else { [string]$primary.code }
    $topStatus=$null
    if ($null -ne $primary.httpStatus) { $topStatus=[int]$primary.httpStatus }
    $null=Invoke-SyncRpc $Settings $Token 'nethor_sync_submit_diagnostic' @{
      p_device_id=$Device.id; p_secret=$Device.secret
      p_generation=$Device.generation
      p_stage=$majorStage; p_error_code=$majorCode; p_http_status=$topStatus
      p_scanned=[Math]::Min(100000,[Math]::Max(0,$Scanned))
      p_failed=[Math]::Min(100000,[Math]::Max(1,$Failed))
      p_transferred=[Math]::Min(100000,[Math]::Max(0,$Transferred))
      p_client_version=(Get-SyncClientVersion); p_breakdown=$groups
    }
    Write-Host 'Rapport de diagnostic sécurisé transmis à Nethor2.'
  } catch {
    # Un échec de telemetrie n'interrompt jamais le transfert.
    Write-Warning 'Rapport distant indisponible ; diagnostic local conserve.'
  }
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
function Upload-Candidate($Settings, [string]$Token, $File, [string]$Hash, $Device) {
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
  # Vérifier l'existence exacte du fichier avant tout nouvel envoi. Supabase
  # peut retourner HTTP 400 "Duplicate" au lieu de HTTP 409.
  $existsParams = @{
    p_device_id=$Device.id; p_secret=$Device.secret
    p_generation=$Device.generation; p_storage_key=$key
  }
  $exists = Invoke-SyncRpc $Settings $Token 'nethor_sync_staged_exists' $existsParams
  if ($exists -eq $true) {
    return @{ status = "already_staged"; key = $key }
  }
  try {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType $mime -InFile $File.FullName | Out-Null
    return @{ status = "staged"; key = $key }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 400 -or $code -eq 409) {
      # Ne jamais interpréter n'importe quel HTTP 400 comme un doublon.
      # Reprendre uniquement si Supabase confirme que cette empreinte existe.
      $confirmed = Invoke-SyncRpc $Settings $Token 'nethor_sync_staged_exists' $existsParams
      if ($confirmed -eq $true) {
        return @{ status = "already_staged"; key = $key }
      }
    }
    throw
  }
}

# En cas de rejet d'un lot d'historique, isoler les entrees en echec plutot
# que perdre l'historique de toutes les autres versions. La RPC reste atomique
# par lot et sa contrainte unique permet de reprendre sans doublons.
$script:historyRetryBudget = 64
function Mark-FileHistoryFailure([object[]]$Batch,[string]$Reason) {
  foreach ($item in $Batch) {
    $script:errors += [pscustomobject]@{
      file=[string]$item.relativePath
      reason=('Historique non confirme : ' + $Reason)
    }
    foreach ($row in @($script:entries)) {
      if ($row.path -eq $item.relativePath -and $row.sha256 -eq $item.sha256) {
        $row.upload = 'history_error'
        break
      }
    }
  }
}
function Submit-FileHistoryBatch($Settings,[string]$Token,$Device,[object[]]$Batch) {
  if (-not $Batch -or $Batch.Count -eq 0) { return }
  if ($script:historyRetryBudget -le 0) {
    Mark-FileHistoryFailure $Batch 'Limite des reprises du lot atteinte.'
    return
  }
  $script:historyRetryBudget--
  try {
    $reply = Invoke-SyncRpc $Settings $Token 'nethor_sync_record_file_changes' @{
      p_device_id=$Device.id; p_secret=$Device.secret
      p_generation=$Device.generation; p_changes=$Batch
    }
    if ($null -eq $reply -or $reply.accepted -ne $true) {
      throw 'Historique non confirme par Supabase.'
    }
  } catch {
    Add-SafeSyncError $_ 'file_history'
    if ($Batch.Count -eq 1) {
      # Seul ce fichier reste non confirme ; il sera retente au prochain scan.
      Mark-FileHistoryFailure $Batch $_.Exception.Message
      return
    }
    $middle=[int][math]::Floor($Batch.Count / 2)
    $left=@()
    $right=@()
    for ($i=0; $i -lt $Batch.Count; $i++) {
      if ($i -lt $middle) { $left += $Batch[$i] }
      else { $right += $Batch[$i] }
    }
    Submit-FileHistoryBatch $Settings $Token $Device $left
    Submit-FileHistoryBatch $Settings $Token $Device $right
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
$entries = @()
$errors = @()
$script:syncStage = 'startup'

$token = $null
$device = $null
$manualVersion = [long]0
$networkEnabled = ($config.uploadEnabled -eq $true) -and (-not $DryRun)
if ($networkEnabled) {
  $script:syncStage='startup'
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
$files = @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction Stop |
  Where-Object { $_.Extension.ToLowerInvariant() -in @(".xls", ".xlsx", ".xlsm") -and -not $_.Name.StartsWith("~$") -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
  Sort-Object FullName)
foreach ($file in $files) {
  $script:syncStage='file_scan'
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
    if ($null -ne $old -and $old.sha256 -eq $hash -and $old.upload -in @("error","history_error")) {
      # Une erreur précédente ne confirme PAS que le fichier a été transféré.
      # Reprendre l'historisation, même si le contenu local n'a pas changé.
      $entry.status = "new"
    }
    elseif ($null -ne $old -and $old.sha256 -eq $hash) { $entry.status = "unchanged" }
    elseif ($null -ne $old) { $entry.status = "modified" }
    elseif ($oldHashes.ContainsKey($hash)) { $entry.status = "moved_or_copied" }
    else { $entry.status = "new" }
    if ($networkEnabled -and
        ($entry.status -ne "unchanged" -or -not $uploaded.ContainsKey($hash))) {
      # Contrôle obligatoire pour une nouvelle version ou un ancien upload non
      # confirmé : la présence d'un hash local ne suffit pas après un changement
      # de poste ou une erreur de réseau.
      $null = Check-ActiveDevice $config $token $device
      $script:syncStage='storage_upload'
      $result = Upload-Candidate $config $token $file $hash $device
      $script:syncStage='file_scan'
      $entry.upload = $result.status
      $entry.storageKey = $result.key
      $uploaded[$hash] = $true
    } elseif ($uploaded.ContainsKey($hash)) {
      $entry.upload = "already_sent"
    } else { $entry.upload = "pending" }
  } catch {
    $entry.upload = "error"
    Add-SafeSyncError $_ $script:syncStage
    $errors += [pscustomobject]@{ file = $relative; reason = $_.Exception.Message }
    $script:syncStage='file_scan'
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
  # Enregistrer les versions réelles du fichier AVANT l'accusé de réception
  # du contrôle. Le stockage précédent conserve l'ancienne date LastWriteTimeUtc ;
  # la date d'envoi ne sert jamais de date de version.
  # Les fichiers correctement transmis doivent etre historises meme si un autre
  # fichier du dossier a echoue : sinon le prochain scan les verrait inchanges.
  $changes = @()
    foreach ($entry in @($entries)) {
      if ($entry.status -notin @('new', 'modified', 'moved_or_copied')) { continue }
      if ($entry.upload -notin @('staged', 'already_staged')) { continue }
      if (-not $entry.storageKey -or -not $entry.sha256) { continue }
      $previousEntry = $previousByPath[[string]$entry.path]
      $previousName = $null
      $previousModified = $null
      $previousHash = $null
      if ($entry.status -eq 'modified' -and $null -ne $previousEntry) {
        $previousName = [IO.Path]::GetFileName([string]$previousEntry.path)
        $previousModified = if ($previousEntry.modifiedUtc) { [string]$previousEntry.modifiedUtc } else { $null }
        $previousHash = if ($previousEntry.sha256) { [string]$previousEntry.sha256 } else { $null }
      }
      $kind = if ($entry.status -eq 'modified') { 'replaced' }
        elseif ($entry.status -eq 'moved_or_copied') { 'moved' } else { 'added' }
      $changes += @{
        relativePath = [string]$entry.path
        fileName = [IO.Path]::GetFileName([string]$entry.path)
        previousFileName = $previousName
        kind = $kind
        previousModifiedUtc = $previousModified
        modifiedUtc = [string]$entry.modifiedUtc
        previousSha256 = $previousHash
        sha256 = [string]$entry.sha256
        storageKey = [string]$entry.storageKey
      }
    }
    # Reprise idempotente : un transfert effectué mais non confirmé est repris
    # sans dupliquer les versions grâce à l'index unique côté Supabase.
    $script:syncStage='file_history'
    for ($offset = 0; $offset -lt $changes.Count; $offset += 100) {
      $batch = @($changes | Select-Object -Skip $offset -First 100)
      Submit-FileHistoryBatch $config $token $device $batch
    }
  # Les erreurs du scan sont agrégées (sans nom de fichiers).
  # Le rapport est transmis même lorsque l'accusé de réception reste en attente.
  if ($errors.Count -gt 0) {
    $transferredCount=@($entries | Where-Object { $_.upload -eq 'staged' }).Count
    Send-SafeSyncDiagnostic $config $token $device $files.Count $errors.Count $transferredCount
  }
  $script:syncStage='sync_report'
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
} catch {
  # Conserver un rapport meme si la session, l'historisation ou l'accuse final
  # echoue avant le chemin normal de sauvegarde.
  try {
    if ($reportPath) {
      $failureMessage=$_.Exception.Message
      $failedReport=[ordered]@{
        generatedUtc=(Get-Date).ToUniversalTime().ToString('o')
        root=$root; simulated=(-not $networkEnabled)
        scanned=@($entries).Count; entries=@($entries)
        errors=@(@($errors) + @([pscustomobject]@{
          file=$null; reason=('Erreur globale ('+$script:syncStage+') : '+$failureMessage)
        }))
      }
      Save-JsonAtomic $reportPath $failedReport
    }
  } catch { }
  # Un échec global (historique RPC, accusé de réception, etc.) est aussi
  # traçable, mais les détails et secrets ne quittent jamais le PC.
  if ($networkEnabled -and $token -and $device) {
    Add-SafeSyncError $_ $script:syncStage
    $scannedCount=@($entries).Count
    $failedCount=[Math]::Max(1,@($errors).Count)
    $transferredCount=@($entries | Where-Object { $_.upload -eq 'staged' }).Count
    Send-SafeSyncDiagnostic $config $token $device $scannedCount $failedCount $transferredCount
  }
  throw
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}

) {return $version}
  }
  return '2.1.6'
}
function Invoke-SyncRpc($Settings, [string]$Token, [string]$Method, $Params) {
  $headers = @{ apikey=[string]$Settings.publishableKey; Authorization="Bearer " + $Token }
  $bytes=ConvertTo-SyncUtf8JsonBytes $Params
  return Invoke-RestMethod -Method Post -Uri ($Settings.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/" + $Method) -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bytes
}
# Telemetrie privee, sans chemin de fichier ni message d'exception brut.
# Les erreurs detaillees restent exclusivement dans sync-report.json local.
$script:diagnosticGroups = @{}
$script:syncStage = 'startup'
function Get-SafeSyncError($Failure,[string]$Stage) {
  $status = $null
  try {
    if ($Failure.Exception.Response) {
      $rawStatus = [int]$Failure.Exception.Response.StatusCode
      if ($rawStatus -ge 100 -and $rawStatus -le 599) { $status=$rawStatus }
    }
  } catch {}
  $code = 'unexpected'
  if ($null -ne $status) {
    if ($status -eq 401 -or $status -eq 403) { $code='authorization' }
    elseif ($status -eq 400 -or $status -eq 409 -or $status -eq 422) { $code='request_rejected' }
    else { $code='http_error' }
  } elseif ($Failure.Exception -is [System.TimeoutException]) {
    $code='timeout'
  } elseif ($Failure.Exception -is [System.Net.WebException]) {
    if ($Failure.Exception.Status -eq [System.Net.WebExceptionStatus]::Timeout) { $code='timeout' }
    else { $code='network' }
  } elseif ($Stage -eq 'file_scan') {
    $code='file_access'
  }
  return @{ stage=$Stage; code=$code; httpStatus=$status }
}
function Add-SafeSyncError($Failure,[string]$Stage) {
  $info=Get-SafeSyncError $Failure $Stage
  $groupKey=$info.stage+'|'+$info.code+'|'+$info.httpStatus
  if (-not $script:diagnosticGroups.ContainsKey($groupKey)) {
    $script:diagnosticGroups[$groupKey]=@{
      stage=$info.stage; code=$info.code; count=0
    }
    if ($null -ne $info.httpStatus) {
      $script:diagnosticGroups[$groupKey].httpStatus=$info.httpStatus
    }
  }
  $script:diagnosticGroups[$groupKey].count++
}
function Send-SafeSyncDiagnostic($Settings,[string]$Token,$Device,[int]$Scanned,[int]$Failed,[int]$Transferred) {
  if (-not $Token -or -not $Device -or $Failed -lt 1 -or
      $script:diagnosticGroups.Count -lt 1) { return }
  try {
    $groups=@($script:diagnosticGroups.Values | Sort-Object { -[int]$_.count } |
      Select-Object -First 12)
    $primary=$groups[0]
    $majorStage=[string]$primary.stage
    $majorCode=if ($script:diagnosticGroups.Count -gt 1) { 'mixed' } else { [string]$primary.code }
    $topStatus=$null
    if ($null -ne $primary.httpStatus) { $topStatus=[int]$primary.httpStatus }
    $null=Invoke-SyncRpc $Settings $Token 'nethor_sync_submit_diagnostic' @{
      p_device_id=$Device.id; p_secret=$Device.secret
      p_generation=$Device.generation
      p_stage=$majorStage; p_error_code=$majorCode; p_http_status=$topStatus
      p_scanned=[Math]::Min(100000,[Math]::Max(0,$Scanned))
      p_failed=[Math]::Min(100000,[Math]::Max(1,$Failed))
      p_transferred=[Math]::Min(100000,[Math]::Max(0,$Transferred))
      p_client_version='2.1.6'; p_breakdown=$groups
    }
    Write-Host 'Rapport de diagnostic sécurisé transmis à Nethor2.'
  } catch {
    # Un échec de telemetrie n'interrompt jamais le transfert.
    Write-Warning 'Rapport distant indisponible ; diagnostic local conserve.'
  }
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
function Upload-Candidate($Settings, [string]$Token, $File, [string]$Hash, $Device) {
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
  # Vérifier l'existence exacte du fichier avant tout nouvel envoi. Supabase
  # peut retourner HTTP 400 "Duplicate" au lieu de HTTP 409.
  $existsParams = @{
    p_device_id=$Device.id; p_secret=$Device.secret
    p_generation=$Device.generation; p_storage_key=$key
  }
  $exists = Invoke-SyncRpc $Settings $Token 'nethor_sync_staged_exists' $existsParams
  if ($exists -eq $true) {
    return @{ status = "already_staged"; key = $key }
  }
  try {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType $mime -InFile $File.FullName | Out-Null
    return @{ status = "staged"; key = $key }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 400 -or $code -eq 409) {
      # Ne jamais interpréter n'importe quel HTTP 400 comme un doublon.
      # Reprendre uniquement si Supabase confirme que cette empreinte existe.
      $confirmed = Invoke-SyncRpc $Settings $Token 'nethor_sync_staged_exists' $existsParams
      if ($confirmed -eq $true) {
        return @{ status = "already_staged"; key = $key }
      }
    }
    throw
  }
}

# En cas de rejet d'un lot d'historique, isoler les entrees en echec plutot
# que perdre l'historique de toutes les autres versions. La RPC reste atomique
# par lot et sa contrainte unique permet de reprendre sans doublons.
$script:historyRetryBudget = 64
function Mark-FileHistoryFailure([object[]]$Batch,[string]$Reason) {
  foreach ($item in $Batch) {
    $script:errors += [pscustomobject]@{
      file=[string]$item.relativePath
      reason=('Historique non confirme : ' + $Reason)
    }
    foreach ($row in @($script:entries)) {
      if ($row.path -eq $item.relativePath -and $row.sha256 -eq $item.sha256) {
        $row.upload = 'history_error'
        break
      }
    }
  }
}
function Submit-FileHistoryBatch($Settings,[string]$Token,$Device,[object[]]$Batch) {
  if (-not $Batch -or $Batch.Count -eq 0) { return }
  if ($script:historyRetryBudget -le 0) {
    Mark-FileHistoryFailure $Batch 'Limite des reprises du lot atteinte.'
    return
  }
  $script:historyRetryBudget--
  try {
    $reply = Invoke-SyncRpc $Settings $Token 'nethor_sync_record_file_changes' @{
      p_device_id=$Device.id; p_secret=$Device.secret
      p_generation=$Device.generation; p_changes=$Batch
    }
    if ($null -eq $reply -or $reply.accepted -ne $true) {
      throw 'Historique non confirme par Supabase.'
    }
  } catch {
    Add-SafeSyncError $_ 'file_history'
    if ($Batch.Count -eq 1) {
      # Seul ce fichier reste non confirme ; il sera retente au prochain scan.
      Mark-FileHistoryFailure $Batch $_.Exception.Message
      return
    }
    $middle=[int][math]::Floor($Batch.Count / 2)
    $left=@()
    $right=@()
    for ($i=0; $i -lt $Batch.Count; $i++) {
      if ($i -lt $middle) { $left += $Batch[$i] }
      else { $right += $Batch[$i] }
    }
    Submit-FileHistoryBatch $Settings $Token $Device $left
    Submit-FileHistoryBatch $Settings $Token $Device $right
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
$entries = @()
$errors = @()
$script:syncStage = 'startup'

$token = $null
$device = $null
$manualVersion = [long]0
$networkEnabled = ($config.uploadEnabled -eq $true) -and (-not $DryRun)
if ($networkEnabled) {
  $script:syncStage='startup'
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
$files = @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction Stop |
  Where-Object { $_.Extension.ToLowerInvariant() -in @(".xls", ".xlsx", ".xlsm") -and -not $_.Name.StartsWith("~$") -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
  Sort-Object FullName)
foreach ($file in $files) {
  $script:syncStage='file_scan'
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
    if ($null -ne $old -and $old.sha256 -eq $hash -and $old.upload -in @("error","history_error")) {
      # Une erreur précédente ne confirme PAS que le fichier a été transféré.
      # Reprendre l'historisation, même si le contenu local n'a pas changé.
      $entry.status = "new"
    }
    elseif ($null -ne $old -and $old.sha256 -eq $hash) { $entry.status = "unchanged" }
    elseif ($null -ne $old) { $entry.status = "modified" }
    elseif ($oldHashes.ContainsKey($hash)) { $entry.status = "moved_or_copied" }
    else { $entry.status = "new" }
    if ($networkEnabled -and
        ($entry.status -ne "unchanged" -or -not $uploaded.ContainsKey($hash))) {
      # Contrôle obligatoire pour une nouvelle version ou un ancien upload non
      # confirmé : la présence d'un hash local ne suffit pas après un changement
      # de poste ou une erreur de réseau.
      $null = Check-ActiveDevice $config $token $device
      $script:syncStage='storage_upload'
      $result = Upload-Candidate $config $token $file $hash $device
      $script:syncStage='file_scan'
      $entry.upload = $result.status
      $entry.storageKey = $result.key
      $uploaded[$hash] = $true
    } elseif ($uploaded.ContainsKey($hash)) {
      $entry.upload = "already_sent"
    } else { $entry.upload = "pending" }
  } catch {
    $entry.upload = "error"
    Add-SafeSyncError $_ $script:syncStage
    $errors += [pscustomobject]@{ file = $relative; reason = $_.Exception.Message }
    $script:syncStage='file_scan'
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
  # Enregistrer les versions réelles du fichier AVANT l'accusé de réception
  # du contrôle. Le stockage précédent conserve l'ancienne date LastWriteTimeUtc ;
  # la date d'envoi ne sert jamais de date de version.
  # Les fichiers correctement transmis doivent etre historises meme si un autre
  # fichier du dossier a echoue : sinon le prochain scan les verrait inchanges.
  $changes = @()
    foreach ($entry in @($entries)) {
      if ($entry.status -notin @('new', 'modified', 'moved_or_copied')) { continue }
      if ($entry.upload -notin @('staged', 'already_staged')) { continue }
      if (-not $entry.storageKey -or -not $entry.sha256) { continue }
      $previousEntry = $previousByPath[[string]$entry.path]
      $previousName = $null
      $previousModified = $null
      $previousHash = $null
      if ($entry.status -eq 'modified' -and $null -ne $previousEntry) {
        $previousName = [IO.Path]::GetFileName([string]$previousEntry.path)
        $previousModified = if ($previousEntry.modifiedUtc) { [string]$previousEntry.modifiedUtc } else { $null }
        $previousHash = if ($previousEntry.sha256) { [string]$previousEntry.sha256 } else { $null }
      }
      $kind = if ($entry.status -eq 'modified') { 'replaced' }
        elseif ($entry.status -eq 'moved_or_copied') { 'moved' } else { 'added' }
      $changes += @{
        relativePath = [string]$entry.path
        fileName = [IO.Path]::GetFileName([string]$entry.path)
        previousFileName = $previousName
        kind = $kind
        previousModifiedUtc = $previousModified
        modifiedUtc = [string]$entry.modifiedUtc
        previousSha256 = $previousHash
        sha256 = [string]$entry.sha256
        storageKey = [string]$entry.storageKey
      }
    }
    # Reprise idempotente : un transfert effectué mais non confirmé est repris
    # sans dupliquer les versions grâce à l'index unique côté Supabase.
    $script:syncStage='file_history'
    for ($offset = 0; $offset -lt $changes.Count; $offset += 100) {
      $batch = @($changes | Select-Object -Skip $offset -First 100)
      Submit-FileHistoryBatch $config $token $device $batch
    }
  # Les erreurs du scan sont agrégées (sans nom de fichiers).
  # Le rapport est transmis même lorsque l'accusé de réception reste en attente.
  if ($errors.Count -gt 0) {
    $transferredCount=@($entries | Where-Object { $_.upload -eq 'staged' }).Count
    Send-SafeSyncDiagnostic $config $token $device $files.Count $errors.Count $transferredCount
  }
  $script:syncStage='sync_report'
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
} catch {
  # Conserver un rapport meme si la session, l'historisation ou l'accuse final
  # echoue avant le chemin normal de sauvegarde.
  try {
    if ($reportPath) {
      $failureMessage=$_.Exception.Message
      $failedReport=[ordered]@{
        generatedUtc=(Get-Date).ToUniversalTime().ToString('o')
        root=$root; simulated=(-not $networkEnabled)
        scanned=@($entries).Count; entries=@($entries)
        errors=@(@($errors) + @([pscustomobject]@{
          file=$null; reason=('Erreur globale ('+$script:syncStage+') : '+$failureMessage)
        }))
      }
      Save-JsonAtomic $reportPath $failedReport
    }
  } catch { }
  # Un échec global (historique RPC, accusé de réception, etc.) est aussi
  # traçable, mais les détails et secrets ne quittent jamais le PC.
  if ($networkEnabled -and $token -and $device) {
    Add-SafeSyncError $_ $script:syncStage
    $scannedCount=@($entries).Count
    $failedCount=[Math]::Max(1,@($errors).Count)
    $transferredCount=@($entries | Where-Object { $_.upload -eq 'staged' }).Count
    Send-SafeSyncDiagnostic $config $token $device $scannedCount $failedCount $transferredCount
  }
  throw
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}

