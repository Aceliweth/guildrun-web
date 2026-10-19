param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$PublicDir = Join-Path $PSScriptRoot "public"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Guildrun Web — Local Static Server" -ForegroundColor Yellow
Write-Host "  Serving: $PublicDir" -ForegroundColor Gray
Write-Host "  URL:     http://localhost:$Port/" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

python -m http.server $Port -d $PublicDir
