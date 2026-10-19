#requires -Version 5.1
<#
Ecoute NethorSync 2 - fonctionne avec la session Windows ouverte.
Interroge le verrou Supabase toutes les 8 secondes sans ecriture.
Ne scanne aucun fichier hors synchronisation ponctuelle demandee.
La planification 19h / 12h reste independante.
#>
[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'), [int]$IntervalSeconds=8)
$ErrorActionPreference='Stop'
$IntervalSeconds=[Math]::Max(5,[Math]::Min($IntervalSeconds,60))
$watchMutex=[Threading.Mutex]::new($false,'Local\NethorSync2-Listener')
if (-not $watchMutex.WaitOne(0)) { exit 0 }

function Unprotect([string]$Encrypted) {
 $value=ConvertTo-SecureString -String $Encrypted.Trim()
 $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
 try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p); $value.Dispose() }
}
function Safe([string]$Value) {
 $v=[regex]::Replace([string]$Value,'(?i)Bearer\s+[A-Za-z0-9._-]+','Bearer [masque]')
 $v=[regex]::Replace($v,'(?i)sb_(secret|publishable)_[A-Za-z0-9_-]+','cle [masquee]')
 return $v
}
function Log([string]$Message) {
 $state=Join-Path $env:LOCALAPPDATA 'NethorSync2'
 if (-not (Test-Path $state)) {New-Item -ItemType Directory -Force -Path $state | Out-Null}
 $line='['+(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')+'] '+(Safe $Message)
 Add-Content -LiteralPath (Join-Path $state 'listener.log') -Value $line -Encoding UTF8
}
try {
 if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw 'Configuration agent absente.' }
 $cfg=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
 if (-not $cfg.supabaseUrl -or -not $cfg.publishableKey) {throw 'Configuration Supabase incomplete.'}
 $stateDir=if ($cfg.statePath) {[string]$cfg.statePath} else {Join-Path $env:LOCALAPPDATA 'NethorSync2'}
 $idPath=Join-Path $stateDir 'device-binding.json'
 $secretPath=Join-Path $stateDir 'device-secret.dat'
 $authPath=Join-Path $stateDir 'auth.dat'
 $device=Get-Content -LiteralPath $idPath -Raw -Encoding UTF8 | ConvertFrom-Json
 $secret=Unprotect (Get-Content -LiteralPath $secretPath -Raw -Encoding UTF8)
 $token=$null
 $refreshAfter=[datetime]::MinValue
 $lastHeartbeat=[datetime]::MinValue
 $retryAfter=[datetime]::MinValue
 $errorDelay=10
 $lastVersion=0
 Log ('Écoute activée sur le poste '+[Environment]::MachineName+', intervalle '+$IntervalSeconds+' s.')
 while ($true) {
  try {
   # Tant que l'assistant d'installation n'est pas terminé, aucun accès réseau.
   $cfg=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
   if ($cfg.uploadEnabled -ne $true) { Start-Sleep -Seconds $IntervalSeconds;continue }
   if ((Get-Date) -ge $refreshAfter) {
    $refresh=Unprotect (Get-Content -LiteralPath $authPath -Raw -Encoding UTF8)
    $headers=@{apikey=[string]$cfg.publishableKey}
    $res=Invoke-RestMethod -Method Post -Uri ($cfg.supabaseUrl.TrimEnd('/')+'/auth/v1/token?grant_type=refresh_token') -Headers $headers -ContentType 'application/json' -Body (@{refresh_token=$refresh}|ConvertTo-Json) -TimeoutSec 20
    if (-not $res.access_token -or -not $res.refresh_token) {throw 'Le renouvellement de session a échoué.'}
    $protected=ConvertTo-SecureString -String $res.refresh_token -AsPlainText -Force
    try {$protected|ConvertFrom-SecureString|Set-Content -LiteralPath $authPath -Encoding UTF8}
    finally {$protected.Dispose();$refresh=$null}
    $token=[string]$res.access_token
    $ttl=if ($res.expires_in) {[int]$res.expires_in} else {3600}
    $refreshAfter=(Get-Date).AddSeconds([Math]::Max(40,$ttl-240))
   }
   $headers=@{apikey=[string]$cfg.publishableKey;Authorization='Bearer '+$token}
   $params=@{p_device_id=[string]$device.deviceId;p_secret=$secret;p_generation=[long]$device.generation}|ConvertTo-Json
   $check=Invoke-RestMethod -Method Post -Uri ($cfg.supabaseUrl.TrimEnd('/')+'/rest/v1/rpc/nethor_sync_poll') -Headers $headers -ContentType 'application/json' -Body $params -TimeoutSec 20
   if (-not $check.active) {throw 'Ce poste n’est plus autorisé.'}
   if (((Get-Date)-$lastHeartbeat).TotalSeconds -ge 180) {
    $null=Invoke-RestMethod -Method Post -Uri ($cfg.supabaseUrl.TrimEnd('/')+'/rest/v1/rpc/nethor_sync_heartbeat') -Headers $headers -ContentType 'application/json' -Body $params -TimeoutSec 20
    $lastHeartbeat=Get-Date
   }
   $errorDelay=10
   if ($check.pending -and (Get-Date) -ge $retryAfter) {
    $version=[long]$check.version
    Log ('Synchronisation ponctuelle demandée (version '+$version+').')
    $exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $script=Join-Path $PSScriptRoot 'NethorSync.ps1'
    # Une seule execution ponctuelle par demande. Les scripts de scan
    # accusent réception sur Supabase apres comparaison/transfert reussis.
    $args='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" -PollOnly'
    $result=Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
    if ($result.ExitCode -ne 0) {
     Log ('La vérification ponctuelle a échoué (code '+$result.ExitCode+'). Nouvelle tentative dans 2 min.')
     $retryAfter=(Get-Date).AddMinutes(2)
    } else {
     $retryAfter=(Get-Date).AddSeconds(20)
     Log 'Vérification ponctuelle terminée.'
    }
    $lastVersion=$version
   }
  } catch {
   $cause=Safe $_.Exception.Message
   Log ('Erreur de communication : '+$cause)
   # Une révocation coupe immédiatement l'agent, même sur PC ancien.
   if ($cause -match 'NETHOR_SYNC_DEVICE_REVOKED|NETHOR_SYNC_NOT_AUTHORIZED') {
    Log 'Écoute arrêtée : ce poste n’est plus lié.';break
   }
   # En cas de jeton invalide, reprendre une fois avec la session enregistrée.
   if ($cause -match 'invalid_grant|Invalid Refresh Token|JWT expired|401') {$refreshAfter=[datetime]::MinValue}
   Start-Sleep -Seconds ([Math]::Min($errorDelay,60))
   $errorDelay=[Math]::Min($errorDelay*2,60)
  }
  Start-Sleep -Seconds $IntervalSeconds
 }
} catch {Log ('Arrêt : '+(Safe $_.Exception.Message))}
finally {$watchMutex.ReleaseMutex();$watchMutex.Dispose()}
