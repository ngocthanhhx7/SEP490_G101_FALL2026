[CmdletBinding()]
param([string]$MongoBinary = "$env:USERPROFILE\.cache\mongodb-binaries\mongod-x64-win32-8.0.34.exe")
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$dbPath = Join-Path $backendRoot 'storage/mongodb-8.0'
if (-not (Test-Path -LiteralPath $MongoBinary)) { throw 'MongoDB 8.0.34 binary missing; install it or supply -MongoBinary. Never download an unknown binary.' }
New-Item -ItemType Directory -Path $dbPath -Force | Out-Null
$listener = Get-NetTCPConnection -LocalPort 27018 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  $arguments = '--dbpath "' + $dbPath + '" --port 27018 --bind_ip 127.0.0.1 --replSet pwc-local --logpath "' + (Join-Path $dbPath 'mongod.log') + '" --logappend'
  Start-Process -FilePath $MongoBinary -ArgumentList $arguments -WindowStyle Hidden
}
Push-Location $backendRoot
try { node scripts/init-local-mongo.js; if ($LASTEXITCODE -ne 0) { throw 'Local Mongo initialization failed' } }
finally { Pop-Location }
