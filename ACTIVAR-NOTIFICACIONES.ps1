$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:LOCALAPPDATA 'GALAXY-Tools/node/node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Necesitas Node.js 22 o superior para ejecutar la activacion.' }
$scriptPath = Join-Path $PSScriptRoot 'scripts/activate-web-push.mjs'
Write-Host 'Activa la edicion de perfiles y Web Push en el proyecto Galaxy.'
Write-Host 'Crea un Access Token en https://supabase.com/dashboard/account/tokens'
Write-Host 'El token se usa solo en memoria y no se guarda en el proyecto.'
$secureToken = Read-Host 'Pega tu Access Token de Supabase (entrada oculta)' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$process = $null
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $nodePath
  $startInfo.Arguments = '"' + $scriptPath + '"'
  $startInfo.WorkingDirectory = $PSScriptRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $process.StandardInput.WriteLine((@{ token = $token } | ConvertTo-Json -Compress))
  $process.StandardInput.Close()
  $token = $null
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw 'La activacion no termino. Revisa el mensaje anterior; puedes volver a ejecutar este archivo.' }
} finally {
  $token = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  $secureToken.Dispose()
  if ($process) { $process.Dispose() }
}
