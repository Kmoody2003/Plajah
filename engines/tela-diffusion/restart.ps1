# Restart the Tela Diffusion Runtime outside the Plajah server (dev loop). Logs → D:\Plajah Runtime\tela_runtime.log
param([int]$Port = 51123)
$root = 'D:\Plajah Runtime'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tela_runtime\.py' -and $_.Name -eq 'python.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$env:HF_HOME = "$root\cache\hf"; $env:TMP = "$root\tmp"; $env:TEMP = "$root\tmp"; $env:PYTHONUNBUFFERED = '1'; $env:PYTHONIOENCODING = 'utf-8'
$script = Join-Path $PSScriptRoot 'tela_runtime.py'
Start-Process -FilePath "$root\tela-py\Scripts\python.exe" -ArgumentList @('-u', "`"$script`"", '--port', $Port) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$root\tela_runtime.log" -RedirectStandardError "$root\tela_runtime.err.log"
for ($i = 0; $i -lt 40; $i++) { try { Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2 | Out-Null; "Tela runtime up on $Port"; exit 0 } catch { Start-Sleep -Milliseconds 750 } }
"Tela runtime did not answer on $Port"; exit 1
