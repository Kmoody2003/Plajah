# Sets the Meta (Facebook/Instagram) connect settings on the plajah-api Cloud Run service.
# Prompts for each value so nothing has to be edited into a command line.
# Uses --update-env-vars / --update-secrets (merge) so no other setting on the service is touched.

$project = 'gen-lang-client-0665118474'
$region  = 'us-west1'
$service = 'plajah-api'

$gcloud = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
if (-not $gcloud) { $gcloud = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' }
if (-not (Test-Path $gcloud)) { Write-Host 'gcloud not found.'; exit 1 }

$appId    = (Read-Host 'Meta App ID').Trim()
$configId = (Read-Host 'Facebook Login for Business Configuration ID (blank to skip)').Trim()
$secret   = Read-Host 'Meta App Secret (input hidden)' -AsSecureString
$plain    = [System.Net.NetworkCredential]::new('', $secret).Password.Trim()

if (-not $appId -or -not $plain) { Write-Host 'App ID and App Secret are required.'; exit 1 }

# Secret Manager: create, or add a new version if it already exists.
$exists = & $gcloud secrets describe META_APP_SECRET --project $project 2>$null
if ($LASTEXITCODE -eq 0) {
  $plain | & $gcloud secrets versions add META_APP_SECRET --data-file=- --project $project
} else {
  $plain | & $gcloud secrets create META_APP_SECRET --data-file=- --project $project
}
if ($LASTEXITCODE -ne 0) { Write-Host 'Could not store the secret.'; exit 1 }

$envVars = "META_APP_ID=$appId"
if ($configId) { $envVars += ",META_LOGIN_CONFIG_ID=$configId" }

& $gcloud run services update $service --region $region --project $project --update-env-vars $envVars --update-secrets META_APP_SECRET=META_APP_SECRET:latest
if ($LASTEXITCODE -eq 0) { Write-Host "`nDone. New revision is deploying." } else { Write-Host "`nUpdate failed - see the message above." }
