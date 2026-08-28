# Marketing Suite — Local Reach & the Media‑Buying Hub (Build Spec)

**Status:** design‑only, nothing here is built in code yet. Scoped 2026‑08‑27.
**Owner surface:** the **Paid** half of the Marketing Kit (`components/MarketingKit.tsx`,
`components/AdPackageManager.tsx`).
**Companion artifacts:** strategy one‑pager and two interactive UI mockups (Local Reach
builder + Review & buy) — links in the `plajah-marketing-kit` memory.

This is the engineering half of the "full gauntlet": the campaign data model, the
`GeoRadiusPicker` component, and the `reachEstimateService` vendor fan‑out. It builds on
the already‑decided platform positions:

- **Two ad architectures.** *Model A — Manage (bring‑your‑own account)* for the walled
  gardens (Google/Bing/Meta), spend on the user's card, **0% Plajah fee**. *Model B — Buy
  (true on‑platform transaction)* for **billboards/DOOH, direct mail, and Plajah house
  inventory**, brokered at **~15%** (see `plajah-revenue-model`).
- **Lead with local reach, not the walled gardens** — billboards + direct mail share one
  map‑radius primitive, are easier to ship, and are the differentiator. Walled‑garden
  connectors come **last** (slowest approvals, least differentiated).
- **Plajah never holds funds** — Stripe Connect **Direct** (see `plajah-payments-direction`).

---

## 0. Roadmap this spec covers

| Wave | Scope | External API? |
|---|---|---|
| **W1** | **Campaign Hub** — the `campaign` model + the planning flow, `GeoRadiusPicker` against the density model | none |
| **W2** | **Local Reach** — wire `reachEstimateService` to Lob (direct mail) **first**, then Taradel (EDDM) + a DOOH partner | yes |
| W3 | Plajah Ad Market (house/brokered supply) | — |
| W4 | Walled‑garden BYO connectors (Google/Bing/Meta) | yes (slow) |

W1 ships with **zero** vendor dependencies — the picker and the whole flow run on the
density model. That's deliberate: build and demo the entire experience before a single
partner contract lands.

---

## 1. Data model

New Firestore collection `campaigns`. Scope‑aware — it **reuses `MarketingScope`** already
exported from `components/MarketingKit.tsx:19‑25`, so a business managing an org gets
org‑scoped campaigns with no new plumbing.

```ts
// services/marketing/campaignTypes.ts  (new)
import type { MarketingScope } from '../../components/MarketingKit';

export type CampaignObjective =
  | 'awareness' | 'traffic' | 'sales' | 'event' | 'membership';

export type CampaignStatus =
  | 'draft' | 'scheduled' | 'live' | 'paused' | 'completed' | 'failed';

export type AdChannel =
  | 'eddm' | 'direct_mail'            // Model B — physical
  | 'billboard_dooh'                  // Model B — screens
  | 'plajah_house'                    // Model B — native inventory
  | 'google' | 'bing' | 'meta' | 'tiktok'; // Model A — BYO

export type AdModel = 'buy' | 'manage';   // B vs A
export type AdVendor =
  | 'lob' | 'postgrid' | 'taradel'        // mail
  | 'adomni' | 'blip' | 'vistar'          // DOOH
  | 'plajah'                              // house
  | 'google' | 'bing' | 'meta' | null;

export interface GeoRadius {
  center: { lat: number; lng: number; label?: string }; // geocoded shop address
  radiusMi: number;                                      // 0.5–5
  mode: 'radius' | 'routes';        // 'routes' = user hand‑edited the route set
  routeIds?: string[];              // USPS carrier‑route ids, when mode==='routes'
}

export interface AudienceList {
  source: 'store_customers' | 'uploaded' | 'purchased';
  segmentId?: string;               // e.g. "bought in last 90d"
  count?: number;                   // resolved at build time
}

export interface Placement {
  channel: AdChannel;
  model: AdModel;
  vendor: AdVendor;
  vendorRef?: string;               // external order/campaign id, set on purchase
  status: 'estimated' | 'ordered' | 'live' | 'delivered' | 'failed';
  units?: number;                   // mailboxes | screens | recipients
  spend?: number;                   // actual, in cents
  metrics?: Record<string, number>; // impressions, scans, ctr…
}

export interface Campaign {
  id: string;
  scope: MarketingScope;            // ← REUSED, not re‑invented
  ownerId: string;                  // operator uid (matches StudioView ownerId stamp)
  authorOrgId?: string;             // set for BUSINESS/ORG — same field StudioView uses
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  schedule: { start: number; end: number };            // epoch ms
  budget: { totalCents: number; currency: 'usd'; pacing: 'even' | 'asap' };
  audience: { geo?: GeoRadius; list?: AudienceList };
  creatives: string[];              // AssetRef ids from the Content Asset Manager
  placements: Placement[];
  results?: { spendCents: number; impressions: number; reach: number;
              attributedRevenueCents?: number };
  createdAt: number; updatedAt: number;
}
```

### Firestore layout & the index trap

Store under the operator subtree, mirroring `scheduledPosts`:
`users/{ownerId}/campaigns/{campaignId}`, filtered in‑memory by `authorOrgId` for
BUSINESS/ORG (exactly the pattern `scheduledPostsService.listenToQueue(cb, ownerId?)`
already uses). **Do not** add a `where('authorOrgId','==',…) + orderBy('createdAt')` query —
that needs a composite index that fails silently if unbuilt (see `plajah-firestore-gotchas`).
Keep the single‑field `createdAt` order + in‑memory scope filter.

**Undefined‑field trap:** a Firestore write throws on any `undefined` value. `vendorRef`,
`segmentId`, `authorOrgId`, `results` are all optional — strip undefined keys before
`setDoc` (reuse the existing scrub helper, or write `''`/omit, per
`plajah-landing-redesign` "cleared slots write '' not undefined").

---

## 2. `GeoRadiusPicker` — the shared local primitive

One component powers billboards, EDDM, later geo‑digital, and eventually Terra. Build it
standalone so nothing re‑implements a radius map.

```tsx
// components/marketing/GeoRadiusPicker.tsx  (new)
export interface GeoReachEstimate {
  mailboxes: number; routes: number; screens: number;
  impressions: number; costLowCents: number; costHighCents: number;
  byChannel: Partial<Record<AdChannel, { units: number; costCents: number }>>;
  source: 'model' | 'live';         // density fallback vs real vendor counts
}

export interface GeoRadiusPickerProps {
  center: { lat: number; lng: number; label?: string };
  radiusMi: number;                          // controlled
  channels: AdChannel[];                      // which overlays + which estimates
  onChange: (geo: GeoRadius, est: GeoReachEstimate) => void;
  maxMi?: number;                             // default 5
  disabled?: boolean;
}
```

**Responsibilities**
1. Render a map centered on `center` with a draggable radius (slider + optional drag‑handle
   on the ring). Overlay carrier‑route cells (cyan) and DOOH screens (magenta) inside the
   radius — matching the mockup's semantic colors (cyan = spatial/live, magenta = screens,
   orange = the radius itself and the buy action).
2. On every radius change (debounced ~250ms) call `reachEstimateService.estimate()` and
   surface the returned `GeoReachEstimate` via `onChange`.
3. Own only the *geo* selection; budget/schedule/creative live in the parent Campaign Hub.

**Map rendering — CSP note.** Artifacts/OG contexts block external tiles, but the in‑app
component runs in the normal PWA, so a real basemap is fine. Recommended: **MapLibre GL +
a vector‑tile source** (no per‑tile API key lock‑in) or the basemap already used by
`plajah-terra`'s parcel map — **reuse Terra's map layer if one exists** rather than adding a
second mapping dependency. Carrier‑route polygons come from the estimate service
(§3); render them as a GeoJSON layer clipped to the radius. The mockups draw a stylized
canvas map only because artifacts can't load tiles — production uses the real basemap.

**Accessibility:** the radius control is a native `<input type="range">` skinned with
`.pj-range .pj-range--signal` (orange fill) so keyboard + screen‑reader + TV D‑pad work with
no extra JS (per the design system's range token).

---

## 3. `reachEstimateService` — vendor fan‑out

A single service the picker calls; internally a set of per‑channel adapters with a **density
model fallback** so W1 needs no vendor. Returns fast estimates for the UI and a firmer quote
at review time.

```ts
// services/marketing/reachEstimateService.ts  (new)
export interface EstimateRequest { geo: GeoRadius; channels: AdChannel[]; flightDays?: number; }

export async function estimate(req: EstimateRequest): Promise<GeoReachEstimate>;
```

**Adapter interface** (one per channel; each degrades to the model on error/no‑contract):

```ts
interface ChannelEstimator {
  channel: AdChannel;
  estimate(geo: GeoRadius, flightDays: number):
    Promise<{ units: number; costCents: number; extra?: Record<string, number>; source: 'model' | 'live' }>;
}
```

- **`eddmEstimator` (Taradel).** Live: query route counts + address counts for the radius,
  price = pieces × (postage + print). Model: `area = π·r²`; `mailboxes = area × DENSITY`
  (~1,850/sq·mi urban — make it a per‑market table later); `routes = mailboxes / ~540`;
  cost ≈ **$0.25/piece**.
- **`directMailEstimator` (Lob/PostGrid).** *List‑based*, not radius — units = resolved
  `AudienceList.count`; cost ≈ **$0.62/piece**. **Ship this adapter first** (Lob's API is the
  cleanest) even though EDDM is the star, because it de‑risks the whole print pipeline.
- **`doohEstimator` (Adomni/Blip/Vistar).** Live: screens available in radius + avg weekly
  impressions + rate. Model: `screens ≈ 4/sq·mi`; `impressions ≈ screens × 5,200/wk`; cost ≈
  **$180/screen/wk**.
- **`houseEstimator` (Plajah).** Native inventory from Plajah's own ad server — 100% Plajah,
  no external call.

**Fan‑out**: `Promise.allSettled` across the requested channels; a rejected adapter falls
back to its model result and marks `source:'model'` so the UI can badge "estimate". Sum into
`GeoReachEstimate`; `costLow/High` = ±10–15% band. **Debounce + cache** by
`(lat,lng,radiusMi,channels,flightDays)` — the slider fires continuously and vendor calls
cost money and latency.

**Two‑tier accuracy:** the picker uses fast estimates; **Review & buy** re‑quotes with
`{ firm: true }` to get a bookable price (DOOH availability shifts), which is why the mockup's
fine print reads "final DOOH price confirms against live availability."

---

## 4. Wiring into the Marketing Kit

`MarketingKit.tsx` renders `mode: 'ORGANIC' | 'PAID'`. Today PAID → `AdPackageManager`.

- Add a **New Campaign** flow reachable from the PAID surface. It's a stepper:
  **Objective → Creative → Local Reach → Budget → Review & buy** (the two mockups are steps 3
  and 5).
- Thread the existing `scope` prop straight through to the new `<CampaignBuilder scope=…>`;
  stamp `ownerId = operator uid` and `authorOrgId` for BUSINESS/ORG exactly as StudioView
  does — no `authorBusinessId` (businesses ride the org backbone).
- **Creative** step pulls `AssetRef`s from the Content Asset Manager (see
  `plajah-content-asset-manager`) — no re‑upload; edits in Pixels flow back.
- **Review & buy** builds one `Placement[]` from the estimate, shows per‑channel line items,
  the **Plajah service fee (~15%)** as its own visible row, and the Connect‑Direct payment
  method. On confirm: create each vendor order (Model B) / hand off to the connector
  (Model A), write `vendorRef` + `status:'ordered'` back onto each `Placement`.

### Fee & payments

- Model B: buyer pays **media & production + Plajah service fee (~15%)**; funds route to the
  vendor via **Connect Direct** (Plajah never custodies). The 15% is Plajah's brokered cut
  per `plajah-revenue-model`.
- Model A: **0% fee** — spend flows on the user's own connected ad account; Plajah only manages.

---

## 5. Honest limits / open before this is real

These are real gaps, not nice‑to‑haves — surfaced in the mockups' "reality checks":

1. **Per‑identity billing.** Paid purchases today run on the **operator's** connected payments
   (`AdPackageManager` reads `currentUser.uid`). Billing a managed org's *own* card needs a
   per‑identity payment method store — not built.
2. **Per‑identity channel credentials.** External accounts are keyed to the authed user only;
   there's no per‑identity credential vault. StudioView already shows an honest banner about
   this under BUSINESS/ORG — the Model‑A connectors inherit the same limit.
3. **Approval lead times.** Google dev‑token, Meta app review, and every DOOH/print partner
   onboarding take real calendar weeks. **File them the day W1 starts** — they gate W2/W4, not
   W1. W1 itself needs none.
4. **Model‑B compliance.** Placing physical/screen media brings ad‑content review and fraud
   liability onto Plajah. Scope a review/approval gate into the partner integration.
5. **Physical lead times in the UI.** Mail lands in ~5–8 business days vs. a DOOH flip in
   minutes. The builder/review must set that expectation (the mockup's "two speeds" note).
6. **Server cron & ad‑engine org awareness.** As with scheduled posts, any server publisher
   must learn to honor `authorOrgId`; `adAlgorithmService` scores `authorId==id` while org
   content stores `authorId=operator` — deeper org accuracy is a later pass.

---

## 6. Build order (suggested)

1. `campaignTypes.ts` + `campaignService.ts` (CRUD, operator‑subtree, in‑memory scope filter).
2. `reachEstimateService.ts` with **model‑only** adapters (no vendor). Unit‑test the density math.
3. `GeoRadiusPicker.tsx` on the real basemap (reuse Terra's if present) → wire to the service.
4. `CampaignBuilder` stepper in the PAID surface; Local Reach = step 3 (matches mockup).
5. Review & buy step; `Placement[]` assembly; visible fee row; Connect‑Direct method.
6. **Then** contract + swap in `directMailEstimator` (Lob) → `eddmEstimator` (Taradel) →
   `doohEstimator`. The UI never changes when `source` flips `model → live`.
