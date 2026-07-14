# Fabula Generation Agent — MCP-linked services → bins

Bring external creative services (Kling, Magnific, …) into Fabula: a prompt box in the editor dispatches
a job to an agent that runs on the **user's own linked account**, and the results land back in the
project's **bins** automatically. The watch-folder → bin mirroring is the delivery half and is already
shipped; this doc covers the agent half.

## Decisions (locked)
- **Agent host:** a **cloud service** on Cloud Run (`plajah-api`, same `/api/*` rewrite convention as
  Crossover). Truly headless — jobs run in the background and fill bins even when Fabula is closed.
- **Connect mode:** **hybrid** — official API where a service has one (Kling via fal / PiAPI; Magnific
  via Freepik), else **headless UI-navigation** (Playwright / computer-use) against the user's logged-in
  session. Either way the user **links their existing account once** (MCP-style, per-user, revocable) and
  the agent acts *as them* — never a shared platform key.

## Shipped now (client)
- **`services/fabula/genAgent.ts`** — browser client + local job mirror (idb). Connector registry,
  `health()`, `listConnectors()`, `connectAccount()`, `submitJob()`, `pollJob()`, `listJobs()`,
  `assetTypeForMime()`. Degrades gracefully when the backend is unreachable (jobs → `backend-offline`,
  panel shows a "connect the agent" note) so the UI is real before the service exists.
- **`components/Fabula/GeneratePanel.jsx`** — the prompt box + UI: connector cards with per-account
  **Connect**, prompt, target bin, Generate; a jobs list that polls and, on completion, imports result
  URLs into the chosen bin via `importGenResults` in `Fabula.jsx`. Opened from the media pool's
  **GENERATE** button.
- Results become pool assets (`generated: true`, `cloudUrl` = the agent's storage URL) in the target bin
  — the same destination the watch folder feeds, so it's "populate bins headless" either way.

## Backend to build (Cloud Run `plajah-api`) — the contract the client already speaks
All routes under `/api/genagent`, `Authorization: Bearer <firebase idToken>` (verify → uid).

- `GET  /health` → `{ ok: true }` (JSON; the client rejects a non-JSON SPA-fallback).
- `POST /connectors` → `{ connectors: [{ id, name, kind, connectMode, blurb, connected }] }` — per-user
  connection state (which accounts this uid has linked).
- `POST /connect` `{ provider }` → `{ authUrl }` (OAuth/session-capture flow to open) **or**
  `{ connected: true }`. This is the **MCP account-link** step:
  - **API providers:** OAuth where offered, else a one-time key/session the user pastes into a secure
    form; store **encrypted** (KMS/Secret Manager) keyed by `uid+provider`. Never sent back to the client.
  - **UI providers:** a guided session-capture (the agent opens the provider's login, the user signs in,
    we persist the authenticated browser context/cookies encrypted for replay).
- `POST /jobs` `{ provider, kind, prompt, params, projectId, bin }` → `{ jobId, status }`.
- `GET  /jobs?projectId=` → `{ jobs: [GenJob] }`.
- `GET  /jobs/:id` → `GenJob` (`status: queued|running|done|error`, `progress`, `results:[{url,name,mime}]`).

### Job worker
1. Load the uid's encrypted credential/session for `provider`.
2. **API path:** call the provider API (Kling/fal, Magnific/Freepik) with `prompt`+`params`; poll to done.
3. **UI path:** spin a headless browser (Playwright) with the stored session; navigate the provider's
   generate flow (computer-use fallback for brittle UIs); download outputs.
4. Write outputs to Storage under `gen/{uid}/{projectId}/{jobId}/…`; set `results[]` to signed/public URLs.
5. The client's poll picks up `done` → `importGenResults` drops them into the bin.

## Security / ToS
- Per-user linked accounts only; encrypted at rest; revocable from a connections screen (TODO UI).
- Respect each provider's ToS: prefer API; UI-navigation only where the user drives their own account and
  automation isn't prohibited. Rate-limit + backoff. No CAPTCHA-solving.
- The client never sees credentials; the agent never uses a shared key across users.

## Follow-ups
- Connections management screen (list linked accounts + revoke).
- Drag a finished job's result straight to the timeline (currently lands in the bin).
- More connectors (Runway, Luma, Veo, Freepik, Ideogram) — same registry entry + a worker adapter.
- Optionally mirror results into a real local watch folder for Crossover-desktop users.
