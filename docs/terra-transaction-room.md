# Terra Transaction Room — by-owner sale spec

Status: draft, 2026-11-25. Nothing built yet. Michigan / Detroit first (Terra's scope is Detroit-only; see `services/terra/terraTypes.ts`).

> Not legal advice. Sections marked **ATTORNEY GATE** must be signed off by a Michigan real estate attorney before launch.

## 1. Goal and the line we don't cross

A homeowner sells their own property (FSBO) or a buyer and seller who already found each other close a direct sale, entirely on Plajah, and the result is a deed the Wayne County Register of Deeds records like any other.

**Plajah coordinates. Licensed parties perform the legally operative acts.**

| Plajah does | A licensed partner does | The person does |
|---|---|---|
| Listing, offers, documents, deadlines, checklists, explanations, audit trail | Title search sign-off + title insurance, escrow of all money, remote online notarization (RON), e-recording, settlement statement, 1099-S, FIRPTA | Signs, pays, makes every decision, submits filings that must come from them (PTA, PRE, permits) |

Hard rules:

1. **No held money** (owner's rule, and money-transmitter law). Earnest money, closing funds and seller proceeds move between the parties and the title/escrow partner only. No smart contract, wallet, or Plajah Stripe balance ever holds them.
2. **Flat fees only** for real estate. A fee tied to price or to a closed sale risks being "acting as a broker" under MCL 339.2501. The platform 5% direct-sales fee never applies to a property sale. **ATTORNEY GATE.**
3. **The recorded deed is the legal record.** Michigan is a race-notice state; priority comes from recording at the county. The on-platform chain is a mirror and audit trail, never "the title."
4. **Templates, not legal advice.** Deed and purchase-agreement drafting uses attorney-approved templates filled from the parties' own answers, with a one-click "attorney review" option. **ATTORNEY GATE** (unauthorized practice of law).

## 2. Parties and roles

| Role | Who | Can |
|---|---|---|
| `seller` | Owner(s) of record (all titleholders, plus spouse where dower/homestead rules require) | Edit listing, accept/counter, sign, upload disclosures |
| `buyer` | Offeror(s) | Make/counter offers, sign, upload proof of funds / pre-approval |
| `title` | Partner title agency (licensed by DIFS) | Post commitment, settlement statement, wire instructions, close |
| `lender` | Buyer's lender | Post approval/conditions, Closing Disclosure date |
| `attorney` | Optional, either side | Read all, comment, approve documents |
| `inspector` / `appraiser` | Invited per task | Upload report to one slot |
| `notary` | RON partner | Session link, notarial certificate |

Every person in a room is bound to a **Plajah ID** (`services/plajahId`, PJ-…), not an email. Sellers must pass owner-of-record verification (§6) before a listing can go Active.

## 3. Lifecycle (the state machine)

```
draft ─► verified ─► listed ─► offer_received ─► under_contract
                                        ▲               │
                                   counter/reject       ▼
                                                 contingencies
                                     (disclosure, inspection, financing, appraisal, title)
                                                        │ all cleared or waived
                                                        ▼
                                                  clear_to_close ─► signing ─► funded ─► recorded ─► post_close ─► closed
       any state ──► terminated (with reason + deposit disposition instruction to title)
```

Listing status stays in sync with the existing RESO statuses in `services/terra/olr.ts`:
`listed` → `Active`, `under_contract` → `ActiveUnderContract`, `clear_to_close` → `Pending`, `recorded` → `Closed`, `terminated` → back to `Active` or `Withdrawn`.

Each transition is an **event** (see §4). Transitions are server-checked: required documents present, required signatures present, deadline not passed. The client can only request a transition.

### Deadlines the engine enforces (Michigan defaults, editable per contract)

| Clock | Default | Source |
|---|---|---|
| Offer expiration | Set by offeror | Purchase agreement |
| Seller Disclosure Statement termination right | 72 h after in-person delivery, 120 h after mail, if delivered after the offer | MCL 565.954 |
| Lead-based paint inspection opportunity (pre-1978) | 10 days unless waived | 42 USC 4852d / 24 CFR 35 |
| Inspection contingency | 10 days | Purchase agreement |
| Financing commitment | 21–30 days | Purchase agreement |
| Closing Disclosure to buyer (financed) | ≥ 3 business days before signing | TRID, 12 CFR 1026.19 |
| Property Transfer Affidavit (buyer) | 45 days after transfer | MCL 211.27a |
| Mortgage discharge recorded by seller's lender | 28 days after payoff | MCL 565.44 |

## 4. Data model

All transaction data is **server-only** (no `firestore.rules` match = default deny; rules have no headroom, see the rules-size note). Reads/writes go through `/api/terra/tx/*` with the service account, like `services/terra/terraServerWrite.ts` and Plajah ID.

```
terraTx/{txId}
  parcelId            "detroit:<parcelNumber>"   — join to terraParcels
  listingKey?         terraListings/{key}
  state               TxState (§3)
  jurisdiction        "detroit"
  parties             { [pjId]: { role, uid, verifiedAt?, displayName } }
  terms               current accepted terms (price, deposit, contingencies, closing date, inclusions)
  deadlines           [{ kind, dueAt, satisfiedAt?, waivedAt?, waivedBy? }]
  partners            { title?: partnerRef, ron?: partnerRef, erecord?: partnerRef }
  head                { eventSeq, eventHash }    — tip of the hash chain
  recording?          { liber, page, instrumentNo, recordedAt, county }
  createdAt, updatedAt

terraTx/{txId}/events/{seq}        append-only, hash-chained
  seq, type, actorPjId, at, payload, prevHash, hash   (SHA-256 over canonical JSON, same canonicalize() as olr.ts)

terraTx/{txId}/offers/{offerId}
  fromPjId, version, terms, status (open|countered|accepted|rejected|expired|withdrawn), expiresAt, docId

terraTx/{txId}/docs/{docId}
  kind (DocKind below), version, storagePath, sha256, uploadedBy, signatures[{pjId, method, at, sha256AtSign}],
  visibility (all | sellerSide | buyerSide | title)

terraTx/{txId}/tasks/{taskId}      checklist items, owner role, status, due, linked doc kind
```

`DocKind`: `seller_disclosure`, `lead_paint_disclosure`, `purchase_agreement`, `counter_offer`, `addendum`, `proof_of_funds`, `preapproval`, `inspection_report`, `appraisal`, `title_commitment`, `survey`, `payoff_letter`, `water_final_read`, `tax_certification`, `settlement_statement`, `closing_disclosure`, `deed_draft`, `deed_recorded`, `transfer_tax_valuation` (L-4258), `pta_2766`, `pre_2368`, `pre_rescind_2602`, `permit_record`, `other`.

Files live in Firebase Storage (default storage, not B2) under `terraTx/{txId}/…`, signed-URL access only, scoped by `visibility`.

Event types (non-exhaustive): `tx.created`, `party.joined`, `party.verified`, `listing.published`, `offer.made`, `offer.countered`, `offer.accepted`, `doc.uploaded`, `doc.signed`, `deadline.set`, `deadline.satisfied`, `deadline.waived`, `deadline.missed`, `contingency.cleared`, `partner.ordered`, `partner.update`, `funds.confirmed_by_title`, `deed.recorded`, `tx.terminated`, `tx.closed`.

### "Smart contract" = this event chain

- Every event's hash includes the previous hash, so any rewrite is detectable — the same pattern as Plajah ID history and the OLR content hash.
- Signatures record `sha256AtSign`: a signature binds to exact bytes; a new document version needs new signatures.
- Optional later: anchor `head.eventHash` to a public chain or a timestamping authority at key moments (accepted, recorded). Anchoring only; no value on-chain.

## 5. Agent work (what Aria does inside the room)

Agents propose; a person confirms. Nothing is signed, sent, filed or paid by an agent.

| Step | Agent does | Inputs already in Terra |
|---|---|---|
| Price | Comparable sales + assessed value range, with vintages | parcel roll, sale data, OLR listings |
| Listing | Draft remarks; Fair Housing language check; photos/film via `ListingFilm` | parcel structure fields |
| Seller disclosure | Prefill what records show (year built, permits, blight tickets, lead service line, flood zone); seller answers the rest | `terraCivic`, infra layers, site context |
| Lead paint | Required flag when `yearBuilt < 1978`; generate the federal disclosure + pamphlet link | parcel |
| Offers | Compare offers side by side (net to seller, contingencies, financing risk); draft counter from the seller's words | offers |
| Deadlines | Calendar + reminders; warn 48 h and 24 h before | deadlines |
| Title prep | Pull chain from Register of Deeds index, open liens, Wayne County Treasurer tax status, Land Bank deed restrictions; explain each commitment exception in plain words | ROD search, treasurer, Terra parcel |
| Survey / legal description | Reconcile deed legal description with the parcel roll and the COGO engine; flag misclosure and encroachment | `services/terra/survey/*` |
| Deed draft | Fill the template (warranty / covenant / quit-claim) from the legal description and party names; check MCL 565.201 format (margins, typed names, preparer, return address, tax-bill address) | survey engine |
| Transfer tax | Compute state ($3.75/$500) and county ($0.55/$500); flag exemptions (MCL 207.505/207.526) and whether L-4258 is needed | price |
| Pre-close | Checklist: DWSD final read, tax proration, payoff request, HOA, utilities, keys | — |
| Post-close | PTA 2766 and PRE 2368 prefilled for the buyer to file; listing → Closed; parcel ownership note pending next roll | recording |

## 6. Seller verification (deed-fraud guard)

Before `listed`:

1. Plajah ID identity verification (government ID + selfie liveness via a KYC partner; Plajah never stores the ID images itself beyond what the partner returns).
2. Name match against owner of record on the parcel roll **and** the last vesting deed at the Register of Deeds (handles roll lag, trusts, LLCs, estates).
3. Entity / estate sellers: upload authority (operating agreement + resolution, letters of authority from probate, trust certification).
4. Vacant land or out-of-state owner → extra friction: mailed code to the tax-bill address.
5. Mismatch → listing blocked, never "warn and continue."

## 7. Partner integrations

| Need | Partner type | Contract with |
|---|---|---|
| Title search, commitment, policy, escrow, settlement, 1099-S, FIRPTA | Michigan-licensed title agency with API | Per-transaction, paid by the parties at closing |
| RON | State-approved RON platform | Per session |
| E-recording | Approved e-recording submitter for the county | Per document |
| Wire verification | Wire-fraud verification service | Per closing |
| KYC | Identity verification provider | Per check |
| Mortgage | Buyer's own lender (Plajah verifies pre-approval only) | — |

Wire instructions are shown **only** from the title partner's verified channel, never from an uploaded document or chat message.

## 8. Money flow (no held money)

```
buyer ──EMD──► title escrow
buyer ──closing funds──► title escrow ──payoff──► seller's lender
                                   ──taxes/fees──► county / state
                                   ──proceeds──► seller
buyer/seller ──flat Plajah fee──► Plajah (separate Stripe charge, never netted from escrow)
```

Plajah only records `funds.confirmed_by_title` events reported by the partner.

## 9. Out of scope for v1

- Seller financing / land contracts (Detroit history of abuse; Dodd-Frank + SAFE Act originator rules). v2 with mandatory attorney review and a recorded memorandum.
- Commercial, multi-unit > 4, new construction, short sales, probate sales without letters of authority.
- Anything outside Wayne County.

## 10. Permit Binder (Detroit permits and applications)

Same room pattern, different checklist. Plajah **hosts the files and the checklist; the person submits on the government portal under their own account.**

- `terraPermits/{binderId}`: parcelId, permit kind, required-document checklist, uploaded files (sha256, versions), status the person reports ("submitted", "permit #…", "approved"), links.
- Agents: tell the person which permit(s) a project needs from zoning + project description (Law Library + site context), pre-check the document list, fill what can be filled, produce a ready-to-upload packet (PDF set named the way the portal expects).
- Link-out: each permit kind maps to the official portal URL (deep link where the portal supports it, landing page otherwise). We never submit, never store their portal password, never scrape behind their login.
- A sale room links the parcel's permit binders, so open permits surface in the seller disclosure and title prep.

Portal map (checked 2026-11-25; no portal has a public submission API, so link-out only):

| Need | Portal | Link depth | Their login |
|---|---|---|---|
| Building / trades / demolition permits, fee estimate, inspections | eLAPS (Accela) `https://aca-prod.accela.com/DETROIT/` (old aca3 URL 301s here), Permits module | Module | Yes (contractor licence linked for trades) |
| BZA variance, special land use | eLAPS Planning module (`Cap/CapType.aspx?module=Planning…`) + detroitmi.gov BZA forms | Module / form page | Yes |
| Rental registration + Certificate of Compliance | eLAPS CodeEnforcement module | Module | Yes |
| Right of way, sidewalk, curb cut | DPW OpenGov `https://detroitmi.portal.opengov.com/` | Portal | Yes |
| Historic District Commission work approval | Survey123 `https://survey123.arcgis.com/share/85d6776aab374408807f42ffd2141baf` | Form | No |
| DWSD water/sewer connection plans | Smartsheet `https://app.smartsheet.com/b/form/400115edde9d41c48dfc22e090da0c50` | Form | No |
| DWSD real-estate closing bill (final read) | Smartsheet `https://app.smartsheet.com/b/form/983b7b41846a40258964182fd7caee3c` | Form | No |
| Land Bank purchase / side lot | buildingdetroit.org | Program page | Yes |
| Delinquent tax | `https://pta.waynecounty.com/` | Search | No |
| Deed records | `wayne.mi.publicsearch.us` (Kofile, since 2025-08-18) | Search | Optional, pay per session |

Read-only permit history for the passport is already open on data.detroitmi.gov (`services2.arcgis.com/qvkbeam7Wirps6zC/...`): `bseed_building_permits`, `bseed_trades_permits`, `bseed_demolition_permits`, `bseed_building_permit_plan_reviews`, `bseed_occupancy_certificates`, `detroit_right_of_way_permits`, `dlba_project_sales`.

## 11. Jurisdiction expansion

Terra is Detroit-only because zoning rules are hand-encoded per jurisdiction. Parcels alone (geometry, owner, value) are much cheaper to add than zoning. Plan: add parcel-only jurisdictions first (search, passport, listings, transaction room), zoning per jurisdiction later.

Michigan has **no open statewide parcel layer** (DTMB keeps one internally and points to counties). Checked live 2026-11-25:

| Jurisdiction | REST endpoint | Records | Owner / value / sale | Terms |
|---|---|---|---|---|
| Detroit (current) | `services2.arcgis.com/qvkbeam7Wirps6zC/.../parcel_file_current/FeatureServer/0` | 377,940 | Y / Y / Y | in use |
| Oakland Co. | `gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1` | 490,819 | Y / Y / N | as-is terms, no non-commercial clause |
| Macomb Co. | `services6.arcgis.com/K0qS4r8AEJxrE8em/.../Macomb_County_Parcel_Data/FeatureServer/10` | 332,993 | Y / Y / N | blank licence → ask |
| Kent Co. | open layer now token-only; `gis.kentcountymi.gov/agisprod/rest/services/ParcelsPublicView/FeatureServer/0` | 232,246 | N / Y / N | app layer, ask |
| Ottawa Co. | `gis.miottawa.org/arcgis/rest/services/HostedServices/ParcelsPublic/FeatureServer/0` | 115,316 | Y / Y / N | "for public applications", export free |
| Ingham Co. | `services3.arcgis.com/ySzhFSJfYeginRjx/.../Ingham_County_Parcels_2025/FeatureServer/0` | 101,873 | Y / Y / N | blank → ask |
| Kalamazoo Co. | `services3.arcgis.com/RGltUbqpl4h9E3Qh/.../Parcels_2025/FeatureServer/0` | 100,505 | Y / Y / N | blank → ask |
| Saginaw Co. | `services3.arcgis.com/CmHnqlf5e6ltOCrY/.../County_Parcels/FeatureServer/0` | 97,157 | Y / Y / Y | blank → ask |
| Muskegon Co. | `maps.muskegoncountygis.com/arcgis/rest/services/Layers/Parcels_Base/MapServer/28` | 84,816 | Y / Y / N | unknown → ask |
| Allegan Co. | `services7.arcgis.com/abcn8A25PPQFVHHF/.../Parcels/FeatureServer/4` | 67,988 | Y / Y / N | blank → ask |
| Eaton Co. | `services2.arcgis.com/c9l1e4fKpsCnqD7H/.../Parcels_AGO/FeatureServer/0` | 46,450 | Y / Y / N | © only → ask |
| Ann Arbor | `a2maps.a2gov.org/a2arcgis/rest/services/AVLDynamic/MapServer/3` | 32,001 | Y / Y / Y | © city → ask |
| Grand Traverse Co. | `gis.gtcountymi.gov/arcgis/rest/services/Public_Services/Tax_Parcel_Public/MapServer/0` | 56,797 | Y / Y / Y | county sells data → permission |
| Genesee Co. | `services2.arcgis.com/PrYwGqAi1wKjoFb1/.../Parcels2025County/FeatureServer/0` | 189,790 | Y / Y / N | **no redistribution** |
| Lansing | `services1.arcgis.com/pNPbgWy7hpfFGWoZ/.../CityParcels_2026/FeatureServer/1` | 42,987 | N / N / N | **CC BY-NC** |

No open REST: Wayne Co. outside Detroit (2015 shapefile only), Washtenaw, Livingston, Jackson, Berrien, Monroe, St. Clair, Bay, Marquette. Fallbacks: local assessors, records requests, or Regrid (~$12k/yr Michigan, per end user, not sublicensable). Layer names roll yearly, so resolve via each hub rather than hard-coding. Owner names are personal data; set display/retention rules.

E-recording: Oakland ROD accepts CSC, ePN, Simplifile, HopDox. Wayne ROD's page lists only in-person and mail — confirm before picking a partner.

## 12. Build order

1. `terraTx` model, event chain, server routes, role checks, deadline engine (no partners; manual uploads).
2. Seller verification (§6).
3. Seller Disclosure + lead-paint flows, prefilled from Terra.
4. Offer / counter / accept on attorney-approved purchase agreement.
5. Title partner integration (order, commitment, settlement, escrow status).
6. Deed builder + transfer tax + RON + e-recording.
7. Post-close filings and listing/parcel sync.
8. Permit Binder.

## 13. Open decisions

- Which title agency partner (and does it cover RON + e-recording itself)?
- Flat fee amount and who pays it.
- Purchase agreement source: commission an attorney-drafted FSBO form vs license an existing one.
- KYC vendor.
- Whether to anchor event-chain heads publicly in v1.
