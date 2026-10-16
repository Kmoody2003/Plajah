# Runs the remaining Ambo church visualizers through the Art Council on the local (on-device) lane.
# Resumable: visualizers whose session is DONE are skipped. Log: docs/ambo/council/_run_local.log
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$env:COUNCIL_LANE = 'local'
$log = 'docs/ambo/council/_run_local.log'
"started $(Get-Date -Format s)" | Out-File -FilePath $log -Encoding utf8
cmd /c "npx tsx scripts/council/runWorshipVisualizerCouncil.ts >> $log 2>&1"
"exit $LASTEXITCODE at $(Get-Date -Format s)" | Add-Content -Path $log -Encoding utf8
