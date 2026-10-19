#requires -Version 5.1
# Login interactif: ne conserve que le refresh token, chiffre pour cet utilisateur Windows via DPAPI.
[CmdletBinding()]
param([string]$ConfigPath = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath "config.json"
}
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Copier config.example.json vers config.json avant la connexion." }
$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $config.supabaseUrl -or -not $config.publishableKey) { throw "Configuration Supabase incomplete." }
$name = (Read-Host "Adresse e-mail ou identifiant Nethor").Trim().ToLowerInvariant()
if (-not $name -or $name -match "\s") { throw "Identifiant invalide." }
$email = if ($name.Contains("@")) { $name } else { $name + "@stock-fl.local" }
$securePassword = Read-Host "Mot de passe" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $payload = @{ email = $email; password = $password } | ConvertTo-Json
  $headers = @{ apikey = [string]$config.publishableKey }
  $auth = Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd("/") + "/auth/v1/token?grant_type=password") -ContentType "application/json" -Headers $headers -Body $payload
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $securePassword.Dispose()
  $password = $null
  $payload = $null
}
if (-not $auth.access_token -or -not $auth.refresh_token) { throw "Connexion non confirmee." }
$headers.Authorization = "Bearer " + $auth.access_token
$permission = Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/nethor2_my_planning_permission") -ContentType "application/json" -Headers $headers -Body "{}"
if ([string]$permission -ne "manage") { throw "Le compte ne dispose pas du droit de gestion du planning." }
$stateDir = if ($config.statePath) {
  if ([IO.Path]::IsPathRooted([string]$config.statePath)) { [IO.Path]::GetFullPath([string]$config.statePath) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ([string]$config.statePath))) }
} else { Join-Path $env:LOCALAPPDATA "NethorSync2" }
if (-not (Test-Path -LiteralPath $stateDir)) { New-Item -Path $stateDir -ItemType Directory -Force | Out-Null }
$refreshToken = ConvertTo-SecureString -String $auth.refresh_token -AsPlainText -Force
try { $refreshToken | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $stateDir "auth.dat") -Encoding UTF8 }
finally { $refreshToken.Dispose() }
# Enregistrement serveur du poste, impossible tant qu'un autre poste est lie.
$bindingPath = Join-Path $stateDir "device-binding.json"
$device = if (Test-Path -LiteralPath $bindingPath) { Get-Content -LiteralPath $bindingPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$deviceId = if ($device -and $device.deviceId) { [string]$device.deviceId } else { [guid]::NewGuid().ToString() }
$secretPath = Join-Path $stateDir "device-secret.dat"
if (Test-Path -LiteralPath $secretPath) {
  $protected = (Get-Content -LiteralPath $secretPath -Raw -Encoding UTF8).Trim()
  $secure = ConvertTo-SecureString -String $protected
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $deviceSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
} else {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $deviceSecret = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}
$registration = Invoke-RestMethod -Method Post -Uri ($config.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/nethor_sync_register") -Headers $headers -ContentType "application/json" -Body (@{
  p_device_id = $deviceId
  p_secret = $deviceSecret
  p_device_label = [Environment]::MachineName
} | ConvertTo-Json)
if (-not $registration.registered -or -not $registration.generation) { throw "Enregistrement du poste non confirme." }
$encodedDeviceSecret = ConvertTo-SecureString -String $deviceSecret -AsPlainText -Force
try { $encodedDeviceSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding UTF8 }
finally { $encodedDeviceSecret.Dispose(); $deviceSecret = $null }
@{ deviceId=$deviceId; generation=[long]$registration.generation; label=[Environment]::MachineName } |
  ConvertTo-Json | Set-Content -LiteralPath $bindingPath -Encoding UTF8
Write-Host "Compte de gestion connecte. Jeton chiffre pour l'utilisateur Windows courant."
Write-Host "Le poste est lie. Aucune publication automatique de planning sans validation."
