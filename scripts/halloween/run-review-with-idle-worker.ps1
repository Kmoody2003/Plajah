param([Parameter(Mandatory=$true)][int]$WorkerId)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskOriginal = Get-CimInstance Win32_Process -Filter "ProcessId=$WorkerId"
if (-not $taskOriginal -or $taskOriginal.CommandLine -notmatch 'plajah_gpu_sidecar\.py') {
    throw 'Idle worker identity changed; no process was stopped'
}
$taskArguments = $taskOriginal.CommandLine -replace ('^"?' + [regex]::Escape($taskOriginal.ExecutablePath) + '"?\s*'), ''
Stop-Process -Id $WorkerId
try {
    Push-Location $taskRoot
    & 'C:/Program Files/nodejs/node.exe' node_modules/tsx/dist/cli.mjs scripts/halloween/run-fidelity-councils.ts *> artifacts/ravencrest-council-log.txt
} finally {
    Pop-Location
    $taskRestored = Start-Process -FilePath $taskOriginal.ExecutablePath -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot/artifacts/ravencrest-review/sidecar-restart.log" -RedirectStandardError "$taskRoot/artifacts/ravencrest-review/sidecar-restart-error.log" -PassThru
    @{pid=$taskRestored.Id;service='plajah_gpu_sidecar';status='restart-requested'} | ConvertTo-Json | Set-Content "$taskRoot/artifacts/ravencrest-review/sidecar-restored.json"
}
