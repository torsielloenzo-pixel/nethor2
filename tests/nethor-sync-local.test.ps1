#requires -Version 5.1
$ErrorActionPreference = "Stop"
$root = Join-Path $env:TEMP ("nethor-sync-test-" + [guid]::NewGuid().ToString("N"))
$src = Join-Path $root "Plannings"
$state = Join-Path $root "Etat"
New-Item -ItemType Directory -Path $src -Force | Out-Null
try {
  $config = @{rootPath=$src;statePath=$state;uploadEnabled=$false;maxFileMB=10} | ConvertTo-Json
  $configPath = Join-Path $root "config.json"
  Set-Content -LiteralPath $configPath -Encoding UTF8 -Value $config
  $script = Join-Path (Split-Path -Parent $PSScriptRoot) "tools/nethor-sync/NethorSync.ps1"
  $p = Join-Path $src "Semaine01.xls"
  [IO.File]::WriteAllBytes($p,[byte[]](1,2,3,4,5))
  (Get-Item -LiteralPath $p).LastWriteTimeUtc = [datetime]::UtcNow.AddMinutes(-2)
  function Scan {
    & $script -ConfigPath $configPath
    if (-not $?) { throw "Scanner failed" }
    return (Get-Content -LiteralPath (Join-Path $state "sync-report.json") -Raw -Encoding UTF8 | ConvertFrom-Json)
  }
  $r=Scan
  if ($r.entries.Count -ne 1 -or $r.entries[0].status -ne "new") { throw "new incorrect" }
  $r=Scan
  if ($r.entries[0].status -ne "unchanged") { throw "unchanged incorrect" }
  [IO.File]::WriteAllBytes($p,[byte[]](1,2,3,4,6))
  (Get-Item -LiteralPath $p).LastWriteTimeUtc = [datetime]::UtcNow.AddMinutes(-2)
  $r=Scan
  if ($r.entries[0].status -ne "modified") { throw "modified incorrect" }
  $renamed = Join-Path $src "Semaine02.xls"
  Move-Item -LiteralPath $p -Destination $renamed
  $r=Scan
  if ($r.entries[0].status -ne "moved_or_copied") { throw "moved_or_copied incorrect" }
  Write-Host "Nethor Sync local scanner: 4 assertions OK."
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
