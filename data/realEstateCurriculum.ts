/**
 * realEstateCurriculum — "Real Estate School", Academia's full-stack property program.
 *
 * Rides the shared School chassis (services/schoolChassis.ts), aligned to the PLAJAH_RE
 * progression seeded in data/educationStandards.ts.
 *
 * WHY THIS EXISTS: research found **no comprehensive open "Real Estate Principles" textbook
 * anywhere**. The field's teaching material is proprietary (the licensure-prep industry sells PDF
 * slideshows for $200–500). The open pieces do exist — MIT OpenCourseWare's real-estate sequence,
 * OpenStax finance, federal consumer material, open property-law casebooks — they have simply never
 * been assembled into one ladder. This is that assembly.
 *
 * THE LAB IS REAL: Plajah already ships Terra — a live parcel spine over Detroit's daily-updated
 * assessor feed, with a zoning engine that computes a legal buildable envelope and checks a proposed
 * massing against it. So the assignments here are not "imagine a property at 123 Main St". They are
 * "open this actual parcel and run the numbers". No other education product can set that homework.
 *
 * LICENCE POSTURE (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md):
 *  - Public domain, hostable: CFPB homebuying material, HUD/FHA, IRS publications, FDIC Money Smart,
 *    Census/ACS, FHFA. These carry the consumer tier.
 *  - CC BY-NC-SA, free-shelf only: MIT OCW 11.431/11.432/11.433, open property-law casebooks.
 *  - CC BY: OpenStax Principles of Finance — the maths substrate.
 *  - NEVER hosted: USPAP (strictly proprietary — taught *about*, never reproduced), Lincoln
 *    Institute, Urban Institute, GSE courses, PSI exam bulletins. Exam banks are authored in-house.
 *  - Zillow-derived figures require "Data Provided by Zillow Group" wherever they are displayed.
 *
 * GUARDRAIL: this is education. It is not legal advice, not an appraisal, not a zoning
 * determination, and not investment advice — and it says so where a learner would most want it.
 */
import type { Curriculum } from '../services/schoolChassis';

const CFPB_HOME = { label: 'CFPB — Buying a house (public domain)', url: 'https://www.consumerfinance.gov/owning-a-home/' };
const CFPB_TOOLKIT = { label: 'CFPB — Your Home Loan Toolkit (public domain)', url: 'https://files.consumerfinance.gov/f/201503_cfpb_your-home-loan-toolkit-web.pdf' };
const HUD_FAIR = { label: 'HUD — Fair Housing rights and obligations', url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp/fair_housing_rights_and_obligations' };
const HUD_HANDBOOK = { label: 'HUD/FHA Single Family Handbook 4000.1', url: 'https://www.hud.gov/hud-partners/single-family-handbook-4000-1' };
const IRS_527 = { label: 'IRS Publication 527 — Residential Rental Property', url: 'https://www.irs.gov/publications/p527' };
const IRS_523 = { label: 'IRS Publication 523 — Selling Your Home', url: 'https://www.irs.gov/publications/p523' };
const MIT_431 = { label: 'MIT OCW 11.431J — Real Estate Finance & Investment (CC BY-NC-SA)', url: 'https://ocw.mit.edu/courses/11-431j-real-estate-finance-and-investment-fall-2006/' };
const MIT_432 = { label: 'MIT OCW 11.432J — Real Estate Capital Markets (CC BY-NC-SA)', url: 'https://ocw.mit.edu/courses/11-432j-real-estate-capital-markets-spring-2007/' };
const MIT_433 = { label: 'MIT OCW 11.433J — Real Estate Economics (CC BY-NC-SA)', url: 'https://ocw.mit.edu/courses/11-433j-real-estate-economics-fall-2008/' };
const OPENSTAX_FIN = { label: 'OpenStax Principles of Finance (CC BY)', url: 'https://openstax.org/details/books/principles-finance' };
const OPEN_PROPERTY = { label: 'Open Source Property — a free casebook (CC BY-NC)', url: 'https://opensourceproperty.org/' };
const ELANGDELL_LAND = { label: 'Land Use — CALI eLangdell (CC BY-NC-SA)', url: 'https://open.umn.edu/opentextbooks/textbooks/106' };
const DETROIT_DATA = { label: 'Detroit Open Data — Parcels (updated daily)', url: 'https://data.detroitmi.gov/' };
const ACS = { label: 'Census / ACS housing tables (public domain)', url: 'https://data.census.gov/' };
const FHFA = { label: 'FHFA House Price Index (public domain)', url: 'https://www.fhfa.gov/data/hpi' };
const MI_LARA = { label: 'Michigan LARA — real estate licensing information', url: 'https://www.michigan.gov/lara/bureau-list/bpl/occ/prof/collection/lic-info/examination-information' };

export const REAL_ESTATE_SCHOOL: Curriculum = {
  id: 'real-estate-school',
  label: 'Real Estate School',
  blurb:
    'From your first rent cheque to a securitised asset — the first genuinely open full-stack real-estate curriculum, taught on live city parcels instead of imaginary ones.',
  accent: '#06D6A0',
  framework: 'PLAJAH_RE',
  tracks: [
    // ── S1 ──────────────────────────────────────────────────────────────────────
    {
      id: 'property',
      title: 'Property & Home',
      blurb: 'What owning actually means, and how to read a real parcel record before you read anything else.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 're-prop-1',
          title: 'What You Own When You Own Land',
          blurb: 'Property is not a thing. It is a bundle of rights, and each stick can be sold separately.',
          minutes: 18,
          standardIds: ['PJRE.PROP.MS'],
          body: `Ask most people what it means to own a house and they will describe an object. Lawyers describe something stranger and more useful: a bundle of rights, each of which can be separated and sold on its own.

The bundle includes the right to possess it, to use it, to exclude other people from it, to transfer it to someone else, and to enjoy whatever it produces. Notice how routinely these come apart in ordinary life. A landlord keeps the right to transfer but hands possession and use to a tenant for a term. A mining company can hold the mineral rights beneath a house whose owner holds everything above. A utility easement lets a company cross land its owner otherwise controls entirely. A mortgage lender holds a claim that becomes possession only if payments stop.

Two limits sit above the whole bundle, and neither is optional. Government retains the power to tax the land, and the power to regulate what may be done on it — zoning, building codes, environmental rules. Owning land has never meant doing whatever you like with it.

That is why the first practical skill in this course is not negotiating or financing. It is reading a parcel record: who holds title, what the land measures, what it is assessed at, what zoning district it sits in, what has been recorded against it. Everything later in the ladder is a calculation performed on those facts.`,
          resources: [OPEN_PROPERTY, DETROIT_DATA],
          assignment: {
            prompt: 'Open Terra and adopt a real parcel — one you can walk past if possible. Record its parcel number, frontage and depth, lot area, assessed value, and zoning district. Then write which sticks in the bundle its owner appears to hold, and which look to be held by someone else.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-prop-2',
          title: 'Renting versus Owning, Honestly',
          blurb: 'Neither is a moral achievement. They are different cost structures with different risks.',
          minutes: 20,
          standardIds: ['PJRE.PROP.MS', 'PJRE.HOME.HS'],
          body: `The received advice — that renting is throwing money away — is wrong in a specific and instructive way.

Renting buys you shelter, mobility and a fixed, known monthly cost. Ownership buys you shelter, forced saving through principal repayment, and exposure to price changes in both directions. The comparison is only useful once you count everything on the ownership side that a monthly-payment comparison hides: property tax, insurance, maintenance, and the enormous transaction costs of buying and selling, which typically take several percent of the price each way.

Those transaction costs drive the single most useful rule in residential real estate: ownership tends to beat renting only over a long enough holding period. Buy and sell within a couple of years and the round-trip costs frequently exceed anything you gained. The break-even horizon varies by market, but the mechanism does not.

The other honest point concerns leverage. A mortgage magnifies both directions. A ten-percent rise in a property's value against a ten-percent deposit is an enormous gain on the money you actually put in — and a ten-percent fall wipes that money out entirely, while the debt stays exactly where it was. Leverage is not the villain of the story, but it is never the free accelerator it is sold as.`,
          resources: [CFPB_HOME, IRS_523],
          assignment: {
            prompt: 'Take a real rental and a real listing in the same neighbourhood. Build the full annual cost of each, including tax, insurance, maintenance and amortised transaction costs. Find the holding period at which owning overtakes renting, and state what would have to be true for you to be wrong.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
      ],
    },

    // ── S2 ──────────────────────────────────────────────────────────────────────
    {
      id: 'agency',
      title: 'Agency & Transactions',
      blurb: 'Who works for whom, what the documents actually say, and how title moves.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 're-agency-1',
          title: 'Whose Agent Is That, Exactly?',
          blurb: 'The most expensive misunderstanding in a first transaction.',
          minutes: 18,
          standardIds: ['PJRE.AGENCY.HS'],
          body: `A buyer walks into an open house, likes the agent, asks their opinion on price, and receives a friendly answer. What they usually do not realise is that the agent standing there may owe their loyalty entirely to the seller.

Agency is a legal relationship with duties attached — loyalty, confidentiality, disclosure, obedience within the law, and accounting for money held. The critical question is always *to whom* those duties run. A seller's agent owes them to the seller, which means anything a buyer volunteers about their budget or urgency can lawfully be passed on. A buyer's agent owes them to the buyer. Dual agency, where one agent or firm represents both sides, is permitted in some jurisdictions and prohibited in others, and it necessarily dilutes duties that would otherwise be undivided.

Most jurisdictions require agents to disclose their role in writing, often at first substantive contact. That disclosure is not paperwork to be waved through; it is the single most important document in the early stage of a transaction.

The practical rule for a first-time buyer or seller is short: before you discuss anything about your finances or motivation, ask directly — "who do you represent in this transaction?" — and get the answer in writing. It costs nothing and changes what you can safely say.`,
          resources: [CFPB_HOME, MI_LARA],
          assignment: {
            prompt: 'Find your jurisdiction’s agency disclosure requirement and read an actual disclosure form. List the duties owed and to whom, and identify whether dual agency is permitted where you live. Then write the three questions you would ask an agent before saying anything about your budget.',
            tool: 'NONE',
            postTag: 'realestate',
          },
        },
        {
          id: 're-agency-2',
          title: 'Reading the Loan Estimate',
          blurb: 'The government designed a form specifically so lenders could be compared. Use it.',
          minutes: 22,
          standardIds: ['PJRE.HOME.HS'],
          body: `After the 2008 crisis, US regulators standardised mortgage disclosure into two forms — the Loan Estimate given after application and the Closing Disclosure given before closing — precisely because borrowers could not previously compare offers. Both are public-domain documents with published guides, and learning to read them is worth more than any amount of general advice about shopping around.

Page one gives loan terms, projected payments and estimated closing costs. Read three things first: whether the rate can change and on what schedule; whether there is a prepayment penalty or a balloon payment; and the total monthly obligation including escrowed taxes and insurance, which is often materially higher than the quoted principal-and-interest figure.

Page two itemises closing costs, split between services you cannot shop for and services you can — a distinction that exists to tell you exactly where negotiation is possible.

Page three carries the number that actually compares two offers: the total you will have paid after five years, and the annual percentage rate, which folds fees into the rate so that a low rate with high fees stops looking cheap.

And the reason the Closing Disclosure arrives three days before closing is so you can compare it against the Estimate. Do that comparison line by line. Discrepancies are common, some categories are legally restricted from increasing, and the three days exist so you have time to ask.`,
          resources: [CFPB_TOOLKIT, CFPB_HOME],
          assignment: {
            prompt: 'Using a real or sample Loan Estimate, extract: rate type, prepayment penalty, total monthly obligation, which costs are shoppable, the APR, and the five-year total. Then compare two different offers on those figures alone and pick one, in writing, with reasons.',
            tool: 'NONE',
            postTag: 'realestate',
          },
        },
        {
          id: 're-agency-3',
          title: 'Fair Housing Is Not Optional',
          blurb: 'The law, why it exists, and how discrimination usually shows up in practice.',
          minutes: 18,
          standardIds: ['PJRE.AGENCY.HS'],
          body: `The Fair Housing Act makes it unlawful to refuse to sell or rent, to set different terms, or to advertise a preference, on the basis of race, colour, religion, sex, national origin, familial status or disability. Many states and cities add further protected characteristics.

The history matters here, because it explains why the law is written the way it is. For decades, federal policy itself graded neighbourhoods by racial composition and withheld mortgage insurance from those it marked as hazardous — the practice known as redlining. Restrictive covenants written into deeds barred sale to particular groups. The resulting differences in who could accumulate housing wealth did not vanish when the practices became illegal; they are visible in property values and homeownership rates today.

Modern violations are rarely announced. They appear as steering — showing buyers only certain neighbourhoods — as different information given to different enquirers, as inconsistent application of criteria, and as advertising that signals a preference through wording or imagery. Testing studies repeatedly find measurable differences in treatment.

Two duties follow for anyone working in this field. Apply criteria identically and be able to demonstrate it, which in practice means writing them down in advance. And where a request concerns disability, understand that reasonable accommodations and modifications are a legal obligation rather than a courtesy.`,
          resources: [HUD_FAIR, OPEN_PROPERTY],
          assignment: {
            prompt: 'Read the protected classes in federal law and add any your state or city includes. Then take three real property advertisements and assess the wording against the advertising rules, explaining specifically what makes each acceptable or not.',
            tool: 'NONE',
            postTag: 'realestate',
          },
        },
      ],
    },

    // ── S3 ──────────────────────────────────────────────────────────────────────
    {
      id: 'valuation',
      title: 'Valuation & Appraisal',
      blurb: 'Three approaches to the same question — and why the answer is always an opinion with evidence attached.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 're-val-1',
          title: 'Comparables: The Sales Comparison Approach',
          blurb: 'The method behind almost every residential valuation, done properly.',
          minutes: 22,
          standardIds: ['PJRE.VAL.HS'],
          body: `The sales comparison approach reasons that a property is worth roughly what similar properties recently sold for, adjusted for their differences. It is the dominant method in residential valuation because it rests on actual transactions rather than theory.

Doing it properly is more disciplined than it looks. Comparables should be genuinely comparable — similar size, condition, age and style — recently sold rather than merely listed, and in the same market area, which frequently means the same few streets rather than the same city. Asking prices are opinions; closed sales are evidence.

Then come adjustments, and the direction confuses everyone at first. You adjust the *comparable*, not the subject. If a comparable has an extra bathroom the subject lacks, you subtract from the comparable's price to estimate what it would have fetched without it. The adjustment reflects what the market paid for that difference, not what it cost to build.

Finally you reconcile. Several adjusted comparables will give several numbers; the appraiser weighs the most similar and most recent most heavily and states a single value with reasoning. That last step is why valuation is a supportable opinion rather than a calculation — two competent professionals can differ, and the defensible one is the one whose reasoning is written down.

This is also the honest place to name the limits. Automated estimates on consumer websites are sales comparison run by machine; they are useful for orientation and unreliable for anything unusual, because they cannot see condition.`,
          resources: [DETROIT_DATA, HUD_HANDBOOK, MIT_431],
          assignment: {
            prompt: 'In Terra, take your adopted parcel and find three genuine recent comparable sales nearby. Adjust each for differences and reconcile to a single supported value. Write the reasoning that justifies your weighting — that paragraph is the assignment.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-val-2',
          title: 'Cost and Income: The Other Two Approaches',
          blurb: 'What it would cost to replace, and what the income stream is worth.',
          minutes: 24,
          standardIds: ['PJRE.VAL.COL'],
          body: `Sales comparison fails when a property is unusual enough that nothing comparable has sold, or when it exists to produce income rather than to be lived in. Two other approaches cover those cases.

The cost approach asks what it would cost to build this improvement today, subtracts accumulated depreciation, and adds the land value. Depreciation here has three sources worth distinguishing: physical deterioration, functional obsolescence when the design itself is outdated, and external obsolescence caused by something off the property entirely. The approach is strongest for new construction and for special-purpose buildings — a school, a church — where sales evidence barely exists.

The income approach values a property as the income it produces. Start with potential gross income, subtract vacancy and collection loss, subtract operating expenses — and note carefully that mortgage payments and depreciation are *not* operating expenses — to get net operating income. Then divide NOI by a capitalisation rate drawn from comparable sales, and you have a value.

That capitalisation rate deserves its own attention, because it carries enormous weight. It is the market's required return, and it moves with interest rates and perceived risk. A small change in cap rate changes value dramatically: the same NOI valued at six percent rather than five is worth roughly seventeen percent less. Much of what looks like a property market rising or falling is actually cap rates moving.

USPAP is the professional standard governing appraisal practice in the United States. It is a copyrighted document sold by its publisher, so we teach *about* it — what it requires of an appraiser, and why an appraisal is a regulated professional opinion — and we never reproduce its text. **Nothing in this course is an appraisal.**`,
          resources: [MIT_431, OPENSTAX_FIN, HUD_HANDBOOK],
          assignment: {
            prompt: 'For a small income property, build the income approach from the top: potential gross income, vacancy, operating expenses, NOI. Derive a cap rate from comparable sales and produce a value. Then re-run it with the cap rate one point higher and report the change in value.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
      ],
    },

    // ── S4 ──────────────────────────────────────────────────────────────────────
    {
      id: 'finance',
      title: 'Finance & Investment',
      blurb: 'Pro formas, leverage, returns — underwriting a real building rather than a hypothetical one.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 're-fin-1',
          title: 'Building a Pro Forma',
          blurb: 'A forecast of cash in and out. Every investment decision rests on one.',
          minutes: 28,
          standardIds: ['PJRE.FIN.COL'],
          body: `A pro forma is a multi-year projection of a property's cash flows, and it is the document every real-estate investment decision actually turns on.

Build it in layers. Start with gross potential rent at market rates, subtract vacancy and credit loss to reach effective gross income, then subtract operating expenses — taxes, insurance, utilities, management, maintenance, and a reserve for capital replacement that beginners almost always omit. That reserve is not optional bookkeeping: roofs and boilers fail on a schedule, and a pro forma without a reserve is simply wrong.

What you have now is net operating income, and NOI is the figure the property produces regardless of how you financed it. Below that line comes debt service, and NOI minus debt service is cash flow before tax — the money that actually reaches an owner.

Project it forward with explicit assumptions: rent growth, expense growth, and the terms of any refinancing. Then add an assumed sale at the end of the holding period, valued by applying an exit cap rate to that year's NOI.

Now the discipline that separates analysis from wishful thinking: every assumption is a guess, so test the ones that matter. Change rent growth by a point. Change the exit cap rate by half a point. Extend the lease-up period. If the deal only works under favourable assumptions, you have not found a good investment — you have found a fragile one, and you now know exactly which assumption you are betting on.`,
          resources: [MIT_431, OPENSTAX_FIN],
          assignment: {
            prompt: 'In Terra, choose a real income-producing parcel. Build a ten-year pro forma with real assessed taxes and researched market rents, including a capital reserve. Compute cash flow and an exit value. Then run three sensitivities and state, in one sentence, which assumption the deal actually depends on.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-fin-2',
          title: 'Leverage, Cap Rates and Return Measures',
          blurb: 'Cap rate, cash-on-cash and IRR answer different questions. Using the wrong one hides risk.',
          minutes: 26,
          standardIds: ['PJRE.FIN.COL'],
          body: `Three numbers get quoted constantly and confused just as often, because each answers a different question.

The capitalisation rate is NOI divided by price. It describes the property's unlevered yield — what the asset earns before any financing — which is exactly why it is used to compare buildings to each other. Cash-on-cash return is annual pre-tax cash flow divided by the equity you actually invested. It describes what your money earns, so it moves with your financing. Internal rate of return is the discount rate at which all cash flows including the eventual sale net to zero. It is the only one of the three that accounts for timing and for the sale, and it is therefore the only one that answers "how did this investment do overall".

Leverage sits underneath all three. Borrowing at a rate below the property's unlevered yield increases return on equity — positive leverage. Borrowing above it destroys return, even while the property itself performs exactly as expected. Leverage is neutral machinery that amplifies whichever direction the underlying asset is already going.

Which is why lenders watch two ratios more than they watch your optimism. Loan-to-value caps how much of the price is debt. Debt service coverage ratio — NOI divided by annual debt service — measures how far income can fall before the loan cannot be paid. A DSCR near 1.0 means no margin at all, and it is the single number most predictive of distress.

**None of this is investment advice.** It is how the arithmetic works.`,
          resources: [MIT_431, OPENSTAX_FIN],
          assignment: {
            prompt: 'Take your pro forma and compute cap rate, cash-on-cash and IRR. Then re-run it at two different loan-to-value levels and report all three measures plus DSCR at each. Write which measure you would lead with if you were presenting to a lender, and which to an equity partner, and why they differ.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-fin-3',
          title: 'Capital Markets: REITs, Securitisation and Waterfalls',
          blurb: 'How property becomes a traded security — and who gets paid in what order.',
          minutes: 28,
          standardIds: ['PJRE.FIN.PRO'],
          body: `Above the level of individual buildings sits a financial system that turns property into instruments anyone can trade, and understanding it explains most of what moves real-estate markets nationally.

A real estate investment trust owns income property and is required to distribute the large majority of its taxable income to shareholders, which is why REITs are held for income. They make property liquid — you can sell shares in an afternoon, which you cannot do with a building — at the cost of introducing stock-market volatility to an asset class that does not otherwise trade daily.

Commercial mortgage-backed securities work from the other side. Many commercial mortgages are pooled, and the pool issues bonds in tranches with a defined order of payment. Senior tranches are paid first and absorb losses last; junior tranches earn more and absorb losses first. This is credit risk sliced deliberately and sold to buyers with different appetites. It is also the structure whose failure modes were exposed in 2008, when the correlation between the underlying loans turned out to be far higher than the models assumed — a lesson about model risk that belongs in every version of this lesson.

In private deals the same ordering principle appears as the distribution waterfall. Cash is paid out in tiers: typically a preferred return to limited partners first, then return of capital, then a split in which the sponsor takes a disproportionate share — the promote — as a reward for performance above a hurdle.

The habit to build here is simple and it transfers everywhere in finance: whenever money is pooled, ask who gets paid first, who gets paid more, and who absorbs the first loss. Those three answers describe the risk far better than any headline return does.`,
          resources: [MIT_432, OPENSTAX_FIN],
          assignment: {
            prompt: 'Model a simple three-tier waterfall on your pro forma: preferred return, return of capital, then a promote split above a hurdle. Show the distribution in a good year and a bad one. Then explain in plain language who bears the first loss and what they are paid for bearing it.',
            tool: 'NONE',
            postTag: 'realestate',
          },
        },
      ],
    },

    // ── S5 ──────────────────────────────────────────────────────────────────────
    {
      id: 'development',
      title: 'Development & Planning',
      blurb: 'What may legally be built here — computed from the real parcel and the real zoning rule.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 're-dev-1',
          title: 'Zoning and the Buildable Envelope',
          blurb: 'Setbacks, height, coverage, floor-area ratio: the invisible box every building sits inside.',
          minutes: 26,
          standardIds: ['PJRE.DEV.COL'],
          body: `Before anything is designed, a parcel has a legal maximum: the buildable envelope. It is defined by the zoning district's rules interacting with the parcel's own dimensions, and computing it is the first real skill in development.

Four controls do most of the work. Setbacks push construction back from front, side and rear boundaries, carving the footprint out of the lot. Height limits cap how far up you may go, which combined with typical floor-to-floor heights gives a storey count. Lot coverage caps the share of the parcel that may sit under building. And floor area ratio caps total floor area as a multiple of lot area — an FAR of 2.0 on a 5,000-square-foot lot permits 10,000 square feet of floor area however it is arranged.

Use controls sit alongside these: the district determines what may happen inside, sometimes by right, sometimes only with a special permit after a hearing.

Terra computes this envelope from the actual parcel record and the actual district rule, and it does something worth pointing out to learners: when it cannot be certain, it refuses to guess. Missing dimensions, overlay districts, historic designations and planned developments all produce explicit blockers instead of a confident wrong answer. That is the correct professional posture, and it is the habit to copy. A zoning analysis that quietly assumes away what it does not know is worse than no analysis, because someone will build on it.

**This is not a zoning determination.** Only the municipality can give you one.`,
          resources: [ELANGDELL_LAND, MIT_433, DETROIT_DATA],
          assignment: {
            prompt: 'In Terra’s Parcel Studio, compute the buildable envelope for your parcel: setbacks, height, coverage and FAR. Place a massing inside it and check compliance. Then record every blocker the tool raised and explain what each one would require you to resolve in the real world.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-dev-2',
          title: 'Feasibility: Does the Envelope Pay?',
          blurb: 'The residual land value question — what the site is worth given what can be built on it.',
          minutes: 26,
          standardIds: ['PJRE.DEV.COL', 'PJRE.FIN.COL'],
          body: `A development is feasible when the finished value exceeds every cost of producing it by enough to compensate for the risk taken. Turning that sentence into a number is the residual land value method, and it runs backwards from the end.

Start with gross development value: what the completed building will be worth, from the income or comparison approaches you already know. Then subtract, in order, construction cost including a contingency that reflects genuine uncertainty; professional fees; finance cost across the build period, which is a real and frequently underestimated line; and the developer's required profit, treated as a cost rather than a residue. What remains is the most that could rationally be paid for the land.

Two consequences follow. The first is that land value is derived, not intrinsic — it is whatever is left after the scheme pays for itself, which is why the same site is worth different amounts under different zoning. Upzoning increases land value directly and immediately, and that is why zoning changes are politically contested in a way that surprises people who think of them as technical.

The second is that time is a cost with teeth. Every additional month of approvals accrues finance cost on land already bought and delays the revenue that repays it. Entitlement risk — the possibility of not getting permission, or getting it slowly — is frequently the largest risk in a development, larger than construction cost, and it is the one least visible on a spreadsheet.`,
          resources: [MIT_433, ELANGDELL_LAND],
          assignment: {
            prompt: 'Using the envelope you computed, run a residual land value on your parcel: gross development value, construction cost with contingency, fees, finance cost, required profit — then the residual. Compare it with the assessed value. Explain the gap, and state what a six-month approval delay would do to your number.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
      ],
    },

    // ── S6 ──────────────────────────────────────────────────────────────────────
    {
      id: 'markets',
      title: 'Markets, Data & Policy',
      blurb: 'Reading a submarket from public data, and understanding the policy that shapes it.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 're-mkt-1',
          title: 'Reading a Submarket from Public Data',
          blurb: 'Supply, demand and absorption — using sources that cost nothing.',
          minutes: 24,
          standardIds: ['PJRE.MKT.COL'],
          body: `Real-estate markets are intensely local. National figures are close to useless for a decision about one building, and the data needed to do better is largely free.

On the demand side, the American Community Survey gives population, household formation, income, tenure split and housing cost burden at small geographies. Household formation matters more than raw population, because households rather than people occupy dwellings. On the supply side, building permits indicate what is coming, and because construction takes time, permits are a genuine leading indicator. Vacancy tells you the balance between the two right now, and absorption — the rate at which available space is taken up — tells you how quickly the market clears.

Price series such as the FHFA index show direction over time. Read them as trends rather than valuations: an index tells you what a market did, not what a specific building is worth.

The analytical move that makes this useful is to compare a submarket against its metro rather than against a national average. A neighbourhood outperforming its metro on income growth and household formation while permits stay low is a different proposition from one where the reverse holds — and neither pattern is visible from national headlines.

A note on commercial sources: figures derived from proprietary datasets such as Zillow's research data require attribution wherever they are shown. Public federal data does not, which is a practical reason to build the core of an analysis from it.`,
          resources: [ACS, FHFA, MIT_433],
          assignment: {
            prompt: 'Profile the submarket around your parcel using public data only: population and household change, income, tenure split, cost burden, recent permits and vacancy. Compare each against the metro. Conclude with a one-paragraph view on demand direction, naming the weakest link in your evidence.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
        {
          id: 're-mkt-2',
          title: 'The Policy Layer',
          blurb: 'Property tax, housing policy and the public decisions that set private value.',
          minutes: 22,
          standardIds: ['PJRE.MKT.COL'],
          body: `Property values are not produced by markets alone. A large share is set by public decisions, and an analyst who cannot read the policy layer will keep being surprised.

Property tax is the most direct. It is a recurring cost that reduces net income and therefore value, and how it is assessed matters as much as the rate — whether assessments track market value, how often they are updated, and what exemptions apply. In markets where assessment lags badly, the tax a new buyer pays can differ sharply from what the seller paid on the same building, which is a real and frequently missed underwriting item.

Then there is the federal apparatus most people never see: mortgage insurance programmes that determine who can borrow, secondary-market institutions that buy loans and thereby set the terms lenders offer, and tax treatment of mortgage interest, depreciation and capital gains that changes after-tax returns substantially.

Local policy is often the most decisive of all. Zoning determines what may be built, which sets land value. Rent regulation changes the income stream directly. Tax abatements alter feasibility for specific projects. Infrastructure investment — transit especially — reliably shows up in nearby property values.

The professional habit is to treat policy as an input with its own risk profile rather than as background. Ask what the current rules are, what is under active consideration, and what the analysis would look like if the proposed change happened. That is the same discipline as sensitivity testing, applied to the political layer.`,
          resources: [IRS_527, HUD_HANDBOOK, MIT_433],
          assignment: {
            prompt: 'For your parcel, document the property-tax treatment: assessed value, rate, any exemptions or abatements, and how assessment would change on sale. Then identify one policy change under discussion locally and model its effect on your pro forma.',
            tool: 'TERRA',
            postTag: 'realestate',
          },
        },
      ],
    },
  ],
};

export default REAL_ESTATE_SCHOOL;
