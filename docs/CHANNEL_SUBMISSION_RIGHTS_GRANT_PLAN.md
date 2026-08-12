# Plajah Live TV Plus — Channel Submission & Rights-Grant Flow

## Context

Plajah wants a global Live TV hub. The legal reality (see research): a stream being publicly reachable does **not** grant the right to rebroadcast it — retransmitting a broadcaster's feed (BBC, PBS, most nationals) without consent is copyright/retransmission infringement, and community "public IPTV" lists are not a lawful commercial source. So the hub can't be built by *grabbing* feeds.

The defensible model is the inverse: **Plajah is a distribution destination that channels opt into**, granting rights through a click-through carriage agreement — the same onboarding pattern already shipped for business pages. This turns "can I take their feed?" into "why every local station wants to be on Plajah." Low-power (LPTV), public-access, community, creator, and FAST-network channels are the target: they want reach and usually lack a streaming outlet.

Builds directly on existing systems (do NOT duplicate them):
- **Live TV Plus / Live Hub** — user channels, sub-channels (N.1/N.2), bound channel numbers, off-platform URLs already modeled as channels, FAST ad-break bumpers, HLS error recovery / dead-asset skipping.
- **FAST entities** — `FastChannel`, `ChannelSource`, `ChannelSourceSet`, `FastChannelSchedule`, `FastChannelLibraryEntry`, `fast_channel_library` collection; `services/fastChannelEpg.ts`, `fastChannelHls.ts`, `fastChannelTimeline.ts`; `TVChannel`.
- **Org backbone + onboarding** — Organization/`orgMemberships`/`orgCan()` RBAC, the accept-handshake, `orgAudit`, and the business-page submission UX.

This flow adds the missing **provenance, rights, review, and compliance layer** on top of the existing channel plumbing.

## The three legal buckets a submission must resolve into
1. **PUBLIC_DOMAIN / GOV** — NASA TV, gov/legislative feeds, Internet Archive public-domain linear. No rights needed; auto-approvable.
2. **OFFICIAL_EMBED** — international free official streams (DW, France 24, NHK World, Al Jazeera, Euronews, Bloomberg…) carried via the broadcaster's *permitted embed* (official YouTube live / provided widget), ads intact. Allowed only where the broadcaster's embed terms permit.
3. **LICENSED / OWNED** — the submitter owns or holds distribution rights (LPTV, public-access, creators, FAST networks). Requires the rights-grant. This is the growth engine.

Anything that doesn't fit one of these is rejected. (Scraped/unofficial re-streams are never accepted.)

## Data model (new, layered on the existing channel entities)

`ChannelSubmission` (Firestore `channelSubmissions`):
- `id`, `orgId?` (owning org) / `submitterUid`, `channelName`, `logoUrl`, `category`, `country`, `languages[]`
- `sourceType: 'PUBLIC_DOMAIN' | 'GOV' | 'OFFICIAL_EMBED' | 'LICENSED_OWNED'`
- `delivery: { kind: 'HLS' | 'MRSS' | 'YOUTUBE_EMBED' | 'DASH', url, epgUrl?, epgFormat?: 'XMLTV' | 'MRSS' }`
- `territory: { mode: 'GLOBAL' | 'ALLOW' | 'BLOCK', countries[] }` (geo-rights)
- `monetization: { adsAllowed, ssai?: boolean, revSharePct?, houseAdsOk?: boolean }`
- `rightsGrant: RightsGrant` (see below)
- `status: 'DRAFT' | 'SUBMITTED' | 'VALIDATING' | 'IN_REVIEW' | 'APPROVED' | 'LIVE' | 'SUSPENDED' | 'REJECTED' | 'REMOVED'`
- `channelId?` (the `FastChannel`/Live-Hub channel created on approval), `reviewerUid?`, `reviewNotes?`, timestamps

`RightsGrant` (the legal artifact — immutable once signed):
- `agreementVersion`, `signedByUid`, `signerName`, `signerTitle`, `signedAt`, `ipHash`
- Warranties (checkboxes, all required for LICENSED_OWNED): holds distribution rights; holds/clears **music & sync** rights (the PBS gotcha); has authority to grant; content complies with law; will honor territory.
- `carriageTerms` snapshot: territory, ad/rev-share, non-exclusive, term + termination, indemnification, takedown cooperation.

## Submission flow (reuse the business onboarding UX)
1. **Who** — any org owner/admin (`orgCan(..., 'MANAGE_CONTENT')`) or an eligible creator; a channel is owned by an Organization (or a user's Live Hub).
2. **Pick source type** → the form adapts (bucket 1/2 skip the rights-grant; bucket 3 requires it).
3. **Delivery + EPG** — paste HLS/MRSS/YouTube-embed URL + optional EPG (XMLTV/MRSS); live **validation probe** runs (below).
4. **Metadata + territory + monetization.**
5. **Rights grant** (bucket 3) — the click-through carriage agreement with warranties; captures an e-sign record.
6. **Submit** → `SUBMITTED`; enters the review queue; `orgAudit` logs it.

## Review & approval pipeline (mirrors the hiring accept-handshake)
`SUBMITTED → VALIDATING (automated) → IN_REVIEW (admin) → APPROVED → LIVE`
- **Auto-classify + fast-path:** PUBLIC_DOMAIN/GOV with a healthy stream can auto-approve; OFFICIAL_EMBED validated against an allowlist of broadcasters+embed-permission; LICENSED_OWNED always human-reviewed.
- **Admin console** (extends the existing admin/user tools): queue with accept/decline/request-changes, reusing the accept pattern (`acceptOrgMember`-style). On approve → create the `FastChannel`/Live-Hub channel from the submission, assign a channel number, publish EPG.
- Rejections keep the submission with a reason; resubmission allowed.

## Technical ingest & health (reuse existing services)
- **Validation probe:** fetch the HLS/DASH manifest (or resolve the YouTube embed), confirm it plays, read variants — reuse `fastChannelHls.ts` + the just-landed dead-asset-skip / HLS-error-recovery logic.
- **EPG:** parse XMLTV/MRSS into the schedule via `fastChannelEpg.ts` / `fastChannelTimeline.ts`; if no EPG, generate a minimal now/next.
- **Geo-block per channel** from `territory` at play time.
- **Ads/SSAI:** honor `monetization`; insert house bumpers ("back shortly" filler already exists) only where `houseAdsOk`.
- **Continuous health monitor:** re-probe on a schedule; auto-`SUSPENDED` on sustained failure (extends the reliability work), notify the owner.

## Compliance guardrails (non-negotiable)
- **Only store manifests/URLs + metadata** — never re-encode/re-host a licensed feed beyond what the grant allows.
- **DMCA:** registered agent + a takedown endpoint; a rights-holder complaint flips a channel to `REMOVED` pending review; retain the `RightsGrant` + audit as the defense record.
- **Territory** enforced per channel; **music/sync** warranted by the submitter.
- **Audit everything** via `orgAudit` (submit, sign, approve, suspend, remove) — immutable trail.
- Retain signed agreements with version history.

## Seed / bootstrap (so the hub isn't empty on day one)
- Public-domain/gov (NASA TV + gov feeds) — auto-approved.
- Plajah-built **public-domain linear channels** from Internet Archive (fully owned programming).
- A small allowlist of **permitted official news embeds** (DW, France 24, NHK World, Al Jazeera, Euronews, Bloomberg) via their official YouTube live.
- Then open **self-serve submission** to LPTV / public-access / creators / FAST networks.

## Delivery phases
1. **Model + submission** — `ChannelSubmission` + `RightsGrant` types, `channelSubmissions` collection, rules (owner writes own; admin reviews), a submission wizard reusing the business-onboarding UX.
2. **Rights-grant click-through** — versioned carriage agreement + e-sign record + warranties.
3. **Review console + approval → channel creation** (wire into existing `FastChannel`/Live-Hub creation).
4. **Validation probe + EPG ingest + geo-block** (reuse fastChannel* services).
5. **Compliance: DMCA/takedown + health monitor + audit.**
6. **Monetization: rev-share accounting + SSAI seam.**

## Verification
- tsc clean (`NODE_OPTIONS=--max-old-space-size=8192`) + production `npm run build` + Vite transform on touched files.
- End-to-end: submit a PUBLIC_DOMAIN channel (NASA) → auto-approves → appears in Live TV Plus with a channel number + now/next EPG; submit a LICENSED_OWNED channel → sign grant → admin approves → goes LIVE; trigger a takedown → channel flips to REMOVED and the grant/audit persist.
