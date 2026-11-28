# Provisions GAMER_RT_TICKET_SECRET + GAMER_RT_RESULT_SECRET (if missing), builds and deploys
# plajah-realtime (services/realtime/) to Cloud Run (us-west1), wires plajah-api to it, and verifies
# both /healthz and https://plajah.com/api/gamer/rt/config.
# Uses --update-env-vars / --update-secrets on plajah-api (merge) so no other setting is touched.

param(
  [string]$Project = 'gen-lang-client-0665118474',
  [string]$Region  = 'us-west1',
  [string]$RuntimeSa = '538331111809-compute@developer.gserviceaccount.com',
  [string]$ApiUrl  = 'https://plajah.com',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Continue'

$gcloud = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
if (-not $gcloud) { $gcloud = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' }
if (-not (Test-Path $gcloud)) { Write-Error 'gcloud not found.'; exit 1 }

function Ensure-RandomSecret([string]$Name) {
  & $gcloud secrets describe $Name --project $Project 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Secret $Name already exists; keeping current version."
  } else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      [System.IO.File]::WriteAllText($tmp, $hex, [System.Text.UTF8Encoding]::new($false))
      & $gcloud secrets create $Name --data-file=$tmp --replication-policy=automatic --project $Project
      if ($LASTEXITCODE -ne 0) { throw "Failed to create secret $Name" }
      Write-Host "Created secret $Name (32-byte random hex)."
    } finally {
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
  }
  & $gcloud secrets add-iam-policy-binding $Name `
    --member="serviceAccount:$RuntimeSa" `
    --role="roles/secretmanager.secretAccessor" `
    --project $Project | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to grant secretAccessor on $Name to $RuntimeSa" }
}

Ensure-RandomSecret 'GAMER_RT_TICKET_SECRET'
Ensure-RandomSecret 'GAMER_RT_RESULT_SECRET'

$sha = (git rev-parse --short HEAD 2>$null)
$stamp = (Get-Date -Format 'yyyyMMddHHmmss')
$tag = if ($sha) { "$sha-$stamp" } else { $stamp }
$image = "$Region-docker.pkg.dev/$Project/cloud-run-source-deploy/plajah-realtime:$tag"

if (-not $SkipBuild) {
  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("plajah-rt-stage-" + [System.Guid]::NewGuid().ToString('N'))
  $cloudBuildCfg = [System.IO.Path]::GetTempFileName()
  try {
    New-Item -ItemType Directory -Path (Join-Path $stage 'services') -Force | Out-Null
    Copy-Item -Path 'services/realtime' -Destination (Join-Path $stage 'services/realtime') -Recurse -Force
    @"
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-f', 'services/realtime/deploy/Dockerfile', '-t', '$image', '.']
images:
  - '$image'
"@ | Set-Content -Path $cloudBuildCfg -Encoding UTF8

    Write-Host "Building $image via Cloud Build (staging only services/realtime)..."
    & $gcloud builds submit $stage --project $Project --region $Region --config $cloudBuildCfg
    if ($LASTEXITCODE -ne 0) { throw 'Cloud Build failed' }
  } finally {
    Remove-Item $cloudBuildCfg -Force -ErrorAction SilentlyContinue
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "Skipping build; deploying existing image $image"
}

$secretSpec = 'GAMER_RT_TICKET_SECRET=GAMER_RT_TICKET_SECRET:latest,GAMER_RT_RESULT_SECRET=GAMER_RT_RESULT_SECRET:latest'

Write-Host "Deploying plajah-realtime to Cloud Run ($Region)..."
& $gcloud run deploy plajah-realtime `
  --image $image `
  --project $Project `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --cpu 1 `
  --memory 512Mi `
  --concurrency 1000 `
  --min-instances 0 `
  --max-instances 1 `
  --timeout 3600 `
  --session-affinity `
  "--set-secrets=$secretSpec" `
  "--set-env-vars=GAMER_RT_API_URL=$ApiUrl"
if ($LASTEXITCODE -ne 0) { throw 'plajah-realtime deploy failed' }

$httpUrl = (& $gcloud run services describe plajah-realtime --project $Project --region $Region --format='value(status.url)').Trim()
$wsUrl = $httpUrl -replace '^https://', 'wss://'
Write-Host "plajah-realtime deployed at $httpUrl ($wsUrl)"

$health = Invoke-RestMethod -Uri "$httpUrl/health" -TimeoutSec 20
Write-Host "Health check (/health): $($health | ConvertTo-Json -Compress)"

$apiJson = (& $gcloud run services describe plajah-api --project $Project --region $Region --format='json' 2>$null) | ConvertFrom-Json
$existingUrls = ($apiJson.spec.template.spec.containers[0].env | Where-Object { $_.name -eq 'GAMER_RT_URLS' } | Select-Object -First 1 -ExpandProperty value)
$existingUrls = if ($existingUrls) { $existingUrls.Trim() } else { '' }
if ($existingUrls) {
  Write-Host "plajah-api GAMER_RT_URLS already configured ($existingUrls); skipping plajah-api redeploy."
} else {
  Write-Host "Wiring plajah-api to $wsUrl..."
  & $gcloud run services update plajah-api `
    --project $Project `
    --region $Region `
    "--update-secrets=$secretSpec" `
    "--update-env-vars=GAMER_RT_URLS=$wsUrl"
  if ($LASTEXITCODE -ne 0) { throw 'plajah-api update failed' }
}

$cfg = Invoke-RestMethod -Uri "$ApiUrl/api/gamer/rt/config" -TimeoutSec 20
Write-Host "Live /api/gamer/rt/config: $($cfg | ConvertTo-Json -Compress)"
