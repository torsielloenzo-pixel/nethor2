#requires -Version 5.1
<#
NethorSync 2.1.8 - mise a jour pilotée depuis Supabase.
Le controle distant ne peut modifier les fichiers Excel, le manifeste local,
l'identite du poste, ni les jetons. Binaire epingle par SHA-256.
#>
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$agentDir=$PSScriptRoot
$stateDir=Join-Path $env:LOCALAPPDATA 'NethorSync2'
$updateDir=Join-Path $stateDir 'updates'
$reportFile=Join-Path $stateDir 'update-report.json'
$versionFile=Join-Path $agentDir 'NethorSync-Version.txt'
$configFile=Join-Path $agentDir 'config.json'
$script:stage='startup'
$script:targetVersion=$null
$script:installedVersion='2.1.8'
$script:latestErrorCode=$null
$mutex=$null
$hasLock=$false

function Save-UpdateReport([string]$Status,[string]$Code='') {
  if (-not (Test-Path -LiteralPath $stateDir)) { New-Item -Path $stateDir -ItemType Directory -Force | Out-Null }
  $result=[ordered]@{
    atUtc=(Get-Date).ToUniversalTime().ToString('o')
    installedVersion=$script:installedVersion
    targetVersion=$script:targetVersion
    stage=$script:stage
    status=$Status
    errorCode=$Code
  }
  $tmp=$reportFile+'.tmp'
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $reportFile -Force
}
function Parse-Version([string]$Raw) {
  if ($Raw -notmatch '^2[.]1[.][0-9]{1,2}$') {throw 'bad_version'}
  return [version]$Raw
}
function Validate-UpdateManifest($Manifest,[string]$CurrentVersion) {
  if ($null -eq $Manifest -or $Manifest.enabled -ne $true) { return $null }
  $remote=Parse-Version ([string]$Manifest.version)
  $local=Parse-Version $CurrentVersion
  if ($remote -le $local) { return $null }
  # Un chemin de release VERSIONNE evite les modifications silencieuses du lien "latest".
  $suffix=([string]$Manifest.version).Replace('.','')
  $allowed='https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync2-Setup-Compatibility-'+$suffix+'.exe'
  if ([string]$Manifest.downloadUrl -cne $allowed) { throw 'untrusted_download_url' }
  if ([string]$Manifest.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
      [string]$Manifest.sha256 -eq ('0'*64)) { throw 'bad_release_hash' }
  return $Manifest
}
function Get-UpdateAuthHeaders($Config) {
  $secretFile=Join-Path $stateDir 'auth.dat'
  if (-not (Test-Path -LiteralPath $secretFile)) { return $null }
  $value=(Get-Content -LiteralPath $secretFile -Raw -Encoding UTF8).Trim()
  $secure=ConvertTo-SecureString -String $value
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $refresh=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
  try {
    $headers=@{apikey=[string]$Config.publishableKey}
    $auth=Invoke-RestMethod -Method Post -Uri ($Config.supabaseUrl.TrimEnd('/')+
      '/auth/v1/token?grant_type=refresh_token') -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{refresh_token=$refresh} | ConvertTo-Json)))
    if (-not $auth.access_token -or -not $auth.refresh_token) { return $null }
    $sealed=ConvertTo-SecureString -String $auth.refresh_token -AsPlainText -Force
    try {
      $sealed | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
    } finally { $sealed.Dispose() }
    $headers.Authorization='Bearer '+$auth.access_token
    return $headers
  } finally { $refresh=$null }
}
function Send-UpdateTelemetry($Config,[string]$Status,[string]$ErrorCode='') {
  try {
    $binding=Join-Path $stateDir 'device-binding.json'
    $secret=Join-Path $stateDir 'device-secret.dat'
    if (-not (Test-Path $binding) -or -not (Test-Path $secret)) { return }
    $headers=Get-UpdateAuthHeaders $Config
    if (-not $headers) { return }
    $identity=Get-Content -LiteralPath $binding -Raw -Encoding UTF8 | ConvertFrom-Json
    $s=ConvertTo-SecureString -String (Get-Content -LiteralPath $secret -Raw -Encoding UTF8).Trim()
    $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $secretText=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p); $s.Dispose() }
    $payload=@{
      p_device_id=$identity.deviceId;p_secret=$secretText
      p_generation=[long]$identity.generation
      p_installed_version=$script:installedVersion
      p_target_version=$script:targetVersion
      p_status=$Status
      p_error_code=$(if ($ErrorCode) {$ErrorCode} else {$null})
    }|ConvertTo-Json -Depth 4
    $secretText=$null
    $null=Invoke-RestMethod -Method Post -Uri ($Config.supabaseUrl.TrimEnd('/')+
      '/rest/v1/rpc/nethor_sync_update_report') -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  } catch {
    # Une panne du journal distant ne doit pas interrompre une mise a jour valide.
  }
}
$backupDir=$null
$downloadPath=$null
$config=$null
try {
  if (-not (Test-Path -LiteralPath $versionFile) -or -not (Test-Path -LiteralPath $configFile)) { throw 'missing_local_configuration' }
  $script:installedVersion=(Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8).Trim()
  $null=Parse-Version $script:installedVersion
  $config=Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not ([string]$config.supabaseUrl).StartsWith('https://') -or
      -not $config.publishableKey) { throw 'bad_supabase_configuration' }
  $script:stage='manifest'
  $manifest=Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd('/')+
    '/rest/v1/rpc/nethor_sync_update_manifest') -Headers @{apikey=[string]$config.publishableKey} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes('{}'))
  $release=Validate-UpdateManifest $manifest $script:installedVersion
  if ($null -eq $release) {
    Save-UpdateReport 'up_to_date'
    exit 0
  }
  $script:targetVersion=[string]$release.version
  Save-UpdateReport 'available'
  if ($CheckOnly) { exit 0 }

  # Ne jamais ecraser les scripts tant qu'une synchronisation est active.
  $mutex=New-Object System.Threading.Mutex($false,'Local\NethorSync2')
  try {$hasLock=$mutex.WaitOne(0)} catch [System.Threading.AbandonedMutexException] {$hasLock=$true}
  if (-not $hasLock) {
    $script:stage='busy'
    Save-UpdateReport 'deferred' 'sync_busy'
    exit 0
  }
  if (-not (Test-Path -LiteralPath $updateDir)) { New-Item -Path $updateDir -ItemType Directory -Force | Out-Null }
  $script:stage='download'
  $downloadPath=Join-Path $updateDir ('NethorSync-Setup-'+$script:targetVersion+'.exe')
  Invoke-WebRequest -Uri ([string]$release.downloadUrl) -OutFile $downloadPath -UseBasicParsing -MaximumRedirection 5
  $file=Get-Item -LiteralPath $downloadPath
  if ($file.Length -lt 100000 -or $file.Length -gt 50000000) { throw 'bad_package_size' }
  $script:stage='verification'
  $digest=(Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($digest -cne [string]$release.sha256) { throw 'hash_mismatch' }
  Save-UpdateReport 'verified'
  Send-UpdateTelemetry $config 'verified'

  $backupDir=Join-Path $updateDir ('backup-'+$script:installedVersion)
  if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -Path $backupDir -ItemType Directory -Force | Out-Null }
  $protectedFiles=@('NethorSync.ps1','Connect-NethorSync.ps1','Installer-Sync.ps1',
    'Register-NethorSyncTasks.ps1','Verify-NethorSyncBinding.ps1','NethorSyncRunner.vbs',
    'Update-NethorSync.ps1','NethorSync-Version.txt','README.md')
  foreach ($name in $protectedFiles) {
    $src=Join-Path $agentDir $name
    if (Test-Path -LiteralPath $src -PathType Leaf) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $backupDir $name) -Force
    }
  }

  $script:stage='install'
  $params=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOCANCEL',
    '/AUTOUPDATE=1')
  $proc=Start-Process -FilePath $downloadPath -ArgumentList $params -Wait -PassThru -WindowStyle Hidden
  if ($proc.ExitCode -ne 0) { throw 'installer_failed' }
  $postVersion=(Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8).Trim()
  if ($postVersion -ne $script:targetVersion) { throw 'version_not_applied' }
  $script:installedVersion=$postVersion
  $script:stage='post_install'
  # Les taches sont recreees seulement apres succes, aucune nouvelle connexion demandee.
  & (Join-Path $agentDir 'Register-NethorSyncTasks.ps1') -AppPath $agentDir
  if (-not $?) { throw 'task_registration_failed' }
  $script:stage='complete'
  Save-UpdateReport 'installed'
  Send-UpdateTelemetry $config 'installed'
  exit 0
} catch {
  $message=[string]$_.Exception.Message
  $code=if ($message -match '^[a-z0-9_]{1,48}$'){$message}else{'unexpected'}
  if ($script:stage -in @('install','post_install') -and
      $backupDir -and (Test-Path -LiteralPath $backupDir)) {
    try {
      foreach ($f in @(Get-ChildItem -LiteralPath $backupDir -File)) {
        Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $agentDir $f.Name) -Force
      }
      $script:installedVersion=(Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8).Trim()
      $script:stage='rollback'
      Save-UpdateReport 'rolled_back' $code
      Send-UpdateTelemetry $config 'rolled_back' $code
    } catch { $script:stage='rollback_failed' }
  }
  if ($script:stage -ne 'rollback') {
    try {Save-UpdateReport 'failed' $code} catch {}
    if ($config) {Send-UpdateTelemetry $config 'failed' $code}
  }
  exit 1
} finally {
  if ($downloadPath -and (Test-Path -LiteralPath $downloadPath)) {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  }
  if ($hasLock) {try{$mutex.ReleaseMutex()}catch{}}
  if ($mutex) {$mutex.Dispose()}
}
