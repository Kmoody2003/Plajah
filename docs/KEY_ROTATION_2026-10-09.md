# Key rotation checklist — 2026-10-09

**Why:** on 2026-10-09 a broken comparison script (Claude) printed these keys' values into a
Claude Code conversation transcript. The values are not public and were never pushed to GitHub,
but anything that has appeared in a log or chat must be treated as compromised and replaced.
No one is transacting on Plajah yet, so rotation costs nothing.

**The rule for every key:** create the new key at the provider, revoke or delete the old one there
(that kills every copy at once, including the ones in `.env.local` and on Cloud Run), then put the
new value into Secret Manager yourself. **Never paste a key into a Claude chat.**

**To store a new value** (run in your own terminal, paste the key, press Enter, then Ctrl+D):

```bash
gcloud secrets versions add SECRET_NAME --data-file=- --project gen-lang-client-0665118474
```

When every row below is checked, tell Claude **"keys are rotated"**. Claude then points
`plajah-api` (and `plajah-story-worker`) at the Secret Manager entries, so no key stays as a plain
setting. That step doesn't read or write any secret value.

---

## 1. Stripe (live), highest priority

- [ ] **Restricted key** (`rk_live_…`): Stripe Dashboard → Developers → API keys →
      Restricted keys → your Plajah key → **Roll key**, and expire the old one now.
      → Secret Manager: `plajah-api-stripe-secret-key`
      → `.env.local`: `STRIPE_SECRET_KEY`
- [ ] **Webhook signing secret** (`whsec_…`): Developers → Webhooks → the plajah.com endpoint →
      Signing secret → **Roll secret**.
      → Secret Manager: `plajah-api-stripe-webhook-secret`
      → `.env.local`: `STRIPE_WEBHOOK_SECRET` (a local `stripe listen` uses its own secret)
- The publishable key (`pk_…`) is public by design. No change needed.

## 2. Mux

- [ ] Mux Dashboard → Settings → **Access Tokens** → create a new token (same permissions:
      Mux Video read+write, plus Data if you used it) → **Revoke** the old token.
      → Secret Manager: `plajah-api-mux-token-id` **and** `plajah-api-mux-token-secret` (both change)
      → `.env.local`: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`

## 3. Anthropic

- [ ] console.anthropic.com → Settings → **API Keys** → create a new key → **Delete** the old one.
      → Secret Manager: `plajah-api-anthropic-api-key`
      → `.env.local`: `ANTHROPIC_API_KEY`

## 4. Google: Gemini / Google AI key (one key, used in two settings)

The leaked `GEMINI_API_KEY` and `GOOGLE_AI_API_KEY` on `plajah-api` had the **same value**.

- [ ] Google Cloud Console → APIs & Services → **Credentials** (project gen-lang-client-0665118474),
      or aistudio.google.com → API keys. Create a new key, restrict it to the Generative Language API,
      then **delete** the old one.
      → Secret Manager: `plajah-api-gemini-api-key` **and** `plajah-api-google-ai-api-key` (same new value)
      → `.env.local`: `GEMINI_API_KEY`
- [ ] **Check the other Cloud Run apps before deleting the old key.** These services also have a
      plain `GEMINI_API_KEY`, and if any uses the same key they stop working when it's deleted:
      `plajah-story-worker`, `blood-songs`, `cyberhero-tic-tac-toe`, `plajah-global-content-archive`,
      `plajah-music-microsite-studio`, `plajah-the-global-content-playground-and-archive`,
      `sonicvision-4k`, `storytime-global-content-archive`, `teleprompter`, `the-post-man`,
      `vibestream-music-microsite-studio` (and `API_KEY` on `plajah-mini-player`).
      The Credentials page shows each key's name and last use. Claude can switch whichever ones you
      want onto the new Secret Manager entry, or you can retire the apps you no longer use.

## 5. Google: YouTube Data API key

- [ ] Same Credentials page → create a new key restricted to **YouTube Data API v3** → delete the old one.
      → Secret Manager: `plajah-api-youtube-api-key`

## 6. Plajah's internal keys (random strings, no provider to visit)

Generate each one with `openssl rand -hex 32` and store it, then update whatever calls it:

- [ ] `STORY_WORKER_KEY` → Secret Manager `plajah-api-story-worker-key`. **Must be the same value**
      on `plajah-story-worker` (its `STORY_WORKER_KEY`); Claude wires both.
- [ ] `CHORA_CRON_KEY` → `plajah-api-chora-cron-key`. Update any job or script that calls
      `/api/lyrics/cron` or the Chora cron routes with this key.
- [ ] `CHORA_BACKFILL_KEY` → `plajah-api-chora-backfill-key` (also used by `scripts/backfillLyricSync.mjs`).
- [ ] `TERRA_CRON_KEY` → `plajah-api-terra-cron-key`. **Also update the Cloud Scheduler job**
      `terra-nightly-ingest`, whose header still carries the old key.

## 7. Not affected

- `POKEE_API_KEY` was the placeholder `pk_your_key_here`. Nothing leaked; set a real key whenever
  you use Pokee.
- `ENCRYPTION_KEY`, `META_APP_SECRET`, `BSKY_OAUTH_PRIVATE_JWK`, the `plajah-gsa` service-account key,
  and the new `CRON_SECRET` / `EMAIL_UNSUB_SECRET` were already Secret Manager references and were
  **not** printed.
- `.env.local` is gitignored and has never been committed.

---

## After rotation (Claude)

1. `gcloud run services update plajah-api --update-secrets …` swaps every plain key for its
   Secret Manager reference (latest version); same for `plajah-story-worker`.
2. Smoke test: Stripe test checkout, a Mux upload, an AI call, a YouTube search, the Terra job.
3. Then start the least-privilege service-account work (separate plan).
