/**
 * finlitCurriculum — "School of Money", Plajah Academia's financial-literacy program.
 *
 * Rides the shared School chassis (services/schoolChassis.ts), so every completed lesson writes a
 * LearningRecord to the portable Academic Passport exactly the way a Reading Quest does.
 *
 * Six strands. Strands 1–5 mirror the topics of the 2021 National Standards for Personal Financial
 * Education (CEE + Jump$tart) so every lesson carries a real alignment tag — the framework 30 US
 * states now legislate against. Strand 6, "The Money of Business", is Plajah's differentiator: the
 * entrepreneurial-finance → accounting → corporate-finance ladder, taught inside the Praxis venture
 * simulator, where the P&L a learner reads is their own.
 *
 * SOURCES + LICENCE POSTURE (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md):
 *  - The spine is public domain: FDIC Money Smart, the CFPB youth/adult suite, SEC Investor.gov,
 *    FTC consumer pubs, MyMoney.gov. These are US Government works — we may host, adapt and print
 *    them freely, which is why this course can promise "no paywall, no login wall, printable".
 *  - The CEE/Jump$tart standards DOCUMENT is all-rights-reserved. We ALIGN and CITE it; we never
 *    reproduce its text. Every `body` below is original teaching prose written for Plajah, and the
 *    standard `statement`s in data/educationStandards.ts are learner-facing paraphrases.
 *  - `resources` link out to the authoritative source rather than mirroring it, so a teacher can
 *    always reach the government original.
 *
 * Guardrail: this is financial EDUCATION. It never gives personalised investment, tax or legal
 * advice, and it says so where a learner is most likely to want it.
 */
import type { Curriculum } from '../services/schoolChassis';

// Authoritative public-domain sources, cited repeatedly.
const SRC = {
  moneySmart: { label: 'FDIC Money Smart (public domain)', url: 'https://www.fdic.gov/consumer-resource-center/money-smart' },
  moneySmartBiz: { label: 'FDIC Money Smart for Small Business', url: 'https://www.fdic.gov/resources/consumers/money-smart/money-smart-for-small-business/index.html' },
  cfpbYouth: { label: 'CFPB — Building Blocks of Financial Capability', url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/' },
  cfpbCredit: { label: 'CFPB — Credit reports and scores', url: 'https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/' },
  cfpbGoals: { label: 'CFPB — Your Money, Your Goals toolkit', url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/' },
  investor: { label: 'SEC Investor.gov — saving and investing', url: 'https://www.investor.gov/introduction-investing' },
  compound: { label: 'Investor.gov compound-interest calculator', url: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator' },
  ftcScams: { label: 'FTC — how to avoid scams', url: 'https://consumer.ftc.gov/scams' },
  ftcIdentity: { label: 'FTC — identity theft recovery', url: 'https://www.identitytheft.gov/' },
  myMoney: { label: 'MyMoney.gov — the My Money Five', url: 'https://www.mymoney.gov/' },
  irsEin: { label: 'IRS — apply for an EIN', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online' },
  sba: { label: 'SBA — plan your business', url: 'https://www.sba.gov/business-guide/plan-your-business' },
  openstaxFinance: { label: 'OpenStax Principles of Finance (CC BY)', url: 'https://openstax.org/details/books/principles-finance' },
  openstaxAccounting: { label: 'OpenStax Principles of Accounting (free)', url: 'https://openstax.org/details/books/principles-financial-accounting' },
};

export const MONEY_SCHOOL: Curriculum = {
  id: 'money-school',
  label: 'School of Money',
  blurb:
    'Financial literacy from a first coin to a company balance sheet. Built on the public-domain spine the US government already publishes — free, printable, and aligned to the standards your state asks for.',
  accent: '#F59E0B',
  framework: 'CEE_FINLIT',
  tracks: [
    // ── Strand 1 ────────────────────────────────────────────────────────────────
    {
      id: 'earning',
      title: 'Earning & Income',
      blurb: 'Where money comes from, what education and skill do to it, and why the number on the offer is never the number you keep.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'fl-earn-1',
          title: 'Where Money Actually Comes From',
          blurb: 'Income is what you receive for something you provide. Everything else is detail.',
          minutes: 14,
          standardIds: ['PFL.EARN.4'],
          body: `Money arrives in a household through a small number of doors, and it is worth learning their names early, because each door behaves differently.

The first is wages — you give an employer your time and skill, and they give you money on a schedule. It is the most predictable door and, for most people for most of their lives, the widest one. The second is self-employment — you sell a product or service directly, so nobody caps what you earn and nobody guarantees it either. The third is income from things you own: interest on savings, rent from property, dividends from a company. This is the door that opens slowly and then, if you feed it for decades, opens very wide. The fourth is transfers — support from family, or from public programmes designed to catch people during unemployment, disability or old age.

Notice what separates the third door from the first two: wages and self-employment require your time, so they stop when you stop. Ownership income does not. Nothing in this course will tell you that one is virtuous and another is not — a paycheque is how most of the world's good work gets done. But understanding that the doors behave differently is the beginning of every plan you will ever make.

A useful habit, starting now: whenever you hear about someone's money, ask which door it came through. You will find that most confident public claims about wealth become much clearer, and sometimes much less impressive, once you can name the door.`,
          resources: [SRC.moneySmart, SRC.myMoney],
          assignment: {
            prompt: 'List every way money currently enters your household or your own hands — allowance, a job, a gift, interest. Label each with its door: wages, self-employment, ownership, or transfer. Then write one sentence on which door you would most like to widen in ten years, and why.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-earn-2',
          title: 'Why the Offer Is Not the Paycheque',
          blurb: 'Gross, net, and the deductions in between — reading a payslip without flinching.',
          minutes: 18,
          standardIds: ['PFL.EARN.8'],
          body: `The first payslip is a small shock for almost everyone. You were offered a number; a visibly smaller number arrives. Nothing has gone wrong. You are looking at the difference between gross pay — what you earned — and net pay, what reaches you after everything that is taken out along the way.

The deductions fall into groups. Income tax is withheld in advance on an estimate of what you will owe for the year, which is why filing a return later either refunds you or asks for the balance. Payroll taxes fund social insurance — retirement and medical programmes you will draw on decades from now. Then there are voluntary deductions you chose: a retirement contribution, health cover, a union fee. These last ones matter, because some of them are the rare case of money leaving your paycheque and still belonging to you.

Read the payslip as a document with a claim on it. Check that the hours are right. Check that the deductions match what you agreed to. Payroll errors are common and almost never corrected unless someone notices, and the person best placed to notice is you.

One number deserves special attention: the retirement contribution, especially if an employer matches part of it. A match is not a benefit in the abstract — it is an immediate, guaranteed return on money you set aside, and it is the closest thing to free money that ordinary finance offers.`,
          resources: [SRC.moneySmart, { label: 'IRS — understanding your paycheck withholding', url: 'https://www.irs.gov/individuals/tax-withholding-estimator' }],
          assignment: {
            prompt: 'Find a real or sample payslip. Identify gross pay, every deduction, and net pay. Then calculate what percentage of gross actually reached the worker. Write two sentences on which deduction surprised you most.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-earn-3',
          title: 'What Education and Skill Are Worth',
          blurb: 'Treating training as an investment with a cost, a return, and a payback period.',
          minutes: 20,
          standardIds: ['PFL.EARN.12'],
          body: `Education is usually discussed as an identity — what kind of person you are going to be. It is also, unavoidably, a financial decision with a price tag, a time cost and a return, and refusing to look at that half does students no favours.

The cost has two parts. The obvious part is money paid: tuition, materials, fees. The hidden part is opportunity cost — the income you did not earn during the years you studied. For a long programme this hidden cost is frequently larger than the tuition, and it is the part most people never count.

The return is the difference between what you will earn with the qualification and what you would have earned without it, added up over a working life. Two things make that number swing enormously: the field, and whether you finish. Unfinished study with debt attached is the worst outcome in the whole calculation, and it is more common than prospectuses suggest.

So the honest question is not "is education worth it" — asked that broadly the question has no answer. It is: *this* programme, at *this* price, with *this* completion rate, leading to *this* work — how many years of the earnings difference does it take to repay the total cost? That number is the payback period, and you can estimate it on one sheet of paper. Do that before you sign anything, and note that apprenticeship, certification and on-the-job routes belong in the same comparison rather than being treated as a consolation prize.`,
          resources: [
            { label: 'BLS — education pays (earnings and unemployment by attainment)', url: 'https://www.bls.gov/emp/chart-unemployment-earnings-education.htm' },
            SRC.moneySmart,
          ],
          assignment: {
            prompt: 'Pick a career you are curious about. Estimate the total cost of the training it needs, including the income given up while studying. Find the typical earnings with and without it, and calculate the payback period. Then argue in one paragraph whether the number changes your mind.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
      ],
    },

    // ── Strand 2 ────────────────────────────────────────────────────────────────
    {
      id: 'spending',
      title: 'Spending & Budgeting',
      blurb: 'A budget is not a punishment. It is a plan you wrote, so that your money goes where you meant it to.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'fl-spend-1',
          title: 'Needs, Wants, and the Space Between',
          blurb: 'The oldest distinction in personal finance, and why the honest version is a spectrum.',
          minutes: 12,
          standardIds: ['PFL.SPEND.4'],
          body: `Every course starts here, usually with two neat columns: needs on the left, wants on the right. Food, shelter, warmth. Sweets, games, the latest thing. It is a good beginning and it is not quite true, and pretending otherwise is why so many budgets collapse in the second week.

Almost everything is a spectrum. You need food; you do not need this particular meal from this particular restaurant. You need to get to work; whether that means a bus fare or a car with a payment attached is a choice. The useful question is not "is this a need?" but "what is the cheapest version of this that still does the job, and how much am I paying above that line for comfort, speed or pleasure?"

That reframing does something important: it stops a budget from being a list of forbidden things. You are allowed to pay above the line. Paying above the line is much of what money is *for*. You simply want to be the one who decided to, rather than discovering it afterwards in a statement.

Try it on one category this week. Write the true floor, write what you actually spent, and look at the gap without judging it. That gap is your first real piece of financial self-knowledge.`,
          resources: [SRC.cfpbYouth, SRC.moneySmart],
          assignment: {
            prompt: 'Take one spending category from last month. Write the cheapest version that would still have done the job, then what you actually spent. Calculate the gap. Decide — deliberately this time — whether you want to keep paying it.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-spend-2',
          title: 'Building a Budget That Survives Contact',
          blurb: 'Most budgets fail for the same three reasons. Design around them from the start.',
          minutes: 20,
          standardIds: ['PFL.SPEND.8'],
          body: `A budget is a forecast, and forecasts are wrong. The skill is not producing a perfect one; it is producing one that keeps working when reality arrives.

Budgets usually fail for three reasons. First, they forget irregular expenses — the annual insurance, the car repair, the birthday season — so a "normal" month looks affordable and the real year does not. The fix is to total those yearly costs, divide by twelve, and treat that figure as a monthly line even though the bill is not monthly. Second, they are too detailed to maintain: nineteen categories is a system nobody keeps for six months. Five or six is a system people actually keep. Third, they leave no slack, so the first unplanned expense feels like failure and the whole thing gets abandoned.

A durable structure is simple: income at the top; fixed commitments; the twelfth-of-a-year sinking fund for irregulars; saving treated as a bill rather than a leftover; then a single flexible pool for everything else. When the flexible pool runs out, spending stops until the next period. That is the entire mechanism, and it works because it requires one decision a month instead of a hundred.

The last idea is the one that matters most: pay saving first, before the flexible pool, not after. Money that survives to the end of the month is not saved by anyone. Money moved on payday is.`,
          resources: [SRC.moneySmart, SRC.cfpbGoals],
          assignment: {
            prompt: 'Build a six-category budget for one month using this structure, including a sinking-fund line for irregular annual costs. Run it for a week and record where it broke. Then revise it — the revision is the real assignment.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-spend-3',
          title: 'Big Decisions: Housing and Transport',
          blurb: 'Two choices set the shape of a budget for years. Everything else is rounding.',
          minutes: 22,
          standardIds: ['PFL.SPEND.12'],
          body: `Personal finance advice is full of small optimisations — the coffee, the subscription, the switched supplier. They are real, they are worth doing, and they are dwarfed by two decisions: where you live and how you travel. Get those roughly right and a budget has room to breathe. Get them wrong and no amount of small discipline will rescue it.

Housing is the larger of the two, and its true cost is never the headline number. Rent has utilities, deposit and moving costs attached. Ownership has property tax, insurance, maintenance and, crucially, the interest on the loan — which in the early years of a long mortgage exceeds the amount going to the debt itself. A rule of thumb people use is to keep total housing costs near or below a third of take-home pay; treat that as a signal rather than a law, but be very clear-eyed when you cross it, because housing costs are hard to reverse quickly.

Transport is the same shape of problem. A vehicle's purchase price is the beginning: insurance, fuel, servicing, tyres and depreciation follow it for as long as you own it. Depreciation is the biggest and the most invisible, because nobody sends you a bill for it.

The exercise that makes this concrete is to compute total annual cost of ownership rather than the monthly payment. Sellers quote monthly payments precisely because that number can be made to look small by stretching the term — and a longer term means you pay more in total for the same object.`,
          resources: [
            { label: 'CFPB — buying a house, and the Loan Estimate explained', url: 'https://www.consumerfinance.gov/owning-a-home/' },
            SRC.moneySmart,
          ],
          assignment: {
            prompt: 'Choose a real listing (a rental or a car). Build its total annual cost — every recurring cost, plus depreciation or interest. Compare that with the advertised monthly figure and write what the advert leaves out.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
      ],
    },

    // ── Strand 3 ────────────────────────────────────────────────────────────────
    {
      id: 'saving',
      title: 'Saving & Investing',
      blurb: 'Why time is the strongest force in finance, and how to use it before you have much money.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fl-save-1',
          title: 'Why Saving Is Hard (and What Beats Willpower)',
          blurb: 'The problem is not virtue. It is that the reward is far away and invisible.',
          minutes: 14,
          standardIds: ['PFL.SAVE.4'],
          body: `Saving asks you to hand something enjoyable now to a stranger — your future self — whom you have never met and do not entirely believe in. Framed that way, it is remarkable anyone saves at all, and it explains why advice built on willpower reliably fails.

What works is structure. Move the money automatically, on the day income arrives, before it is available to spend. Put it somewhere with mild friction — a separate account, not the one attached to your card. Give each pot a name tied to a real thing, because "emergency fund" is abstract and "the month I can survive without a job" is not. And make the first goal small enough to actually reach, since the habit is built by finishing, not by aiming high.

None of this requires discipline in the moment, which is the point. You are designing a system that produces the outcome discipline would have produced, without needing you to be at your best every single day.

Start with one automatic transfer, however small. The amount matters far less than establishing that money moves without a decision.`,
          resources: [SRC.moneySmart, SRC.cfpbYouth],
          assignment: {
            prompt: 'Set up (or write out precisely) one automatic transfer to savings on the day money arrives. Name the goal after the real thing it buys. Run it for four weeks and report what actually happened.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-save-2',
          title: 'Compound Interest: The Only Free Lunch',
          blurb: 'Interest on interest — small, boring, and the most powerful idea in this course.',
          minutes: 20,
          standardIds: ['PFL.SAVE.8'],
          body: `Simple interest pays you on what you put in. Compound interest pays you on what you put in *and* on the interest you already earned, so the balance grows on its own growth. Over a year the difference is dull. Over decades it stops being dull and becomes the entire story.

Two consequences follow, and they point in opposite directions.

The first is that time matters more than amount. A modest sum invested in your twenties routinely beats a much larger sum started in your forties, because the early money has more years to compound. This is genuinely the strongest argument in personal finance for starting before you feel ready, with an amount that feels too small to matter.

The second is that compounding is neutral about direction. Run it against you — on credit-card debt, on a high-interest loan — and it grows the amount you owe with exactly the same relentlessness. The same mechanism that makes early saving powerful makes carried debt expensive. This is why the credit strand comes next.

Go and use a calculator on this rather than trusting the prose. Put in a small monthly amount, a plausible rate, and a forty-year horizon, and then halve the horizon and look at what happens. The gap between those two numbers is the reason this lesson exists.`,
          resources: [SRC.compound, SRC.investor],
          assignment: {
            prompt: 'Using the Investor.gov calculator, model the same monthly contribution over 40 years and over 20 years. Record both totals and how much of each is contributions versus growth. Write what the comparison tells you about when to start.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-save-3',
          title: 'Investing: Risk, Diversification and Time Horizon',
          blurb: 'What investing actually is, why spreading matters, and the questions to ask before anything else.',
          minutes: 24,
          standardIds: ['PFL.INVEST.8', 'PFL.INVEST.12'],
          body: `Saving protects money. Investing puts it to work and accepts the possibility of loss in exchange for the possibility of growth. Both are correct in the right place, and the thing that decides which is right is not your personality — it is your time horizon. Money you need in two years should not be exposed to markets that routinely fall for two years. Money you will not touch for thirty can be.

Investments differ in what you actually own. A share makes you a part-owner of a business, so you get its growth and its risk. A bond makes you a lender, so you get interest and the risk the borrower fails. A fund is a bundle of many of these at once, which is the practical way most people diversify.

Diversification is the one genuinely free improvement available. Spreading across many holdings removes the risk specific to any single company without reducing your expected return in the same proportion. It cannot protect you from a whole market falling — nothing can — but it removes the risk of being ruined by one bad choice.

Two costs decide more outcomes than stock-picking does. Fees compound against you exactly as returns compound for you, so a fraction of a percent per year is not trivial over decades. And taxes differ by account type; retirement accounts exist precisely to change that maths in your favour.

**This is education, not advice.** Nothing here recommends a specific investment for your situation. When the decision is large, the right move is a professional with a duty to act in your interest — and asking directly how they are paid.`,
          resources: [SRC.investor, SRC.openstaxFinance, { label: 'FINRA — fund analyzer (fee impact)', url: 'https://tools.finra.org/fund_analyzer/' }],
          assignment: {
            prompt: 'Pick two funds. Compare their fees, what they hold, and how concentrated they are. Then write which you would choose for money you would not touch for thirty years, and explicitly name what you are risking.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
      ],
    },

    // ── Strand 4 ────────────────────────────────────────────────────────────────
    {
      id: 'credit',
      title: 'Credit & Debt',
      blurb: 'Borrowing is a tool with a price. Learn to read the price before you accept the tool.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fl-credit-1',
          title: 'What Borrowing Actually Costs',
          blurb: 'Interest rate, term, and total cost — and why only one of the three is advertised.',
          minutes: 16,
          standardIds: ['PFL.CREDIT.4', 'PFL.CREDIT.12'],
          body: `Borrowing means using money now and returning more than you took. The extra is the price of time, and it is set by three things: the interest rate, how long you take, and how much you borrowed.

The trap is that lenders advertise the monthly payment, because the monthly payment is the number that can be made to look comfortable. Stretch a loan from three years to six and the monthly figure drops dramatically — while the total you pay rises, sometimes enormously, because you are renting the money for twice as long. A borrower comparing only monthly payments will reliably choose the more expensive loan and feel good about it.

So learn to ask for one number: total cost. Multiply the payment by the number of payments, subtract the amount borrowed, and you have the price of the loan in currency rather than percentages. Then compare that figure against what the thing is worth to you.

Two structural facts are worth memorising. On long loans, early payments are mostly interest and barely reduce the debt — which is why paying extra early is disproportionately powerful. And credit-card debt is different in kind, not degree: rates are high, compounding is relentless, and minimum payments are designed to keep the balance alive for years. Treat a carried card balance as the most urgent financial problem you have.`,
          resources: [SRC.cfpbCredit, SRC.moneySmart],
          assignment: {
            prompt: 'Take a real advertised loan or finance offer. Compute the total cost in currency, not percent. Then recompute it at a term two years shorter. Write down both totals and what the difference would buy.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-credit-2',
          title: 'Credit Reports and Scores, Demystified',
          blurb: 'Who is keeping the file, what is in it, and what actually moves the number.',
          minutes: 20,
          standardIds: ['PFL.CREDIT.8'],
          body: `Somewhere there is a file about how you have handled borrowed money. Credit-reporting agencies collect it, lenders report into it, and a score is calculated from it to summarise how reliably you repay. Understanding this file is not optional, because it quietly prices your housing, your loans, sometimes your insurance and occasionally your job.

The file contains your accounts, balances and limits, whether payments arrived on time, public records like bankruptcies, and a list of who has enquired. It does not contain your income, your savings or your character, which is why a high earner can have a poor score and a modest earner can have an excellent one.

What moves the number, in rough order of weight: paying on time, which dominates everything else; how much of your available credit you are using, where lower is better; how long your accounts have existed; and how recently you have applied for new credit. Notice that the two biggest levers are behavioural and free — pay on time, keep balances low relative to limits.

Two practical duties. Check your reports regularly, because errors are common and every study finds them; you are entitled to them at no cost. And if something is wrong, dispute it in writing with the agency — the process exists and it works, but only for people who use it.`,
          resources: [SRC.cfpbCredit, { label: 'AnnualCreditReport.gov — your free reports', url: 'https://www.annualcreditreport.com/' }],
          assignment: {
            prompt: 'Obtain (or study a sample of) a credit report. Identify every category of information it holds. List the three actions that would most improve the score of the person it describes, and explain why each works.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
      ],
    },

    // ── Strand 5 ────────────────────────────────────────────────────────────────
    {
      id: 'risk',
      title: 'Risk & Protection',
      blurb: 'Insurance, fraud and identity — the strand that protects everything the others built.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'fl-risk-1',
          title: 'How Insurance Actually Works',
          blurb: 'You are not buying a product. You are joining a pool.',
          minutes: 16,
          standardIds: ['PFL.RISK.4', 'PFL.RISK.12'],
          body: `Insurance is frequently taught as a list of products, which makes it boring and hard to reason about. The underlying idea is simpler and much more useful: many people each pay a small, certain amount so that the few who suffer a large, uncertain loss are made whole. You are buying the removal of a catastrophe you could not absorb.

That single idea answers most practical questions. Insure the things that would be ruinous — your ability to earn, your health, your home, harm you might cause others. Do not insure things you could comfortably replace, because for small losses you are simply paying the pool's running costs for no real transfer of risk. Extended warranties on inexpensive electronics are the classic example.

Two dials control the price. The deductible or excess is what you pay before cover begins; raising it lowers your premium and is sensible exactly when you have savings to cover it. The coverage limit is the most the policy will pay; setting it too low to save a little premium defeats the purpose of buying the policy at all.

Read one thing before you sign: the exclusions. That section tells you what is *not* covered, and it is where people discover, at the worst moment, that they bought something other than what they assumed.`,
          resources: [SRC.moneySmart, SRC.cfpbGoals],
          assignment: {
            prompt: 'Take any real policy document. Find the deductible, the coverage limit, and the exclusions. Write down one scenario the policy would cover and one it plainly would not.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-risk-2',
          title: 'Fraud, Scams and Your Identity',
          blurb: 'Every scam runs the same play. Learn the shape and you will spot the variants.',
          minutes: 18,
          standardIds: ['PFL.RISK.8'],
          body: `Scams look endlessly various and are structurally almost identical. Nearly all of them combine three ingredients: manufactured urgency, an appeal to authority or affection, and a payment method that cannot be reversed.

Urgency exists to prevent thought — your account will be closed, the offer expires, the warrant is being issued. Authority or affection supplies trust: a tax office, a bank, a grandchild in trouble, a romance conducted entirely at a distance. And the payment demand is the tell that settles it, because legitimate institutions do not ask for gift cards, wire transfers to individuals, or cryptocurrency. Those methods are requested precisely because the money cannot be clawed back.

The defence is a rule rather than a judgement, since scams are engineered to defeat judgement under pressure: never act on an inbound contact. Hang up, close the message, and reach the organisation yourself using a number or address you already had. A real institution will be entirely happy to be called back. A scammer will fight hard to keep you on the line — that resistance is itself the confirmation.

Identity theft is the version where someone uses your details rather than your attention. Freeze your credit files if you are not actively borrowing; it is free and blocks most new-account fraud outright. And if it happens, there is an official recovery process with a step-by-step plan — use it rather than improvising.`,
          resources: [SRC.ftcScams, SRC.ftcIdentity],
          assignment: {
            prompt: 'Find a real scam attempt (an email, text, or a documented case). Identify the three ingredients: the urgency, the authority or affection, and the irreversible payment method. Then write the exact sentence you would use to end the contact.',
            tool: 'NONE',
            postTag: 'moneyschool',
          },
        },
      ],
    },

    // ── Strand 6 — the differentiator ───────────────────────────────────────────
    {
      id: 'business',
      title: 'The Money of Business',
      blurb: 'Entrepreneurial finance → accounting → corporate finance. Taught inside your own venture, where the P&L you read is yours.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'fl-biz-1',
          title: 'How a Business Makes Money',
          blurb: 'Revenue, cost, profit — and why profitable businesses still fail.',
          minutes: 20,
          standardIds: ['PFL.BIZ.12'],
          body: `A business earns revenue when customers pay it, incurs costs producing what they paid for, and keeps the difference as profit. That sentence is the whole of the subject; everything else is precision about the words.

Costs split in a way that governs almost every decision. Variable costs rise with each unit you sell — materials, payment fees, the ingredients of the meal. Fixed costs continue whether you sell anything or not — rent, subscriptions, insurance. Revenue minus variable costs gives gross profit, and gross profit is what must eventually cover the fixed costs. The sales level where it exactly covers them is your break-even point, and knowing that single number tells you more about a young business than almost any other figure.

Here is the part that surprises people: profit and cash are not the same thing, and businesses die of the difference. You can sell profitably in June, be paid in September, and still be unable to pay your own bills in July. Profit is a measure of performance over a period; cash is whether money is in the account today. A business with good margins and bad timing fails just as completely as an unprofitable one.

So the discipline is to track both. Ask what each sale actually contributes after its own costs, and separately ask when the money arrives relative to when it must go out.`,
          resources: [SRC.moneySmartBiz, SRC.sba],
          assignment: {
            prompt: 'In Praxis, open your venture and complete the Books chapter: enter revenue, cost of goods and expenses, then read your own gross and net margin. Write down your break-even point and how many sales a month it implies.',
            tool: 'PRAXIS',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-biz-2',
          title: 'Keeping the Books',
          blurb: 'A chart of accounts, two financial statements, and why double entry has survived 500 years.',
          minutes: 26,
          standardIds: ['PFL.BIZ.ACCT'],
          body: `Accounting is the language a business uses to describe itself, and like any language it is far easier to learn by speaking it about something you care about — which is why this lesson is done inside your own venture rather than on a textbook company.

Start with the chart of accounts: a named list of the buckets every transaction falls into — categories of income, of expense, of things you own, of things you owe. Sort transactions into consistent buckets and useful statements assemble themselves. Sort them inconsistently and no amount of later analysis will rescue the picture.

Two statements matter first. The income statement, or P&L, covers a period and answers "did we make money?" — revenue, minus cost of goods, minus expenses, equals profit. The balance sheet is a snapshot of one instant and answers "what do we own and owe?" — assets on one side, liabilities and owner's equity on the other, always in balance. The P&L is the film; the balance sheet is the photograph.

Double-entry is the technique underneath: every transaction touches at least two accounts, so the books must balance. It has survived since the fifteenth century because it catches errors structurally — if the sides disagree, something is wrong, and you know before the mistake compounds.

One rule outranks technique: never mix personal and business money. Separate accounts from day one. Commingled funds make books unreliable, taxes painful, and — for a company structured to limit your liability — can put that protection itself at risk.`,
          resources: [SRC.openstaxAccounting, SRC.moneySmartBiz, SRC.irsEin],
          assignment: {
            prompt: 'Build a chart of accounts for your venture in Praxis, then produce one income statement for a period and describe, in plain language, what it says about the business. Note one decision the statement would change.',
            tool: 'PRAXIS',
            postTag: 'moneyschool',
          },
        },
        {
          id: 'fl-biz-3',
          title: 'Unit Economics and the Cost of Capital',
          blurb: 'Does each customer pay for themselves — and what does money from outside actually cost?',
          minutes: 26,
          standardIds: ['PFL.BIZ.FIN'],
          body: `A business can grow enthusiastically toward its own destruction if each additional customer loses money. Unit economics is the discipline that prevents this by asking a deliberately narrow question: for one customer, what did we spend to acquire them, and what will they pay us over the whole relationship?

The first figure is customer acquisition cost — total sales and marketing spend divided by customers gained. The second is lifetime value — what a customer's purchases contribute after variable costs, across the time they stay. Compare them. If lifetime value does not comfortably exceed acquisition cost, growth makes the problem larger, faster. Practitioners often want that ratio around three to one, with the acquisition cost repaid within roughly a year, so growth funds itself rather than requiring endless outside money.

Then there is capital from outside, which is never free. Debt costs interest and must be repaid on a schedule regardless of how trading goes. Equity costs ownership — permanently, and including the share of everything the business ever becomes. Investors also demand a higher return than lenders, because they are paid last if things go badly. A blended figure for what a business's money costs is its cost of capital, and its use is simple: a project worth doing must return more than the money costs. Otherwise you are working to enrich your financiers.

The trap in raising money is confusing the amount with the price. Ten percent of a small company today may cost far more than it appears once the company is large — and dilution is permanent in a way that a repaid loan is not.`,
          resources: [SRC.openstaxFinance, SRC.sba, SRC.investor],
          assignment: {
            prompt: 'In Praxis, work the Grow chapter: compute your venture’s acquisition cost and lifetime value and state the ratio honestly. Then in Fund, model one raise — how much, on what terms, and what it costs you in ownership or interest. Defend whether it is worth it.',
            tool: 'PRAXIS',
            postTag: 'moneyschool',
          },
        },
      ],
    },
  ],
};

export default MONEY_SCHOOL;
