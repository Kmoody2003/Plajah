# Elevate ⇄ payroll: importing staff, and the "Plajah as a payroll front end" question

_Research notes, 2026-10-16; Finch path wired 2026-10-17. Companion to `services/payrollImport.ts`, `components/elevate/PayrollImport.tsx`, `routes/payrollConnect.ts`._

## What ships today

| Need | Status | Where |
|---|---|---|
| Pull **names + roles + departments** from any payroll system | **Done — file export.** Paychex Flex, ADP, Gusto, QuickBooks Payroll, Paylocity, Paycor, Rippling, BambooHR exports are auto-detected; pay / SSN / bank / DOB columns are dropped at parse time. Each worker becomes a staff record tagged `staff`, is placed in the matching department, and gets a **pre-provisioned Plajah account** (role mapped from job title: "Youth Pastor" → Pastor, "Treasurer" → Treasurer, anything else → Staff). | Elevate Ops → Accounts & Access → *Import staff from payroll* |
| Pull the same directly from **Paychex Flex (API)** | **Built, needs keys.** `routes/payrollConnect.ts` does client-credentials auth + `GET /companies/{id}/workers`, paginated, and strips everything but name / title / org unit / work contact. Blocked only on a Paychex developer application (`PAYCHEX_CLIENT_ID` / `PAYCHEX_CLIENT_SECRET` env). An org admin then enters their Paychex company id once. | same panel → "Pull from Paychex Flex" |
| Any-provider API (one integration for 250+ systems) | **Built, needs keys — Finch.** `routes/payrollConnect.ts` (`/finch/*`) opens Finch Connect in a popup, exchanges the code for a token (stored AES-256-GCM encrypted in the server-only `payrollConnections/{orgId}` doc — never on the world-readable org doc), then pages `GET /employer/directory` into `PayrollWorker` rows (name, department, active flag; job titles only if `FINCH_PRODUCTS` adds `employment`). Blocked only on a Finch application (`FINCH_CLIENT_ID` / `FINCH_CLIENT_SECRET`) + `ENCRYPTION_KEY`. Org owners/admins connect once; roster staff pull. | same panel → "Connect payroll (any provider)" → "Pull from {provider}" |
| Run payroll from inside Plajah | **Feasible via an embedded-payroll partner (Gusto Embedded or Check). Not built.** | see below |

## 1. Paychex Flex API — what we learned

- **Auth**: OAuth 2.0 client-credentials. API key + secret are posted in the request body to the authentication endpoint; you get a bearer token that **expires after 60 minutes, with no refresh token** — re-request when it dies. ([Paychex developer docs](https://developer.paychex.com/resources/authentication)) Third-party guides name the token URL as `https://api.paychex.com/auth/oauth/v2/token`; the official page points at the SDK for the exact path, so confirm before going live. ([Stitchflow](https://www.stitchflow.com/user-management/paychex/api), [Bindbee](https://www.bindbee.dev/blog/paychex-api-integration-guide))
- **Getting a key**: a Flex client admin creates an application in Paychex Flex under *Company Settings → Connected Applications*; one key + secret can be authorized across multiple client companies. Scopes seen in the wild: `companies:read`, `workers:read`. There is no self-serve sandbox; access is per-client approval, and the full endpoint reference sits behind a developer login. ([supergood API report card](https://supergood.ai/api-report-card/paychex-flex), [StackOne connector notes](https://docs.stackone.com/connectors/paychex))
- **Endpoints**: `GET /companies` (company ids), `GET /companies/{companyId}/workers` (offset/limit paging, max 100). Worker payloads carry `name.givenName / familyName`, job title, organization (department), communications (work email / phone), current status — exactly what Elevate needs, and nothing else is requested.
- **Implication for Plajah**: every church must authorize *our* Paychex app from their own Flex admin. That's fine for a handful of early churches; at scale, the per-client approval plus undocumented rate limits are why most products go through a unified API instead.

## 2. The "any payroll" answer — Finch unified API

Finch is a read (and limited write) layer over 250+ payroll / HRIS systems. One `GET https://api.tryfinch.com/employer/directory` call (Bearer token + `Finch-API-Version: 2020-09-17`) returns every individual with `first_name`, `last_name`, `department.name`, `manager`, `is_active`, paginated with `limit`/`offset` — the exact shape our `PayrollWorker` already uses. The customer connects their own payroll through Finch Connect (an OAuth-style popup) and grants the `directory` product; syncs refresh roughly every 24 hours. Paychex Flex is on Finch's compatible-provider lists. ([Finch Directory API](https://developer.tryfinch.com/api-reference/organization/directory), [Finch unified API](https://www.tryfinch.com/lp/unified-api), [Finch × Relius provider list incl. Paychex Flex](https://support.tryfinch.com/articles/7582517256), [Knit's evaluation of Finch](https://www.getknit.dev/blog/a-detailed-evaluation-of-finch-as-a-unified-hris-and-payroll-api))

**Why it fits**: one integration covers Paychex, ADP, Gusto, QuickBooks, Paylocity, Paycor, Rippling, BambooHR and the rest; the church authorizes from a popup instead of a Paychex admin console; and the data model maps 1:1 onto `PayrollWorker`. Pricing is per-connection and negotiated (developer sandbox is free).

### How the Finch path is wired (2026-10-17)

| Step | Where | Notes |
|---|---|---|
| Status | `GET /api/payroll/finch/status?orgId=` | `configured` (server keys present), `connected` (org has a token), `canConnect` (caller is owner/admin), provider name + granted products. For owners/admins when configured it also returns the public `clientId`, `redirectUri`, `requestedProducts` and `sandbox` so the client can build the Connect URL. The secret never leaves the server. |
| Connect | client `openFinchConnect()` → popup at `https://connect.tryfinch.com/authorize?client_id&redirect_uri&products=directory&state` | Finch redirects the popup to `GET /api/payroll/finch/callback`, a tiny page on **our** origin that `postMessage`s `{code, state}` to the opener and closes. The client checks origin + `state`, then `POST /api/payroll/finch/connect { orgId, code }`. |
| Token exchange | server `POST https://api.tryfinch.com/auth/token` `{ client_id, client_secret, code, redirect_uri }` | Response carries `access_token`, `provider_id`, `company_id`, `connection_id`, `products`. Token → `encryptSecret()` (same AES-256-GCM vault as fediverse / generation credentials, `ENCRYPTION_KEY`) → `payrollConnections/{orgId}` (no client rule = server-only). Org doc gets only metadata: `payroll.{provider:'finch', finchProvider, finchProviderName, finchCompanyId, finchConnectionId, finchProducts, connectedBy, connectedAt}`. |
| Pull | `POST /api/payroll/finch/workers { orgId }` → `GET /employer/directory?limit=100&offset=` (header `Finch-API-Version: 2020-09-17`), paged until `paging.count` | `individuals[].{id, first_name, last_name, department.name, is_active}` → `PayrollWorker{externalId, firstName, lastName, department, status: ACTIVE/INACTIVE}`. Email/phone stay empty (they live in Finch's `individual` product, bundled with SSN/DOB — not requested). Anyone passing `orgStaff()` (owner, admin, pastors, leaders) may pull. |
| Titles (optional) | `POST /employer/employment { requests: [{individual_id}] }` in chunks of 100 | Only when the granted products include `employment` (set `FINCH_PRODUCTS="directory employment"` before the org connects). The server copies **only** `title`, `employment.type/subtype` and `start_date` out of each response; the same payload carries `income`, which is never read, logged or stored. Default is `directory` only, so titles are empty and the role mapper defaults everyone to Staff — admins fix roles after import. |
| Disconnect | `POST /api/payroll/finch/disconnect { orgId }` | Owners/admins. Calls Finch `POST /disconnect` (best effort), deletes `payrollConnections/{orgId}`, strips the `finch*` fields from the org doc (falls back to `provider:'paychex'` if a Paychex company id is still bound). |
| Sync errors | 401 from Finch → HTTP 409 "reconnect"; 202 → 503 "still syncing, try again" | Finch returns 202 for the first ~minutes after a new connection while it ingests the provider; the UI shows the message and the user retries. |

Finch Connect must be told the redirect URI: in the Finch dashboard add `https://<your app origin>/api/payroll/finch/callback` (or whatever `FINCH_REDIRECT_URI` is set to). For local testing, `FINCH_SANDBOX=finch` uses Finch's own sandbox provider (sign in with any email, no real payroll needed); `FINCH_SANDBOX=provider` uses a real provider's sandbox account.

## 3. Could Plajah be a payroll front end (run payroll from the platform)?

Yes, but only as an **embedded payroll partner**, not by driving Paychex's UI:

- **Paychex Flex API** is read-mostly for partners; writes are restricted and there is no "run payroll" surface for third parties. Not a path to a Plajah-branded payroll.
- **Gusto Embedded Payroll** is built precisely for this: a partner platform (us) embeds Gusto's payroll, tax filing, payments and compliance behind its own UI via API, with Gusto holding the tax-agency relationships. Access starts with a developer account, but production keys and pricing come through Gusto's Partnerships team (monthly fee, quote-based; US only; launches are typically weeks-to-months once credentials are issued). ([Gusto Embedded FAQ](https://gusto.com/about/bd/gusto-embedded-payroll), [HR.software review](https://www.hr.software/reviews/gusto-embedded), [TechCrunch launch coverage](https://techcrunch.com/2021/06/30/2171608))
- **Check (checkhq.com)** is the other embedded-payroll infrastructure vendor with 80+ platform partners; same model — we own the front end, they run tax + money movement. ([CB Insights: Check vs Finch](https://www.cbinsights.com/compare/check-1-vs-finch-3))
- **ADP's** position is that embedded partners take on real implementation and support burden — worth reading as the counter-argument before committing. ([ADP on choosing an embedded payroll partner](https://www.adp.com/resources/articles-and-insights/articles/c/choosing-the-right-embedded-payroll-partner.aspx))

**What it would mean for Elevate**: a "Payroll" section in Finance Hub where Finance Director / Treasurer roles run pay for the staff seats we already hold (the same people the provisioning flow creates), with Gusto/Check handling filings and direct deposit. Churches that already pay through Paychex would **migrate** their payroll to the embedded provider — that migration (and the partner contract, money-transmission/KYB onboarding, and support load) is the real cost, not the code. Recommendation: ship the read-only directory sync (file today, Finch next), measure how many Elevate orgs ask for payroll itself, and only then open the Gusto Embedded / Check conversation.

## Env / setup

```
# Finch — any provider (recommended)
FINCH_CLIENT_ID=…          # Finch dashboard → Credentials
FINCH_CLIENT_SECRET=…
ENCRYPTION_KEY=…           # already required for fediverse / generation credentials; the Finch token is sealed with it
FINCH_REDIRECT_URI=https://plajah.app/api/payroll/finch/callback   # optional; defaults to VITE_APP_URL (or the request host) + /api/payroll/finch/callback. Must be registered in the Finch dashboard.
FINCH_PRODUCTS=directory   # optional; "directory employment" also pulls job titles (see the titles row above before enabling)
FINCH_SANDBOX=             # optional; "finch" or "provider" for test connections only
FINCH_API_BASE=https://api.tryfinch.com            # optional override
FINCH_CONNECT_URL=https://connect.tryfinch.com/authorize   # optional override

# Paychex Flex — direct (only if a church insists on bypassing Finch)
PAYCHEX_CLIENT_ID=…        # from the Paychex developer application
PAYCHEX_CLIENT_SECRET=…
PAYCHEX_API_BASE=https://api.paychex.com          # optional override
PAYCHEX_TOKEN_URL=https://api.paychex.com/auth/oauth/v2/token   # optional override
```
Without `FINCH_CLIENT_ID` / `FINCH_CLIENT_SECRET` the panel's "Connect payroll (any provider)" button reads *not configured* and the file export remains the only path. With them, in Elevate Ops → Accounts & Access → Import staff from payroll, an org owner/admin clicks **Connect payroll**, signs in to their provider in the Finch popup, and "Pull from {provider}" lights up for roster staff. The Paychex direct path works the same way as before (owner/admin enters the company id once) and is hidden while a Finch connection is active.

**Never requested, never stored**: compensation, pay statements, benefits, deductions, SSN, DOB, bank accounts. `FINCH_PRODUCTS` silently drops `individual`, `payment`, `pay_statement`, `benefits`, `deduction` if anyone adds them.
