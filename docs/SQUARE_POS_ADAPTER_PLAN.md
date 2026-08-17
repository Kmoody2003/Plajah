# Square POS Adapter — Engineering Build Plan

**Status:** Design / not started · **Owner:** Kenne · **Created:** 2026-08-16
**Strategy context:** `Connect → Prove → Convert` (see memory `plajah-pos-integration-strategy` and the
"Plajah Counter Play" strategy artifact). This plan builds the **first** external-POS adapter — **Square** —
chosen because it has the most open API (self-serve OAuth, full read/write, webhooks) and is fully
**decoupled from payment processing**, so we can mirror a merchant's catalog/inventory/sales without touching
their money. It also proves the reusable **Connected-mode** framework every later adapter (Clover, Shopify,
Lightspeed, Toast) will plug into.

---

## 1. Goal & scope

A Square merchant connects their account to a Plajah Business in a few clicks. Plajah then:
1. **Imports their catalog** → creates/updates `storeProducts` (Plajah storefront goes live with their real menu).
2. **Mirrors inventory** in near-real-time via Square webhooks → stock stays single-sourced.
3. **Ingests completed sales** via Square webhooks → writes `storeOrders`, awards loyalty *post-sale* (lagged).
4. Runs in **Connected mode** (Square = system of record). The business keeps using Square exactly as-is.

**Out of scope for v1:** pushing Plajah-created orders *into* Square (order-ahead write-back), writing catalog
changes back to Square, and Square as a card-present tender inside `PosRegister`. These are v2 (see §11).

**Related platform decisions (2026-08-16 — apply to the Native-mode commerce spine, tracked separately):**
- **Charge model:** the commerce/POS spine (`create-order`, `pos-sale`, storefront) moves from **destination** charges to
  **direct** charges — the business is merchant-of-record, pays Stripe directly, and owns its own refunds/disputes.
  This shrinks Plajah's liability and dispute labor. Aggregated rails (creator tips, digital, cross-business
  marketplace) stay destination / separate charges-and-transfers. (Separate work item from this Square adapter,
  which is read-only and doesn't create charges, but the two ship into the same Business surface.)
- **Application fee:** **$0.** Plajah takes nothing per transaction; all margin comes from the subscription.
- **Pricing:** Founding-10 private beta free → 90-day free trial at open launch → $29.99/mo months 1–6 → $49.99/mo
  standard. Connected Companion (this adapter's mode) is always free.
- A **Disputes & Refunds module** (dispute webhooks + merchant dispute-inbox UI + reserve/clawback policy) is a
  separate spec, offered as Native-spine Phase 4.5 — not part of this read-only Square v1.

**Connected-account model — Standard vs Express (recommendation):**
Businesses receive money through a Stripe Connect account. The type matters for cost AND liability:

| | Standard | Express (current) |
|---|---|---|
| Connect fee to Plajah | **$0** | ~$2 / active account / mo |
| Owns refunds/disputes (direct charges) | The business | The business |
| Liable for **negative balances** | **The business** (Stripe pursues them) | **Plajah** (platform on the hook) |
| Onboarding UX | Stripe-hosted OAuth; business gets full Stripe Dashboard | Lighter, more embedded/branded; Plajah controls payout timing |
| Build state | Not built (new OAuth connect flow) | **Already built** — `POST /api/stripe/connect/onboard` mints Express (card_payments + transfers), writes `users/{uid}.stripeConnectAccountId` |

- **Target model = Standard.** Fullest expression of the "never in a bad place" goal: $0 fees, and the *merchant* —
  not Plajah — owns refunds, disputes, **and negative balances.** With direct charges, this is the cleanest
  possible liability posture and the strongest "Plajah never custodies funds" story.
- **For the Founding-10 pilot: don't block on it.** Express is already built and ~$2/account (~$20/mo for ten) is
  trivial. Run the pilot on existing Express onboarding, then migrate to Standard before scale, when the
  per-account fee and negative-balance liability start to matter (hundreds+ of accounts).
- **Only reason to stay on Express long-term:** you want embedded/branded onboarding and control over payout
  timing/reserves. But payout control edges toward *holding funds* — the money-transmission risk you're avoiding —
  so Standard fits Plajah's posture better.

**Non-negotiable invariants (from existing spine):**
- Plajah never holds funds. Square keeps processing; we only read data. No Stripe Connect changes.
- Inventory single-sources through `firestoreIncrement('storeProducts/{id}', {stock})` — the same atomic path
  `pos-sale` and the Stripe webhook already use (`server.ts`). The Square sync must NOT bypass it.
- Firestore server writer can't store object arrays → `storeOrders.items` stays a **JSON string**.
- `storeOrders` must carry BOTH `customerUid/businessUid` AND `buyerId/sellerId` mirror fields (rules gate on
  buyer/seller — omitting them silently breaks order tracking).
- **Never write `undefined` fields to Firestore** (throws). Map missing Square fields to `''`/omit.

---

## 2. Data model changes (`types.ts`)

```ts
// 2a. Extend the existing fulfillment union (types.ts:4522)
fulfillmentSource?: 'printful' | 'gelato' | 'manual' | 'external' | 'api'
  | 'square' | 'clover' | 'shopify' | 'lightspeed' | 'toast';
// Reuse existing StoreProduct fields — no new ones needed for catalog mirror:
//   fulfillmentProviderId  = the Square location id
//   fulfillmentExternalId  = Square catalog object id (item variation id)
//   externalStoreUrl       = optional Square online link

// 2b. New: per-business POS connection record  (collection: businesses/{businessUid}/posConnections/{provider})
export interface PosConnection {
  provider: 'square' | 'clover' | 'shopify' | 'lightspeed' | 'toast';
  businessUid: string;
  status: 'CONNECTED' | 'ERROR' | 'REVOKED' | 'SYNCING';
  mode: 'CONNECTED' | 'NATIVE';        // which system is source of truth
  externalMerchantId?: string;         // Square merchant_id
  externalLocationId?: string;         // primary Square location
  scopes?: string[];
  lastCatalogSyncAt?: number;
  lastOrderCursor?: string;            // for backfill paging
  webhookSignatureKey?: string;        // stored server-side only (see §4)
  productCount?: number;
  errorMessage?: string;
  connectedAt: number;
  updatedAt: number;
}
```

> **Token storage:** OAuth access/refresh tokens and the webhook signature key are **secrets** — do NOT put
> them on the client-readable `PosConnection` doc. Store them in a separate server-only doc
> `businesses/{businessUid}/posSecrets/{provider}` with a Firestore rule of `allow read, write: if false`
> (server writes via the admin REST path only, like existing Stripe secrets). Client reads the safe
> `posConnections` doc for UI state.

---

## 3. Square app setup (one-time, external)

- Create a Square application in the Square Developer Dashboard → get `SQUARE_APP_ID`, `SQUARE_APP_SECRET`.
- Configure OAuth redirect URL → `https://<plajah-api>/api/pos/square/oauth/callback`.
- Request scopes: `MERCHANT_PROFILE_READ`, `ITEMS_READ`, `INVENTORY_READ`, `ORDERS_READ`, `PAYMENTS_READ`,
  `CUSTOMERS_READ`. (All read-only for v1 — no `*_WRITE`, which keeps the review/permission surface minimal.)
- Subscribe to webhook events: `catalog.version.updated`, `inventory.count.updated`, `order.created`,
  `order.updated`, `payment.updated`. Webhook notification URL → `/api/pos/square/webhook`.
- Env vars (mirror the Printful/Gelato env pattern in `server.ts`): `SQUARE_APP_ID`, `SQUARE_APP_SECRET`,
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_API_BASE` (`https://connect.squareup.com`, sandbox
  `https://connect.squareupsandbox.com`).

---

## 4. Server: new module `posSquare` in `server.ts` (or `server/pos/square.ts`)

Follow the existing **Printful/Gelato proxy + Stripe webhook** patterns already in `server.ts`.

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/pos/square/oauth/start?businessUid=` | Build Square authorize URL (state = signed businessUid), redirect. |
| `GET`  | `/api/pos/square/oauth/callback` | Exchange `code` → tokens; fetch merchant + locations; write `posConnections` (safe) + `posSecrets` (tokens); kick off initial catalog import. |
| `POST` | `/api/pos/square/sync?businessUid=` | Manual re-sync (catalog + inventory reconcile). Business-authed (owner). |
| `POST` | `/api/pos/square/webhook` | **Raw body BEFORE `express.json()`** (mirror `/api/stripe/webhook` at `server.ts:1251`). Verify `x-square-hmacsha256-signature` against `SQUARE_WEBHOOK_SIGNATURE_KEY` + notification URL. Idempotent. |
| `POST` | `/api/pos/square/disconnect?businessUid=` | Revoke token via Square, set `status:'REVOKED'`, stop syncing. |

**Webhook handler routing (idempotent, at-least-once → dedupe on Square `event_id`):**
- `catalog.version.updated` → enqueue incremental catalog re-pull for that merchant.
- `inventory.count.updated` → for each affected variation, look up the mapped `storeProducts` doc by
  `fulfillmentExternalId` and **set** stock (absolute, not delta — Square gives the new count) via a
  reconcile write that routes through the same stock field the rest of the app reads.
- `order.created` / `order.updated` (state `COMPLETED`) / `payment.updated` (status `COMPLETED`) →
  upsert a `storeOrders` doc (see §6). Guard against double-count using Square order id as the doc key suffix
  (`sq_<orderId>`), so replays are idempotent.

---

## 5. Catalog import — Square Catalog → `StoreProduct`

New mapper alongside the existing `merchToStoreProduct` / `migrateMerchItem` (`storeService.ts:93/140`):

```
squareCatalogToStoreProduct(sqItem, sqVariation, location, sellerId, sellerName) → StoreProduct
```

Mapping (Square `CatalogObject` of type `ITEM` + its `ITEM_VARIATION`s):
- `title`        ← item `name`
- `description`  ← item `description_plaintext` (fallback `''`)
- `price`        ← variation `price_money.amount` / 100 (Square = cents → Plajah `StoreProduct.price` is **dollars**)
- `images[]`     ← resolved `image_ids` → Square image URLs (fallback `[]`)
- `variants[]`   ← each `ITEM_VARIATION` → `StoreProductVariant{ id, name, sku, stock, priceModifier }`
- `stock`        ← sum of variation inventory counts at the connected location
- `category`     ← map Square category → nearest `StoreProductCategory` (default a safe fallback)
- `sellerId`     ← businessUid, `sellerType:'ORG'`, `sellerName` ← org name
- `isActive`     ← `!is_deleted && present_at_location`
- `fulfillmentSource:'square'`, `fulfillmentProviderId: locationId`, `fulfillmentExternalId: variationId`

**Upsert rule:** key Plajah products by `(businessUid, fulfillmentExternalId)`. On re-sync, update existing
(`updateProduct`) rather than duplicating; deactivate (`isActive:false`) items removed/deleted in Square.
Use `createProduct` (`storeService.ts:11`) for new. **Server-side writes** must strip `undefined` and store any
array-of-objects safely (variants are simple enough for Firestore, but confirm no nested `undefined`).

**Backfill:** paginate Square `SearchCatalogObjects` / `ListCatalog` with cursor; store progress; rate-limit
politely. Inventory counts pulled via `BatchRetrieveInventoryCounts` for the location.

---

## 6. Order ingest — Square Order → `storeOrders`

On a completed Square order/payment webhook, write a `storeOrders/{sq_<orderId>}` doc in the exact
`StoreOrderRecord` shape (`businessOpsService.ts:13`):

```
{
  businessUid, customerUid: <mapped Plajah uid or ''>,      // Square customer → Plajah if resolvable
  buyerId: <same as customerUid or 'guest'>, sellerId: businessUid,   // MIRROR FIELDS — required
  status: 'COMPLETED',
  source: 'SQUARE',
  items: JSON.stringify([{ productId, title, qty, unitAmount, variantName }]),  // JSON STRING
  subtotalCents, tender: 'SQUARE',
  createdAt, paidAt
}
```

- **Do NOT decrement stock from the order webhook** — Square already decremented, and the
  `inventory.count.updated` webhook is the single source for stock. Decrementing here would double-count.
- **Loyalty (post-sale, lagged):** if the Square order maps to a known Plajah customer, award loyalty via the
  existing net-increment path (`LOYALTY_PTS_PER_DOLLAR`) to `businesses/{b}/loyalty/{customerUid}`. If no
  mapped customer, skip (this is the documented Connected-mode degradation — earn works, redeem-at-register
  does not).

---

## 7. Client service `services/posConnectService.ts` (new)

Thin client layer (mirror `businessOpsService` style):
- `startSquareConnect(businessUid)` → `window.location = /api/pos/square/oauth/start?...`
- `fetchPosConnection(businessUid, provider)` → read `posConnections/{provider}` doc.
- `triggerSync(businessUid, provider)` → POST `/api/pos/square/sync`.
- `disconnect(businessUid, provider)` → POST `/api/pos/square/disconnect`.
- `listenPosConnection(...)` → live status for the UI (SYNCING → CONNECTED).

---

## 8. UI surfaces

- **Business Dashboard → Settings (or a new "Integrations" tab):** `PosIntegrationsPanel.tsx` (new) — a card per
  provider. Square card: "Connect Square" button → OAuth; once connected shows status chip, merchant name,
  location, product count, last-sync time, "Re-sync" and "Disconnect". Show the **Connected-mode feature
  banner**: what's live (storefront, discovery, in-store live) and what's greyed until Native (loyalty-redeem,
  deals-at-register) — literally the Part-B degradation table as an inline explainer + upgrade CTA.
- **`InventoryManager` / `StoreProductManager`:** for `fulfillmentSource:'square'` products, show a "Synced from
  Square" chip and make stock/price **read-only** (source of truth is Square), with a tooltip. Prevents the
  owner from editing a field that the next sync will overwrite.
- **Mode toggle:** a "Switch to Plajah register (Native)" CTA on the connection card → begins the Convert flow
  (v2 wires the actual cutover; v1 just captures intent + shows the pitch).

---

## 9. Firestore rules (`firestore.rules`) — NEEDS DEPLOY

```
match /businesses/{b}/posConnections/{provider} {
  allow read: if isOrgAdmin(b) || isOwner(b);   // owner/admin only — not public
  allow write: if false;                         // server-only writer
}
match /businesses/{b}/posSecrets/{provider} {
  allow read, write: if false;                   // server admin path only, never client
}
```
Reuse the existing owner/admin helper used by `businesses/{b}/staff|offers|loyalty`. `storeProducts` and
`storeOrders` rules already exist (public-read products, buyer/seller-gated orders) — no change.

---

## 10. Phased tickets (ship + review between phases)

**Phase 0 — Foundations (no external calls)**
- [ ] Extend `fulfillmentSource` union; add `PosConnection` interface (`types.ts`).
- [ ] Add Firestore rules for `posConnections` + `posSecrets`; deploy.
- [ ] `posConnectService.ts` stub + `PosIntegrationsPanel.tsx` shell (shows "Connect Square", disabled).
- **Accept:** dashboard shows an Integrations panel; tsc-clean on touched files.

**Phase 1 — OAuth connect**
- [ ] Square app + env vars wired; `/oauth/start` + `/oauth/callback`; token + secret storage.
- [ ] On callback: fetch merchant + locations, write `posConnections` (status `CONNECTED`).
- **Accept:** a sandbox Square account connects end-to-end; connection card shows merchant name + location.

**Phase 2 — Catalog import**
- [ ] `squareCatalogToStoreProduct` mapper + paginated backfill on connect; upsert by `fulfillmentExternalId`.
- [ ] "Re-sync" button; deactivate removed items.
- **Accept:** connecting a sandbox catalog populates the Plajah storefront with matching products/prices/images;
  re-sync is idempotent (no dupes).

**Phase 3 — Inventory webhook**
- [ ] `/webhook` with signature verify (raw body) + `inventory.count.updated` → reconcile stock.
- **Accept:** changing stock in Square reflects in Plajah within seconds; number matches; no double-writes.

**Phase 4 — Order ingest + lagged loyalty**
- [ ] `order.*` / `payment.updated` → write `storeOrders` (JSON items, buyer/seller mirror, `source:'SQUARE'`).
- [ ] Post-sale loyalty award for mapped customers.
- **Accept:** a completed Square sale appears in the business's Plajah orders; loyalty accrues for a matched
  Plajah customer; stock is NOT double-decremented.

**Phase 5 — Polish + Connected-mode UX**
- [ ] Read-only chips on synced products; degradation/upgrade banner; disconnect + revoke; error states.
- **Accept:** owner can't edit synced price/stock; disconnect cleanly revokes and stops sync.

---

## 11. v2 backlog (after Square Connected mode proves out)
- Order write-back (order-ahead → Square) via Orders API `CREATE`.
- Square as card-present tender inside `PosRegister` (branch in `posPeripherals.canCollectCard`).
- The **Convert** cutover flow: migrate a Connected business to Native (Plajah register + Stripe Connect),
  ETF-buyout credit accounting, re-point `fulfillmentSource` → `manual`.
- Generalize `posSquare` into a `PosAdapter` interface so Clover/Shopify/Lightspeed drop in (Wave 2/3).

---

## 12. Plajah-specific gotchas (do not relearn the hard way)
- `tsc --noEmit` OOMs at default heap → `NODE_OPTIONS=--max-old-space-size=8192`; ~35–54 pre-existing errors are
  baseline (see memory `plajah-build-no-typecheck`). Vite build skips typecheck.
- Firestore: `where + orderBy` needs a composite index and **fails silently** — sort client-side or create the
  index. `undefined` field writes **throw**.
- Webhook raw-body ordering: the Square webhook route MUST be registered before `express.json()`, same as the
  Stripe webhook, or signature verification breaks.
- Square money is **cents**; `StoreProduct.price` is **dollars**; `storeOrders` amounts are **cents**. Convert
  carefully at each boundary.
- PWA/SW can serve stale bundles in dev — hard-refresh after deploy (see memory `plajah-pwa-dev-shadowing`).

---

## 13. Verification
- Square **Sandbox** account for all phases (seed a catalog + inventory + a test sale).
- Webhook signature: use Square's webhook test events; confirm HMAC verify rejects a tampered body.
- Idempotency: replay the same webhook event twice → exactly one `storeOrders` doc, stock counted once.
- Deploy path: `/api/pos/square/*` ships via CI → Cloud Run; verify live before demoing (see memory
  `plajah-ci-deploy`).
