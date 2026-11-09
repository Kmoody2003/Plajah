# Maker Exchange keys: DigiKey and Mouser

Live part prices and stock in the Electronics Lab's parts list come from DigiKey and Mouser. Both
keys are free and live **only on the server** (`routes/makerBuild.ts`); they are never sent to the
browser. Without them, each part shows search links instead.

**Never paste a key into a Claude chat.** Type or paste it only into the places below.

## 1. Get the keys

**DigiKey** (Product Information V4, 2-legged OAuth)
1. Sign in or register at https://developer.digikey.com/ .
2. Create an organization (if asked), then **Production Apps → Create Production App**.
   Use a Production app, not Sandbox: the server calls `api.digikey.com`.
3. Enable **Product Information V4**. No OAuth callback is needed (client credentials).
4. Copy the **Client ID** and **Client Secret**.

**Mouser** (Search API)
1. Sign in to your Mouser account, then open the API home: https://www.mouser.com/en/apihome/ .
2. Sign up for the **Search API**. The key arrives by email and shows in your account.
3. Limits: about 30 calls a minute and 1,000 a day.

## 2. Production (Cloud Run `plajah-api`)

Run in your own terminal. Each command waits for the value: paste it, press Enter, then Ctrl+D
(Ctrl+Z then Enter in Windows PowerShell).

```bash
gcloud secrets create plajah-api-digikey-client-id --replication-policy=automatic --data-file=- --project gen-lang-client-0665118474
gcloud secrets create plajah-api-digikey-client-secret --replication-policy=automatic --data-file=- --project gen-lang-client-0665118474
gcloud secrets create plajah-api-mouser-api-key --replication-policy=automatic --data-file=- --project gen-lang-client-0665118474
```

Point the service at them (this command never sees the values):

```bash
gcloud run services update plajah-api --region us-west1 --project gen-lang-client-0665118474 \
  --update-secrets DIGIKEY_CLIENT_ID=plajah-api-digikey-client-id:latest,DIGIKEY_CLIENT_SECRET=plajah-api-digikey-client-secret:latest,MOUSER_API_KEY=plajah-api-mouser-api-key:latest
```

If it reports a permission error, give the service's runtime account the **Secret Manager Secret
Accessor** role on the three secrets (Secret Manager → secret → Permissions), then run it again.
Deploys from CI keep these bindings (the deploy only updates plain env vars).

To rotate later: `gcloud secrets versions add plajah-api-mouser-api-key --data-file=- --project gen-lang-client-0665118474`,
then redeploy or run the update command above.

## 3. Local development

Add the same three names to `.env.local` (git-ignored):

```
DIGIKEY_CLIENT_ID=
DIGIKEY_CLIENT_SECRET=
MOUSER_API_KEY=
```

## 4. Check

Electronics Lab → BOM tab → the search button on any line. "Live prices need DigiKey or Mouser keys"
means the server does not see them yet.
