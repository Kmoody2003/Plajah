import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Rotate the choices (keeping their cyclic order) so the correct answer lands on a spread-out index.
// Authoring convention: the correct choice is always written FIRST (index 0) and rotated here.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const rotated = choices.map((_, i) => choices[(i - target + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'film-business.l01';
const L02 = 'film-business.l02';
const L03 = 'film-business.l03';
const L04 = 'film-business.l04';
const L05 = 'film-business.l05';
const L06 = 'film-business.l06';
const L07 = 'film-business.l07';
const L08 = 'film-business.l08';
const L09 = 'film-business.l09';
const L10 = 'film-business.l10';
const L11 = 'film-business.l11';
const L12 = 'film-business.l12';
const L13 = 'film-business.l13';
const L14 = 'film-business.l14';
const L15 = 'film-business.l15';
const L16 = 'film-business.l16';
const L17 = 'film-business.l17';
const L18 = 'film-business.l18';
const L19 = 'film-business.l19';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'film-business',
    label: 'The Film Business (Professional)',
    blurb: 'How a film is financed, protected, made, sold and paid for: rights, budgets, capital stacks, insurance, guilds, distribution and the revenue waterfall. US context; education, not legal or financial advice.',
    accent: '#e23b6d',
    framework: 'ncas',
    tracks: [
      {
        id: 'film-business.t1',
        title: 'Life of a Film and the Rights Chain',
        blurb: 'The stages every film passes through, and the paper that proves you own the story.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L01,
            title: 'The Life of a Film',
            blurb: 'Seven stages from idea to exploitation, and where the money and risk sit in each.',
            minutes: 9,
            body: `Important: this course is education, not legal or financial advice. It describes how the US film business generally works. Real deals depend on contracts, jurisdictions and facts, so hire an entertainment attorney and an accountant before you sign or invest anything.

A film moves through seven stages. Development is where the idea becomes a script, rights are secured and a package (director, cast) forms. Financing assembles the money. Pre-production turns the script into a plan: budget, schedule, crew, locations, insurance. Production is the shoot. Post-production covers editing, sound, music, color and the creation of delivery materials. Distribution places the finished film with buyers and audiences. Exploitation is the long tail, where the film earns across formats, windows and territories for years.

Money and risk are not spread evenly. Development costs are small but unreimbursed unless the film is made. Production is where costs are largest and fastest, which is why financiers want insurance and often a completion guarantee. Distribution is where most revenue is decided, yet it arrives last, slowly, and passes through many hands before it reaches an investor.

A worked example: a producer spends $20,000 on an option and a script rewrite, which is development. That is cheap compared with a $2,000,000 shoot, but it is also the only money at risk before anyone else commits. If the project never finances, the $20,000 is lost. Professionals therefore try to attach value (a director, a lead actor, a sales estimate) before spending heavily.

Throughout this course, keep one question in mind: at each stage, who is paid, who is protected, and who holds the rights?`,
          },
          {
            id: L02,
            title: 'The Rights Chain and Chain of Title',
            blurb: 'Why a film is only as sellable as the documents that trace ownership from author to producer.',
            minutes: 10,
            body: `Copyright in a screenplay or book starts with its author. A producer who wants to make a film needs permission, and every link between the original author and the production company must be documented. That documented sequence is the chain of title.

A typical chain for a film based on a novel: the novelist assigns or licenses film rights to the producer through an option or purchase agreement; the screenwriter signs a writer agreement, usually as work made for hire, so the script belongs to the production company; the director, composer and key creative contributors sign agreements that vest their contributions in the company; any short assignment documents are recorded with the US Copyright Office so the public record matches reality.

Buyers and insurers examine this chain closely. A distributor wants to know that no stranger can claim the film, and an errors and omissions (E&O) insurer typically asks for chain-of-title documents, a title report and a copyright search before it will issue a policy. A gap, such as a missing signature from a co-writer, can stall a sale or void coverage for a claim arising from that gap.

Worked scenario: you option a magazine article. The article was written by a freelancer, but the contract with the magazine says the magazine only bought first-publication rights. The magazine cannot grant you film rights. The chain has a break between the freelancer and you, and you must go to the freelancer. Always ask: who actually owns the right I am buying, and can I prove it with a signed document?`,
          },
          {
            id: L03,
            title: 'Options, Life Rights and Work Made for Hire',
            blurb: 'The three most common ways a producer secures a story and a script.',
            minutes: 11,
            body: `An option agreement gives a producer the exclusive right, for a fixed period, to buy underlying rights such as a novel, article or script. The producer pays an option fee, often modest, and the agreement states a purchase price and a term, with extensions available for additional payments. If the producer does not exercise the option, the rights revert to the owner. Often the option fees are stated to be applicable against the purchase price, meaning they are credited when the option is exercised.

Worked example: a one-year option costs $10,000, a six-month extension costs $5,000, and the purchase price is $100,000, with option payments applicable against it. If you exercise after using the extension, you have already paid $15,000, so you owe $85,000 at exercise. If you walk away, you have spent $15,000 and own nothing.

Life rights agreements cover a real person's story. Life rights are not a standalone property right like copyright. The agreement is chiefly a consent and release: the person agrees to cooperate, grants rights to their story and waives claims such as defamation and invasion of privacy. It does not remove all risk, which is why E&O insurers still review such films.

Work made for hire is a US copyright concept. Under the Copyright Act, a work is made for hire if an employee created it within the scope of employment, or if it was specially commissioned for certain listed uses (including as part of a motion picture) and both sides sign a written agreement saying so. In that case the hiring company is the legal author. Where a work-for-hire clause is unavailable or doubtful, producers add a backup assignment of rights.`,
          },
          {
            id: L04,
            title: 'Development Deals and Packaging',
            blurb: 'How projects are developed with other people\'s money, and how a package attracts financing.',
            minutes: 9,
            body: `Development is the stage where a producer turns an idea into something financeable. Producers fund it in several ways: out of pocket, through a development deal where a studio or company pays for scripts and overhead in return for first rights to the projects, or through a first-look arrangement, where a producer agrees to bring projects to a company first. These deals vary widely, so read them carefully.

A package is the set of elements that make a project attractive to financiers and buyers: a strong script, a director with credits, and cast whose names help sell in foreign markets. Packaging reduces risk for a financier because pre-sale buyers and lenders look for these elements. An attachment is typically an agreement in principle rather than a firm contract, so many packages need a pay-or-play offer or a firm deal to carry real weight with a lender. Pay-or-play means the person is paid even if the production never uses them.

If a studio drops a project, a producer may be able to get it back through turnaround. The producer finds a new buyer who reimburses the original studio for its development costs, sometimes plus a premium or a backend interest. Terms are negotiated, not standardized.

Worked example: a studio spent $200,000 developing a script and then puts it in turnaround. A new financier agrees to repay costs plus a 10 percent premium. Repayment is 200,000 times 1.10, or $220,000, and the financier gets the project free of claims once the studio is paid. The producer now has a stronger package without the original studio holding the rights.`,
          },
        ],
      },
      {
        id: 'film-business.t2',
        title: 'Budgeting and Scheduling',
        blurb: 'How a film is priced and planned: the budget structure, a worked low-budget breakdown, and the schedule behind it.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Budget Structure: Above and Below the Line',
            blurb: 'How a film budget is organized, and why contingency is not a luxury.',
            minutes: 9,
            body: `A film budget is organized so financiers, insurers and guarantors can read it at a glance. The traditional split is above-the-line and below-the-line. Above-the-line (ATL) covers the creative and deal-driven costs that are largely fixed before shooting: story and rights, screenwriter, producers, director and principal cast. Below-the-line (BTL) covers the physical production: crew, equipment, locations, art department, wardrobe, transportation, catering, and then post-production, music and the remaining costs. Other sections usually cover insurance, legal, accounting, publicity, and finance fees.

Costs are usually grouped into numbered accounts and sub-accounts, so a producer can track actual spending against the budget line by line and produce a cost report each week.

Contingency is a reserve for unexpected costs, commonly around 10 percent of the budget on independent films, and bond companies typically expect one. It is not padding. Everything from a damaged rental to a rain day draws on it. If contingency is spent early, the production is in danger.

Worked example: BTL production costs are $450,000 and the other costs total $450,000, so the budget before contingency is $900,000. A 10 percent contingency is $90,000, making the total $990,000. If an unplanned two-day reshoot costs $40,000, you still have $50,000 of contingency left. That remaining amount tells you how much risk you can still absorb.

Budgets are living documents: they are revised when script, schedule or cast change, and each revision should be dated and version controlled.`,
          },
          {
            id: L06,
            title: 'A Worked Low-Budget Breakdown',
            blurb: 'Walk through a $990,000 independent budget line by line and see what a percentage really means.',
            minutes: 10,
            body: `Let us build a simplified independent feature budget. All figures are illustrative, not benchmarks, since real costs depend on the market, the cast and the era.

Above the line:
- story rights and script $40,000
- producers $40,000
- director $30,000
- cast $40,000, totaling $150,000.

Below the line, production:
- crew $200,000
- equipment $80,000
- locations and permits $60,000
- art, wardrobe and makeup $50,000
- transportation and catering $60,000, totaling $450,000.

Post-production and music:
- editorial $70,000
- sound and mix $50,000
- color and finishing $30,000
- music licensing and score $50,000, totaling $200,000.

Other: insurance, legal, accounting and delivery items total $100,000.

Subtotal: 150,000 plus 450,000 plus 200,000 plus 100,000 equals $900,000. A 10 percent contingency adds $90,000, so the total is $990,000.

What do the percentages tell you? BTL production is 450 of 900, which is half the subtotal. Post and music at 200 of 900 is just over 22 percent. These ratios help you spot trouble: a budget with almost no post or legal money is probably under-planned. It also reveals what is fixed and what can flex. Rights and cast deals are mostly fixed before the shoot, while locations, equipment and days can move with the schedule.

Finally, note that the budget is only the cost to make the film. Marketing, festival fees, distribution expenses and interest on loans often sit outside it, and you must plan for them separately.`,
          },
          {
            id: L07,
            title: 'Scheduling: From Script Pages to Shooting Days',
            blurb: 'How a breakdown and schedule turn a script into a calendar, and why days drive cost.',
            minutes: 9,
            body: `Scheduling begins with the script breakdown: every scene is read for cast, extras, locations, props, vehicles, stunts, effects and anything that costs money. Scene length is measured in eighths of a page, so a scene of one and three-eighths pages is 11 eighths. Each scene goes onto a stripboard, a set of strips that can be rearranged by location, cast availability, daylight and company moves.

Film is not shot in story order. The schedule groups scenes by location to limit company moves, uses actors in as few days as possible (because cast are paid by the day or week), and respects constraints such as child performer hours, daylight, weather cover and union rest rules.

Page counts give a rough starting estimate. Many independent productions plan to shoot a few script pages per day, while complex action or effects scenes may fill a day with a fraction of one page. The number of shooting days drives crew and equipment cost directly, so a small change in pace changes the budget a great deal.

Worked example: a 90-page script at five pages per day needs 90 divided by 5, which is 18 shooting days. On a five-day week that is 3.6 weeks, so the production schedules four weeks including a buffer. If the director needs four pages per day because the material is dense, the shoot becomes 22.5 days, rounded up to 23, and the weekly crew costs apply to an extra week.

A schedule is also a communication tool: from it come the call sheets, which tell each person where to be and when.`,
          },
        ],
      },
      {
        id: 'film-business.t3',
        title: 'Financing, Entities and Insurance',
        blurb: 'Where the money comes from, how it is stacked, who owns the film, and how risk is transferred.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L08,
            title: 'Sources of Film Financing',
            blurb: 'Equity, debt, pre-sales, incentives, grants, crowdfunding and completion bonds, and what each buyer of risk expects.',
            minutes: 11,
            body: `Few films are funded from one source. Financing usually layers several, each with different risk and expectations.

Equity comes from investors who take ownership or a profit share. It is the riskiest money, paid back after lenders, but it has the most upside. Investment offerings involve securities law, so they must be structured with counsel.

Debt is a loan, often secured against something with value. Gap or bridge financing lends against sales not yet made, for example the estimated value of unsold territories. The lender is repaid from sales, so it needs a credible sales estimate.

Pre-sales are agreements to license a film's rights in a territory before the film exists. The buyer commits a payment on delivery, and that contract can support a bank loan. Pre-sales depend on a strong package.

Tax incentives are offered by many US states and foreign countries to attract spending. The mechanism, not the number, is what to learn: a government rebates or credits a percentage of qualifying local spend, subject to rules, caps and approval. Amounts and rules change often, so always check the current program.

Grants come from foundations, arts councils and film funds, usually for documentaries and developing filmmakers. Crowdfunding raises small amounts from many backers, usually pre-sales of rewards rather than equity, and doubles as audience building.

A completion bond, covered later, is not a source of money for the budget. It is a guarantee that the film will be finished, which makes lenders more willing to lend.

Always ask what each source requires in return: repayment order, approval rights, credit, and delivery obligations.`,
          },
          {
            id: L09,
            title: 'A Worked Capital Stack',
            blurb: 'Build a $5,000,000 budget from layers, then see how the order of repayment shapes risk.',
            minutes: 10,
            body: `A capital stack lists the money layers that fund a film and the order in which they are repaid. Here is an illustrative $5,000,000 film. The numbers are for teaching only.

Tax-credit loan: $1,000,000, a loan secured by the expected incentive from the production's qualifying spend. Pre-sale minimum guarantees: $1,500,000, payments from distributors who bought territories in advance. Gap loan: $1,000,000, secured by the estimated value of unsold territories. Equity: $1,500,000 from private investors.

Check the arithmetic: 1,000,000 plus 1,500,000 plus 1,000,000 plus 1,500,000 equals $5,000,000. Equity is 1.5 divided by 5, or 30 percent of the budget.

Now the repayment order, called the waterfall. Typically, the lenders sit first in line (senior), because their loans are secured and cheaper. The tax-credit loan is repaid from the incentive when it is paid. The gap loan is repaid from sales. Equity usually sits behind them: it is repaid only after the debt, and then earns a share of profits. That is why equity carries more risk and often demands a premium, for example recoupment of 120 percent in some deals (terms vary) of what it invested before profits are shared.

A well-built stack matches risk to money. Pre-sales and incentives lower the risk of the layers above equity, which makes the whole deal more financeable. A stack with all equity and no debt is simple, but each investor shares in every loss. Lenders will also require delivery, insurance and often a completion guarantee.`,
          },
          {
            id: L10,
            title: 'Production Entities and Single-Purpose LLCs',
            blurb: 'Why each film usually lives in its own company, and what that protects.',
            minutes: 9,
            body: `Most independent films are made by a single-purpose entity (SPE), often a limited liability company (LLC) formed for that one film. The LLC owns the film, signs the contracts, holds the bank accounts and receives the revenue.

There are several reasons. First, liability is contained: if a claim arises on this film, the exposure is generally limited to the LLC's assets rather than reaching the producer's other projects or personal assets, provided the company is properly run and funds are not mixed. Second, financiers and lenders want to take a security interest in a clearly defined asset, the film and its revenues, without the claims of other projects. Third, the profit split is easy to document in the operating agreement: who contributes, who manages, and how distributions flow.

Typical structure: the producer's company is the manager of the LLC, investors are members, and the operating agreement explains voting, authority limits, the waterfall and what happens if the budget is exceeded.

Worked example: an investor puts $100,000 into a film LLC with total equity of $1,000,000. The investor holds 10 percent of the equity. If the operating agreement gives investors 50 percent of net profits after recoupment, this investor's share of net profits is 10 percent of that investor pool, which equals 5 percent of net profits overall.

An LLC does not remove all risk: guarantees, fraud, and ignoring formalities can pierce the shield. Different states, tax treatment and securities rules apply, so entity setup belongs with a lawyer and an accountant.`,
          },
          {
            id: L11,
            title: 'Insurance and Completion Bonds',
            blurb: 'The policies that make a film financeable: production package, general liability, E&O and the completion guarantee.',
            minutes: 10,
            body: `Insurance transfers specific risks to insurers so that one accident does not end the film. Financiers and distributors usually require it.

A production package policy commonly bundles coverages for the shoot: equipment and property damage, negative or media coverage for loss of footage, extra expense when something delays work, and cast insurance, which covers costs if a key person cannot work. General liability covers third-party bodily injury or property damage, such as a crew member damaging a location. Workers' compensation covers injuries to employees and is generally required by law. Auto and other cover can be added.

Errors and omissions (E&O) insurance is different. It covers claims that the finished film infringes copyright, defames someone, invades privacy, or uses a name, likeness or idea without permission. Most distributors require it, and insurers generally want clearance procedures and chain-of-title documents first. Typical limits requested by distributors are commonly cited as one million dollars per claim and three million in aggregate, though requirements vary.

A completion bond (completion guarantee) is a contract in which a guarantor promises the financiers that the film will be completed and delivered according to the budget, script and schedule. If costs run over, the guarantor provides the funds or can take over the production. The fee is commonly cited at about 3 to 5 percent of the budget. On a $5,000,000 film, that is $150,000 to $250,000.

Policies and bonds exclude things, so read exclusions carefully and work with an experienced entertainment broker.`,
          },
        ],
      },
      {
        id: 'film-business.t4',
        title: 'People, Paper and Protection',
        blurb: 'The guilds, the agreements on set, and the clearance and registration steps that protect a finished film.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L12,
            title: 'Guilds and Unions in Outline',
            blurb: 'What SAG-AFTRA, WGA, DGA and IATSE do, and what being a signatory means.',
            minutes: 9,
            body: `Four organizations shape most professional US film production. They are labor unions (often called guilds) that negotiate collective bargaining agreements with producers, mostly through the Alliance of Motion Picture and Television Producers (AMPTP).

SAG-AFTRA represents screen performers: actors, stunt performers, voice actors, and broadcasters among others. The Writers Guild of America (WGA) represents writers of film, television and other media, with East and West sections. The Directors Guild of America (DGA) represents directors and also certain members of the directing team, such as assistant directors, unit production managers and stage managers. IATSE (International Alliance of Theatrical Stage Employees) represents many below-the-line crafts such as camera, lighting, grip, sound, editing, makeup and set work through local unions.

What the agreements do: they set minimum pay and working conditions, provide for health and pension benefits, require residual payments when a film earns in later markets, and set credit and dispute procedures. Their details change with each contract negotiation, so this course does not quote rates. Always get current figures from the union or its published agreements.

A production becomes a signatory when it signs a guild's agreement. Many guilds require financial assurances, such as a deposit, so they can be sure performers and crew will be paid. Independent producers also use special low-budget or short-form agreements offered by unions, which have their own terms.

Practical effect: signing with a guild raises cost but opens access to guild talent and satisfies many distributors. A non-union film can work, but may limit cast and distribution choices.`,
          },
          {
            id: L13,
            title: 'Contracts and Releases',
            blurb: 'Actor deals, location agreements, appearance releases and the two licenses every song needs.',
            minutes: 10,
            body: `A film runs on paper. The core documents are few but must be signed before the work is done, not after.

Actor agreements state the role, dates, pay, credit, and the grant of rights in the performance, including the right to use their name and likeness to promote the film. Union actors work under guild terms. Crew deal memos cover pay, hours and work-for-hire language, so the production owns what crew create.

Location agreements give permission to film on private property, set the dates, the fee, restrictions and insurance, and confirm who is responsible for damage. Public locations generally need a permit from the local film office. Filming on private property without a signed agreement is a common source of claims.

Appearance releases are signed by people who appear recognizably, such as extras and interview subjects, granting permission for the use of their image. Releases for documentary subjects matter especially because the film's content depends on them.

Music requires two permissions. A synchronization license from the copyright owner of the composition (often a publisher) allows the song to be used with the images. A master use license from the owner of the sound recording (often a record label) allows use of that specific recording. If you hire a band to record a cover version, you still need the sync license, but the master belongs to your production.

Worked example: you want a famous pop recording in a scene. You need sync from the publisher and master use from the label. If the label agrees and the publisher refuses, you cannot use it. Clear music early, as it can be among the largest negotiated costs.`,
          },
          {
            id: L14,
            title: 'Clearance and Copyright Registration for a Finished Film',
            blurb: 'The checks and filings that protect the film after the cut is locked.',
            minutes: 10,
            body: `Before delivery, a film goes through a clearance review. A clearance procedure checks that everything seen and heard is authorized: script and title, music, footage and images, artwork and logos on screen, names and likenesses, and potential defamation or privacy issues. A title report and copyright search help show that the title and the underlying material do not conflict with existing works. A clearance attorney or specialist often prepares a report, and E&O insurers generally rely on it.

Copyright exists automatically once a work is fixed, but registration with the US Copyright Office has legal consequences. For a US work, registration (or a refusal) is a prerequisite to filing an infringement suit in federal court. Timely registration also governs remedies. To seek statutory damages and attorney's fees, the work must generally be registered before the infringement began or within three months after first publication.

Worked example: a film is first published on March 1 and an infringement starts April 15. You register on April 20, which is within three months of publication, so statutory damages and fees remain available. In a second case the film is published January 10, an infringement begins June 1, and registration happens July 1. Registration came after the infringement began and more than three months after publication, so those remedies are not available for that infringement.

Producers also record key documents, such as assignments and security interests, with the Copyright Office, since recording gives public notice of ownership and liens. Distributors and lenders commonly require both registration and recordation as delivery items.`,
          },
        ],
      },
      {
        id: 'film-business.t5',
        title: 'Distribution, Revenue and Plajah',
        blurb: 'How a film reaches audiences, how money flows back, and how Plajah\'s tools fit the picture.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L15,
            title: 'Distribution Models and Release Windows',
            blurb: 'Theatrical, streaming, TVOD, SVOD, AVOD, festivals and self-distribution, and how windows sequence them.',
            minutes: 10,
            body: `Distribution is how a finished film reaches people, and who gets paid depends on the model.

In theatrical distribution, a distributor books the film into cinemas and shares box office with exhibitors. Four-walling is a variant in which the filmmaker rents the cinema and keeps the ticket income, taking the marketing risk.

Streaming and home video follow several models. TVOD (transactional) means pay per rental or purchase. SVOD (subscription) means the viewer pays a monthly fee and the platform pays the rights holder a license fee, often a flat buyout. AVOD (advertising) means the viewer watches free with ads and the rights holder shares ad revenue. Broadcast and cable licensing is another channel.

Festivals are not primarily a revenue source. They are showcases: they generate press, buyer attention and sometimes sales or awards.

A sales agent represents the film to distributors, mostly in international markets, charging a commission and recoupable expenses. Self-distribution means the filmmaker handles release directly, with full control and full responsibility.

Release windows are the staged order in which a film appears in different formats, traditionally theatrical first, then transactional home viewing, then subscription services, then free or ad-supported television. The order exists so each channel has exclusive time, though window lengths vary and have shortened over time.

Worked example: a film licensed to a streamer for a flat $800,000 earns that sum regardless of views. A film on AVOD may earn little up front but gain over time, so the model should match your financing needs.`,
          },
          {
            id: L16,
            title: 'How Revenue Flows: A Simplified Waterfall',
            blurb: 'Why a film can gross millions and still show no net profit.',
            minutes: 12,
            body: `Revenue does not go straight to the people who made the film. It flows through a waterfall, a priority order set by contracts. Often a collection account management agreement (CAMA) is used: a neutral third party collects the film's revenues in a bank account and pays out each party in agreed order, so everyone can trust the accounting.

Here is a simplified, illustrative example. The film earns $10,000,000 gross receipts.

Sales agent commission of 15 percent: $1,500,000, leaving $8,500,000. Distribution and marketing expenses: $1,500,000, leaving $7,000,000. Senior loan and interest: $2,000,000, leaving $5,000,000. Equity recoupment at 120 percent of a $3,000,000 investment: $3,600,000, leaving $1,400,000. Deferred payments to cast and crew: $400,000, leaving $1,000,000. The remaining $1,000,000 is the net profit, often split 50 percent to the investors and 50 percent to the producers' pool, so $500,000 goes to the producers' pool. Anyone with a profit participation is paid from that share.

Now suppose the film grosses only $6,000,000. Commission is $900,000, leaving $5,100,000. After $1,500,000 of expenses, $3,600,000 remains. The $2,000,000 loan leaves $1,600,000. Equity is owed $3,600,000 but receives only $1,600,000. There is no net profit, and net profit participants receive nothing.

This is why participations defined as a share of net profit are often worthless in practice, and why many professionals negotiate gross-based or first-dollar terms, fees or deferments with clear definitions. Gross receipts and fees come first; profit comes last.`,
          },
          {
            id: L17,
            title: 'Marketing and Festival Strategy',
            blurb: 'Plan the festival run like a campaign: premiere status, tiers, budgets and sales leverage.',
            minutes: 9,
            body: `Marketing starts before the shoot. A film with a clear audience, a distinctive hook and good stills and trailer assets is easier to sell. Many distributors judge a film by how clearly it can be marketed.

A festival strategy matters because many festivals value premiere status, meaning the film has not screened publicly before. Showing at a small local event too early can cost eligibility at larger ones. A common approach is to aim for the highest-profile festival that fits the film, and step down if turned away, with a defined calendar of submission deadlines.

Festivals are often tiered informally, from the largest international festivals that attract buyers and press, to genre and regional festivals that build audience and reviews. Your sales agent, publicist and attorney can help you judge which is right.

Submission costs add up: entry fees are charged per festival, and fee waivers are sometimes available. Budget also for travel, a press kit, a publicist, deliverables such as DCP or screening files, subtitles and posters. These are marketing and distribution costs and often fall outside the production budget.

Worked example: you plan to submit to 20 festivals at $75 each, which totals $1,500. Six of them grant you fee waivers, so you pay for 14: 14 times 75 is $1,050. The saving is $450. The bigger numbers are travel and publicity, so decide your goal first: a sale, a deal, awards, or audience.

A festival win does not guarantee a deal, so plan a distribution path in parallel.`,
          },
          {
            id: L18,
            title: 'International Sales',
            blurb: 'Selling a film territory by territory through sales agents, markets and minimum guarantees.',
            minutes: 10,
            body: `Outside the US, films are usually licensed territory by territory. A sales agent takes the film to film markets, the trade events where buyers from many countries meet. Well-known examples include the American Film Market, the Cannes market (Marche du Film) and the European Film Market in Berlin. The agent shows a trailer or footage, negotiates with local distributors and secures deals.

Each license states the territory, the rights licensed (theatrical, home entertainment, television, digital), the term, the language and the payment. A common structure is a minimum guarantee (MG): a fixed advance the buyer pays regardless of performance, often partly on signing and mostly on delivery. The distributor may later pay overages if the film earns beyond the MG after recouping its costs.

Sales estimates are projections of what each territory might pay for a given package. Lenders and gap financiers use these estimates, and a pre-sale makes one of those estimates a real contract.

Delivery is the list of materials the buyer is entitled to: the final film in the required format, trailers, music cue sheets, chain-of-title documents, E&O certificate, subtitles and more. Late or incomplete delivery delays payment.

Worked example: four licenses produce MGs of Germany $400,000, UK $250,000, France $300,000 and Japan $150,000. The total is $1,100,000. The sales agent takes 15 percent commission: 0.15 times 1,100,000 is $165,000, leaving $935,000 before any expenses are deducted. Currency exchange, taxes and withholding can also reduce the amount received.

Territories can also be cross-collateralized by contract, meaning a shortfall in one can be offset by another, so read each deal carefully.`,
          },
          {
            id: L19,
            title: 'Plajah\'s Film Tools in the Professional Picture',
            blurb: 'Where Fabula, the production suite and Taleo fit the stages you have learned, and what they do not replace.',
            minutes: 9,
            body: `Important: this course is education, not legal or financial advice. Tools can organize your work, but they do not replace an entertainment attorney, accountant, insurer or guild.

Plajah's film tools map to the stages of the film's life. Fabula is Plajah's film editor, where cuts, titles and effects are built for post-production and short-form work. The production suite is the on-set layer for pre-production and production: a hub that keeps script, crew authority, schedule, call sheets and reports in one shared record, a roster of cast and crew, a daily brief that each person confirms, and craft services planning. It can also hold budget lines, locations, festival plans and clearance records, so the paper trail you learned about stays attached to the project. Taleo is Plajah's home for the release side, where finished films can be presented to an audience. It does not replace a sales agent or distributor if you want one, and your rights and contracts still matter.

Think of using them against the checklist from this course. Does each call sheet reflect the current schedule? Does every clearance have a signed document behind it? Is your budget revised when your schedule changes? Are festival dates recorded against deliverables? A good tool makes missing items visible.

Worked example: a producer finishes a shoot of 18 days. The call sheets and daily briefs show who confirmed each call, the clearance list shows two music cues still unsigned, and the festival plan shows a submission deadline in six weeks. The tools do not clear the music, but they show the problem early enough for counsel to fix it.

Use the suite to run the project; use professionals to sign the agreements.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'film-business',
    questions: [
      // ---------- L01 ----------
      mc(L01, 1, 1, `Which stage of a film's life covers editing, sound, music, color and creation of delivery materials?`,
        [`Post-production`, `Development and packaging`, `Financing the production`, `Exploitation of the film`],
        `Think of what happens after the shoot ends.`,
        `Post-production follows production and turns raw footage into a finished, deliverable film.`),
      mc(L01, 2, 2, `A producer spends $20,000 on an option and a rewrite, then a $2,000,000 shoot follows. What share of the $2,020,000 total is the development spend, to the nearest whole percent?`,
        [`About 1 percent`, `About 10 percent`, `About 2 percent`, `About 20 percent`],
        `Divide 20,000 by 2,020,000.`,
        `20,000 divided by 2,020,000 is about 0.0099, or roughly 1 percent. Development is cheap but is the first money at risk.`),
      mc(L01, 3, 2, `A producer finishes a film and then discovers the script was never legally optioned. At which stage should this have been fixed, ideally?`,
        [`Development`, `Exploitation`, `Post-production`, `Festival submission`],
        `Rights are secured before the money and the shoot.`,
        `Securing rights is a development task. Finding the gap after production is far more costly.`),
      mc(L01, 4, 3, `Why do financiers often want insurance and a completion guarantee before production begins?`,
        [`Production is when costs are largest and fastest, so risk is highest`, `Development costs are always larger than shooting costs, so risk is lowest during production`, `Distribution revenue arrives before production ends`, `Guilds forbid production without a bond`],
        `Where is spending concentrated in time?`,
        `Production is where most cost is incurred quickly, so financiers want protection against overruns and accidents.`),
      tf(L01, 5, 3, `A film that is finished has finished earning: exploitation ends when the first release ends.`, 1,
        `Think about how long a film can sell across formats and territories.`,
        `False. Exploitation is a long tail across windows, formats and territories that can last for years.`),

      // ---------- L02 ----------
      mc(L02, 1, 1, `What is a chain of title?`,
        [`The documented sequence of rights transfers from the original author to the producer`, `The list of crew members in credit order`, `The order in which investors are repaid`, `The schedule of release windows`],
        `It is about ownership, traced through paper.`,
        `Chain of title is the documented trail proving who owns the rights, from the author to the producer.`),
      mc(L02, 2, 2, `You option a magazine article. The magazine only bought first-publication rights from the freelancer. Who can grant you film rights?`,
        [`The freelancer, since the magazine did not acquire them`, `The magazine, because it published the article and paid the freelance writer`, `Either one, since publication transfers all rights`, `Nobody, because articles cannot be adapted`],
        `Who still holds the film rights?`,
        `The magazine could only grant what it owned. The film rights remained with the freelancer, so the chain runs through the freelancer.`),
      mc(L02, 3, 2, `A co-writer never signed an agreement vesting rights in the production company. What is the most likely effect?`,
        [`A break in the chain of title that can stall a sale or complicate E&O coverage`, `No effect, because only the director's signature matters to buyers, lenders and insurers`, `The film automatically becomes public domain`, `The guild takes ownership of the script`],
        `Buyers and insurers examine every link.`,
        `A missing signature creates a gap in the chain. Distributors and E&O insurers examine the chain, and a gap can delay a deal or coverage.`),
      mc(L02, 4, 3, `Why does recording assignment documents with the US Copyright Office help a production?`,
        [`It makes the public record match who actually owns the rights`, `It guarantees the film will be profitable once it reaches the market`, `It replaces the need for signed contracts`, `It registers the film with all guilds`],
        `Think public record versus private paperwork.`,
        `Recordation gives public notice of ownership transfers and liens, supporting buyers and lenders who check the record. It does not replace the underlying contracts.`),
      mc(L02, 5, 3, `Which delivery risk is a chain-of-title gap MOST directly linked to?`,
        [`A claim from someone who says they own part of the story`, `A rain delay on the shoot`, `A misspelled credit`, `A late color grade`],
        `Which risk concerns who owns the story?`,
        `A chain gap exposes the film to an ownership claim, which is the kind of risk E&O insurers and distributors screen for.`),

      // ---------- L03 ----------
      mc(L03, 1, 1, `What does an option agreement give a producer?`,
        [`The exclusive right, for a set period, to buy underlying rights`, `Permanent ownership of the work from the day the option fee is paid`, `The right to direct the film`, `A guarantee of financing`],
        `It is a right to buy, not the purchase itself.`,
        `An option is an exclusive, time-limited right to purchase rights at a stated price. If it is not exercised the rights revert.`),
      mc(L03, 2, 2, `A one-year option costs $10,000, a six-month extension costs $5,000, and the purchase price is $100,000 with option payments applicable. You exercise after using the extension. What do you owe at exercise?`,
        [`$85,000`, `$100,000`, `$90,000`, `$115,000`],
        `Subtract everything already paid from the purchase price.`,
        `Applicable payments total $10,000 plus $5,000, or $15,000. $100,000 minus $15,000 leaves $85,000 due.`),
      mc(L03, 3, 2, `Using the same terms, you let the option and extension lapse without exercising. What is your total outlay and what do you own?`,
        [`$15,000 and no rights`, `$15,000 and half the rights`, `$100,000 and full rights`, `$10,000 and no rights`],
        `Count both payments; consider reversion.`,
        `You paid $10,000 plus $5,000, or $15,000, and because you did not exercise, the rights revert to the owner.`),
      mc(L03, 4, 3, `Which statement about life rights is most accurate?`,
        [`They are mainly a consent and release agreement, not a standalone property right`, `They give you copyright in the person's life`, `They eliminate all defamation and privacy risk`, `They are required for any true story`],
        `Copyright protects expression, not facts.`,
        `A life rights agreement chiefly provides consent, cooperation and waiver of certain claims. It does not remove all risk.`),
      mc(L03, 5, 3, `Which is required for a specially commissioned contribution to be a work made for hire as part of a motion picture under US copyright law?`,
        [`A written agreement signed by both sides stating it is a work made for hire`, `Payment of more than the guild minimum rate plus a signed delivery schedule`, `Delivery within one year`, `Registration of the film`],
        `The statute asks for a writing.`,
        `A commissioned work in a listed category, including as part of a motion picture, is made for hire only if both parties sign a written agreement to that effect. Producers often add a backup assignment.`),

      // ---------- L04 ----------
      mc(L04, 1, 1, `What is a package in film development?`,
        [`The creative and commercial elements, such as director and cast, attached to make a project financeable`, `A bundle of camera equipment`, `A shipping container of delivery materials`, `A guild contract`],
        `Think of what a financier wants to see attached.`,
        `A package is the set of elements, like script, director and cast, that makes a project attractive to financiers and buyers.`),
      mc(L04, 2, 2, `A studio spent $200,000 on a script. A new buyer repays costs plus a 10 percent premium to take it out of turnaround. What does the studio receive?`,
        [`$220,000`, `$210,000`, `$200,000`, `$240,000`],
        `Multiply 200,000 by 1.10.`,
        `200,000 times 1.10 is $220,000: the costs plus a $20,000 premium.`),
      mc(L04, 3, 2, `A lead actor is attached on a handshake, with no pay-or-play offer. A lender asks how solid the package is. What is the best summary?`,
        [`The attachment is weak until it becomes a firm or pay-or-play agreement`, `It is as strong as a fully signed contract because the actor verbally agreed`, `Lenders do not look at cast`, `It is guaranteed by the sales agent`],
        `What does a lender rely on?`,
        `An informal attachment can fall away. Firm deals or pay-or-play offers give real weight to a package.`),
      mc(L04, 4, 3, `What does turnaround allow a producer to do?`,
        [`Reclaim a dropped project by finding a new buyer who reimburses the original company`, `Cancel all option payments retroactively`, `Convert equity into debt`, `Avoid chain-of-title review`],
        `Think of a project leaving one home for another.`,
        `In turnaround, a new buyer repays the original company's costs, sometimes plus a premium, so the project can move on.`),
      tf(L04, 5, 3, `A first-look arrangement obliges a producer to bring projects to a particular company first.`, 0,
        `The name describes the order of approach.`,
        `True. In a first-look deal the producer offers projects to that company before going elsewhere, though the details vary.`),

      // ---------- L05 ----------
      mc(L05, 1, 1, `Which of these is typically an above-the-line cost?`,
        [`Director and principal cast`, `Camera equipment rental and grip package`, `Catering and craft services for the crew`, `Location permits and street closure fees`],
        `Above the line means creative and deal-driven costs.`,
        `Principal creative talent, such as director and leads, falls above the line. Equipment, catering and permits are below the line.`),
      mc(L05, 2, 2, `A budget before contingency is $900,000 and contingency is 10 percent. What is the total?`,
        [`$990,000`, `$910,000`, `$999,000`, `$1,000,000`],
        `Ten percent of 900,000 is 90,000.`,
        `10 percent of $900,000 is $90,000, so the total is $990,000.`),
      mc(L05, 3, 2, `With a $90,000 contingency, a $40,000 reshoot and a $25,000 equipment loss occur. How much contingency remains?`,
        [`$25,000`, `$50,000`, `$65,000`, `$15,000`],
        `Subtract both from 90,000.`,
        `40,000 plus 25,000 is 65,000, and 90,000 minus 65,000 is $25,000.`),
      mc(L05, 4, 3, `Why is spending most of the contingency early in the shoot a warning sign?`,
        [`Later weeks still face risk but the reserve to absorb it is gone`, `It means the budget was too low in post-production and must be rewritten`, `Guilds penalize unused contingency`, `It proves the script is too long`],
        `Contingency covers surprises throughout the shoot.`,
        `Risk continues through the shoot, so an early drain leaves little protection for later surprises.`),
      mc(L05, 5, 3, `Why are budgets numbered into accounts and sub-accounts?`,
        [`So actual spend can be tracked line by line against the budget in cost reports`, `Because unions require numbered accounts`, `To hide above-the-line costs`, `To avoid revisions`],
        `Think of weekly cost reports.`,
        `Account structure lets the production compare actuals with budget by line, which is how overruns are caught early.`),

      // ---------- L06 ----------
      mc(L06, 1, 1, `In the worked budget, what are the above-the-line costs?`,
        [`$150,000`, `$450,000`, `$200,000`, `$100,000`],
        `Add story/script, producers, director and cast.`,
        `40,000 plus 40,000 plus 30,000 plus 40,000 equals $150,000.`),
      mc(L06, 2, 2, `In the worked budget, below-the-line production costs are crew $200,000, equipment $80,000, locations $60,000, art and wardrobe $50,000, and transport and catering $60,000. What is the sum?`,
        [`$450,000`, `$440,000`, `$460,000`, `$400,000`],
        `Add the five lines carefully.`,
        `200 plus 80 is 280; plus 60 is 340; plus 50 is 390; plus 60 is $450,000.`),
      mc(L06, 3, 2, `Below-the-line production is $450,000 of a $900,000 pre-contingency subtotal. What fraction is that?`,
        [`One half`, `One third`, `Two thirds`, `One quarter`],
        `Divide 450 by 900.`,
        `450 divided by 900 is 0.5, one half of the subtotal.`),
      mc(L06, 4, 3, `A budget shows $20,000 for post-production on a $900,000 film with a lot of effects shots. What does that most suggest?`,
        [`Post is probably under-planned relative to the work`, `Post is overfunded`, `Effects shots are free in post`, `Contingency can be removed`],
        `Compare it with the 22 percent in the example.`,
        `The example allocates about 22 percent to post and music. A tiny allocation for a heavy post workload suggests under-planning.`),
      mc(L06, 5, 3, `Which costs are commonly OUTSIDE a production budget but still must be planned?`,
        [`Marketing, festival fees and loan interest`, `Director fee and principal cast compensation`, `Crew wages and overtime during the entire shoot`, `Location rental and permit fees for each set`],
        `Think about what happens after the film is made.`,
        `The budget covers the cost to make the film. Marketing, festival fees and finance costs often sit outside and need separate planning.`),

      // ---------- L07 ----------
      mc(L07, 1, 1, `How is scene length conventionally measured in a script breakdown?`,
        [`In eighths of a page`, `In minutes of screen time only`, `In number of lines`, `In words`],
        `A page is divided into small fractions.`,
        `Scene length is measured in eighths of a page.`),
      mc(L07, 2, 2, `A 90-page script is shot at 5 pages per day. How many shooting days?`,
        [`18`, `15`, `20`, `22`],
        `Divide pages by pages per day.`,
        `90 divided by 5 is 18 shooting days.`),
      mc(L07, 3, 2, `A 90-page script is shot at 4 pages per day. How many days, rounded up to a whole day?`,
        [`23`, `22`, `24`, `18`],
        `90 divided by 4 gives a fraction.`,
        `90 divided by 4 is 22.5, which rounds up to 23 days.`),
      mc(L07, 4, 3, `Why do productions group scenes by location rather than shoot in story order?`,
        [`To reduce company moves and use cast and locations efficiently`, `Because audiences prefer stories that are shot in scrambled order`, `Because guilds require it`, `To avoid writing call sheets`],
        `Think of what moving a crew costs.`,
        `Grouping by location limits company moves and actor days, saving time and money.`),
      mc(L07, 5, 3, `A scene of one and three-eighths pages is expressed how in eighths?`,
        [`11 eighths`, `13 eighths`, `9 eighths`, `10 eighths`],
        `One page is 8 eighths.`,
        `1 page is 8 eighths, plus 3 eighths is 11 eighths.`),

      // ---------- L08 ----------
      mc(L08, 1, 1, `What is a pre-sale?`,
        [`A license of rights in a territory sold before the film exists`, `A sale of the finished film at a festival`, `A discount for early ticket buyers`, `A loan from a guild`],
        `The buyer commits before the film is finished.`,
        `A pre-sale licenses a territory in advance, with payment on delivery, and can support a loan.`),
      mc(L08, 2, 2, `A film is funded by $400,000 of pre-sales, $300,000 of gap debt and $300,000 of equity. What share of the total is equity?`,
        [`30 percent`, `40 percent`, `20 percent`, `33 percent`],
        `Total is 1,000,000.`,
        `Total is $1,000,000 and equity is $300,000, so 30 percent.`),
      mc(L08, 3, 2, `For a $2,000,000 budget with $500,000 of grants and $300,000 from crowdfunding, how much remains to raise?`,
        [`$1,200,000`, `$1,300,000`, `$1,500,000`, `$800,000`],
        `Subtract both sources.`,
        `500,000 plus 300,000 is 800,000, and 2,000,000 minus 800,000 is $1,200,000.`),
      mc(L08, 4, 3, `Why is equity usually the riskiest layer?`,
        [`It is repaid after debt, so it absorbs shortfalls first`, `It is repaid before loans`, `It is guaranteed by the completion bond, so it can never lose money`, `It carries no upside`],
        `Who is first in line when money comes back?`,
        `Equity sits behind lenders in the repayment order, so losses hit it first, which is why it asks for upside.`),
      tf(L08, 5, 3, `A completion bond is a source of money that fills a funding gap in the budget.`, 1,
        `It guarantees delivery rather than adding a budget line.`,
        `False. A completion bond guarantees the film will be finished; it is not a funding source for the original budget.`),

      // ---------- L09 ----------
      mc(L09, 1, 1, `What does a capital stack show?`,
        [`The layers of financing and their order of repayment`, `The shooting schedule`, `The cast list`, `The release windows`],
        `Stack means layers.`,
        `A capital stack lists funding layers and the priority in which they are repaid.`),
      mc(L09, 2, 2, `A stack has a $1,000,000 tax-credit loan, $1,500,000 pre-sales, $1,000,000 gap loan and $1,500,000 equity. What is the budget?`,
        [`$5,000,000`, `$4,500,000`, `$5,500,000`, `$4,000,000`],
        `Add all four.`,
        `1.0 plus 1.5 plus 1.0 plus 1.5 equals $5,000,000.`),
      mc(L09, 3, 2, `Equity invested is $1,500,000 and it recoups at 120 percent before profit share. How much must it receive first?`,
        [`$1,800,000`, `$1,650,000`, `$1,500,000`, `$2,000,000`],
        `Multiply by 1.2.`,
        `1,500,000 times 1.2 is $1,800,000.`),
      mc(L09, 4, 3, `Why do pre-sales and incentives make equity easier to raise?`,
        [`They cover part of the budget with lower-risk money, lowering risk for the remainder`, `They eliminate the need for insurance`, `They are repaid after equity`, `They remove the need for delivery`],
        `Consider how the stack changes risk.`,
        `Contracted or secured layers reduce uncertainty, making the whole financing more credible to equity investors.`),
      mc(L09, 5, 3, `A $5,000,000 film goes 10 percent over budget. How much extra money is needed, and who typically covers it if there is a completion bond?`,
        [`$500,000, provided by the completion guarantor within its terms`, `$50,000, paid by the sales agent`, `$500,000, paid by the unions`, `$5,000,000, paid by the distributor under its output agreement terms`],
        `Ten percent of five million.`,
        `10 percent of $5,000,000 is $500,000. A completion guarantor is committed to fund overruns within the bond terms.`),

      // ---------- L10 ----------
      mc(L10, 1, 1, `What is a single-purpose entity in film?`,
        [`A company formed to make and own one film`, `A guild local that negotiates wages for crew`, `A distributor division that handles overseas sales`, `A type of insurance that covers set accidents`],
        `One film, one company.`,
        `An SPE, often an LLC, is set up for one project so contracts, assets and liability are contained.`),
      mc(L10, 2, 2, `An investor puts $100,000 into an LLC with $1,000,000 of total equity. What percentage of the equity does the investor hold?`,
        [`10 percent`, `1 percent`, `100 percent`, `5 percent`],
        `Divide 100,000 by 1,000,000.`,
        `100,000 divided by 1,000,000 is 10 percent.`),
      mc(L10, 3, 2, `The operating agreement gives the investor pool 50 percent of net profit. This 10 percent equity holder shares in the pool pro rata. What share of overall net profit do they receive?`,
        [`5 percent`, `10 percent`, `50 percent`, `0.5 percent`],
        `Take 10 percent of the 50 percent pool.`,
        `10 percent of 50 percent is 5 percent of net profit.`),
      mc(L10, 4, 3, `Which practice can undermine an LLC's liability protection?`,
        [`Mixing the company's funds with personal funds`, `Keeping separate bank accounts for the film company`, `Having a written operating agreement among members`, `Hiring an outside accountant to keep the books`],
        `Think about keeping things separate.`,
        `Commingling funds and ignoring formalities can lead a court to disregard the shield.`),
      mc(L10, 5, 3, `Why do lenders prefer to lend to a single-purpose film entity?`,
        [`They can take security in a clearly defined asset without claims from other projects`, `It exempts the loan from repayment`, `It guarantees a sale`, `It avoids the need for insurance`],
        `Think about a clean pool of assets.`,
        `A dedicated entity gives lenders a clear asset and revenue stream to secure against.`),

      // ---------- L11 ----------
      mc(L11, 1, 1, `Which insurance covers claims that a finished film infringes copyright or defames someone?`,
        [`Errors and omissions (E&O)`, `General liability coverage for the set`, `Cast insurance for an injured actor`, `Workers compensation for crew injuries`],
        `It protects the finished work after release.`,
        `E&O covers claims such as copyright infringement, defamation and privacy arising from the finished film.`),
      mc(L11, 2, 2, `A completion bond fee is 3 percent of a $5,000,000 budget. What is the fee?`,
        [`$150,000`, `$15,000`, `$250,000`, `$300,000`],
        `Multiply 5,000,000 by 0.03.`,
        `5,000,000 times 0.03 equals $150,000.`),
      mc(L11, 3, 2, `At a 5 percent fee, what does the bond cost on the same $5,000,000 budget?`,
        [`$250,000`, `$25,000`, `$200,000`, `$350,000`],
        `Multiply 5,000,000 by 0.05.`,
        `5,000,000 times 0.05 equals $250,000.`),
      mc(L11, 4, 3, `A crew member damages a rented house during the shoot. Which cover is most directly relevant?`,
        [`General liability`, `Errors and omissions coverage`, `A completion bond guarantee`, `Guild residuals payments owed`],
        `Third-party property damage.`,
        `General liability addresses third-party property damage and bodily injury arising from operations.`),
      tf(L11, 5, 3, `Insurers and guarantors generally accept any claim regardless of policy exclusions.`, 1,
        `Think about what exclusions are for.`,
        `False. Policies and bonds contain exclusions and conditions, so reading them carefully matters.`),

      // ---------- L12 ----------
      mc(L12, 1, 1, `Which guild represents screen performers?`,
        [`SAG-AFTRA`, `WGA`, `DGA`, `IATSE`],
        `The A stands for artists and the S for screen actors.`,
        `SAG-AFTRA represents actors, stunt performers and other on-camera and voice performers.`),
      mc(L12, 2, 2, `A production needs a camera operator, a gaffer and a grip. Which organization represents many such crafts?`,
        [`IATSE`, `WGA`, `DGA`, `AMPTP`],
        `Think of below-the-line crafts.`,
        `IATSE represents many below-the-line crafts through its local unions.`),
      mc(L12, 3, 2, `A production wants a unit production manager and assistant directors to work under a guild contract. Which guild typically covers those roles?`,
        [`DGA`, `WGA`, `SAG-AFTRA`, `IATSE`],
        `They are part of the directing team.`,
        `The DGA represents directors and also members of the directing team such as UPMs, ADs and stage managers.`),
      mc(L12, 4, 3, `What does becoming a signatory to a guild agreement mean?`,
        [`The production agrees to follow that guild's collective bargaining terms`, `The guild finances the film`, `The guild distributes the film to theaters and streaming services worldwide`, `The production is exempt from insurance`],
        `Signing means agreeing to terms.`,
        `A signatory signs the guild's agreement and must follow its minimums, benefits and procedures.`),
      mc(L12, 5, 3, `Why does this course avoid quoting guild rates?`,
        [`They change with each negotiated contract, so current figures must come from the union`, `They are secret by law`, `They never change`, `They are the same for every production`],
        `Think about how contracts are renewed.`,
        `Minimums and terms are renegotiated, so always consult the current agreement.`),

      // ---------- L13 ----------
      mc(L13, 1, 1, `Which two licenses does using a commercial recording of a song in a film require?`,
        [`Synchronization license and master use license`, `Location agreement and appearance release forms`, `Option agreement and purchase agreement papers`, `E&O policy and completion bond documents`],
        `One covers the composition, the other the recording.`,
        `Sync covers the musical composition; master use covers the specific sound recording.`),
      mc(L13, 2, 2, `You hire a band to record a cover of a famous song. What do you still need?`,
        [`A sync license from the composition owner`, `A master use license from the original label`, `Neither, because it is a cover`, `A guild bond`],
        `You own the new recording, not the song.`,
        `The composition still needs a sync license. The master for your new recording belongs to your production.`),
      mc(L13, 3, 2, `The label agrees to master use but the publisher refuses sync. What follows?`,
        [`You cannot lawfully use the song`, `You may use it with the master alone`, `You may use it if you credit the label`, `You may use it for the festival only`],
        `Both permissions are required.`,
        `Both licenses are required. Without sync you cannot use the composition.`),
      mc(L13, 4, 3, `Why are signed documents needed BEFORE the work is done?`,
        [`To avoid disputes and ensure rights vest in the production`, `Because guilds prohibit any signing after principal photography ends`, `To reduce the budget`, `To avoid insurance`],
        `Think about leverage after the fact.`,
        `Prior agreements settle rights, pay and credit before there is leverage or conflict.`),
      mc(L13, 5, 3, `Which signed document best addresses an unpaid extra whose face appears clearly in the film?`,
        [`An appearance release`, `A location agreement for the property`, `A sync license for the background music`, `A completion bond from a guarantor`],
        `It is about use of a person's image.`,
        `An appearance release grants permission to use a recognizable person's image.`),

      // ---------- L14 ----------
      mc(L14, 1, 1, `What is a prerequisite to filing a federal copyright infringement suit for a US work?`,
        [`Registration (or refusal) with the Copyright Office`, `A completion bond issued by a completion guarantor`, `A guild signature from the relevant union local office`, `A festival premiere before a paying audience`],
        `It is a filing with a government office.`,
        `For a US work, registration or refusal is required before suing for infringement.`),
      mc(L14, 2, 2, `Film first published March 1; infringement begins April 15; registration April 20. Are statutory damages and attorney's fees available?`,
        [`Yes, registration was within three months of publication`, `No, because infringement started before the film was registered at all`, `No, because April is too late`, `Only if the film was unpublished`],
        `Count the months from publication.`,
        `Registration within three months after first publication preserves those remedies even if infringement began earlier.`),
      mc(L14, 3, 2, `Film first published January 10; infringement begins June 1; registration July 1. Are statutory damages and fees available for that infringement?`,
        [`No`, `Yes, because registration was within a month of infringement`, `Yes, because the film was published`, `Only for foreign works`],
        `Check both timing tests.`,
        `Registration came after the infringement began and more than three months after publication, so those remedies are unavailable.`),
      mc(L14, 4, 3, `Why do E&O insurers want clearance procedures and a title report?`,
        [`They assess the risk of claims about title and clearance`, `They want to edit the film`, `They replace guild checks`, `They set ticket prices`],
        `Think underwriting.`,
        `Underwriters use clearance work to judge claims risk before issuing coverage.`),
      mc(L14, 5, 3, `Why record a security interest or assignment with the Copyright Office?`,
        [`It gives public notice of ownership and liens`, `It forces every buyer to pay the full asking price`, `It guarantees the film will earn a profit later`, `It replaces the need to register with the Copyright Office`],
        `Notice to the world.`,
        `Recordation provides public notice, which lenders and buyers rely on.`),

      // ---------- L15 ----------
      mc(L15, 1, 1, `What does SVOD stand for in streaming?`,
        [`Subscription video on demand`, `Single video on demand rental`, `Studio video on demand release`, `Streaming video on disc format`],
        `The viewer pays monthly.`,
        `SVOD is subscription video on demand: a fee for access to a catalogue.`),
      mc(L15, 2, 2, `A streamer licenses your film for a flat fee of $800,000. The film is watched by many viewers. What do you earn from the license?`,
        [`$800,000`, `More than $800,000 for each million views`, `Nothing until profit`, `$80,000`],
        `Flat means fixed.`,
        `A flat-fee license pays the agreed amount regardless of views.`),
      mc(L15, 3, 2, `A filmmaker rents a cinema and keeps all ticket income, paying the venue a flat rental. What is this called?`,
        [`Four-walling`, `Pre-selling territories`, `AVOD ad-supported streaming`, `Turnaround to another studio`],
        `The filmmaker takes the cinema's four walls.`,
        `Four-walling lets the filmmaker keep the ticket income while carrying the marketing risk.`),
      mc(L15, 4, 3, `Why does the release window order exist?`,
        [`To give each channel a period of exclusivity`, `Because guilds set the order of every release`, `To reduce piracy of the finished film to zero`, `To keep the film from ever entering festivals`],
        `Consider each channel's value.`,
        `Windows protect the value of each channel by sequencing availability, though lengths vary and have shortened.`),
      tf(L15, 5, 3, `Festivals are mainly a direct revenue source for most films.`, 1,
        `Think showcase versus income.`,
        `False. They are mainly showcases that generate attention and sales leads.`),

      // ---------- L16 ----------
      mc(L16, 1, 1, `What is a collection account management agreement used for?`,
        [`A neutral third party collects revenue and pays parties in agreed order`, `Insuring the film`, `Hiring crew`, `Registering copyright`],
        `It's about the flow of money.`,
        `A CAMA has a neutral manager collect revenue and disburse it per the waterfall.`),
      mc(L16, 2, 2, `Gross receipts are $10,000,000. A 15 percent sales commission is deducted, then $1,500,000 of expenses. What remains?`,
        [`$7,000,000`, `$8,500,000`, `$6,000,000`, `$7,500,000`],
        `Commission first, then expenses.`,
        `15 percent of 10,000,000 is 1,500,000, leaving 8,500,000; minus 1,500,000 leaves $7,000,000.`),
      mc(L16, 3, 2, `With $5,000,000 left, equity recoups $3,600,000, deferments are $400,000, and the remainder is split 50/50. What does the producer pool receive?`,
        [`$500,000`, `$1,000,000`, `$1,400,000`, `$250,000`],
        `Find net profit first, then halve it.`,
        `5,000,000 minus 3,600,000 is 1,400,000; minus 400,000 is 1,000,000 net profit; half is $500,000.`),
      mc(L16, 4, 3, `Gross is $6,000,000 with the same fee structure and a $2,000,000 loan. What is left for equity after commission, expenses and the loan?`,
        [`$1,600,000`, `$2,000,000`, `$3,600,000`, `$0`],
        `6,000,000 less 15 percent less 1,500,000 less 2,000,000.`,
        `Commission is 900,000, leaving 5,100,000; minus 1,500,000 is 3,600,000; minus 2,000,000 leaves $1,600,000 for equity, less than the $3,600,000 it is owed.`),
      mc(L16, 5, 3, `Why can a film with large gross receipts show no net profit?`,
        [`Fees, expenses, debt and recoupment come ahead of profit`, `Profit is paid before expenses and debt are repaid from receipts`, `Gross receipts are never reported`, `Net profit is taxed at 100 percent`],
        `Look at the order of the waterfall.`,
        `Net profit is what remains after every priority claim, so it is last in line and can be zero.`),

      // ---------- L17 ----------
      mc(L17, 1, 1, `What is premiere status?`,
        [`The film has not screened publicly before, which some festivals require`, `The film has a red carpet`, `The film has been sold`, `The film is bonded`],
        `Think first public showing.`,
        `Premiere status means the film has not been shown publicly, which can affect festival eligibility.`),
      mc(L17, 2, 2, `You submit to 20 festivals at $75 each. Six grant waivers. What do you pay?`,
        [`$1,050`, `$1,500`, `$450`, `$1,200`],
        `Count the festivals you still pay for.`,
        `14 paid submissions at $75 is $1,050.`),
      mc(L17, 3, 2, `How much do the six waivers save compared with paying for all 20 at $75?`,
        [`$450`, `$150`, `$1,050`, `$600`],
        `6 times 75.`,
        `6 times $75 is $450.`),
      mc(L17, 4, 3, `A small local screening takes place before the film applies to a major festival requiring a premiere. What is the risk?`,
        [`Losing premiere eligibility`, `Losing copyright in the finished film`, `Losing E&O cover on the policy`, `Losing guild status with the union`],
        `Think about the rule of first public showing.`,
        `An early public screening can forfeit premiere status where it is required.`),
      mc(L17, 5, 3, `Which is the best first step in planning a festival run?`,
        [`Define the goal, such as a sale, awards or audience, then pick festivals`, `Submit everywhere`, `Skip marketing materials`, `Wait for acceptance first`],
        `Strategy starts with an objective.`,
        `Goal-setting guides which festivals, budgets and materials make sense.`),

      // ---------- L18 ----------
      mc(L18, 1, 1, `What is a minimum guarantee (MG)?`,
        [`A fixed advance a buyer pays for rights in a territory`, `A guild minimum wage`, `An insurance deductible`, `A festival fee`],
        `It is paid regardless of performance.`,
        `An MG is an advance the distributor pays regardless of performance.`),
      mc(L18, 2, 2, `MGs are Germany $400,000, UK $250,000, France $300,000, Japan $150,000. What is the total?`,
        [`$1,100,000`, `$1,000,000`, `$1,200,000`, `$1,050,000`],
        `Add them.`,
        `400 plus 250 plus 300 plus 150 equals $1,100,000.`),
      mc(L18, 3, 2, `A 15 percent commission applies to $1,100,000. What does the producer have left before expenses?`,
        [`$935,000`, `$965,000`, `$900,000`, `$985,000`],
        `15 percent of 1,100,000 is 165,000.`,
        `1,100,000 minus 165,000 is $935,000.`),
      mc(L18, 4, 3, `What is the role of a sales agent at a market?`,
        [`To show the film to buyers, negotiate licenses and secure deals`, `To insure the film`, `To record copyright assignments`, `To register guild members`],
        `They represent the film to buyers.`,
        `Sales agents present the film at markets and negotiate territory licenses.`),
      mc(L18, 5, 3, `Why does late or incomplete delivery matter?`,
        [`Buyers' payments often depend on receiving all required materials`, `Delivery has no effect`, `It changes copyright ownership`, `It cancels guild agreements`],
        `Think of the MG payment schedule.`,
        `Payment is tied to delivery, so missing items delay or reduce income.`),

      // ---------- L19 ----------
      mc(L19, 1, 1, `According to this course, tools such as Plajah's production suite can organize work but do not replace what?`,
        [`An entertainment attorney, accountant, insurer or guild`, `A script`, `Cameras`, `Editors`],
        `Think of professional advice.`,
        `Tools organize the work but do not replace professional legal and financial advice.`),
      mc(L19, 2, 2, `A shoot of 18 days is complete. The clearance list shows 2 unsigned music cues out of 12 total. How many are signed?`,
        [`10`, `12`, `9`, `14`],
        `Subtract unsigned from total.`,
        `12 minus 2 is 10 signed cues.`),
      mc(L19, 3, 2, `A festival deadline is in 6 weeks, which is 42 days. Counsel needs 10 days to clear the cues and 3 weeks for delivery items. How many days remain after both, assuming they run one after the other?`,
        [`11`, `13`, `21`, `32`],
        `3 weeks is 21 days.`,
        `10 plus 21 is 31 days, and 42 minus 31 is 11 days remaining.`),
      mc(L19, 4, 3, `Which approach best uses a production tool alongside this course?`,
        [`Check each call sheet, clearance and budget revision against the checklist and bring gaps to counsel`, `Assume the tool handles all legal clearance`, `Skip budget revisions`, `Avoid signed agreements`],
        `Tools surface problems; professionals fix them.`,
        `Tools make missing items visible so professionals can resolve them.`),
      tf(L19, 5, 3, `Using a production management tool means you no longer need signed contracts with cast and crew.`, 1,
        `Think about who creates legal rights.`,
        `False. Signed agreements remain essential; a tool only helps track them.`),
    ],
  },
};
