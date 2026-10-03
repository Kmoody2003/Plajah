import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'entertainment-finance.l01';
const L02 = 'entertainment-finance.l02';
const L03 = 'entertainment-finance.l03';
const L04 = 'entertainment-finance.l04';
const L05 = 'entertainment-finance.l05';
const L06 = 'entertainment-finance.l06';
const L07 = 'entertainment-finance.l07';
const L08 = 'entertainment-finance.l08';
const L09 = 'entertainment-finance.l09';
const L10 = 'entertainment-finance.l10';
const L11 = 'entertainment-finance.l11';
const L12 = 'entertainment-finance.l12';
const L13 = 'entertainment-finance.l13';
const L14 = 'entertainment-finance.l14';
const L15 = 'entertainment-finance.l15';
const L16 = 'entertainment-finance.l16';
const L17 = 'entertainment-finance.l17';
const L18 = 'entertainment-finance.l18';
const L19 = 'entertainment-finance.l19';
const L20 = 'entertainment-finance.l20';
const L21 = 'entertainment-finance.l21';
const L22 = 'entertainment-finance.l22';
const L23 = 'entertainment-finance.l23';
const L24 = 'entertainment-finance.l24';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'entertainment-finance',
    label: 'Entertainment Finance',
    blurb: 'How films, music, live shows and games get funded and how the money flows back: financing sources, budgets, waterfalls, royalties, valuation, audits, risk, taxes, investor pitches and ethics. All figures are illustrative; terms and rules vary and change. General education, not financial or legal advice.',
    accent: '#06D6A0',
    framework: 'ncas',
    tracks: [
      {
        id: 'entertainment-finance.t1',
        title: 'Where the Money Comes From',
        blurb: 'The main ways entertainment projects are funded, from investors and loans to presales, incentives and crowds.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Why Entertainment Needs a Financing Plan',
            blurb: 'Projects spend money long before they earn any, so someone has to fund the gap and take the risk.',
            minutes: 6,
            body: `Making a movie, an album, a tour or a video game has a strange money shape: almost all the costs come first, and the income, if any, arrives later and is uncertain. A film crew must be paid before a single ticket is sold. A band pays for a studio before anyone streams a song. The money used to cover those early costs is called financing, and the job of assembling it is called a financing plan.

Every dollar of financing comes with a cost and a risk. Some money is cheap but must be paid back no matter what. Some money asks for no repayment but wants a share of the profits, if there are any. Some comes from customers or partners who pay early in exchange for a promise. Smart producers mix several sources so that no single source carries all the risk.

Here is an illustrative plan for a small film with a $2,000,000 budget. Equity investors supply $800,000. Presales to distributors supply $600,000. A government tax incentive is expected to return $300,000. A bank loan supplies the final $300,000. Add them up: 800,000 + 600,000 + 300,000 + 300,000 = 2,000,000. The plan is fully funded on paper.

Notice what could go wrong. If the incentive arrives late, the project has a cash gap. If the loan has strict repayment terms, it must be repaid before the investors see a penny. Understanding who gets paid first, and who gets nothing if things go badly, is the heart of entertainment finance, and the rest of this course unpacks it. All numbers here are examples only; real terms vary and change.`,
          },
          {
            id: L02,
            title: 'Equity and Debt',
            blurb: 'Debt must be repaid with interest; equity shares in profit but can lose everything.',
            minutes: 6,
            body: `There are two basic kinds of money. Debt is borrowed money. The lender expects the loan back plus interest, whether the project succeeds or not. Equity is invested money. The investor owns a share of the project or its profits, and is paid only if there are profits to share.

Consider a producer who needs $400,000. Option A is a loan at 10% simple interest for one year. At the end of the year the producer owes 400,000 + (400,000 x 0.10) = $440,000. Option B is an equity investment of $400,000 in exchange for 40% of the project's net profit.

Now imagine two outcomes. If the project earns a net profit of $1,000,000, the equity investor receives 40% of 1,000,000 = $400,000, a return of their original money, while the lender received just $40,000 in interest on top of principal. Equity paid more in the good case. If the project earns nothing, the lender is still owed $440,000, while the equity investor receives $0 and loses the original $400,000. Debt is safer for the one who provides it; equity has more upside and more risk.

Because debt must be repaid first, lenders are said to be senior and equity junior in the order of payment. Many projects use both: a senior loan secured against something solid, and equity taking the remaining risk. Producers prefer to borrow only what the project can plausibly repay. Interest rates, security and legal terms vary widely and change over time.`,
          },
          {
            id: L03,
            title: 'Presales, Distribution Advances and Tax Incentives',
            blurb: 'Early payments from distributors and government incentives can fund production before release.',
            minutes: 7,
            body: `A presale is a contract in which a distributor in a territory agrees, before the film is made, to pay a fee for the right to release it there. The fee is often called a minimum guarantee. Typically, only a small part is paid on signing, with the balance due when the finished film is delivered. A bank may lend against the presale contract, because a signed deal from a reputable buyer is something it can rely on. The distributor's decision usually rests on the cast, the director, the script and past sales of similar projects.

Suppose a producer signs three presales of $300,000 each. That is 3 x 300,000 = $900,000 of contracted income. If 10% is paid on signing, each deal pays $30,000 up front and $270,000 on delivery. Delivery has conditions: the film must match the agreed specifications, and a late or non-conforming delivery can delay or reduce payment.

Tax incentives are programs where a government gives a credit, rebate or similar benefit for spending in its territory. Many places offer them to attract production, but rules, rates and caps differ widely and change. As an illustration, a 25% incentive on $1,200,000 of qualifying spending is 0.25 x 1,200,000 = $300,000. Only qualifying spending counts, often local labor and services, so the full budget is rarely eligible. Incentives frequently arrive after an audit of costs, which is why producers often borrow against them while waiting. Ask a specialist about the current rules of any place you plan to film.`,
          },
          {
            id: L04,
            title: 'Gap Loans, Bridge Loans and Completion Bonds',
            blurb: 'Lenders cover shortfalls and timing gaps, and a bond company guarantees the project gets finished.',
            minutes: 7,
            body: `Two loan types are common. A bridge loan covers timing: money that is promised but has not arrived yet, such as a tax incentive paid after production wraps. A gap loan covers a shortfall: the part of the budget not covered by presales, equity or incentives. Gap lenders take more risk, because they are repaid from sales that have not happened yet, so they charge more and are cautious about how much they lend.

Take a $5,000,000 film. Presales provide $2,000,000, equity $1,500,000 and a tax incentive $1,000,000. Those total 2,000,000 + 1,500,000 + 1,000,000 = $4,500,000. The gap is 5,000,000 - 4,500,000 = $500,000. A gap lender might finance that, secured against unsold territories.

A bridge example: the $1,000,000 incentive will arrive in about six months, but a bridge lender will lend only 80% of it: 0.8 x 1,000,000 = $800,000. At 12% annual interest for half a year, interest is 800,000 x 0.12 x 0.5 = $48,000.

A completion bond is an insurance-like guarantee, issued by a specialist company, that the film will be finished and delivered as promised. If costs run over, the bond company can step in, and may take control. Lenders and distributors often require one. The fee is typically a small percentage of the budget; at an illustrative 2% on $5,000,000, it would cost $100,000. Terms vary and change, and a bond does not guarantee that the film will be good or profitable.`,
          },
          {
            id: L05,
            title: 'Grants, Crowdfunding and Slate Financing',
            blurb: 'Non-repayable support, funding from many small backers, and pooled bets on several projects.',
            minutes: 7,
            body: `A grant is money given without an expectation of repayment, usually by governments, arts councils or foundations, for work meeting stated aims. Grants are competitive, have application windows and reporting duties, and often cover only part of the cost. They are especially common for documentaries, experimental work and community projects.

Crowdfunding collects many small contributions online, usually in exchange for rewards such as copies or credits, though some regulated forms offer investment shares. Platforms and payment processors keep fees. Illustratively, if a campaign raises $50,000 and total fees are 8%, the creator receives 50,000 - (0.08 x 50,000) = 50,000 - 4,000 = $46,000, and must still pay for making and shipping the rewards. Many platforms release funds only if the goal is met. Crowdfunding also proves demand and builds an audience, which can help in later fundraising.

Slate financing pools money across several projects instead of betting on one. Imagine an investor funds four films with $2,000,000 each, a total of $8,000,000. The films return $1,000,000, $2,000,000, $3,000,000 and $6,000,000, for 12,000,000 in all. The overall gain is 12,000,000 - 8,000,000 = $4,000,000, or 50%, even though one film lost money. One big hit paid for the others. The tradeoff is that slates reduce the risk of a single failure but not the risk that the whole slate underperforms. Figures here are made up for teaching.`,
          },
        ],
      },
      {
        id: 'entertainment-finance.t2',
        title: 'Budgets, Cash Flow and Waterfalls',
        blurb: 'Planning spending, tracking cash, and understanding who gets paid in what order.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L06,
            title: 'Budgets Versus Forecasts',
            blurb: 'A budget is the plan; a forecast is the current best estimate of where costs will land.',
            minutes: 6,
            body: `A budget is a plan for what a project will cost, set before spending begins and approved by the people providing money. A forecast is an updated estimate, made during the project, of what the total will actually be. The difference matters: the budget rarely changes, but the forecast changes often. Comparing them tells you early whether you are on track.

A forecast has three parts. Actual costs are what has already been spent. The estimate to complete is what you expect to spend from now on. Together they give the forecast total, sometimes called the estimate at completion. The variance is the forecast minus the budget; a positive variance means over budget.

Example: a film is budgeted at $900,000 of base costs plus a $100,000 contingency, for a $1,000,000 total. Contingency is a reserve for unexpected costs, commonly around a tenth of the other costs, though this varies. A few weeks in, $300,000 has been spent and the producer expects $650,000 more. The forecast of base costs is 300,000 + 650,000 = $950,000. The variance is 950,000 - 900,000 = $50,000 over. That overage comes out of contingency, leaving 100,000 - 50,000 = $50,000 of reserve.

If the forecast kept climbing past the whole contingency, the producer would need to cut costs or find more money. Funders and bond companies often watch the forecast closely, which is why a candid, regularly updated forecast builds trust.`,
          },
          {
            id: L07,
            title: 'Cash Flow: Why Profitable Projects Still Run Out of Money',
            blurb: 'Timing of money in and out can cause a shortfall even when the project will eventually profit.',
            minutes: 6,
            body: `Profit is what is left after all costs over the life of a project. Cash flow is the movement of money in and out month by month. A project can be profitable overall yet run out of cash in the middle, because costs come early and income comes late. Businesses fail from cash shortages even when the long-run math looks fine.

A cash flow forecast lists expected money coming in and going out in each period and tracks the running balance. Example: a production starts with $400,000 in the bank. Payroll and other costs are $250,000 per month. A $300,000 tax incentive is expected in month six, but nothing else arrives before then.

After month one: 400,000 - 250,000 = $150,000. After month two: 150,000 - 250,000 = -$100,000. The account is short by $100,000 before the incentive arrives, and the shortfall keeps growing each month until it does. The project must find bridge financing, delay costs, or negotiate payment terms. The incentive is real, but it comes too late.

Practical habits follow from this. Update cash forecasts weekly during production. Match big payments to the dates income is actually due. Keep a reserve. Ask lenders for a facility before you need it, because borrowing is easier when you are not already in trouble. A cash crunch is solved by timing, not by hope.`,
          },
          {
            id: L08,
            title: 'Waterfalls and the Order of Recoupment',
            blurb: 'A waterfall lists who is paid first, second and so on as revenue comes in.',
            minutes: 8,
            body: `When money comes in, it does not go to everyone at once. A waterfall is a contractual list showing the order in which revenue is paid out, each tier filling up before the next receives anything. Being earlier in the waterfall means being paid sooner and with more certainty. Recoupment means earning back an amount owed, such as a loan or an investment.

A typical but not universal order is: distributor fees and expenses first, then senior lenders, then equity investors' capital (often with a premium), and only then the remaining profit split. Real contracts differ, so always read the actual agreement.

Example, with made-up figures. A film receives $1,500,000 in revenue.
1. Distribution fee of 20%: 0.20 x 1,500,000 = 300,000. Remaining: $1,200,000.
2. Distribution expenses: 100,000. Remaining: $1,100,000.
3. Senior loan of 300,000 plus 30,000 interest: 330,000. Remaining: $770,000.
4. Equity investors recoup 500,000 plus a 20% premium of 100,000: 600,000. Remaining: $170,000.
5. The profit is split 50/50 between the investor pool and the producer: 85,000 each.

Investors in total receive 600,000 + 85,000 = $685,000 on a $500,000 investment. If revenue had been only $1,000,000, the same steps would leave 1,000,000 - 200,000 - 100,000 - 330,000 = $370,000 for the equity tier, less than the 600,000 owed, and the producer would receive nothing from profit. Position in the waterfall decides who bears the shortfall.`,
          },
          {
            id: L09,
            title: 'Gross Versus Net Profit and Definitions of Net Points',
            blurb: 'A share of gross is paid from the top; a share of net depends on a long list of deductions in the contract.',
            minutes: 8,
            body: `People who work on a project are sometimes paid a percentage of the revenue. The key question is: percent of what? Gross receipts are the money coming in, before most deductions. Net profit is what remains after deductions defined in the contract, which can include distribution fees, distribution expenses, production costs and interest. The word "net" has no single meaning; each agreement defines it. A participant's share is often described in points, where one point is one percent, applied to the defined profit pool.

Consider a film that collects $10,000,000 in gross receipts. Under an illustrative definition of net profit, subtract a 25% distribution fee (2,500,000), distribution expenses of 3,000,000, production cost of 4,000,000 and financing interest of 500,000. That is 2,500,000 + 3,000,000 + 4,000,000 + 500,000 = 10,000,000. The net profit is 10,000,000 - 10,000,000 = $0. A participant with 5% of net profit receives nothing, though 5% of gross would have been $500,000.

If the same film earned $12,000,000, the deductions would be 3,000,000 (25% fee) + 3,000,000 + 4,000,000 + 500,000 = 10,500,000, leaving net profit of $1,500,000, and 5 points would pay 0.05 x 1,500,000 = $75,000.

Because definitions can be so consequential, creators and their advisers negotiate them carefully, ask for caps on fees and overhead, and look for clear reporting. Some share the gross after a threshold instead. This debate over fairness is long-running and is revisited in the ethics lesson.`,
          },
        ],
      },
      {
        id: 'entertainment-finance.t3',
        title: 'Money in Film, Music, Live Events and Games',
        blurb: 'How guild payments, advances, publishing, touring, ticket settlements and game deals work.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Residuals and Guild Payments at a Glance',
            blurb: 'Collective bargaining agreements set minimum pay and reuse payments for guild members.',
            minutes: 6,
            body: `Many performers, writers and directors belong to guilds or unions. A guild negotiates a collective bargaining agreement (CBA) with employers, setting minimum pay, working conditions, credits and payments for reuse of the work. Those reuse payments are called residuals. When a program is rebroadcast, streamed, sold to other markets or released on other formats, covered members may receive additional payments under formulas in the CBA. Producers must budget for these obligations, and distributors often sign agreements to assume them so the guild can be confident they will be paid.

Residual formulas vary by guild, medium and market, and change at each negotiation, so this lesson is an overview with a purely hypothetical rate. Suppose a CBA required a residual pool equal to 2% of $3,000,000 in reuse revenue. That pool is 0.02 x 3,000,000 = $60,000. If it is shared in proportion to original pay, and Actor A earned $30,000 while Actor B earned $10,000, A's share is 30,000 / 40,000 = 75% of the pool, which is $45,000, and B's is 25%, or $15,000.

Guild contracts also require contributions to pension and health plans, typically calculated as a percentage on top of pay. These fringes are real costs that belong in the budget. A common mistake is treating guild pay as only the weekly rate. Consult the current agreement or a payroll company for real figures.`,
          },
          {
            id: L11,
            title: 'Music Advances and Recoupment',
            blurb: 'An advance is a prepayment against future royalties, repaid only out of the artist\'s earnings.',
            minutes: 7,
            body: `In a traditional record deal, a label pays the artist an advance, money paid up front that is later deducted from the royalties the artist earns. Recoupment is the label earning back that advance. The artist does not usually pay it back out of pocket if the record underperforms, but they also receive no royalty checks until the advance is recouped. Contracts differ, and many modern deals use different structures, so read the agreement.

An advance often includes a recording fund, which covers the cost of making the record. Suppose a label gives a $150,000 advance. The artist's royalty is 20% of the label's net receipts. If the label's net receipts are $1,000,000, the artist earns 0.20 x 1,000,000 = $200,000 in royalties. Subtract the advance: 200,000 - 150,000 = $50,000 paid to the artist.

If receipts were only $600,000, the artist earns 0.20 x 600,000 = $120,000. That is less than the advance, so the artist is unrecouped by 150,000 - 120,000 = $30,000 and receives nothing yet. Future earnings go first to the $30,000.

Cross-collateralization means a shortfall on one record can be recouped from earnings on another. Some deals allow recoupment of other costs, such as video or marketing support, which lengthens the road to payment. Negotiating the royalty base, rate, recoupable items and cross-collateralization matters as much as the size of the advance.`,
          },
          {
            id: L12,
            title: 'Publishing Deals and Songwriter Income',
            blurb: 'Songs earn through a writer share and a publisher share, and different deal types split them differently.',
            minutes: 7,
            body: `A song has two kinds of rights: the recording (the master) and the composition (the words and music). Music publishing handles the composition. Publishers collect income from performances, mechanical licenses, synchronization in film and television, and print, and typically pay songwriters their share.

Income is commonly pictured as a pie in two halves. The writer's share is usually half of performance income and is paid directly to the writer by a performing rights organization. The publisher's share is the other half, paid to whoever publishes the song.

Different deals divide the publisher's half in different ways. A traditional publishing deal usually gives the publisher ownership or part-ownership of the copyright in return for an advance and active promotion. An administration deal lets the writer keep ownership, and the administrator collects income for a fee, typically somewhere around 10% to 25% depending on services.

Example, illustrative: a song earns $200,000, making the writer's share $100,000 and the publisher's share $100,000. A self-publishing writer using an administrator at a 15% fee pays 0.15 x 100,000 = $15,000 and keeps 100,000 - 15,000 = $85,000 of the publisher's share. Total to the writer: 100,000 + 85,000 = $185,000.

Under a traditional deal, the publisher might keep a larger part of that publisher's share but offer an advance and pitching of songs. Which is better depends on the writer's leverage and need for services.`,
          },
          {
            id: L13,
            title: 'The Touring Profit and Loss Statement',
            blurb: 'A tour is a business: revenue minus costs and commissions shows what the artist actually keeps.',
            minutes: 7,
            body: `A profit and loss statement, or P&L, lists revenue and expenses for a period or project, ending in the profit. For a tour, a P&L answers the question every artist should ask before going on the road: after everyone is paid, what is left?

Revenue includes the artist's share of ticket income, merchandise sales, sponsorship and other income. Costs include crew wages, travel, hotels, trucking, equipment hire, insurance and production. Advisers are usually paid as a percentage of income: agents commonly take around 10% and managers around 15% to 20%, though agreements vary.

Illustrative example. A tour plays 20 shows to 1,500 paying people each at $50 per ticket. Gross ticket sales are 20 x 1,500 x 50 = $1,500,000. Suppose after venue costs and the promoter's share, the artist's side receives $1,200,000. Tour costs are $600,000. Before commissions, that leaves 1,200,000 - 600,000 = $600,000. The agent at 10% of 1,200,000 receives $120,000; the manager at 15% receives $180,000. Net to the artist is 600,000 - 120,000 - 180,000 = $300,000, a margin of 25% of the artist's income.

Notice that costs are mostly fixed, so selling fewer tickets shrinks profit quickly, while selling out helps a lot. Merchandise often matters because it can carry a high profit margin. A cautious P&L tests a bad-case scenario before the tour is booked.`,
          },
          {
            id: L14,
            title: 'Ticketing, Promoters and Settlement',
            blurb: 'After a show, the settlement sheet decides who gets what from the night\'s revenue.',
            minutes: 7,
            body: `A promoter books the artist, secures the venue, markets the show and takes the financial risk of the night. Tickets are sold through ticketing systems that charge service fees, and taxes and facility charges may be added. After the show, the artist's team and the promoter prepare a settlement, a written accounting of revenue, expenses and the resulting payment.

A very common structure is a guarantee versus a percentage: the artist is paid the greater of a fixed guarantee or a percentage of net box office, where net box office means ticket revenue after agreed show expenses. Exact terms, such as which fees count as expenses, are negotiated in advance, and unclear definitions are a common source of disputes.

Example, illustrative. The artist has a $50,000 guarantee versus 85% of net. The venue sells 2,000 tickets at $60, so gross is 2,000 x 60 = $120,000. Agreed show expenses (rent, production, marketing, staffing) total $50,000, so net is 120,000 - 50,000 = $70,000. 85% of 70,000 is $59,500, which exceeds the guarantee, so the artist receives $59,500. The promoter keeps 70,000 - 59,500 = $10,500.

If only half the tickets sold, gross would be $60,000 and net $10,000; 85% would be only $8,500, so the guarantee of $50,000 would apply, and the promoter would lose money on the night. That downside is why promoters analyze demand carefully and why artists with proven demand can ask for large guarantees. Always check a settlement line by line.`,
          },
          {
            id: L15,
            title: 'Games and Interactive Finance at a Glance',
            blurb: 'Game funding combines publisher advances, platform fees and ongoing in-game revenue.',
            minutes: 6,
            body: `Games are expensive to make and can take years, so funding often comes from a publisher, investors, platform programs, crowdfunding or the studio's own earlier hits. A publisher typically advances money toward development and in return takes distribution rights and a revenue share. As in music, the advance is recouped from the developer's earnings before the developer sees further payments, though structures vary.

Revenue arrives through several routes: sales of the game, subscriptions, in-game purchases and advertising. Digital stores keep a platform fee, and a figure of 30% has long been a common headline rate, though lower rates exist in some programs and the rules change.

Illustrative example. A publisher advances $5,000,000. The game earns $10,000,000 in gross sales. A platform fee of 30% removes 0.30 x 10,000,000 = $3,000,000, leaving $7,000,000. The publisher first recoups its $5,000,000 advance, leaving 7,000,000 - 5,000,000 = $2,000,000. If the remainder is then split 50/50, the developer receives $1,000,000 and the publisher $1,000,000 more.

Live-service games, which keep updating and selling content after launch, make revenue more continuous but need ongoing spending and careful forecasting. Milestones, in which the publisher pays in stages after the developer delivers agreed builds, reduce risk for both sides. Questions of who owns the underlying intellectual property and what happens if a project is cancelled are crucial terms to negotiate.`,
          },
        ],
      },
      {
        id: 'entertainment-finance.t4',
        title: 'Value, Records, Risk and Taxes',
        blurb: 'Valuing catalogs, checking the books, insuring against disaster and understanding taxes at a high level.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L16,
            title: 'Valuing Catalogs and Libraries',
            blurb: 'Catalogs are often priced as a multiple of steady annual earnings, or as discounted future cash.',
            minutes: 7,
            body: `A catalog is a collection of rights that keep earning, such as a group of songs, a set of master recordings or a library of films and shows. Buyers and sellers need a way to put a price on that stream of future income.

One common shortcut is the multiple: price equals a multiple of average annual earnings. Many catalogs are valued on an average of the last few years of net income. The multiple depends on how stable the income is, how fast it is growing, how long the rights last, the genre, and prevailing interest rates. Multiples of several times earnings up to well above ten times have been discussed in various markets and eras, so treat any number as typical for a moment, not a rule.

Example, illustrative. A song catalog earned $100,000, $120,000 and $140,000 over three years. The average is (100,000 + 120,000 + 140,000) / 3 = $120,000. At a multiple of 12, the value is 12 x 120,000 = $1,440,000. At 10 times it would be $1,200,000; at 15 times, $1,800,000.

A second method discounts future cash. Money later is worth less than money now. At an 8% discount rate, $108,000 received in a year is worth 108,000 / 1.08 = $100,000 today. Adding up discounted payments across years gives a present value. Careful buyers also check whether ownership of the rights is clean, whether income is one-off spikes, and how royalties are actually paid.`,
          },
          {
            id: L17,
            title: 'Accounting, Statements and Contract Audit Rights',
            blurb: 'If you are paid based on someone else\'s accounting, an audit clause lets you check it.',
            minutes: 7,
            body: `Creators and investors who are paid a share of income usually rely on statements prepared by the party that collects the money, such as a label, distributor or publisher. A statement summarizes income, deductions and the amount payable. Errors happen through honest mistakes, unclear contracts or, occasionally, deliberate underreporting.

An audit right is a clause giving the payee the power to have an independent accountant inspect the payer's relevant books and records. Typical limits include notice requirements, a limit on how often an audit can be done, a time window after each statement, and rules about who pays the cost. Windows of a year or two are common but vary, and statements may become binding if the deadline is missed. Check dates in your own contract.

Illustrative example. A label paid royalties based on $800,000 of receipts, but an audit finds the true figure was $900,000. The artist's rate is 20%. The unpaid amount is 0.20 x (900,000 - 800,000) = 0.20 x 100,000 = $20,000. If the audit cost $15,000, the net benefit is 20,000 - 15,000 = $5,000, and the contract might shift cost to the payer if the underpayment exceeds a set percentage.

Audits are worthwhile when potential recovery is large compared with cost, and they also deter errors. Even without an audit, read statements, keep copies of contracts and ask questions early. Good records on your own side make any future dispute easier.`,
          },
          {
            id: L18,
            title: 'Risk Management and Insurance',
            blurb: 'Insurance transfers certain insurable risks, but it does not protect against a project simply not finding an audience.',
            minutes: 6,
            body: `Risk is the chance that something goes wrong. Entertainment has many kinds: accidents, equipment damage, illness, bad weather, legal claims, late delivery, disputes, and market failure. Good finance work lists risks, estimates how likely and how costly they are, and decides whether to avoid, reduce, insure or accept each one.

Insurance transfers certain risks to an insurer in exchange for a premium. Common policies for productions include general liability, for injury or property damage claims; equipment coverage; workers' compensation, which is legally required in many places; errors and omissions, which protects against claims such as infringement or defamation in the finished work; and coverage when a key person, such as the lead performer, cannot work. Live events may buy event cancellation cover. Which policies are required depends on contracts, lenders and local law.

A deductible is the amount you bear before the insurer pays. Example, illustrative: a camera is damaged, and the covered loss is $80,000 with a $10,000 deductible. The insurer pays 80,000 - 10,000 = $70,000, and the production bears $10,000.

Insurance has limits. Policies have exclusions, require truthful disclosure, and do not protect against the audience not showing up or a film being weak. Read the policy, work with a specialist broker, and tell the insurer everything relevant. Planning, such as backup locations and safety procedures, often reduces risk more cheaply than insurance alone.`,
          },
          {
            id: L19,
            title: 'Taxes at a High Level, and Choosing an Entity',
            blurb: 'How you organize your business changes how income is taxed and where liability falls.',
            minutes: 8,
            body: `This lesson is a broad introduction to U.S. ideas; tax law is detailed, changes often and depends on your situation, so a qualified accountant is essential. Creators typically receive income as an individual (self-employed), through a business entity, or both.

A sole proprietorship has no separate legal existence; income flows to the owner's return and the owner is personally responsible for debts. A limited liability company (LLC) is a legal entity that can separate personal assets from many business liabilities, and by default is taxed as a pass-through, meaning profit is taxed on the owners' returns. An S corporation is a tax election with pass-through treatment under conditions. A C corporation is taxed itself on profits, and shareholders are taxed again when profits are paid as dividends, often called double taxation.

Illustrative example. A C corporation earns $100,000. At the U.S. federal corporate rate of 21% (as of this writing; check the current rate), tax is $21,000, leaving $79,000. If all of it is paid out as dividends taxed at an assumed 15%, the shareholder owes 0.15 x 79,000 = $11,850 and keeps 79,000 - 11,850 = $67,150. A pass-through entity would instead report the $100,000 to the owner's return, and the result depends on the owner's own rates and deductions.

Other points to ask about: self-employment tax, deductions for business expenses, how advances are taxed, sales tax on merchandise, and state rules. Choice of entity also affects investors, who often prefer particular structures.`,
          },
        ],
      },
      {
        id: 'entertainment-finance.t5',
        title: 'Deals, Investors and Integrity',
        blurb: 'International money, pitching, term sheets, spotting fraud and acting ethically.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L20,
            title: 'International Income, Withholding and Currency',
            blurb: 'Income from abroad may be reduced by withholding tax and changed in value by exchange rates.',
            minutes: 7,
            body: `Entertainment income often crosses borders: a song streams abroad, a film sells to foreign distributors, an artist performs overseas. Two issues arise.

First, withholding tax. Some countries require the payer to deduct tax from certain payments to foreign recipients, such as royalties or performance fees, and send it to the tax authority before paying the rest. Rates differ by country and type of payment, and tax treaties between countries can reduce them if paperwork is filed. Your home country may allow a foreign tax credit, which offsets the home tax by what you paid abroad, within limits. Without planning, the same income can be taxed twice.

Illustrative example. A U.S. artist is due a $100,000 royalty from a country with a 15% withholding rate. The payer withholds 0.15 x 100,000 = $15,000 and pays $85,000. If the artist can claim a credit for the $15,000, the effect on U.S. tax may be reduced, but they must keep the withholding certificate or receipt.

Second, currency risk. Contracts priced in a foreign currency change in value as exchange rates move. A deal worth 1,000,000 euros at an exchange rate of 1.10 dollars per euro equals $1,100,000. If the rate falls to 1.00, the same payment equals $1,000,000, a loss of $100,000 with no change to the contract. Producers may agree to price in their own currency or hedge the exposure. International co-productions combine funding from several countries and require careful agreements on ownership and territories. Seek local specialist advice.`,
          },
          {
            id: L21,
            title: 'Pitching Investors',
            blurb: 'A good pitch shows the opportunity, the team, the plan and an honest range of outcomes.',
            minutes: 7,
            body: `Investors give money in return for potential reward and need to believe in three things: the project, the people and the plan. A pitch package commonly includes a short deck, a script or demo, a budget, a financing plan, comparable projects, a schedule, a distribution or release strategy, and an explanation of how and when investors could be repaid.

Comparables, or comps, are similar past projects that show what the market has paid. Choose them honestly: a handful of recent, relevant titles is more persuasive than one blockbuster that no one could replicate. Show how your team has delivered before, or explain how you reduce the risk of inexperience, for example by attaching experienced partners.

Present a range of outcomes rather than a single promise. A common method is scenario analysis with an expected value, the probability-weighted average. Suppose an investor puts in $1,000,000. In your illustrative scenarios there is a 50% chance of getting back $500,000, 30% of $1,200,000 and 20% of $3,000,000. Expected return is 0.50 x 500,000 + 0.30 x 1,200,000 + 0.20 x 3,000,000 = 250,000 + 360,000 + 600,000 = $1,210,000. The probabilities are judgments, not facts, and you should say so.

Never guarantee returns. Offering shares in a project to investors can be regulated as a securities offering in many places, with rules on who may invest and what must be disclosed, so involve a lawyer before you solicit money. Honesty protects both the investor and your reputation.`,
          },
          {
            id: L22,
            title: 'Reading a Term Sheet',
            blurb: 'A term sheet outlines the main deal points before long contracts are drafted.',
            minutes: 7,
            body: `A term sheet is a short document summarizing the main terms of a proposed deal. Most of it is typically non-binding, meaning the parties are not yet obliged to close, though some clauses, such as confidentiality or exclusivity (a period when you agree not to shop the deal elsewhere), can be binding. Always check which parts bind. Detailed contracts follow, and the final contract controls.

Key items include the amount invested, the valuation or return, the form of security (equity, loan, profit share), the position in the waterfall, any premium, fees and expenses, approval rights, credit, reporting duties, timelines, conditions that must be satisfied before funding, and what happens if the project is abandoned.

Valuation terms matter. Pre-money value is what the company is valued at before the investment; post-money adds the new cash. Example, illustrative: an investor puts in $200,000 at a pre-money valuation of $800,000. Post-money value is 800,000 + 200,000 = $1,000,000, and the investor owns 200,000 / 1,000,000 = 20%.

Dilution occurs when new investors come in later. If a later investor puts in $500,000 at a pre-money value of $1,500,000, post-money is $2,000,000 and the new investor owns 500,000 / 2,000,000 = 25%. The first investor's 20% shrinks to 20% x 0.75 = 15%, because everyone else now owns 75% of the larger company.

Read every clause, ask what each one would do in a bad scenario, and have a lawyer review before signing. Pressure to sign quickly is a reason to slow down.`,
          },
          {
            id: L23,
            title: 'Red Flags and Fraud',
            blurb: 'Patterns that should make you pause: guaranteed returns, secrecy, pressure and missing paperwork.',
            minutes: 7,
            body: `Most producers and investors are honest, but entertainment attracts fraud because projects are hard to value and glamour lowers people's guard. Learning the warning signs protects both investors and creators.

Common red flags include guaranteed or unusually high returns; pressure to invest immediately; reluctance to provide written contracts, budgets or bank details; vague descriptions of where money goes; claims of famous attachments or distribution deals that cannot be verified; mixing project money with personal spending; unlicensed sellers of investments; and requests for upfront fees before promised financing arrives. A Ponzi-style scheme pays earlier investors with money from later ones rather than from real income, and collapses when new money stops.

Arithmetic can reveal problems too. Suppose a producer offers 40% of a film's profits to each of three investors. 3 x 40% = 120%, which is impossible, because only 100% exists. The producer has oversold the project, and someone will lose out. Similarly, a promise of a 30% return in six months equals roughly 60% a year, far above what most legitimate investments reliably earn.

Protect yourself:
- verify identities and past credits independently
- ask to see signed distribution agreements and confirm them with the other party using contact details you found yourself
- pay into escrow or a lawyer's trust account rather than a personal account
- get everything in writing
- and consult a lawyer or accountant.

If you suspect fraud, stop paying and report it to the appropriate authorities.`,
          },
          {
            id: L24,
            title: 'Ethics in Entertainment Finance',
            blurb: 'Fair dealing, honest reporting, and disclosure of conflicts build the trust the industry runs on.',
            minutes: 7,
            body: `Entertainment finance depends on trust, because one side often holds the books and the other must rely on them. Ethical practice goes beyond what a contract technically allows.

Core principles include honest forecasting, with no inflated projections to win funding; accurate reporting, with statements that follow the agreed definitions; disclosure of conflicts of interest; fair treatment of creators, crew and smaller participants; and respect for the intent as well as the letter of agreements.

A conflict of interest arises when someone has a personal interest that could affect their duty to others. Example: a production company charges its own film a 10% overhead fee on a $500,000 budget, which is 0.10 x 500,000 = $50,000 paid to itself. That may be perfectly acceptable when clearly agreed and disclosed. It becomes a problem when it is hidden, or when the investors believed the full $500,000 would go on the screen.

There are real, contested debates. Net-profit definitions in the industry have been criticized by some creators as opaque and weighted toward the party that keeps the accounts; studios and distributors respond that their deductions reflect genuine costs and risks they bear. Both sides have a point, and the best response is clearer contracts, reasonable caps and transparent reporting rather than assuming bad faith. Fair pay for artists in the streaming era is similarly debated.

Practical habits: write down agreements, explain waterfalls plainly, share statements on time, correct mistakes promptly, and refuse requests to disguise numbers. Reputation lasts longer than any single deal.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'entertainment-finance',
    questions: [
      // L01
      tf(L01, 1, 1, `In most entertainment projects, the costs arrive before the income does.`, 0, `Think about when a film crew is paid compared with when tickets are sold.`, `Projects typically spend money up front while revenue arrives later and is uncertain, which is why financing is needed.`),
      mc(L01, 2, 1, `A film has a $2,000,000 budget. Equity gives $800,000, presales $600,000 and a tax incentive $300,000. How much must a loan supply to fully fund it?`, [`$300,000`, `$400,000`, `$500,000`, `$800,000`], `Add the three known sources and subtract from the budget.`, `800,000 + 600,000 + 300,000 = 1,700,000, so the remaining 2,000,000 - 1,700,000 = 300,000.`),
      mc(L01, 3, 2, `Why do producers usually combine several funding sources?`, [`So that no single source carries all of the risk`, `Because only one source is ever legal`, `Because mixing sources removes all risk`, `Because lenders refuse to lend to funded projects`], `Think about what happens if one source falls through.`, `Mixing sources spreads risk, though it does not remove it.`),
      tf(L01, 4, 2, `A tax incentive that arrives late can leave a project short of cash even if the budget looks fully funded on paper.`, 0, `Consider the difference between having money promised and having it in the bank.`, `Timing matters: promised money that has not arrived cannot pay today's bills.`),
      mc(L01, 5, 3, `Which description best fits a financing plan?`, [`A schedule of how the budget will be paid for, from several sources`, `A list of every actor in the film`, `A prediction of how many tickets will be sold`, `A promise to investors that they will profit`], `It answers the question where the money comes from.`, `A financing plan assembles sources of funds to cover the budget; it does not promise profit.`),
      // L02
      mc(L02, 1, 1, `Which statement describes debt?`, [`Borrowed money that must be repaid, usually with interest`, `Money invested in return for a share of any profit`, `A gift that never needs repaying`, `A payment from a customer before delivery`], `Think about who expects to get the money back no matter what.`, `Debt is a loan: the lender expects principal and interest back whether or not the project succeeds.`),
      mc(L02, 2, 2, `A producer borrows $400,000 at 10% simple interest for one year. How much is owed at the end?`, [`$440,000`, `$410,000`, `$404,000`, `$500,000`], `Interest is 10% of the principal.`, `400,000 x 0.10 = 40,000 of interest, so 440,000 is owed.`),
      mc(L02, 3, 2, `An investor puts in $400,000 for 40% of net profit. The project earns net profit of $1,000,000. What does the investor receive as their profit share?`, [`$400,000`, `$40,000`, `$440,000`, `$1,000,000`], `Take 40% of the net profit.`, `0.40 x 1,000,000 = 400,000.`),
      tf(L02, 4, 2, `If a project earns nothing, an equity investor is still owed their money back with interest.`, 1, `Equity is repaid only from profits.`, `Equity investors are paid only if there is something to share; interest-bearing repayment is the feature of debt.`),
      mc(L02, 5, 3, `Why are lenders described as senior to equity investors?`, [`They are repaid first when money comes in`, `They own more of the project`, `They approve the creative choices`, `They always earn higher returns`], `Seniority relates to order of payment.`, `Senior debt is paid ahead of equity, which sits lower in the order and absorbs losses first.`),
      // L03
      mc(L03, 1, 1, `What is a presale?`, [`A contract to pay for distribution rights before the film is made`, `A discount on tickets before opening night`, `A sale of the finished script`, `A tax refund for filming locally`], `The word pre means before.`, `In a presale a distributor agrees in advance to pay a fee for rights in a territory.`),
      mc(L03, 2, 2, `A producer signs three presales of $300,000 each, with 10% paid on signing. How much is paid on signing across all three?`, [`$90,000`, `$30,000`, `$270,000`, `$900,000`], `Find 10% of the combined total.`, `Total is 900,000; 10% of that is 90,000 (30,000 per deal).`),
      tf(L03, 3, 1, `A late or non-conforming delivery can delay or reduce the balance paid under a presale.`, 0, `Think about the conditions attached to delivery.`, `Distributors usually pay the balance only when the film meets the agreed delivery requirements.`),
      mc(L03, 4, 2, `A 25% incentive applies to $1,200,000 of qualifying spending. What is the incentive?`, [`$300,000`, `$120,000`, `$480,000`, `$25,000`], `Multiply the qualifying spend by the rate.`, `0.25 x 1,200,000 = 300,000.`),
      mc(L03, 5, 3, `Why might a producer borrow against an expected tax incentive?`, [`Because the incentive often arrives after costs are audited, leaving a timing gap`, `Because incentives are paid before filming starts`, `Because borrowing eliminates interest`, `Because the law requires a loan for every incentive`], `Think about when the incentive money actually arrives.`, `Incentives frequently arrive after cost audits, so producers may borrow to cover the wait.`),
      // L04
      mc(L04, 1, 1, `Which loan covers money that is promised but has not arrived yet?`, [`A bridge loan`, `A gap loan`, `A mortgage`, `A completion bond`], `The name suggests crossing a timing gap.`, `A bridge loan covers timing, such as waiting for an incentive; a gap loan covers a shortfall.`),
      mc(L04, 2, 2, `A $5,000,000 film has $2,000,000 in presales, $1,500,000 equity and $1,000,000 incentive. What is the gap?`, [`$500,000`, `$1,000,000`, `$4,500,000`, `$250,000`], `Subtract all known sources from the budget.`, `2,000,000 + 1,500,000 + 1,000,000 = 4,500,000; 5,000,000 - 4,500,000 = 500,000.`),
      mc(L04, 3, 2, `A bridge lender lends 80% of a $1,000,000 incentive at 12% annual interest for half a year. How much interest accrues?`, [`$48,000`, `$96,000`, `$60,000`, `$120,000`], `Principal is 800,000; apply the rate for half a year.`, `800,000 x 0.12 x 0.5 = 48,000.`),
      tf(L04, 4, 1, `A completion bond guarantees that a film will be profitable.`, 1, `Consider what a bond covers: finishing, not success.`, `A bond is a guarantee of completion and delivery, not of quality or profit.`),
      mc(L04, 5, 3, `At an illustrative 2% fee, what would a completion bond cost on a $5,000,000 budget?`, [`$100,000`, `$10,000`, `$250,000`, `$1,000,000`], `Take 2% of the budget.`, `0.02 x 5,000,000 = 100,000.`),
      // L05
      tf(L05, 1, 1, `A grant is generally money given without an expectation of repayment.`, 0, `Compare it with a loan.`, `Grants support work that meets stated aims and are usually not repaid, though they come with conditions.`),
      mc(L05, 2, 2, `A crowdfunding campaign raises $50,000 and fees total 8%. How much does the creator receive before fulfillment costs?`, [`$46,000`, `$4,000`, `$42,000`, `$54,000`], `Subtract the fee from the amount raised.`, `0.08 x 50,000 = 4,000, so 50,000 - 4,000 = 46,000.`),
      mc(L05, 3, 2, `What is the main idea of slate financing?`, [`Funding several projects together so one hit can offset losses`, `Funding one project with a single large loan`, `Paying all actors the same fee`, `Selling a film before it is written`], `Think about spreading a bet.`, `Slates pool money across projects to reduce reliance on any single one.`),
      mc(L05, 4, 3, `An investor funds four films totaling $8,000,000 that return $12,000,000 in all. What is the overall percentage gain?`, [`50%`, `33%`, `150%`, `25%`], `Gain divided by the amount invested.`, `12,000,000 - 8,000,000 = 4,000,000, and 4,000,000 / 8,000,000 = 50%.`),
      tf(L05, 5, 3, `Slate financing removes the risk that the whole slate underperforms.`, 1, `Diversification spreads risk but does not erase it.`, `If all the projects do poorly, the slate loses; pooling reduces single-project risk only.`),
      // L06
      tf(L06, 1, 1, `A forecast is an updated estimate of final cost made during the project.`, 0, `Contrast it with a plan set before spending begins.`, `A budget is the plan; a forecast re-estimates where costs will end up.`),
      mc(L06, 2, 2, `A film has $900,000 of base costs budgeted. $300,000 has been spent and $650,000 is expected to be spent. What is the variance?`, [`$50,000 over`, `$50,000 under`, `$150,000 over`, `$350,000 over`], `Add actual and estimate to complete, then compare with the budget.`, `300,000 + 650,000 = 950,000, which is 50,000 over the 900,000 budget.`),
      mc(L06, 3, 2, `With a $100,000 contingency and a $50,000 overage absorbed, how much contingency remains?`, [`$50,000`, `$100,000`, `$150,000`, `$0`], `Subtract the overage from the reserve.`, `100,000 - 50,000 = 50,000.`),
      mc(L06, 4, 1, `What is contingency?`, [`A reserve in the budget for unexpected costs`, `A fee paid to the director`, `Money earned from sales`, `A type of tax credit`], `It is for surprises.`, `Contingency is a budgeted reserve for unforeseen costs.`),
      tf(L06, 5, 3, `The estimate to complete plus actual costs to date gives the forecast total.`, 0, `It combines what has been spent and what is expected.`, `Actuals plus estimate to complete equals the estimate at completion, the forecast total.`),
      // L07
      mc(L07, 1, 1, `What is cash flow?`, [`The movement of money in and out over time`, `The total profit at the end of a project`, `A kind of loan`, `A tax on income`], `Think of a stream through time.`, `Cash flow tracks money coming in and going out period by period.`),
      mc(L07, 2, 2, `A production has $400,000 and spends $250,000 per month with no income. What is the balance after month one?`, [`$150,000`, `$250,000`, `-$100,000`, `$650,000`], `Subtract one month of spending.`, `400,000 - 250,000 = 150,000.`),
      mc(L07, 3, 2, `Continuing that production with no income, what is the balance after month two?`, [`-$100,000`, `$150,000`, `$100,000`, `-$250,000`], `Subtract another month from the month-one balance.`, `150,000 - 250,000 = -100,000, a shortfall.`),
      tf(L07, 4, 2, `A project can be profitable overall and still run out of cash partway through.`, 0, `Consider costs coming before income.`, `Timing mismatches cause cash shortfalls even when lifetime profit is positive.`),
      mc(L07, 5, 3, `Which habit best reduces the risk of a cash crunch?`, [`Updating the cash forecast often and arranging a credit facility early`, `Waiting until the account is empty to seek a loan`, `Ignoring incoming payments until they arrive`, `Paying all costs at once at the start`], `Plan ahead rather than react.`, `Frequent forecasts and early financing arrangements give time to solve timing gaps.`),
      // L08
      mc(L08, 1, 1, `What is a waterfall in entertainment finance?`, [`The contractual order in which revenue is paid out`, `A style of lighting`, `A type of tax credit`, `A budget line for contingency`], `Each tier fills before the next.`, `A waterfall lists who is paid first, second and so on as revenue arrives.`),
      mc(L08, 2, 2, `In the lesson example, $1,500,000 arrives. After a 20% distribution fee, how much remains?`, [`$1,200,000`, `$1,300,000`, `$300,000`, `$1,480,000`], `Take 20% off the revenue.`, `0.20 x 1,500,000 = 300,000; 1,500,000 - 300,000 = 1,200,000.`),
      mc(L08, 3, 3, `After a fee of 300,000, expenses of 100,000 and loan repayment of 330,000, then equity recoupment of 600,000 from $1,500,000, how much profit remains to split?`, [`$170,000`, `$770,000`, `$600,000`, `$270,000`], `Subtract each step in order.`, `1,500,000 - 300,000 - 100,000 - 330,000 - 600,000 = 170,000.`),
      mc(L08, 4, 2, `If the remaining $170,000 is split 50/50, how much does each side receive?`, [`$85,000`, `$170,000`, `$50,000`, `$100,000`], `Divide by two.`, `170,000 / 2 = 85,000.`),
      tf(L08, 5, 3, `Being earlier in the waterfall generally means being paid sooner and with more certainty.`, 0, `Think about who gets first claim on revenue.`, `Earlier tiers are filled first, so they are protected when revenue falls short.`),
      // L09
      mc(L09, 1, 1, `Which phrase best describes gross receipts?`, [`Money coming in, before most deductions`, `Profit after all deductions`, `A type of fee`, `The production budget`], `Gross is the big top-line number.`, `Gross receipts are revenue before deductions defined for net profit.`),
      tf(L09, 2, 1, `The word net has the same meaning in every contract.`, 1, `Contracts define their own terms.`, `Net profit is whatever the agreement defines, which can include many deductions.`),
      mc(L09, 3, 3, `A film grosses $10,000,000. Deductions are a 25% distribution fee, $3,000,000 expenses, $4,000,000 production cost and $500,000 interest. What is net profit?`, [`$0`, `$500,000`, `$2,500,000`, `$10,000,000`], `Add all deductions and subtract from gross.`, `2,500,000 + 3,000,000 + 4,000,000 + 500,000 = 10,000,000, leaving 0.`),
      mc(L09, 4, 2, `In that same example, what would 5% of gross have paid?`, [`$500,000`, `$50,000`, `$0`, `$5,000,000`], `Take 5% of 10,000,000.`, `0.05 x 10,000,000 = 500,000, while 5% of net profit of 0 is nothing.`),
      mc(L09, 5, 3, `At $12,000,000 gross with the same costs (fee now 25% of gross), net profit is $1,500,000. What do 5 points of net pay?`, [`$75,000`, `$60,000`, `$600,000`, `$7,500`], `Take 5% of the net profit.`, `0.05 x 1,500,000 = 75,000.`),
      // L10
      tf(L10, 1, 1, `Residuals are payments for reuse of a work, set by agreements such as guild contracts.`, 0, `Think about reruns and other releases.`, `Residuals compensate covered members when work is reused, under formulas in the contract.`),
      mc(L10, 2, 1, `What does a collective bargaining agreement set?`, [`Minimum pay, conditions and certain reuse payments for guild members`, `The ticket price of a movie`, `The tax rate on royalties`, `The film's budget`], `It is negotiated between a guild and employers.`, `CBAs set minimums, working conditions, credits and reuse payments.`),
      mc(L10, 3, 2, `With a hypothetical rate, a residual pool is 2% of $3,000,000. What is the pool?`, [`$60,000`, `$6,000`, `$600,000`, `$30,000`], `Multiply the revenue by the rate.`, `0.02 x 3,000,000 = 60,000.`),
      mc(L10, 4, 3, `Actor A earned $30,000 and Actor B $10,000. The $60,000 pool is shared in proportion to original pay. What does A receive?`, [`$45,000`, `$30,000`, `$15,000`, `$20,000`], `A earned three quarters of the combined pay.`, `30,000 / 40,000 = 75%, and 0.75 x 60,000 = 45,000.`),
      tf(L10, 5, 2, `Pension and health contributions are real costs that belong in a budget alongside weekly pay.`, 0, `Guild contracts add more than the weekly rate.`, `Fringes calculated on pay are required costs and must be budgeted.`),
      // L11
      mc(L11, 1, 1, `What is an advance in a record deal?`, [`Money paid up front and later deducted from royalties earned`, `A gift that is never accounted for`, `A fee paid by fans`, `A tax refund`], `It is repaid out of future earnings.`, `An advance is a prepayment recouped from the artist's royalties.`),
      mc(L11, 2, 2, `An artist has a $150,000 advance and a 20% royalty on $1,000,000 of net receipts. What is paid after recoupment?`, [`$50,000`, `$200,000`, `$150,000`, `$350,000`], `Compute royalties, then subtract the advance.`, `0.20 x 1,000,000 = 200,000; 200,000 - 150,000 = 50,000.`),
      mc(L11, 3, 2, `With net receipts of only $600,000 at 20%, how much remains unrecouped on a $150,000 advance?`, [`$30,000`, `$120,000`, `$0`, `$150,000`], `Royalties earned are 120,000.`, `0.20 x 600,000 = 120,000; 150,000 - 120,000 = 30,000 unrecouped.`),
      tf(L11, 4, 2, `Cross-collateralization lets a shortfall on one record be recouped from earnings on another.`, 0, `The word describes pooling accounts.`, `Under cross-collateralization, unrecouped amounts can be recovered from other earnings.`),
      mc(L11, 5, 3, `Why might recoupable extras like video costs hurt an artist?`, [`They extend the time before royalties are actually paid`, `They increase the royalty rate`, `They cancel the advance`, `They are paid by the label with no effect`], `Think about what must be earned back before payments start.`, `More recoupable costs mean more to earn back before the artist receives money.`),
      // L12
      mc(L12, 1, 1, `Which right does music publishing mainly handle?`, [`The composition: words and music`, `The recording only`, `Concert tickets`, `Merchandise`], `Distinguish song from recording.`, `Publishing deals with the composition; masters are the recordings.`),
      tf(L12, 2, 2, `The writer's share is commonly about half of performance income and is paid directly to the writer.`, 0, `Think about the two halves of the pie.`, `Performing rights organizations typically pay the writer's half directly.`),
      mc(L12, 3, 2, `In an administration deal, who usually keeps ownership of the copyright?`, [`The writer`, `The administrator`, `The performing rights organization`, `The venue`], `The administrator collects for a fee.`, `Administration deals let the writer keep ownership while paying a fee for collection services.`),
      mc(L12, 4, 3, `A song earns $200,000 total. The writer self-publishes with a 15% administration fee on the publisher's $100,000 share. What does the writer receive in all?`, [`$185,000`, `$85,000`, `$170,000`, `$200,000`], `Writer share plus publisher share minus the fee.`, `Fee is 15,000; 100,000 + (100,000 - 15,000) = 185,000.`),
      mc(L12, 5, 2, `What does a traditional publishing deal typically give the publisher?`, [`Ownership or part-ownership of the copyright in return for an advance and promotion`, `Control of the writer's live performances`, `Ownership of the recording`, `A share of ticket sales`], `Compare with an admin deal.`, `Traditional deals trade copyright interest for an advance and active promotion.`),
      // L13
      mc(L13, 1, 1, `What does a profit and loss statement show?`, [`Revenue, expenses and resulting profit`, `Only the budget`, `The ticket prices`, `The number of fans`], `The name tells you.`, `A P&L lists revenue and expenses and ends with profit.`),
      mc(L13, 2, 2, `A tour plays 20 shows to 1,500 people each at $50. What is gross ticket sales?`, [`$1,500,000`, `$150,000`, `$75,000`, `$15,000,000`], `Multiply shows, attendance and price.`, `20 x 1,500 = 30,000 tickets; 30,000 x 50 = 1,500,000.`),
      mc(L13, 3, 3, `The artist side receives $1,200,000, with costs of $600,000, a 10% agent and a 15% manager on the $1,200,000. What is net to the artist?`, [`$300,000`, `$600,000`, `$450,000`, `$420,000`], `Subtract costs, then both commissions.`, `Agent 120,000 and manager 180,000: 1,200,000 - 600,000 - 120,000 - 180,000 = 300,000.`),
      tf(L13, 4, 2, `Because tour costs are largely fixed, selling fewer tickets can shrink profit quickly.`, 0, `Consider costs that do not shrink with attendance.`, `Fixed costs remain while revenue falls, so profit drops sharply.`),
      mc(L13, 5, 2, `The artist's $300,000 net on $1,200,000 of artist income is what margin?`, [`25%`, `30%`, `20%`, `50%`], `Divide net by income.`, `300,000 / 1,200,000 = 0.25.`),
      // L14
      mc(L14, 1, 1, `What is a settlement in live events?`, [`A written accounting of the night's revenue, expenses and payments`, `A court ruling`, `A ticket refund`, `A contract for the next tour`], `It happens after the show.`, `Settlement is the post-show accounting that decides who is paid what.`),
      mc(L14, 2, 2, `A show sells 2,000 tickets at $60. What is gross?`, [`$120,000`, `$12,000`, `$62,000`, `$1,200,000`], `Multiply tickets by price.`, `2,000 x 60 = 120,000.`),
      mc(L14, 3, 3, `Gross $120,000, expenses $50,000, artist gets 85% of net versus a $50,000 guarantee. What does the artist receive?`, [`$59,500`, `$50,000`, `$102,000`, `$70,000`], `Compare the percentage of net with the guarantee.`, `Net is 70,000; 85% is 59,500, which exceeds 50,000.`),
      mc(L14, 4, 2, `Using that same night, what does the promoter keep after paying the artist?`, [`$10,500`, `$59,500`, `$20,000`, `$70,000`], `Net minus the artist payment.`, `70,000 - 59,500 = 10,500.`),
      tf(L14, 5, 3, `If a show sells poorly, a guarantee can mean the promoter loses money while the artist is still paid.`, 0, `Consider which side carries the downside.`, `A guarantee shifts risk to the promoter, who must pay it regardless of sales.`),
      // L15
      mc(L15, 1, 1, `What is a milestone payment in game development?`, [`A payment made after the developer delivers an agreed build`, `A bonus paid to players`, `A tax on sales`, `A fee for store listing`], `Payments happen in stages.`, `Milestones tie publisher payments to delivered work.`),
      mc(L15, 2, 2, `A game earns $10,000,000 and a 30% platform fee applies. How much remains?`, [`$7,000,000`, `$3,000,000`, `$9,700,000`, `$6,000,000`], `Subtract the fee.`, `0.30 x 10,000,000 = 3,000,000; 10,000,000 - 3,000,000 = 7,000,000.`),
      mc(L15, 3, 3, `With $7,000,000 remaining, a $5,000,000 advance recouped first, and the rest split 50/50, what does the developer receive?`, [`$1,000,000`, `$2,000,000`, `$3,500,000`, `$0`], `Recoup first, then split what is left.`, `7,000,000 - 5,000,000 = 2,000,000; half is 1,000,000.`),
      tf(L15, 4, 1, `A 30% platform fee has long been a common headline figure, though rates and rules vary and change.`, 0, `Consider that fees differ by program.`, `The figure is common but not universal, and programs differ.`),
      mc(L15, 5, 2, `What makes live-service games different financially?`, [`They earn and spend continuously after launch`, `They never need a budget`, `They have no platform fees`, `They are free of risk`], `Think about ongoing updates.`, `Live-service games rely on ongoing content and revenue, so forecasting is continuous.`),
      // L16
      mc(L16, 1, 1, `What is a catalog in this context?`, [`A collection of rights that keep earning, like songs or films`, `A printed list of products`, `A type of loan`, `A film crew roster`], `Think of rights producing ongoing income.`, `Catalogs are bundles of rights that generate income over time.`),
      mc(L16, 2, 2, `A catalog earned $100,000, $120,000 and $140,000 in three years. What is the average?`, [`$120,000`, `$100,000`, `$360,000`, `$140,000`], `Add and divide by three.`, `360,000 / 3 = 120,000.`),
      mc(L16, 3, 2, `At an illustrative multiple of 12 on $120,000, what is the value?`, [`$1,440,000`, `$1,200,000`, `$120,012`, `$1,800,000`], `Multiply earnings by the multiple.`, `12 x 120,000 = 1,440,000.`),
      mc(L16, 4, 3, `At an 8% discount rate, what is $108,000 received in a year worth today?`, [`$100,000`, `$116,640`, `$99,360`, `$108,000`], `Divide by 1.08.`, `108,000 / 1.08 = 100,000.`),
      tf(L16, 5, 1, `A valuation multiple is a fixed rule that applies to every catalog.`, 1, `Multiples depend on many factors.`, `Multiples vary with stability, growth, genre, rights and market conditions.`),
      // L17
      mc(L17, 1, 1, `What does a contract audit right allow?`, [`An independent check of the payer's relevant records`, `Changing the royalty rate`, `Canceling the contract`, `Publishing the payer's accounts`], `Think of verifying statements.`, `An audit clause lets the payee examine records that support the statements.`),
      tf(L17, 2, 2, `Audit rights often have time limits after each statement, so deadlines matter.`, 0, `Consider how long you have to check.`, `Contracts typically set a window, after which statements may become binding.`),
      mc(L17, 3, 3, `An audit shows receipts were $900,000, not $800,000, with a 20% rate. What is the underpayment?`, [`$20,000`, `$100,000`, `$180,000`, `$2,000`], `The unreported amount times the rate.`, `0.20 x 100,000 = 20,000.`),
      mc(L17, 4, 2, `If that audit cost $15,000 and recovered $20,000, what is the net benefit?`, [`$5,000`, `$35,000`, `$15,000`, `$20,000`], `Subtract cost from recovery.`, `20,000 - 15,000 = 5,000.`),
      mc(L17, 5, 2, `When is an audit most worthwhile?`, [`When the potential recovery is large compared with its cost`, `When statements are always perfect`, `Only after a contract ends`, `Whenever the artist is unhappy`], `Think cost against benefit.`, `Audits make sense when likely recovery outweighs cost, and they also deter errors.`),
      // L18
      mc(L18, 1, 1, `What is a deductible?`, [`The amount you bear before the insurer pays`, `The insurer's profit`, `A tax refund`, `The policy's expiry date`], `It is your share of a loss.`, `The deductible is what the insured bears first.`),
      mc(L18, 2, 2, `A covered loss is $80,000 with a $10,000 deductible. What does the insurer pay?`, [`$70,000`, `$80,000`, `$90,000`, `$10,000`], `Subtract the deductible.`, `80,000 - 10,000 = 70,000.`),
      tf(L18, 3, 2, `Production insurance typically protects against an audience not showing up.`, 1, `Consider what is insurable.`, `Insurance covers specified perils; commercial failure is a business risk it does not cover.`),
      mc(L18, 4, 2, `Which coverage protects against claims such as infringement or defamation in a finished work?`, [`Errors and omissions`, `Equipment coverage`, `Workers' compensation`, `Event cancellation`], `The name refers to mistakes in the content.`, `Errors and omissions insurance addresses claims arising from the content itself.`),
      mc(L18, 5, 3, `Which approach to a risk lowers its likelihood rather than transferring it?`, [`Safety procedures and backup locations`, `Buying a policy`, `Ignoring it`, `Increasing the deductible`], `Think prevention.`, `Reducing a risk means preventing it; insurance transfers cost afterward.`),
      // L19
      mc(L19, 1, 1, `Which entity type is taxed itself on profits and again on dividends?`, [`C corporation`, `Sole proprietorship`, `Default LLC`, `Partnership`], `The term is double taxation.`, `A C corporation pays tax on profits and shareholders pay tax on dividends.`),
      tf(L19, 2, 2, `A pass-through entity reports profit on the owners' own tax returns.`, 0, `Profit passes through to owners.`, `Pass-through taxation means business income is taxed at the owner level.`),
      mc(L19, 3, 3, `A C corporation earns $100,000 and pays 21% tax. What remains?`, [`$79,000`, `$21,000`, `$100,000`, `$89,000`], `Subtract the tax.`, `0.21 x 100,000 = 21,000; 100,000 - 21,000 = 79,000.`),
      mc(L19, 4, 3, `Paying the remaining $79,000 as a dividend taxed at an assumed 15%, what does the shareholder keep?`, [`$67,150`, `$11,850`, `$79,000`, `$64,150`], `Compute tax on the dividend and subtract.`, `0.15 x 79,000 = 11,850; 79,000 - 11,850 = 67,150.`),
      mc(L19, 5, 1, `Why consult an accountant?`, [`Tax rules are detailed, change, and depend on your situation`, `Because tax rules never change`, `Because all entities are taxed identically`, `Because accountants set the tax rates`], `Consider the lesson's caution.`, `Rules vary and change, so personalized professional advice matters.`),
      // L20
      mc(L20, 1, 1, `What is withholding tax?`, [`Tax deducted by the payer before paying the recipient`, `A fee paid to a manager`, `A refund from a government`, `A type of insurance`], `The payer holds back part of the payment.`, `Payers may be required to deduct tax and send it to the tax authority.`),
      mc(L20, 2, 2, `A $100,000 royalty faces 15% withholding. How much does the artist receive?`, [`$85,000`, `$15,000`, `$100,000`, `$115,000`], `Subtract 15%.`, `0.15 x 100,000 = 15,000; 100,000 - 15,000 = 85,000.`),
      tf(L20, 3, 2, `A foreign tax credit can help offset home-country tax by what was paid abroad, within limits.`, 0, `The name suggests credit for tax paid elsewhere.`, `Many systems allow a credit to reduce double taxation, though limits and paperwork apply.`),
      mc(L20, 4, 3, `A contract is for 1,000,000 euros. At 1.10 dollars per euro, what is it worth in dollars?`, [`$1,100,000`, `$1,000,000`, `$909,091`, `$110,000`], `Multiply by the rate.`, `1,000,000 x 1.10 = 1,100,000.`),
      mc(L20, 5, 3, `If the rate falls to 1.00, how much value in dollars is lost on that 1,000,000 euro payment?`, [`$100,000`, `$10,000`, `$1,000,000`, `$0`], `Compare the two dollar values.`, `1,100,000 - 1,000,000 = 100,000.`),
      // L21
      mc(L21, 1, 1, `What are comparables, or comps?`, [`Similar past projects that show what the market has paid`, `The cast list`, `A type of loan`, `Free tickets`], `They are for comparison.`, `Comps are similar projects used to support expectations.`),
      mc(L21, 2, 3, `An investor puts in $1,000,000. Scenarios: 50% chance of $500,000, 30% of $1,200,000, 20% of $3,000,000. What is the expected return?`, [`$1,210,000`, `$1,000,000`, `$1,566,667`, `$4,700,000`], `Weight each outcome by its probability.`, `250,000 + 360,000 + 600,000 = 1,210,000.`),
      tf(L21, 3, 1, `A good pitch should guarantee investors a profit.`, 1, `Consider honesty about uncertainty.`, `Guaranteeing returns is a warning sign; honest ranges are appropriate.`),
      mc(L21, 4, 2, `Why involve a lawyer before soliciting investors?`, [`Offers of shares may be regulated as securities`, `Lawyers set the film budget`, `It is required to write a script`, `Investors prefer lawyers to producers`], `Think about regulations.`, `Securities rules can apply, with limits on who may invest and what must be disclosed.`),
      tf(L21, 5, 2, `Scenario probabilities in a pitch are judgments, and should be presented as such.`, 0, `Consider whether anyone can know them for sure.`, `Probabilities are estimates and should be labeled honestly.`),
      // L22
      mc(L22, 1, 1, `Is a term sheet usually binding?`, [`Mostly not, though some clauses like confidentiality may be`, `Always entirely binding`, `Never has any binding clause`, `Binding only on the lawyers`], `Check which parts bind.`, `Most terms are non-binding, but clauses like exclusivity can bind.`),
      mc(L22, 2, 2, `An investor puts in $200,000 at an $800,000 pre-money valuation. What is the post-money value?`, [`$1,000,000`, `$600,000`, `$800,000`, `$160,000`], `Add the new cash.`, `800,000 + 200,000 = 1,000,000.`),
      mc(L22, 3, 2, `What percentage does that investor own?`, [`20%`, `25%`, `200%`, `80%`], `Investment divided by post-money.`, `200,000 / 1,000,000 = 20%.`),
      mc(L22, 4, 3, `A later investor puts in $500,000 at $1,500,000 pre-money. What does the first investor's 20% become?`, [`15%`, `20%`, `10%`, `25%`], `Existing owners hold 75% after the new round.`, `Post-money is 2,000,000, new investor owns 25%, and 20% x 0.75 = 15%.`),
      tf(L22, 5, 3, `Pressure to sign a term sheet quickly is a reason to slow down and review.`, 0, `Consider what haste hides.`, `Careful review, including by a lawyer, protects against unfavorable terms.`),
      // L23
      mc(L23, 1, 1, `Which is a common red flag?`, [`Guaranteed or unusually high returns`, `Written contracts`, `A clear budget`, `A lawyer's trust account`], `Think about promises nobody can keep.`, `Guaranteed or very high returns are classic warning signs.`),
      mc(L23, 2, 2, `A producer offers 40% of profits to each of three investors. What total is promised?`, [`120%`, `100%`, `40%`, `80%`], `Add the three shares.`, `3 x 40% = 120%, more than exists.`),
      tf(L23, 3, 2, `A Ponzi-style scheme pays earlier investors using money from later investors.`, 0, `Consider the source of the payments.`, `That is the defining feature, and it collapses when new money stops.`),
      mc(L23, 4, 3, `How should you confirm a claimed distribution deal?`, [`Contact the other party using details you found yourself`, `Trust the producer's email`, `Pay a deposit first`, `Ask the producer to vouch for it`], `Verify independently.`, `Independent verification avoids relying on the claimant's own contacts.`),
      mc(L23, 5, 2, `A promise of 30% in six months is roughly what annual rate if simple?`, [`60%`, `30%`, `15%`, `180%`], `Two six-month periods per year.`, `30% x 2 = 60%, far above what most legitimate investments reliably earn.`),
      // L24
      mc(L24, 1, 1, `What is a conflict of interest?`, [`A personal interest that could affect duties to others`, `A disagreement about a script`, `A late payment`, `A type of insurance`], `It involves competing interests.`, `It arises when someone's own interest may affect their duty to others.`),
      mc(L24, 2, 3, `A company charges its own $500,000 film a 10% overhead fee. How much is that?`, [`$50,000`, `$5,000`, `$500,000`, `$55,000`], `Multiply the budget by the rate.`, `0.10 x 500,000 = 50,000.`),
      tf(L24, 3, 2, `A related-party fee that is clearly agreed and disclosed can be acceptable.`, 0, `Consider the role of disclosure.`, `Disclosure and agreement are what distinguish acceptable fees from hidden ones.`),
      mc(L24, 4, 3, `Which response to the net-profit debate does the lesson favor?`, [`Clearer contracts, reasonable caps and transparent reporting`, `Assuming bad faith in all cases`, `Eliminating all profit shares`, `Keeping definitions confidential`], `Both sides have a point.`, `The lesson suggests clarity and transparency address concerns without presuming bad faith.`),
      tf(L24, 5, 1, `Ethical practice means following the intent of agreements, not only the letter.`, 0, `Consider trust.`, `Trust depends on honoring what parties reasonably expected, beyond technical compliance.`),
    ],
  },
};
