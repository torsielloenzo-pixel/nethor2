#requires -Version 5.1
<#
Verifie la liaison existante avec Supabase pour reprendre une installation
interrompue sans ressaisir le mot de passe. Aucun secret n'est journalise.
#>
[CmdletBinding()]
param([string]$ConfigPath = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath 'config.json'
}
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stateDir = if ($config.statePath) { [string]$config.statePath } else { Join-Path $env:LOCALAPPDATA 'NethorSync2' }
$authPath = Join-Path $stateDir 'auth.dat'
$bindingPath = Join-Path $stateDir 'device-binding.json'
$secretPath = Join-Path $stateDir 'device-secret.dat'
foreach ($item in @($authPath,$bindingPath,$secretPath)) {
  if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
    throw 'Liaison locale incomplete : authentification necessaire.'
  }
}
function Decode-Secret([string]$Cipher) {
  $secret = ConvertTo-SecureString -String $Cipher.Trim()
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
}
$device = Get-Content -LiteralPath $bindingPath -Raw -Encoding UTF8 | ConvertFrom-Json
$refresh = Decode-Secret (Get-Content -LiteralPath $authPath -Raw -Encoding UTF8)
$deviceSecret = Decode-Secret (Get-Content -LiteralPath $secretPath -Raw -Encoding UTF8)
if (-not $device.deviceId -or -not $device.generation -or -not $deviceSecret) {
  throw 'Identite du poste incomplète.'
}
$headers = @{ apikey = [string]$config.publishableKey }
# Supabase rotate les refresh tokens : sauvegarder immédiatement le nouveau.
$response = Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd('/') + '/auth/v1/token?grant_type=refresh_token') -Headers $headers -ContentType 'application/json' -Body (@{refresh_token=$refresh}|ConvertTo-Json)
if (-not $response.access_token -or -not $response.refresh_token) { throw 'Session Nethor expirée.' }
$newToken = ConvertTo-SecureString -String $response.refresh_token -AsPlainText -Force
try { $newToken | ConvertFrom-SecureString | Set-Content -LiteralPath $authPath -Encoding UTF8 }
finally { $newToken.Dispose(); $refresh = $null }
$headers.Authorization = 'Bearer ' + $response.access_token
$result = Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd('/') + '/rest/v1/rpc/nethor_sync_heartbeat') -Headers $headers -ContentType 'application/json' -Body (@{
  p_device_id = [string]$device.deviceId
  p_secret = $deviceSecret
  p_generation = [long]$device.generation
}|ConvertTo-Json)
$deviceSecret = $null
if ($result.active -ne $true) { throw 'Le poste n’est plus autorisé par Supabase.' }
Write-Output 'Poste déjà lié et autorisé : reprise de la configuration.'
