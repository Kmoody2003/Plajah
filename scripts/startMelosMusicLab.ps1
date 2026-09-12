param(
  [int]$AppPort = 3000,
  [int]$AcePort = 8001,
  [string]$AceDirectory = ''
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not $AceDirectory) { $AceDirectory = Join-Path $taskRoot 'artifacts\melos-runtime\ACE-Step-1.5' }
$taskAce = (Resolve-Path -LiteralPath $AceDirectory).Path
$taskPython = Join-Path $taskAce '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Install ACE-Step with uv sync before starting the music lab.' }
$taskLogs = Join-Path $taskRoot 'artifacts\melos-runtime\logs'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$taskRandom = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($taskRandom)
$env:ACESTEP_API_KEY = [Convert]::ToHexString($taskRandom)
$env:ACESTEP_INIT_LLM = 'false'
$env:ACESTEP_OFFLOAD_TO_CPU = 'true'
$env:ACESTEP_OFFLOAD_DIT_TO_CPU = 'true'
$env:ACESTEP_API_HOST = '127.0.0.1'
$env:ACESTEP_API_PORT = [string]$AcePort
$env:MELOS_ACE_URL = "http://127.0.0.1:$AcePort"
$env:MELOS_ACE_TOKEN = $env:ACESTEP_API_KEY
$env:PORT = [string]$AppPort
$taskProcess = Start-Process -FilePath $taskPython -ArgumentList @('-m', 'acestep.api_server') -WorkingDirectory $taskAce -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogs 'ace-output.log') -RedirectStandardError (Join-Path $taskLogs 'ace-error.log')
try {
  Write-Host "ACE-Step is starting on loopback port $AcePort. Model initialization may take several minutes."
  Write-Host "Melos: http://localhost:$AppPort — sign in as admin, open Studio, then Generate."
  Push-Location -LiteralPath $taskRoot
  try { & npm.cmd run dev } finally { Pop-Location }
} finally {
  if (-not $taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id }
}
