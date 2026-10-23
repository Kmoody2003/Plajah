# Install + restart the Tela 3D Runtime outside the Plajah server (dev loop). Copies the engine to
# D:\Plajah Runtime\engines\tela-3d (where the desktop app's TELA3D_ENSURE looks), then starts it from there.
# Logs → D:\Plajah Runtime\tela3d_runtime.log
param([int]$Port = 51124)
$root = 'D:\Plajah Runtime'
$dst = "$root\engines\tela-3d"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$PSScriptRoot\tela3d_runtime.py", "$PSScriptRoot\fetch_weights.py", "$PSScriptRoot\uv_raster.py", "$PSScriptRoot\paint_from_views.py" $dst -Force
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tela3d_runtime\.py' -and $_.Name -eq 'python.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$env:HF_HOME = "$root\cache\hf"; $env:TMP = "$root\tmp"; $env:TEMP = "$root\tmp"; $env:PYTHONUNBUFFERED = '1'; $env:PYTHONIOENCODING = 'utf-8'
Start-Process -FilePath "$root\tela3d-py\Scripts\python.exe" -ArgumentList @('-u', '-W', 'ignore', "`"$dst\tela3d_runtime.py`"", '--port', $Port) -WorkingDirectory $dst -WindowStyle Hidden -RedirectStandardOutput "$root\tela3d_runtime.log" -RedirectStandardError "$root\tela3d_runtime.err.log"
for ($i = 0; $i -lt 80; $i++) { try { Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2 | Out-Null; "Tela 3D runtime up on $Port"; exit 0 } catch { Start-Sleep -Milliseconds 750 } }
"Tela 3D runtime did not answer on $Port"; exit 1
