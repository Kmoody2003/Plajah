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

## 3. Proposed tiers (flat monthly price, billed annually) — superseded by §3A

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

## 3A. Price list by government type — superseded by §3C

Flat monthly prices, billed annually, with unlimited users. Every tier includes the full
platform: Law Library, Forum (private and public drafting), Meetings, Programs Desk, Tela
documents, spreadsheets and forms, and ARIA. The §3 allowance rules (pooled storage, live hours, AI
credits; opt-in overage at cost plus 20%; pass-throughs at cost) still apply.

### Cities, villages and townships

| Tier | Population | Monthly | Annual | What they typically pay today for meetings + engagement + grants + code hosting |
|---|---|---|---|---|
| City S | under 25,000 | **$500** | $6,000 | ~$20k–35k/yr (agenda software alone often $8k–21k) |
| City M | 25,000–100,000 | **$1,500** | $18,000 | ~$40k–80k/yr |
| City L | 100,000–500,000 | **$3,500** | $42,000 | ~$60k–120k/yr (Ocala FL pays ~$69k/yr for Legistar alone) |
| City XL | over 500,000 (e.g. Detroit) | **$7,500** | $90,000 | $100k+/yr |

### Counties

Counties run more boards (commission, planning, road, health) and more programs than a city of the
same size, so they sit a step above.

| Tier | Population | Monthly | Annual | Market reference |
|---|---|---|---|---|
| County S | under 100,000 | **$1,250** | $15,000 | Troup County GA (~70k people) was quoted $81k first year, $61.5k/yr after, for Legistar alone |
| County M | 100,000–500,000 | **$3,000** | $36,000 | ~$60k–120k/yr |
| County L | 500,000–1,000,000 | **$6,000** | $72,000 | $100k+/yr |
| County XL | over 1,000,000 (e.g. Wayne, Oakland) | **$10,000** | $120,000 | $150k+/yr |

### States

A state subscription covers the **legislature** (both chambers, legislative counsel and member
offices: private drafting, public drafts, the conflict engine against the full state code, hearings and
committee meetings) plus **one executive agency** for Programs Desk. Each extra agency is an add-on.

| Tier | Population | Monthly | Annual | Add-on agency |
|---|---|---|---|---|
| State S | under 3 million | **$15,000** | $180,000 | +$2,500/mo |
| State M | 3–10 million (Michigan ≈ 10M) | **$25,000** | $300,000 | +$3,500/mo |
| State L | over 10 million | **$40,000** | $480,000 | +$5,000/mo |

State pricing is a starting point. We have not yet gathered public contract figures for state
legislative drafting and committee systems the way we did for cities (§1). **Validate against 3–5
real state contracts before quoting.** State buyers will also expect GovRAMP (formerly StateRAMP)
and an RFP or cooperative-contract path.

### Federal (later, not offered yet)

Per agency or per committee, **custom, starting around $50,000/mo**. It requires FedRAMP
authorization (a large, multi-year compliance effort), so it isn't on the price list until that
exists.

### Why these numbers hold up

- **Cities and counties pay roughly 40–80% less** than today's meetings + engagement + grants +
  code stack (§1), and get drafting, the Law Library, documents and AI on top.
- **Margins:** a City L or County M tenant costs an estimated $1,300–2,200/mo to serve at typical use
  (§2), so $3,000–3,500 leaves a healthy margin. City S and County S are deliberately thin (about
  break-even to 30%) because they're the land-grab tiers and sit under many purchase-approval
  thresholds.
- **States** carry heavier usage (hundreds of staff, many committee hearings, constant conflict
  analysis across the whole code) and need more support, which the $15k–40k range is sized for.
- **Discounts:** 2-year term −5%, 3-year term −10% with a price lock; a bundled county + its cities
  −15% (sold through the county, which spreads Terra fast); pilots free for 3 months.


## 3B. Value model: what a government replaces (12 Nov 2026; the add-on is folded into §3C)

Tela documents, sheets and forms, LiveTalk video meetings, Tela/Fabula design tools and ARIA can
replace much of the per-seat software a government buys today. This section counts that value, and
adds a **Workspace add-on** priced flat by tier (still no per-seat fees) so large offices moving their
documents onto Plajah don't erode the margin.

### Workspace add-on (flat by tier)

| | Under 25k / 100k | Mid | Large | Largest |
|---|---|---|---|---|
| Cities | +$250/mo | +$1,000 | +$3,000 | +$8,000 |
| Counties | +$800/mo | +$3,000 | +$6,500 | +$14,000 |
| States | +$3,000/mo | +$6,000 | +$12,000 | — |

It works out to about **$3–4 per desk user per month**. Microsoft 365 G3 for government runs about
$39, and Google Workspace Business Standard about $14. Our estimated cost to serve a desk user
(storage, bandwidth, AI on Haiku 5.5) is about $2/month, so the add-on carries a 38–52% margin.

### Assumptions

- **Desk seats per tier** (staff who use office software). These are estimates, set conservatively below total
  headcount (city governments run roughly 10–13 employees per 1,000 residents, and many are field staff):
  60 / 250 / 900 / 2,500 for cities; 200 / 800 / 1,800 / 4,000 for counties; 800 / 1,500 / 3,000 for a
  state legislature plus one agency.
- **Per-seat list prices, monthly:** Microsoft 365 G3 GCC ~$39 (reseller figure after the July 2026
  increase); Google Workspace Business Standard ~$14 (used as the low end of "office suite");
  Adobe Acrobat Pro for teams $23.99 (30% of seats); Zoom Workplace Business ~$18.33 (25% of seats);
  Adobe Creative Cloud Pro for teams $99.99 (1% of seats, communications staff).
- **Civic tools** (agenda/meetings, streaming, engagement, grants, code hosting) use the public contract ranges in §1.
  Granicus streaming alone runs about $27k–60k/yr in the city contracts found (Berkeley, Sanger, Santa Ana).
- **State "today" is understated:** state legislative drafting and committee systems aren't counted because we
  have no public figures yet.

### Not counted (Plajah doesn't replace these yet)

Email and calendar (Exchange/Gmail), phone systems, legally binding e-signature (DocuSign-style;
Business Pro ~$45/user/mo), police/CJIS systems, ERP and finance, GIS desktop licences. **Most governments
will keep Microsoft or Google for email**, so treat the office-suite column as "documents moved
onto Plajah", not a guaranteed cancellation. The civic-tools column is the saving that's certain.

### Result

| Tier | Desk seats (est.) | Plajah: Civic + Workspace /mo | Plajah per year | Today: civic tools | Today: office suite | Today: PDF, video, design | **Today total** | **Saving** |
|---|---|---|---|---|---|---|---|---|
| City Under 25k | 60 | $500 + $250 | $9k | $20k–$35k | $10k–$28k | $10k | **$40k–$73k** | **77–88%** |
| City 25k–100k | 250 | $1,500 + $1,000 | $30k | $40k–$80k | $42k–$117k | $38k | **$120k–$235k** | **75–87%** |
| City 100k–500k | 900 | $3,500 + $3,000 | $78k | $60k–$120k | $151k–$421k | $138k | **$349k–$679k** | **78–89%** |
| City Over 500k | 2,500 | $7,500 + $8,000 | $186k | $100k–$180k | $420k–$1.17M | $383k | **$903k–$1.73M** | **79–89%** |
| County Under 100k | 200 | $1,250 + $800 | $25k | $40k–$80k | $34k–$94k | $31k | **$104k–$204k** | **76–88%** |
| County 100k–500k | 800 | $3,000 + $3,000 | $72k | $60k–$120k | $134k–$374k | $123k | **$317k–$617k** | **77–88%** |
| County 500k–1M | 1,800 | $6,000 + $6,500 | $150k | $100k–$180k | $302k–$842k | $276k | **$678k–$1.30M** | **78–88%** |
| County Over 1M | 4,000 | $10,000 + $14,000 | $288k | $150k–$250k | $672k–$1.87M | $613k | **$1.44M–$2.74M** | **80–89%** |
| State Under 3M | 800 | $15,000 + $3,000 | $216k | not counted | $134k–$374k | $123k | **$257k–$497k** | **16–57%** |
| State 3–10M | 1,500 | $25,000 + $6,000 | $372k | not counted | $252k–$702k | $230k | **$482k–$932k** | **23–60%** |
| State Over 10M | 3,000 | $40,000 + $12,000 | $624k | not counted | $504k–$1.40M | $460k | **$964k–$1.86M** | **35–67%** |

Counting only the civic-tools column, the Civic plan on its own (without the Workspace add-on) costs less than the tools it replaces at every city and county tier.
With the office suite and per-seat tools included, cities and counties save roughly 75–89%.


## 3C. Whole-government plans by tier — superseded by §3D (the Civic Rate)

**One plan per government.** A city, county or state buys one subscription that covers **every
department, every office and every employee**: the legislature or council, the executive, every agency,
boards and commissions. There are no per-agency prices, no add-ons and no per-seat fees, so
departments never have a reason to stay off the platform. A government is one customer and gets one
experience: law, drafting, meetings, programs, documents, video and the public record, shared across
departments.

| Plan | Population | Monthly | Annual | Included each month (storage · live video hours · AI credits) | Desk staff (est.) | Today's spend replaced | Less | Est. margin |
|---|---|---|---|---|---|---|---|---|
| Whole city | Under 25k | **$950** | $11k | 2 TB · 20 h · 15,000 | 60 | $40k–$73k | 71–84% | ~14% |
| Whole city | 25k–100k | **$2,500** | $30k | 5 TB · 40 h · 50,000 | 250 | $120k–$235k | 75–87% | ~52% |
| Whole city | 100k–500k | **$6,500** | $78k | 15 TB · 100 h · 120,000 | 900 | $349k–$679k | 78–89% | ~57% |
| Whole city | Over 500k | **$15,500** | $186k | 40 TB · 250 h · 300,000 | 2,500 | $903k–$1.73M | 79–89% | ~55% |
| Whole county | Under 100k | **$2,000** | $24k | 5 TB · 40 h · 40,000 | 200 | $104k–$204k | 77–88% | ~45% |
| Whole county | 100k–500k | **$6,000** | $72k | 15 TB · 100 h · 120,000 | 800 | $317k–$617k | 77–88% | ~57% |
| Whole county | 500k–1M | **$12,500** | $150k | 35 TB · 200 h · 250,000 | 1,800 | $678k–$1.30M | 78–88% | ~63% |
| Whole county | Over 1M | **$24,000** | $288k | 80 TB · 300 h · 500,000 | 4,000 | $1.44M–$2.74M | 80–89% | ~59% |
| Whole state | Under 3M | **$45,000** | $540k | 150 TB · 600 h · 400,000 | 10,000 | $3.21M–$6.21M | 83–91% | ~44% |
| Whole state | 3–10M | **$95,000** | $1.14M | 400 TB · 1,200 h · 1,000,000 | 25,000 | $8.03M–$15.53M | 86–93% | ~39% |
| Whole state | Over 10M | **$195,000** | $2.34M | 1 PB · 2,500 h · 2,400,000 | 60,000 | $19.28M–$37.28M | 88–94% | ~31% |

**How it stays affordable and honest**

- **Turning on another department costs us little.** The real costs are storage, video and AI, which grow with use, not
  with the org chart. Each plan includes a pooled monthly allowance sized to the jurisdiction (table
  above; 1 AI credit = $0.01 of model cost). If a government goes past it, extra use is opt-in, at cost
  plus 20%, with a cap the government sets. Agencies never get a separate bill.
- **One published price list.** Every jurisdiction of the same size pays the same price, with no
  negotiation games. That's the trust-builder: a reporter or auditor can check it.
- **Ramp for states.** A whole-state plan's first year is billed at 50% while departments come
  online, then full price. Cities and counties get 3 months free as a pilot.
- **Locks:** up to 3-year price lock, increases capped at 3% a year, full data export and exit
  guarantee at any time.
- **Margins** (estimated cost to serve ≈ $2 per desk user per month plus fixed civic costs such as meeting video):
  roughly 40–60% for most tiers, lower for the largest states (~31%) and the smallest cities (~14%). The
  smallest-city price was raised from $750 to $950 so it covers its fixed video costs.

**What changed from §3A/§3B:** the Civic plan and Workspace add-on are merged into one price, and
the state plan now covers the whole executive branch, not the legislature plus one agency. That's why
state prices rose. A whole state replaces office, PDF, video and design software for tens of
thousands of staff, so the saving grows far more than the price does.

**State desk-staff estimates** (whole state government, office-software users only): 10,000 / 25,000
/ 60,000 by tier. Michigan's state workforce is on the order of 45,000–50,000 employees; verify per state
before quoting. State "today" still excludes legislative and agency civic systems, so the saving is
understated.


## 3D. The Civic Rate — one public formula (12 Nov 2026; replaces §3A–3C)

Every other government suite sells seats, modules and multi-year contracts negotiated deal by deal.
Terra Civic sells one thing, priced like a public utility, with the same formula for everyone:

> **Annual price = $1,500 + 30¢ per resident (first million) + 15¢ per resident above a million.**

That covers the **whole government**: every department, every office, every employee, the full platform
(Law Library, Forum, Meetings, Programs Desk, Civic Record, Tela documents, sheets and forms,
LiveTalk video, ARIA). There are no seats, modules, tiers or per-agency fees. A council clerk, a
reporter or a resident can work out the price with a calculator.

### Examples

| Example | Residents | Per year | Per month | Per resident | Today's spend replaced | Less | Est. margin |
|---|---|---|---|---|---|---|---|
| Village | 1,000 | **$1,800** | $150 | $1.80 | $5,437–$13,637 | 67–87% | ~26% |
| Town | 5,000 | **$3,000** | $250 | $0.60 | $15,387–$38,387 | 81–92% | ~36% |
| Small city | 15,000 | **$6,000** | $500 | $0.40 | $27,761–$62,761 | 78–90% | ~23% |
| City | 60,000 | **$19,500** | $1,625 | $0.33 | $116,645–$228,645 | 83–91% | ~36% |
| Large city | 250,000 | **$76,500** | $6,375 | $0.31 | $381,353–$741,353 | 80–90% | ~37% |
| Detroit-size city | 630,000 | **$190,500** | $15,875 | $0.30 | $909,569–$1.75M | 79–89% | ~40% |
| County | 300,000 | **$91,500** | $7,625 | $0.30 | $445,623–$865,623 | 79–89% | ~39% |
| Oakland-size county | 1,270,000 | **$342,000** | $28,500 | $0.27 | $1.73M–$3.34M | 80–90% | ~38% |
| Wayne-size county | 1,750,000 | **$414,000** | $34,500 | $0.24 | $2.35M–$4.53M | 82–91% | ~32% |
| Michigan-size state | 10,100,000 | **$1.67M** | $138,875 | $0.17 | $8.11M–$15.69M | 79–89% | ~28% |

"Today" uses the §3B method: civic tools from public contracts, plus the office suite (Google ~$14
to Microsoft 365 G3 ~$39 per user per month) and per-seat PDF, video and design tools. Desk staff are
estimated at 4 per 1,000 residents for cities and counties and 2.5 per 1,000 for states. State "today"
excludes legislative systems, so it's understated.

### What's included, sized by residents (pooled across the whole government)

- **Storage:** 1 TB plus 50 GB per 1,000 residents.
- **Live meeting video:** 10 hours plus 1 hour per 10,000 residents each month (600 hours max).
- **AI:** 10,000 credits plus 1 credit per 10 residents each month (1 credit = $0.01 of model cost).
- **Extra use** is opt-in, at cost plus 20%, with a cap the government sets. Departments never get a separate bill.

### Why it's built this way

- **Costs follow residents, so the price does too.** Staff count, meeting volume, public traffic and storage
  all scale with population. The $1,500 base covers the fixed cost of standing up a government (support,
  setup, a meeting channel). The cost model is in §2. Estimated cost ≈ fixed cost + $24 per desk user a year +
  $0.05 per resident a year + used video.
- **Small towns get the most.** A 1,000-person village pays $150 a month for the same platform Detroit uses.
  Self-serve setup and templates keep their fixed cost low. That's the adoption engine: there are far more small towns than big cities.
- **Fair-margin promise (open book).** We target about 40% gross margin across all governments. Each year we
  publish a short cost report. If our civic margin goes over 50% for the year, the per-resident rate drops for
  everyone the next year. Lower costs get passed through.
- **A resident shouldn't pay twice.** When overlapping governments both subscribe (a city inside a subscribing county,
  or a county inside a subscribing state), each gets 20% off.
- **No lock-in.** Monthly or annual billing, cancel anytime with a full data export. A price lock of up to 3 years,
  with increases capped at 3%, is optional, not required.
- **Easy start.** 90-day free pilot for any government. States pay half in year one while departments come online.
- **Revenue comes back.** A published share funds the Community Revenue Pool (§13 of the Forum blueprint).

### Margin check (estimates)

Most sizes land at about 35–50%. The thinnest are the state (~25–30%, because of large staff counts) and the
10,000–25,000 band (~30%). Raise the base before the rate if real costs run hotter: the base is what protects small-town margins.

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
