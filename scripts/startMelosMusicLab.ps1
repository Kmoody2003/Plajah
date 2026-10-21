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
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($taskRandom); $rng.Dispose()
$env:ACESTEP_API_KEY = [BitConverter]::ToString($taskRandom).Replace('-', ''); Set-Content -Path (Join-Path $taskLogs 'ace-token.txt') -Value $env:ACESTEP_API_KEY -NoNewline
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:HF_HOME = 'D:\Plajah Models\.hf_cache'
$env:HF_HUB_CACHE = 'D:\Plajah Models\.hf_cache\hub'
$env:ACESTEP_CHECKPOINTS_DIR = if ($env:ACESTEP_CHECKPOINTS_DIR) { $env:ACESTEP_CHECKPOINTS_DIR } else { 'D:\Plajah Models\ace-step-checkpoints' }
New-Item -ItemType Directory -Path $env:ACESTEP_CHECKPOINTS_DIR -Force | Out-Null
$env:ACESTEP_INIT_LLM = if ($env:ACESTEP_INIT_LLM) { $env:ACESTEP_INIT_LLM } else { 'true' }
$env:ACESTEP_LM_MODEL_PATH = if ($env:ACESTEP_LM_MODEL_PATH) { $env:ACESTEP_LM_MODEL_PATH } else { 'acestep-5Hz-lm-0.6B' }
$env:MELOS_ACE_THINKING = $env:ACESTEP_INIT_LLM
if (-not $env:MELOS_OLLAMA_URL -and -not $env:MELOS_QWEN_PYTHON) {
  $taskScorePython = 'D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\python.exe'
  $taskScoreModel = 'D:\Plajah Models\llm\Qwen2.5-7B-Instruct-Q4_K_M.gguf'
  if ((Test-Path -LiteralPath $taskScorePython) -and (Test-Path -LiteralPath $taskScoreModel)) {
    $env:MELOS_QWEN_PYTHON = $taskScorePython
    $env:MELOS_QWEN_GGUF = $taskScoreModel
  }
}
$env:ACESTEP_OFFLOAD_TO_CPU = 'true'
$env:ACESTEP_OFFLOAD_DIT_TO_CPU = 'true'
$env:ACESTEP_API_HOST = '127.0.0.1'
$env:ACESTEP_API_PORT = [string]$AcePort
$env:MELOS_ACE_URL = "http://127.0.0.1:$AcePort"
$env:MELOS_ACE_TOKEN = $env:ACESTEP_API_KEY
$env:PORT = [string]$AppPort
$taskProcess = Start-Process -FilePath $taskPython -ArgumentList @('-u', '-m', 'acestep.api_server') -WorkingDirectory $taskAce -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogs 'ace-output.log') -RedirectStandardError (Join-Path $taskLogs 'ace-error.log')
try {
  Write-Host "ACE-Step is starting on loopback port $AcePort. Model initialization may take several minutes."
  Write-Host "Melos: http://localhost:$AppPort -- sign in as admin, open Studio, then Generate."
  Push-Location -LiteralPath $taskRoot
  try { & npm.cmd run dev } finally { Pop-Location }
} finally {
  if (-not $taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id }
}
