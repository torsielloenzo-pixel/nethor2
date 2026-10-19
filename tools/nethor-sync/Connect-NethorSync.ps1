#requires -Version 5.1
# Login interactif: ne conserve que le refresh token, chiffre pour cet utilisateur Windows via DPAPI.
[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"))
$ErrorActionPreference = "Stop"
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
Write-Host "Compte de gestion connecte. Jeton chiffre pour l'utilisateur Windows courant."
Write-Host "Aucun fichier n'est envoye avant activation de uploadEnabled dans config.json."
