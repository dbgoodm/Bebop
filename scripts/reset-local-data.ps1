param(
  [string]$DataDirectory = (Join-Path $env:APPDATA "com.dbgoodm.bebop"),
  [string]$Confirmation = ""
)

$ErrorActionPreference = "Stop"
$resolvedLeaf = Split-Path -Leaf $DataDirectory
if ($resolvedLeaf -ne "com.dbgoodm.bebop") {
  throw "Refusing to reset a directory not named com.dbgoodm.bebop."
}
if (Get-Process -Name "bebop-desktop" -ErrorAction SilentlyContinue) {
  throw "Quit Bebop before resetting its local data."
}
if (-not (Test-Path -LiteralPath $DataDirectory -PathType Container)) {
  Write-Output "No Bebop application-data directory exists at $DataDirectory."
  exit 0
}
if ($Confirmation -ne "RESET") {
  throw "No data changed. Re-run with -Confirmation RESET after reviewing: $DataDirectory"
}

$parentDirectory = Split-Path -Parent $DataDirectory
$backupDirectory = Join-Path $parentDirectory "bebop-reset-backups"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$destination = Join-Path $backupDirectory "com.dbgoodm.bebop-$timestamp-$([guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
Move-Item -LiteralPath $DataDirectory -Destination $destination
Write-Output "Bebop local data moved to $destination. Music files were not changed."
