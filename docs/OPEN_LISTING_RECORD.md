# Open Listing Record (OLR) — v0.1.0

An open, mirrorable format for property listings, published by **Plajah Terra**.

**Feed:** `GET /api/terra/olr`
**Descriptor:** `GET /api/terra/olr-schema`
**Single record:** `GET /api/terra/olr/{ListingKey}`
**Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

---

## Why this exists

Property data is fragmented across systems that don't interoperate by design. The
public record covers every parcel; listing databases cover the small fraction
actively for sale, behind membership and syndication agreements. Anyone wanting to
build something new has to negotiate access market by market.

OLR is the smallest useful thing that changes that: **a documented format plus a
public feed anyone may mirror.**

### The core design decision

**OLR is not a competing standard.** Field names follow the **RESO Data
Dictionary** — the vocabulary the real-estate industry already standardised on.
That gives two properties worth more than novelty:

1. An MLS feed maps into OLR **almost by identity**. No translation layer, no
   semantic drift.
2. Anything that already speaks RESO can consume an OLR feed **unmodified**.

We are not inventing a vocabulary. We are publishing the industry's own vocabulary
in a form that can be mirrored, and adding the provenance the original lacks.

Terra-specific fields use the `X_Terra_` prefix — RESO's documented convention for
local extensions, which conformant consumers ignore rather than reject.

---

## What OLR adds to RESO

| Addition | Why |
|---|---|
| `X_Terra_Sources[]` | Per-record provenance: where each fact came from, when the **source** last updated it, when **we** retrieved it, and whether the value was **observed or estimated**. |
| `X_Terra_ContentHash` | SHA-256 over the canonical record. Makes tampering detectable and revisions provable. |
| `X_Terra_Revision` | Monotonic. A changed record publishes a new revision; it never silently mutates. |
| `X_Terra_ParcelId` | Joins the listing to the public parcel spine — the link that lets a listing sit on top of the full property record. |
| Open licence | The format and the feed are CC BY 4.0. Mirroring is expected, not tolerated. |

### The provenance rule

**No fact renders without its vintage.** Some sources update daily; others are
frozen artefacts years old. Both are useful. Conflating them is not.

Every `OlrSource` therefore carries `retrievedAt`, an optional `sourceUpdatedAt`,
and an `observed` flag (`observed` / `estimated` / `interpolated` / `unknown`).
Consumers are expected to surface this. Traffic counts, for instance, routinely
carry a source year decades old and are frequently interpolated rather than
measured — rendering such a number bare is misinformation by omission.

### What the hash does and does not prove

`X_Terra_ContentHash` is a real SHA-256 over the canonicalised record. It proves
**integrity**: an altered listing is detectable, and a revision chain is verifiable
against published hashes.

It does **not** prove *when* the record existed. That requires an external
timestamp authority, and is deliberately deferred. **Do not describe OLR records as
"blockchain-verified" or "timestamped."** They are fingerprinted and versioned.

---

## Feed format

```jsonc
{
  "olrVersion": "0.1.0",
  "resoDataDictionary": "1.7",
  "license": "CC-BY-4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "attribution": [ "..." ],          // strings the consumer MUST render
  "generatedAt": "2026-07-30T18:00:00.000Z",
  "count": 200,
  "nextSince": "2026-07-30T17:58:12.000Z",
  "value": [ /* OpenListingRecord[] */ ]
}
```

### Paging

RESO-style replication on `ModificationTimestamp`:

1. `GET /api/terra/olr`
2. Take `nextSince` from the response.
3. `GET /api/terra/olr?since=<nextSince>`
4. Repeat until `count` is 0.

`limit` defaults to 200, max 500. Records are ordered by `ModificationTimestamp`
ascending, so the cursor always advances.

### Attribution

The `attribution` array carries strings the consumer is **obliged** to render —
some upstream licences mandate exact wording. Pass them through verbatim; do not
paraphrase or consolidate.

---

## Record shape

Full typed definition: [`services/terra/olr.ts`](../services/terra/olr.ts).

**Required:** `OlrVersion`, `ListingKey`, `SourceSystemKey`, `SourceSystemName`,
`StandardStatus`, `PropertyType`, `ModificationTimestamp`.

**RESO core:** price (`ListPrice`, `OriginalListPrice`, `ClosePrice`), address
(`UnparsedAddress`, `City`, `StateOrProvince`, `PostalCode`, `Latitude`,
`Longitude`), structure (`BedroomsTotal`, `BathroomsTotalInteger`, `LivingArea`,
`LotSizeSquareFeet`, `YearBuilt`), parcel/tax/zoning (`ParcelNumber`, `Zoning`,
`TaxAnnualAmount`, `TaxAssessedValue`), dates, agent, and `Media[]`.

**Enumerations** follow RESO. Where a source serves a local extension, the mapped
RESO value goes in `StandardStatus` and the original is preserved verbatim in
`MlsStatus` — local vocabulary is never discarded.

---

## Interoperating

### Importing from an MLS

[`services/terra/resoClient.ts`](../services/terra/resoClient.ts) reads any RESO
Web API feed with credentials the member already holds. Retrieval and replication
only.

⚠️ **Access is per-MLS.** The standard is universal; credentials are granted
individually under licence agreements, usually to a broker or agent member. There
is no universal key. Onboarding is paperwork per market.

⚠️ **Call `$metadata` once per connection at setup.** It is the only reliable way
to learn which Data Dictionary version and which local enumeration extensions a
given server actually serves. The `RESO_DD_TARGET` in this repo is an intent, not
a certification.

### Publishing outward — what is and isn't possible

This deserves plain language, because the assumption is common:

> **There is no public API for publishing a for-sale listing to the major consumer
> portals.** Their inventory arrives via MLS syndication and direct broker
> agreements. Terra cannot push a listing there, and neither can anyone else
> without such an agreement.

Nor is writing back into an MLS generally available: **RESO Web API is in practice
a read/replication standard**, and most MLSs expose no third-party write path.

So OLR is the outbound story. Instead of queueing for a slot on a closed portal, we
publish an open standard and let consumers come to it — including portals, if they
want it. The direction is inverted on purpose.

**Compliance note for practitioners:** industry rules govern the relationship
between public marketing and MLS submission, and they have changed recently. If you
are a licensed agent publicly marketing a listing on Terra, confirm your current
obligations with your MLS and broker. Terra does not and cannot make that
determination for you.

---

## Source data and its terms

Terra's Detroit parcel spine comes from the City of Detroit's open data portal.

- The city publishes **no explicit licence** — datasets carry an empty
  `licenseInfo` and the portal offers a warranty disclaimer (AS-IS, no fitness
  guarantee) rather than a rights grant.
- Practically: open public record. **No redistribution ban** was found — but **no
  affirmative grant** either. Rights are unstated rather than granted.
- Consumers of an OLR feed inherit that ambiguity for parcel-derived fields. We
  attribute, disclaim, and pass provenance through so downstream users can make
  their own assessment.

There is a Michigan-specific tailwind: when four Michigan counties attempted
no-resale conditions on bulk land records, the federal appeals court covering
Michigan held those conditions received no state-action antitrust immunity —
reasoning partly that the legislature authorised such conditions *between public
bodies* and pointedly not between a county and a private party. Re-enclosing this
data is legally harder here than in most states.

**None of the above is legal advice.**

### Owner names

Parcel records include the taxpayer of record — public record everywhere, but
several states restrict republishing owner identity for protected individuals, and
at least one imposes per-violation statutory damages with a short takedown window.
**Terra ships Detroit-only.** Anyone mirroring this feed or extending it to other
states must handle those regimes themselves.

---

## Fair-housing constraints on consumers

A listing feed can be used to build things that break US fair-housing law. Two
design rules Terra follows, offered to anyone building on OLR:

1. **Show sourced facts uniformly.** Displaying the same sourced data to every user
   is defensible. Computing your own composite judgment, or varying what you show
   per user, is where steering exposure begins.
2. **Never build demographic filters or "find neighbourhoods like this one" over
   residential listings.** Building the control makes you a co-author of the
   result, not a neutral host.

OLR carries no demographic fields, deliberately.

---

## Versioning

`OlrVersion` is semver. Additive fields are minor; a removal or a semantic change
to an existing field is major. `X_Terra_*` fields may be added in minor versions —
consumers must ignore unknown fields.

## Status

**v0.1.0 — draft.** The format is published and the feed is live; the shape may
still change in response to real consumers. If you are mirroring it, say so, and we
will treat your use as a compatibility constraint.
