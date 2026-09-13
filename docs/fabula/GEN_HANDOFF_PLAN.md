# Fabula Generation — connectors, handoff, and where the UI lives

Supersedes the connector/IA sections of `GEN_AGENT_PLAN.md`. That doc's backend contract
(`/api/genagent`, job lifecycle, encrypted per-user credentials) still stands; what changed is
**which providers can be automated at all**, **whose credits get spent**, and **where the interface goes**.

## 1. MCP is not the outward integration

`GEN_AGENT_PLAN.md` describes account linking as "MCP-style". That phrasing invites building the wrong
layer. MCP is a protocol for exposing tools **to an LLM host** — it solves tool discovery for a model.
It solves nothing here:

- MCP clients are LLM hosts. `GeneratePanel` is a React panel; it should call `/api/genagent`.
- MCP transports suit request/response tool calls, not multi-minute jobs returning 200MB of video.
  Our job-queue + signed-storage-URL contract is already the right shape.
- For most of these vendors there is no MCP server to point at, so we would be writing one ourselves
  around their REST API — a protocol between our own panel and our own service, for zero benefit.

**Correction (2026-08-30): Magnific ships an MCP server**, and an earlier draft of this doc wrongly said
no vendor did. `https://mcp.magnific.com`, streamable HTTP, OAuth 2.0, no API key — and its docs state
plainly that *"MCP tools share the same credit balance as the in-app product."* That makes MCP the one
transport confirmed to spend a user's own plan credits at Magnific.

It still isn't the transport between our panel and our backend. But it is a legitimate **outward**
transport for that one vendor, and a better one than the REST API on the credit question, because a
server-side MCP client is a perfectly ordinary thing to write. Two consequences:
- If Magnific's REST API turns out to bill separately from the plan, switch Magnific's outward leg to
  MCP. Everything else — vault, job store, polling, result import — is unchanged; only the leaf moves.
- The Aria leg (step 6) can talk to `mcp.magnific.com` directly rather than through our adapter.

Per-user account linking is **OAuth + an encrypted credential vault**. Call it that.

**Where MCP does belong — later, and inward:** once the gen agent exists, wrap *it* as an MCP server so
Aria can drive it agentically ("board scene 4 and generate plates for every shot"). MCP as the interface
to our own agent, not to vendors. Build it after the REST layer, not instead of it.

## 2. The finding that drives everything: three wallet models

Every one of these services has **two separate balances** — the consumer subscription credits in the web
app, and developer API billing. They are not the same money, and which one an API call spends differs
per provider. This must be surfaced in the UI or users will be furious about a bill they didn't expect.

| Provider | Official API | Wallet model | Notes |
|---|---|---|---|
| **Kling** | Yes — `kling.ai/dev` | `separate` | Prepaid resource packages, **entirely distinct from consumer membership**. Credits do not transfer in either direction. A Kling subscription grants no API access. $1 free on signup. Failed API tasks don't consume credits. |
| **Magnific** (was Freepik) | Yes — `api.magnific.com` | `shared` *(MCP confirmed; REST assumed)* | Freepik rebranded to **Magnific** in April 2026; one brand, one credit pool across image/video/audio/upscale. Their MCP docs confirm MCP tools share the in-app credit balance. The REST API bills to the same organization account, but no doc page states the plan-credit relationship outright — **confirm on the account page before shipping billing copy.** |
| **Runway** | Yes — Gen-4 family | `separate` | Developer API key; dev account billing is distinct from a consumer Runway subscription. |
| **Dreamina** | No public API | `none` | Region-gated. Automation against ToS. **Handoff only.** |
| **Google Flow** | **No API** | `none` | Flow is the consumer app for Veo, sold via AI Ultra/Pro. Veo is reachable via Gemini API / Vertex — but that spends the user's **GCP** billing, not their Flow subscription. Not the same thing; do not list Veo as a "Flow connector". **Handoff only.** |

So `walletModel: 'shared' | 'separate' | 'none'` is a required field on every connector, and the panel
states plainly which balance a job will spend before the user hits Generate.

### Magnific desktop app — not an integration surface

Magnific ships a macOS desktop app (~14MB). That size means it is a **thin native shell around the web
app**; processing is still cloud-side. It exposes no local API, no CLI, no scriptable surface. It does
not give us a local compute path and it does not change the connector design. Its only possible value is
as a **deep-link target in handoff mode** (open the user straight into the app with the prompt staged) —
worth probing for a custom URL scheme, but not worth blocking on.

## 3. Drop the headless-browser path

`GEN_AGENT_PLAN.md` lists Playwright/computer-use session replay as co-equal to the API path. Cut it.
The cost isn't brittleness — it's that we'd store users' authenticated session cookies and replay them
from a datacenter IP against services whose bot detection will flag it. **The account that gets banned is
the user's**, for a feature we shipped. The two providers this would target (Dreamina, Flow) are exactly
the highest-risk. Not worth it.

## 4. Handoff mode — ship this first

For every provider, and *especially* the `walletModel: 'none'` ones, Fabula compiles the shot into that
provider's prompt dialect, bundles the reference images, and hands off:

- copy the compiled prompt
- download the reference pack
- deep-link into the provider

The user generates in their own browser on their own subscription credits, and the **already-shipped
watch-folder → bin mirroring catches the download**. Zero ToS risk, no credential vault, works day one,
and — critically — it is the only way to spend the subscription credits users already pay for.

Connected mode is then an *automation upgrade* on the three providers that permit it, not a prerequisite.

## 5. Where the UI goes — no new workspace (yet)

Fabula has two rails:

```
page:    PRODUCTIONS | SLATE | EDIT                       Fabula.jsx:6945
editWs:  MEDIA | EDIT | VFX | COLOR | AUDIO | DELIVER     Fabula.jsx:6953
```

**Do not add a tab between EDIT and VFX.** That slot reads as "post-edit fix-up". Generation is not a
fix-up — in an AI-native pipeline it *is* principal photography. Placing it after EDIT teaches users the
wrong model, and it breaks the deliberate Resolve mirror.

Instead: **one panel, three doors**, all driving the same `ShotSpec`.

| Door | Context | Behavior |
|---|---|---|
| **SLATE** shot card | the shot — `still`/`video`/`voice` prompts + `bible` locks as refs | Generate sits beside the existing `CopyBtn`; Copy remains for handoff providers |
| **MEDIA** pool | bin only | what ships today (`Fabula.jsx:5117`) |
| **EDIT** timeline clip | clip's `shotId` → its shot | right-click "Regenerate shot" / "Alternate take"; result replaces the placeholder |

The plumbing for all three already exists and was not being exploited:

- SLATE shot cards already carry per-shot `still` / `video` / `voice` prompts with a `CopyBtn` and a
  `↻ REWORK` notes loop (`Fabula.jsx:6009`). **That is handoff mode v0, done manually.**
- `buildEditFromBreakdown()` writes clips as `{ kind:"script", shotId, label }` (`Fabula.jsx:1499`) —
  **timeline clips already know which SLATE shot they came from**, so a finished generation can replace
  its placeholder in place.
- `SERVICES` / `STILL_TARGETS` (`Fabula.jsx:107`) already drive a **provider-aware prompt compiler**
  (`shotPromptSystem`). This is the capability manifest in embryo — it carries prompt dialect but not
  execution capability. Unify: one registry in `genAgent.ts` carrying both; `Fabula.jsx` derives from it.

### When a room *is* warranted

Two things will outgrow a modal: the job queue (in-flight, credit burn, failures) and **variant
management** — six takes of shot 4B, pick the select. That's a browsing surface. When it happens, the
workspace goes **between MEDIA and EDIT**, not between EDIT and VFX:

```
MEDIA | STAGE | EDIT | VFX | COLOR | AUDIO | DELIVER
```

`STAGE` preserves the rail's chronological logic (media in → shoot → cut → comp → grade → mix → deliver)
and reads correctly as acquisition. Build it second, once we've seen which door people actually use.

## 6. The payoff

`buildEditFromBreakdown()` has a sibling waiting: `queueGenFromBreakdown()` — every `status:"ready"`
shot's prompts pushed to the queue at once with its bible locks as refs. Results land in bins, match on
`shotId`, replace the placeholders. Break down a scene → queue 24 shots → walk away → come back to an
assembled cut of real footage.

Nothing else in the category can do that, because nothing else owns the breakdown and the timeline in
the same app.

## Build order

1. ✅ **Unified connector registry + `ShotSpec` + handoff compiler** — `services/fabula/genAgent.ts`.
   10 connectors carrying `modes` / `walletModel` / `caps` / `promptHint`; `specFromShot()`,
   `refsForConnector()`, `compileHandoff()`, `placeResultInCut()`.
2. ✅ **SLATE door** — `SEND` beside `CopyBtn` on each shot's still/video prompt (`openGenForShot`).
   Panel opens pre-filled with the shot's prompt and the bible's locks as refs.
3. ✅ **EDIT door** — clip right-click → "Generate shot…" / "Generate alternate take…"
   (`openGenForClip`), shown only on clips that trace back to a SLATE shot. Results land via
   `placeResultInCut()`: a `kind:"script"` placeholder is filled in place keeping its start and
   duration; a slot already holding media gets the new take alongside with the previous one **muted,
   never deleted**; the `kind:"voice"` row sharing that shotId is left alone.
   Covered by `npm run test:fabulagen` (20 tests).
4. 🟡 **Backend + credential vault + first adapter — Magnific only.**
   - `services/fabula/genVault.ts` — per-user provider keys, AES-256-GCM under the same
     `ENCRYPTION_KEY` the fediverse credentials use. A key is write-only from the client's side:
     `listLinked` returns presence and a masked tail (`••••1234`), never the value.
   - `services/fabula/magnificApi.ts` — the adapter. Server-side only.
   - `/api/genagent/*` in `server.ts` — health, connectors, connect, connect/key, connect/revoke,
     jobs POST/GET, jobs/:id. Runs in the existing Express server, no Cloud Run needed yet.
   - Runway and Kling still have no adapter; `POST /jobs` returns 501 naming handoff, rather than
     failing obscurely.

## 7. The Magnific adapter, concretely

`https://api.magnific.com`, header `x-magnific-api-key`, async everywhere: POST returns a `task_id`,
GET `/{endpoint}/{task_id}` polls until `COMPLETED`. Two endpoints are wired:

| Fabula intent | Endpoint | Chosen when |
|---|---|---|
| text → still | `POST /v1/ai/mystic` | the spec has no `source`/`first_frame` ref |
| upscale / reimagine a frame | `POST /v1/ai/image-upscaler` | it does |

Three places a film tool and this API disagree, all handled explicitly:

1. **Images go up as base64, not URLs.** Every reference is fetched server-side and encoded, with a
   12MB ceiling that errors clearly rather than posting something Magnific will reject.
2. **There are no cinema aspect ratios.** Mystic's enum tops out at 20:9 (2.22:1) — Fabula's default
   2.39:1 scope frame does not exist. `mysticAspect()` picks the nearest by log-ratio distance and
   returns a note in *ratios, not enum names* ("generating the nearest it has, 2.22:1 — crop to 2.39:1
   in the timeline"), which the panel shows on the job. Silently reframing a shot would be worse than
   refusing.
3. **`COMPLETED` with an empty `generated` array is treated as an error**, not a success that imports
   nothing while telling the user it worked.

The upscaler defaults to `optimized_for: films_n_photography` — Fabula is a film tool.

### Result mirroring

Provider URLs are not ours and don't last, so `services/fabula/genMirror.ts` copies every finished
result into Plajah Storage before the client ever sees it. Objects land at
`fabula/{uid}/gen/{projectId}/{jobId}/{n}.{ext}` — inside the **existing** `fabula/{uid}/**` storage
rule, so there is no rules change and no dry-run to get wrong.

The read URL is deliberately the same shape `resumableUpload.ts` produces
(`firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token=…`), so a mirrored asset is
indistinguishable from an uploaded one in the viewer, the grade and the export. Server-side that needs
`gcsUploadWithDownloadToken` — a multipart upload that sets `firebaseStorageDownloadTokens`, because
plain `uploadType=media` carries no metadata.

Mirroring is **best-effort and never destructive**: a failed copy keeps the provider URL and attaches
a note saying it may expire, one bad result doesn't sink the others, an oversized result is refused
before storage would bounce it, and re-mirroring an already-mirrored URL is a no-op. Path segments come
from the request body, so they're sanitised to an alphabet that cannot escape the uid prefix.

### Remaining in step 4
- ⬜ Runway + Kling adapters (same shape: build body, submit, poll, normalize).
- ✅ Mirror results into Plajah Storage (`genMirror.ts`) — see above.
- ✅ **Settings → Connected Services** (`components/ConnectedServicesSettings.tsx`, mounted as the
  `CONNECTED_SERVICES` tab in `UserDashboard.tsx`). Link, see what's linked (masked tail only), and
  revoke — without opening a tool or loading a production. Two deliberate choices:
  - Providers with no public API are **not shown as linkable**. There is nothing to link, and a form
    would imply otherwise; they're listed under "Nothing to link" with the handoff explanation.
  - A connector can declare `connected` mode because the vendor has an API and still have no adapter
    here. `/health` returns which are actually wired, and the rest render Link disabled with "not
    wired yet" rather than offering a form that would 501.

  It also fails safe up front: if `/health` reports `encryptionConfigured: false`, linking is
  disabled with an explanation, instead of accepting a key it cannot store.
- ⬜ Webhooks (`webhook_url` is already plumbed through the adapter) to replace client polling.

5. ⬜ `queueGenFromBreakdown()` — the payoff in §6.
6. ⬜ MCP server wrapping the agent, for Aria — and an MCP *client* to `mcp.magnific.com`.

### Not verified in the browser
Fabula is gated on a signed-in user (`App.tsx:5277` — guest is not enough), so an agent session cannot
exercise these panels. Everything above is covered by unit tests and confirmed to resolve through Vite's
real module pipeline, but the SLATE `SEND` button and the clip context-menu items have not been clicked
by a human yet. Worth ten minutes when you're next signed in.

## Sources

Verified 2026-08-30. Vendor terms move fast — re-check before shipping billing copy.

- Kling developer platform billing: https://www.eesel.ai/blog/kling-ai-pricing , https://klingapi.com/docs
- Magnific/Freepik rebrand, credits, API: https://checkthat.ai/brands/freepik/pricing , https://www.myarchitectai.com/blog/magnific-ai-pricing
- Magnific desktop: https://www.magnific.com/desktop
- Magnific API docs (endpoints, auth, async pattern): https://docs.magnific.com — machine-readable
  index at https://docs.magnific.com/llms.txt, any page as markdown by appending `.md`
- Magnific MCP (OAuth, shared plan credits): https://docs.magnific.com/modelcontextprotocol
