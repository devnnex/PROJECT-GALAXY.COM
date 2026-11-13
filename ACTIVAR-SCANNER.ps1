$ErrorActionPreference = 'Stop'
$nodeOptions = @((Join-Path $env:LOCALAPPDATA 'GALAXY-Tools\node\node.exe'), (Join-Path $env:LOCALAPPDATA 'AuraMusicTools\node-v22.22.0-win-x64\node.exe'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeOptions = @($nodeCommand.Source) + $nodeOptions }
$scannerNode = $nodeOptions | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $scannerNode) { throw 'Necesitas Node.js 22 o superior.' }
Write-Host 'Activa el scanner XAUUSD para los miembros activos de Galaxy.'
Write-Host 'Requiere la sesión de Supabase de Galaxy y el secreto GOLD_API_KEY ya configurados.'
& $scannerNode (Join-Path $PSScriptRoot 'scripts\activate-scanner.mjs') --enable
if ($LASTEXITCODE -ne 0) { throw 'La activación no se completó. Revisa el estado del proveedor y el acceso a Supabase.' }
