# Terra Civic — Government Pricing (proposal)

**Status:** proposal for discussion. Numbers are starting points to validate against real usage.
**Date:** 12 November 2026.
**Applies to:** Forum, Law Library, Meetings and Programs (`TERRA_CIVIC_FORUM_BLUEPRINT.md`,
`TERRA_CIVIC_PROGRAMS_BLUEPRINT.md`), plus the rest of the Plajah workspace a government tenant
gets: Tela documents, spreadsheets, forms, livestreaming, ARIA.

---

## 0. Principles

1. **No per-seat pricing.** Every employee, official, board member and volunteer reviewer is
   included. Residents and the public are always free.
2. **Price by jurisdiction size**, which roughly tracks usage, and include a generous pooled
   allowance for the things that actually cost money: storage, bandwidth, video and AI.
3. **Beat the combined stack** a government buys today for meetings, engagement, grants and code
   hosting, at every tier, while keeping a healthy margin at typical usage and staying above
   break-even even when a tenant uses its full allowance.
4. **No surprise bills.** Allowances are pooled per tenant. Overage is opt-in, priced at cost plus
   20%, and there are hard caps the tenant sets. Third-party pass-throughs (ID checks, mailed
   notices, human captioning) are billed at cost.
5. **Gentle price escalators.** Annual increases are capped at 3%, with price locks of up to 3 years.
   Incumbents commonly write in 5% a year (Ocala's Legistar renewals rose 5% a year).

---

## 1. What governments pay today (public contract records)

| Category | Typical annual cost | Examples |
|---|---|---|
| Agenda and meeting management (often with streaming) | **$8k–$80k** | Granicus: Ferguson MO ~$8.4k; Sunnyside WA $9.2k (1Meeting); Lockport IL ~$21k; Ocala FL $62k→$69k (Legistar, +5% a year); Troup County GA $81k first year, $61.5k recurring. CivicClerk: Faribault MN $7.9k recurring; Santa Fe NM ~$20k–38k. iCompass: Marion IA $18.9k; Peoria IL $19.9k |
| Public engagement | **$5k–$27k** | Polco: Lake Elmo MN $24k / 3 yrs; Maple Grove MN $33k / 3 yrs. PublicInput: Sutter County CA ~$26.7k first year |
| Grant management | **$5k–$20k+** | Neighborly $2,400 per license per year (Niagara Falls, 2023; per seat); ZoomGrants ~$5k/yr plus program fees (third-party listing) |
| Code hosting | **$0.5k–$1.3k** (codification supplements are extra) | Municode hosting ~$500; eCode360 premium $1,295 (Fenton MO, 2026) |
| Office suite (context) | M365 G3 GCC ~**$39/user/mo** after July 2026 (reseller figures) | 200 staff ≈ $94k/yr |

**Combined meetings + engagement + grants + code hosting:** roughly **$20k–$35k/yr** for a small
city, **$40k–$120k/yr** for a mid-size city or county, and more for large cities. That excludes the office suite, video
hardware, and implementation fees, which often add 20–30% in year one.

**Codification:** Terra hosts the code openly and runs codification on the platform. Enacted
amendments are applied automatically, then the clerk or a codifier partner reviews and signs
(`TERRA_CIVIC_LEDGER_BLUEPRINT.md` §4). This replaces most vendor supplement fees. The legal
editorial sign-off stays with a human who has authority.

---

## 2. Our costs per tenant (estimates to validate)

| Cost driver | Assumption | Mid-size city per month |
|---|---|---|
| File and document storage | Cloud object storage ~$20–26 per TB-month hot, far less for archive tiers | 5 TB → ~$100 |
| Public bandwidth (non-video) | ~2 TB egress at ~$0.08–0.12/GB | ~$200 |
| Meeting video | ~10 meetings × 3 h live, a few hundred viewers each, archive kept (Mux encode, store, deliver) | ~$300–500 (rough estimate, depends heavily on viewership) |
| Transcription and captions | ~1,800 min/month machine transcription | ~$10–30 |
| AI: civic features | Conflict analysis, comment synthesis, minutes drafts, resident Q&A. Haiku 5.5 ($0.10 / $0.50 per M tokens) for bulk work, Sonnet 5.5 ($2 / $10) for legal analysis, prompt caching on the Law Library, Batch API (50% off) for overnight jobs | ~$100–300 |
| AI: staff using the wider Plajah workspace | 300 staff using document, spreadsheet and form assistants. Defaults to Haiku 5.5, Sonnet on request | ~$100–600 |
| Support, security and compliance overhead | SOC 2, GovRAMP, on-call, onboarding, spread across tenants | ~$500 early on, falling with scale |
| **Total** | | **~$1,300–2,200 typical; about $2,400 at full allowance use** |

The real cost risk is **support and compliance**, not infrastructure. Self-serve onboarding and
templates (Programs blueprint §2) are what keep the price low.

---

## 3. Proposed tiers (flat monthly price, billed annually)

| Tier | Population | Monthly | Annual | Included pooled allowance | Market stack it replaces |
|---|---|---|---|---|---|
| **Village** | < 10k | **$450** | $5,400 | 1 TB storage · 20 live hours/mo · 1 TB egress · 15k AI credits | Agenda software alone is often $8k–9k |
| **Town** | 10k–50k | **$1,150** | $13,800 | 3 TB · 40 h · 2 TB · 50k AI credits | ~$20k–35k |
| **City / County** | 50k–250k | **$2,950** | $35,400 | 8 TB · 100 h · 5 TB · 150k AI credits | ~$40k–120k |
| **Metro** | 250k–1M | **$6,500** | $78,000 | 25 TB · 250 h · 15 TB · 400k AI credits | Commonly $100k+ |
| **State / Major metro** | > 1M or a state agency | **from $12,500** | custom | Custom | Custom |

- **AI credits:** 1 credit = $0.01 of model cost at Plajah's price. Routine assistant work runs on
  Haiku 5.5, so 150k credits ($1,500 at cost) covers very heavy use. Most tenants will use well under
  half.
- **Every tier includes:** unlimited users; Forum (private and public drafting), the Law Library
  with conflict reports, Meetings (agenda, notice, livestream, comment queue, minutes, boards),
  Programs Desk, and the full workspace (Tela documents, spreadsheets, forms, ARIA). Plus SSO, audit
  logs, records export and WCAG 2.1 AA.
- **Overage (opt-in, capped):** storage, egress, live hours and AI credits at cost plus 20%.
- **Pass-through at cost:** ID verification for Forum Tier 2, mailed postcards and zoning notices,
  SMS, human captioning (CART) and ASL interpreters, ERP connector setup by third parties.
- **Optional services:** white-glove onboarding (fixed fee), and a fiscal-agent mode for Programs
  (priced separately after legal review).

**Margin check (City/County tier):** $2,950 price against ~$1,300–2,200 typical cost is roughly a
25–55% gross margin. At full allowance use, cost is about $2,400, so the tier still clears cost.
Margins improve as support overhead spreads across more tenants. If real usage runs hotter, the
first lever is the size of the included AI allowance, not the price.

---

## 4. Making it easy to buy

- **Under approval thresholds.** Village and Town tiers fit under the purchase limit many places let a
  manager approve without a formal bid. Thresholds vary by state and charter, so check each one.
- **Cooperative contracts.** Get listed on Sourcewell, TIPS and/or OMNIA so cities can buy without
  running their own RFP. Kerrville TX bought CivicClerk through a TIPS contract.
- **Pilot pricing.** The first 3 months are free for the first ten tenants per region. Detroit-area
  pilots go first, following Terra's coverage ladder.
- **Fixed-price multi-year.** Up to 3-year terms, with increases capped at 3%.

---

## 5. Where the money goes

Government subscription revenue is Plajah revenue. A published share of it funds the Community
Revenue Pool (charities and creators weighted most, then small businesses), under the rules in
`TERRA_CIVIC_FORUM_BLUEPRINT.md` §13.1–13.2. Pricing is never a percentage of grant dollars
(Programs blueprint §9).

---

## 6. Open questions

1. Validate the video cost line with real Mux usage from Live Hub before publishing prices.
2. What percentage of civic revenue goes to the Community Revenue Pool? It changes the margin target.
3. Should states be priced per agency or per state?
4. Do school districts and special districts get their own tier, or do they use the population table?

## Sources

Contract figures are from public council records and news coverage: [Ferguson MO](https://www.fergusoncity.com/DocumentCenter/View/6344/Resolution-No-2023-19-granicus-agenda-management),
[Ocala FL](https://ocala.legistar.com/LegislationDetail.aspx?From=RSS&ID=6573675&GUID=8D4EEC8F-44B3-4610-9B67-8AF747F3C2C4),
[Lockport IL](https://citizenportal.ai/articles/5914027/illinois/will-county/lockport/council-renews-granicus-agenda-management-software-contract-for-up-to-three-years),
[Sunnyside WA](https://citizenportal.ai/articles/5924783/washington/yakima-county/sunnyside-city/council-approves-one-year-granicus1meeting-agenda-management-agreement),
[Troup County GA](https://citizenportal.ai/articles/8663122/Georgia/Troup-County/County-staff-recommend-switching-to-GranicusLegistar-for-agenda-management-and-streaming-firstyear-cost-cited-at-81239),
[Faribault MN](https://www.faribaultmn.gov/AgendaCenter/ViewFile/Item/11448?fileID=31034),
[Kerrville TX](https://d2kbkoa27fdvtw.cloudfront.net/kerrvilletx/310097af0e5f4ecbe6c0c8af2aeeb1e70.),
[Marion IA](https://cityofmarion.civicweb.net/document/29893/Resolution%20approving%20payment%20to%20Diligent%20Corpor.pdf?handle=357570C561E94454AB530313A880F630),
[Peoria IL](https://peoriail.legistar.com/LegislationDetail.aspx?From=RSS&ID=5849667&GUID=0D190F34-6B9C-440B-9B80-D022CC2CF9A0),
[Lake Elmo MN](https://www.lakeelmo.gov/AgendaCenter/ViewFile/Item/926?fileID=5408),
[Maple Grove MN](https://maplegrovemn.gov/AgendaCenter/ViewFile/Item/5453?fileID=20112),
[Sutter County CA](https://citizenportal.ai/articles/11034238/california/sutter-county/board-authorizes-26663-first-year-contract-for-a-public-engagement-platform),
[Niagara Falls NY](https://cms3.revize.com/revize/niagarafallsny/Documents/Government/City%20Council/Agenda/July%2026/3.Council-Agenda-Item-Neighborly-Software-for-Community-Development-1.pdf),
[ZoomGrants listing](https://www.capterra.com/p/133342/ZoomGrants/),
[Fenton MO eCode360](https://citizenportal.ai/articles/6128864/missouri/st-louis-county/fenton/city-moves-to-absorb-small-ecode360-price-increase-for-municipal-code-hosting),
[M365 government pricing (reseller)](https://apexdigital.com/microsoft-365-government-price-increase-extended-service-terms-2026/).
Claude model prices are Anthropic's published API rates.
