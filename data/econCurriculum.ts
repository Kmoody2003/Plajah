/**
 * econCurriculum — "School of Economics", PreK intuition → university-level reasoning.
 *
 * Rides the shared School chassis (services/schoolChassis.ts), aligned to the CEE Voluntary
 * National Content Standards in Economics (framework CEE_ECON, seeded in
 * data/educationStandards.ts) with C3 economics indicators as the social-studies bridge.
 *
 * THE DIFFERENTIATOR: economics taught on live data. Every macro lesson names the actual public
 * series a learner should pull rather than reproducing a stale chart — this month's CPI, this
 * month's unemployment rate, the real yield curve. FRED, BLS and BEA publish all of it free.
 * "Bring the Fed's own data into a Year 7 classroom" is something even the Fed's education arm
 * only gestures at.
 *
 * LICENCE POSTURE (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md):
 *  - Public domain / free API: FRED, BLS, BEA, Census. Hostable and quotable.
 *  - CC BY-NC-SA, free shelf only: OpenStax Principles of Economics 3e (note: 2e was CC BY),
 *    MIT OCW 14.01/14.02.
 *  - CC BY: Saylor course shells.
 *  - Embed-only, never adapted: CORE Econ (CC BY-NC-ND), Marginal Revolution University (CC BY-ND).
 *  - Align-and-cite only, never hosted: the CEE standards document itself.
 *
 * TEACHING POSTURE: economics has genuine live disagreements — about minimum wages, trade,
 * stimulus, inequality. Where the profession is divided, this course says so and teaches the
 * mechanisms and the evidence rather than picking a side. Where there is broad professional
 * agreement, it says that too.
 */
import type { Curriculum } from '../services/schoolChassis';

const FRED = { label: 'FRED — Federal Reserve Economic Data (free API)', url: 'https://fred.stlouisfed.org/' };
const BLS = { label: 'Bureau of Labor Statistics (public domain)', url: 'https://www.bls.gov/' };
const BEA = { label: 'Bureau of Economic Analysis — GDP (public domain)', url: 'https://www.bea.gov/' };
const CENSUS = { label: 'Census / ACS data (public domain)', url: 'https://data.census.gov/' };
const OPENSTAX = { label: 'OpenStax Principles of Economics 3e (CC BY-NC-SA)', url: 'https://openstax.org/details/books/principles-economics-3e' };
const MRU = { label: 'Marginal Revolution University — embed only (CC BY-ND)', url: 'https://mru.org/' };
const CORE = { label: 'CORE Econ, The Economy — read online (CC BY-NC-ND)', url: 'https://www.core-econ.org/' };
const MIT_1401 = { label: 'MIT OCW 14.01 Principles of Microeconomics (CC BY-NC-SA)', url: 'https://ocw.mit.edu/courses/14-01-principles-of-microeconomics-fall-2018/' };
const FED_EDU = { label: 'St. Louis Fed — Econ Lowdown (link/embed under Permitted Use)', url: 'https://www.stlouisfed.org/education' };
const CFPB_ACT = { label: 'CFPB — youth financial education activities (public domain)', url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/' };

export const ECON_SCHOOL: Curriculum = {
  id: 'econ-school',
  label: 'School of Economics',
  blurb:
    'How the world works, from a first lesson in scarcity to reading this month’s real inflation data. Taught on live public series, not stale charts.',
  accent: '#3B82F6',
  framework: 'CEE_ECON',
  tracks: [
    {
      id: 'scarcity',
      title: 'Scarcity & Choice',
      blurb: 'The one idea the whole subject is built on — and the cost that never appears on a price tag.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ec-scar-1',
          title: 'You Cannot Have Everything',
          blurb: 'Scarcity is not poverty. It is the permanent condition that makes choosing necessary.',
          minutes: 14,
          standardIds: ['CEE.ECON.1.4', 'D2.Eco.1.K-2'],
          body: `Economics begins with an observation so obvious that its consequences are usually missed: wants exceed the means available to satisfy them. That is scarcity, and it is worth being precise about what it does and does not mean.

Scarcity is not the same as poverty. A billionaire faces scarcity, because a day still contains twenty-four hours and attention cannot be bought in unlimited quantity. Scarcity is not shortage either — a shortage is a temporary mismatch in one market, while scarcity is the permanent background condition of every society that has ever existed.

What follows from it is the whole subject. Because you cannot have everything, you must choose. Because you must choose, every choice gives something up. And the thing you gave up — the best alternative you did not take — is the real cost of what you chose.

That last idea is called opportunity cost and it is the most useful thing in this entire course. The cost of an hour spent on one thing is the best other thing that hour could have been. The cost of a government building a hospital is whatever else those resources would have produced. Money is only ever a way of keeping score; the real cost is always the road not taken.

Teach this early and everything later gets easier, because most economic reasoning is just opportunity cost applied carefully.`,
          resources: [CFPB_ACT, OPENSTAX],
          assignment: {
            prompt: 'Pick a real decision you made this week. Write what you chose, then name the single best alternative you gave up — that is its true cost. Do it again for a decision your school or town made. Which was harder to name, and why?',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-scar-2',
          title: 'Thinking at the Margin',
          blurb: 'Decisions are almost never all-or-nothing. They are about one more or one less.',
          minutes: 18,
          standardIds: ['CEE.ECON.2.8', 'D2.Eco.1.6-8'],
          body: `People rarely decide whether to eat; they decide whether to have another slice. Firms rarely decide whether to produce; they decide whether to make one more unit. Economists call this thinking at the margin, and it dissolves a surprising number of arguments.

The rule is simple. Do something as long as the additional benefit of one more exceeds the additional cost of one more, and stop when they meet. Notice what the rule ignores: everything that came before. Costs already incurred and unrecoverable — sunk costs — should not influence the next decision at all, because no future choice can undo them.

That is genuinely hard psychologically, which is why the fallacy has a name and why people sit through films they stopped enjoying because they paid for the ticket. The ticket money is gone either way; the only live question is how to spend the next ninety minutes.

Marginal thinking also explains a puzzle that troubled economists for a century: why water, essential to life, is cheap, while diamonds, useless to survival, are dear. The answer is that price reflects the value of *one more unit* in the circumstances you are actually in. Water is abundant, so one more litre is worth little. Diamonds are scarce, so one more is worth much. Nobody is choosing between all the water and all the diamonds — a choice nobody ever faces.`,
          resources: [OPENSTAX, MRU],
          assignment: {
            prompt: 'Find a real decision where someone argued from sunk costs ("we have already spent so much"). Rewrite the argument at the margin — what does one more unit cost, and what does it deliver? Then say whether the conclusion changes.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
    {
      id: 'markets',
      title: 'Markets & Prices',
      blurb: 'How millions of uncoordinated decisions produce a price — and what a price is actually telling you.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ec-mkt-1',
          title: 'Supply, Demand and Where They Meet',
          blurb: 'The most famous diagram in economics, and the two mistakes everyone makes reading it.',
          minutes: 22,
          standardIds: ['CEE.ECON.7.8', 'CEE.ECON.4.8'],
          body: `Demand describes how much buyers will purchase at each price, and it slopes down because at lower prices more people buy and existing buyers buy more. Supply describes how much sellers will offer at each price, and it slopes up because higher prices make production worth more trouble. Where they cross is equilibrium: the price at which the quantity people want to buy equals the quantity people want to sell.

Two mistakes are worth heading off directly, because almost every learner makes them.

The first is confusing a movement *along* a curve with a shift *of* a curve. A price change moves you along the existing curve. Anything else — incomes, tastes, the price of something related, input costs, technology, the number of sellers — shifts the whole curve. "Demand went up because prices fell" is the classic error: the quantity demanded rose, but demand itself did not move.

The second is treating equilibrium as a place markets sit rather than a place they head toward. Real markets are usually adjusting, and the interesting question is how fast and how smoothly.

What makes the model powerful is that no one is in charge. Nobody decides how many loaves a city needs. Bakers observe prices, buyers observe prices, and the outcome emerges. When it works, that coordination is remarkable. It also fails in identifiable ways — market power, missing information, costs falling on third parties — and naming those failure modes precisely is a later lesson rather than an objection to the model.`,
          resources: [OPENSTAX, MRU, MIT_1401],
          assignment: {
            prompt: 'Take a real price change in the news. Diagram it: did the curve shift, or did the market move along it? Say which curve moved and what moved it, then predict what happens to quantity and check whether reporting agrees.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-mkt-2',
          title: 'What a Price Is Actually Saying',
          blurb: 'Prices are not just amounts. They are signals, incentives and a rationing device at once.',
          minutes: 20,
          standardIds: ['CEE.ECON.8.12', 'CEE.ECON.5.8'],
          body: `A price does three jobs simultaneously, and separating them explains most policy arguments about prices.

It signals. A rising price tells everyone in the world, without any announcement, that this thing has become scarcer or more wanted. It carries information that no central authority could gather, because it aggregates what millions of people privately know about their own circumstances.

It incentivises. That same rising price makes producing more worthwhile, so supply responds. And it makes economising worthwhile, so demand responds. Both sides move toward relieving the scarcity that caused the rise.

It rations. At any moment there is a fixed quantity, and price determines who gets it — those willing and able to pay.

The third job is where the arguments live, because willingness to pay is not the same as need. That is precisely why price controls are appealing: a cap holds the price down for those who get the good. But suppressing the price also suppresses the signal and the incentive, so less is supplied and more is demanded, and the shortage is rationed some other way — queues, waiting lists, who you know, or a black market.

Economists broadly agree on that mechanism. They disagree, genuinely and in good faith, about when the distributional gain is worth the efficiency loss — which is a question about values as much as economics, and this course teaches it as such rather than pretending the discipline has settled it.`,
          resources: [OPENSTAX, CORE, MRU],
          assignment: {
            prompt: 'Find a real price control (rent, energy, transport fares). Explain what happened to the quantity supplied and how the good ended up being rationed instead. Then argue the strongest case for the control and the strongest case against, before saying where you land.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
    {
      id: 'macro',
      title: 'The National Economy',
      blurb: 'Output, jobs and prices — the three numbers every economy is judged on, read from live data.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ec-macro-1',
          title: 'GDP and What It Misses',
          blurb: 'The most cited number in economics, its definition, and its honest limits.',
          minutes: 22,
          standardIds: ['CEE.ECON.18.12', 'CEE.ECON.15.12'],
          body: `Gross domestic product is the market value of all final goods and services produced within a country in a period. Every word is doing work. *Final* excludes intermediate goods so the flour in bread is not counted twice. *Produced within* means location, not ownership. *Market value* means it counts what was transacted at prices.

That last word is where the limits begin, and a serious course names them rather than treating GDP as a score for national wellbeing.

GDP misses unpaid work entirely — care, housework, volunteering — which means a country can appear to grow simply because work moved from home to market. It is indifferent to distribution, so a rising average tells you nothing about who received it. It counts spending on harm repair as production: a disaster raises GDP through rebuilding. It ignores depletion, so extracting a finite resource adds to output while the stock falls. And it says nothing about leisure, health or environmental quality.

None of that makes GDP useless. It correlates strongly with things people do want — life expectancy, literacy, material security — and it is measured consistently enough to compare periods and countries. It is a good measure of one thing, routinely misused as a measure of everything.

The professional habit is to pair it. Read GDP alongside distribution, employment and a wellbeing measure, and never let one number carry an argument on its own.`,
          resources: [BEA, FRED, OPENSTAX],
          assignment: {
            prompt: 'Pull real GDP for your country from the BEA or FRED and chart the last twenty years. Mark the recessions. Then find one thing that happened in that period which GDP fails to capture, and explain what measure would have caught it.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-macro-2',
          title: 'Inflation: Reading This Month’s Number',
          blurb: 'What the price index actually measures, and how to pull the real figure yourself.',
          minutes: 24,
          standardIds: ['CEE.ECON.11.8', 'CEE.ECON.18.12'],
          body: `Inflation is a sustained rise in the general price level, which means each unit of money buys less. It is measured by tracking a basket of goods a typical household buys and comparing its cost over time — that is the consumer price index, published monthly and free.

Three distinctions make the number readable. Headline inflation includes everything; core inflation strips out food and energy, not because those do not matter but because they are volatile enough to obscure the underlying trend. Month-on-month tells you the recent pace; year-on-year tells you the twelve-month change, and the two can tell quite different stories at a turning point.

Two mechanisms are usually offered for why it happens. Demand-pull: spending outruns what the economy can produce. Cost-push: production becomes more expensive — energy, wages, supply disruption — and prices follow. Both can operate at once, and separating them in a real episode is genuinely difficult, which is part of why central banks disagree in real time.

The reason inflation is treated so seriously is that it redistributes without anyone deciding to. It erodes savings and fixed incomes, it favours borrowers over lenders because debts are repaid in cheaper money, and when it becomes unpredictable it makes long contracts hazardous, which suppresses investment.

The practical skill in this lesson is not memorising a definition. It is pulling the current series yourself, distinguishing headline from core, and describing what it shows in a sentence a non-economist would understand.`,
          resources: [BLS, FRED, FED_EDU],
          assignment: {
            prompt: 'Pull the current CPI series from BLS or FRED. Report headline and core, month-on-month and year-on-year. Then write one paragraph a family member could understand explaining what it means for their money — and name which component moved most.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-macro-3',
          title: 'Unemployment and What Counts as a Job',
          blurb: 'Why the headline rate can fall for a bad reason.',
          minutes: 20,
          standardIds: ['CEE.ECON.18.12'],
          body: `To be counted as unemployed in the standard measure you must be without work, available for work, and actively looking. That third condition is the one that surprises people, and it is why the headline rate can mislead in both directions.

Someone who gives up searching leaves the labour force entirely and stops being counted as unemployed — so discouragement can lower the unemployment rate while the situation worsens. Someone working a few hours who wants full-time work is counted as employed. Broader measures exist precisely for this reason and are published alongside the headline; so is the labour force participation rate, which tells you what share of working-age people are in the market at all.

Economists also distinguish kinds of unemployment because the policy response differs. Frictional unemployment is people between jobs, and it is unavoidable and even healthy in a fluid economy. Structural unemployment is a mismatch between skills or locations and available work, and it responds to training and mobility rather than to stimulus. Cyclical unemployment tracks the business cycle and is the kind demand policy targets.

The professional reading habit: never take the headline alone. Read it with participation and a broader underemployment measure, and ask what the composition of the change was. A falling rate with falling participation is a very different story from a falling rate with rising participation.`,
          resources: [BLS, FRED],
          assignment: {
            prompt: 'Pull the current unemployment rate, a broader underemployment measure, and the participation rate. Chart all three for ten years. Find a month where the headline improved while another measure worsened, and explain what was happening.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
    {
      id: 'money',
      title: 'Money, Banking & the Fed',
      blurb: 'What money is, where it comes from, and how a central bank steers an economy.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ec-money-1',
          title: 'What Money Actually Is',
          blurb: 'Three jobs, no intrinsic value, and why we accept it anyway.',
          minutes: 20,
          standardIds: ['CEE.ECON.11.8'],
          body: `Money is defined by what it does rather than what it is made of. It does three jobs: it is a medium of exchange, so trade does not require finding someone who wants exactly what you have; a unit of account, so values can be compared on one scale; and a store of value, so purchasing power can be carried into the future.

Barter fails on the first job. It requires a double coincidence of wants — you must find someone who has what you want *and* wants what you have — and the difficulty of that grows with the number of goods. Money removes the constraint, and the gain in possible trades is enormous.

Modern money is fiat: it is not backed by a commodity and has no intrinsic worth. It works because it is generally accepted, which is partly a matter of law — it settles debts and taxes — and largely a matter of shared expectation. Everyone accepts it because everyone else does. That makes money a genuinely social institution, and it explains why confidence is not a soft factor but the thing itself: currencies that lose it collapse quickly.

Most money in a modern economy is not notes and coins. It is bank deposits, and it is created when banks lend — the loan and the deposit come into existence together. Understanding that is the prerequisite for the next lesson, because it is the channel a central bank actually works through.`,
          resources: [FED_EDU, OPENSTAX, FRED],
          assignment: {
            prompt: 'Find how much of your country’s money supply is physical currency versus bank deposits (FRED publishes both). Report the ratio, then explain in your own words where the rest came from.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-money-2',
          title: 'What a Central Bank Does',
          blurb: 'Interest rates, the transmission mechanism, and the trade-off that cannot be avoided.',
          minutes: 24,
          standardIds: ['CEE.ECON.12.12', 'CEE.ECON.20.12'],
          body: `A central bank's main lever is a short-term interest rate, and the chain from that rate to your life is worth tracing carefully because every step is where the argument happens.

Raise the policy rate and borrowing becomes dearer. Dearer borrowing means less spending on things people finance — houses, cars, business investment. Less spending slows demand. Slower demand eases upward pressure on prices. It also, and this is the unavoidable part, slows hiring.

That is the trade-off at the centre of monetary policy: the same action that cools inflation cools employment. There is no setting that optimises both, which is why central banks with a dual mandate are always balancing rather than solving, and why reasonable people disagree about the right level at any moment.

Two complications make it harder than the chain suggests. Policy acts with long and variable lags — often a year or more — so decisions must be made on forecasts that will be wrong. And expectations matter enormously: if people expect high inflation they behave in ways that produce it, which is why central banks talk so much and treat credibility as an asset.

The reading skill here is to follow an actual decision. Central banks publish their statements, projections and votes. Read one, identify what they said about the trade-off, and see whether the vote was unanimous — dissents are the most informative part of the document.`,
          resources: [FED_EDU, FRED, OPENSTAX],
          assignment: {
            prompt: 'Read the most recent policy statement from your central bank. Summarise the decision, the reasoning about inflation versus employment, and any dissent. Then pull the policy-rate series from FRED and chart the last five years against inflation.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
    {
      id: 'data',
      title: 'Economic Data & Reasoning',
      blurb: 'The skill that outlasts every syllabus: getting real data and reasoning honestly about it.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ec-data-1',
          title: 'Correlation, Causation and the Missing Variable',
          blurb: 'Why "these two move together" is almost never an answer.',
          minutes: 24,
          standardIds: ['CEE.ECON.18.12', 'D2.Eco.1.9-12'],
          body: `Two series that move together may do so for four quite different reasons, and distinguishing them is most of empirical economics.

A causes B. B causes A — reverse causation, and it is common in economics: does police spending reduce crime, or does crime raise police spending? Both plausible, and the data alone cannot separate them. A third factor C causes both — the confounder, and it is the usual culprit. Or the relationship is coincidence, which happens more often than intuition allows across enough series.

Because controlled experiments are usually impossible in economics, the discipline has built methods to approximate them: natural experiments where something arbitrary divides otherwise similar groups, difference-in-differences comparing changed and unchanged groups over time, and instrumental variables using something that affects the cause but not the outcome directly.

None of them are magic. Each rests on assumptions that can be argued about, which is why empirical economics involves so much argument about identification rather than about the arithmetic.

The habit worth building is not scepticism for its own sake but a specific question, asked every time: what would have happened otherwise? That counterfactual is what any causal claim is really about, and if a study cannot say how it estimated the counterfactual, its headline finding is a correlation wearing a costume.`,
          resources: [FRED, CORE, MIT_1401],
          assignment: {
            prompt: 'Find a published claim that X caused Y in the economy. Identify how the authors estimated the counterfactual. Then write the strongest confounder you can think of and say whether their method handles it.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-data-2',
          title: 'Build a Live Dashboard',
          blurb: 'The capstone: pull the real series and tell the country’s story in one page.',
          minutes: 30,
          standardIds: ['CEE.ECON.18.12', 'CEE.ECON.20.12'],
          body: `Everything in this school converges on one deliverable: taking free public data and producing an honest, current picture of an economy.

Assemble the core panel. Output — real GDP and its growth rate. Prices — headline and core inflation. Labour — unemployment, a broader underemployment measure, and participation. Money — the policy rate and a longer-term yield. Optionally, distribution, because averages conceal.

Then do the work that separates a dashboard from a decoration. Put each series in context: is this level high or low against its own history? Say what the series does *not* tell you — every one of them has a known blind spot you have already studied. Identify the tension, because there is almost always one: inflation easing while employment softens, output growing while participation falls. And commit to a reading in a paragraph a non-economist could follow.

Two rules of honesty. Label every axis and cite every source, because an unlabelled chart is an assertion. And state your uncertainty: data is revised, sometimes substantially, and a forecast without an error band is a guess in formal clothing.

Do this once a month for a term and a learner will understand the macroeconomy better than most people who have merely read about it — because they will have watched it move.`,
          resources: [FRED, BLS, BEA, CENSUS],
          assignment: {
            prompt: 'Build a one-page live dashboard: output, prices, labour and money, each pulled from the current public series with sources and axis labels. Add a paragraph naming the central tension in the data right now and what you would watch next month to resolve it.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
    {
      id: 'systems',
      title: 'Systems, Institutions & Policy',
      blurb: 'Growth, inequality, trade and the role of government — where economics meets values.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ec-sys-1',
          title: 'Why Some Countries Are Rich',
          blurb: 'Productivity, institutions and the compounding that separates nations over a century.',
          minutes: 24,
          standardIds: ['CEE.ECON.15.12', 'CEE.ECON.14.12'],
          body: `Living standards depend, in the long run, on productivity — output per hour worked. Everything else is distribution of a total that productivity sets.

Productivity rises through a small number of channels. Physical capital: better tools. Human capital: education, skills, health. Technology: better methods, which is the largest contributor over long periods. And specialisation with trade, which raises output without inventing anything new, simply by letting people and places do what they are comparatively best at.

Compounding does the rest, and its scale is hard to feel. An economy growing two percent a year doubles living standards in about thirty-five years; at one percent it takes seventy. A single percentage point, sustained, is the difference between one doubling and two in a lifetime.

Underneath the channels sit institutions, and the modern literature treats them as decisive: secure property rights, enforceable contracts, functioning courts, restraint on expropriation, competitive markets, and public goods that no private actor will fund. Countries with similar resources and very different institutions diverge dramatically, and the natural experiments where a border split similar populations are as close to proof as this field offers.

Be honest about the open questions. Which institutions matter most, in what order, and whether they can be transplanted, are all genuinely contested. Economics knows more about what correlates with growth than about how to produce it on demand.`,
          resources: [OPENSTAX, CORE, FRED],
          assignment: {
            prompt: 'Pick two countries with similar resources and different outcomes over fifty years. Chart GDP per capita for both. Then research the institutional differences and write which you think mattered most — naming the evidence that could prove you wrong.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
        {
          id: 'ec-sys-2',
          title: 'When Markets Fail, and When Governments Do',
          blurb: 'Both failure modes are real. A serious course teaches both.',
          minutes: 26,
          standardIds: ['CEE.ECON.9.12', 'CEE.ECON.20.12', 'D2.Eco.1.9-12'],
          body: `Markets coordinate remarkably well under conditions that are not always present. Naming the exceptions precisely is more useful than either cheerleading or condemnation.

Markets fail in identifiable ways. Externalities: costs or benefits falling on third parties, so pollution is overproduced and vaccination underconsumed. Public goods: things non-excludable and non-rival, which private actors will not fund because no one can be charged. Market power: a dominant seller restricting output to raise price. Information asymmetry: one side knowing materially more, which can unravel a market entirely. And systemic risk, where individually rational decisions produce collective catastrophe.

Each has a standard remedy — pricing the externality, public provision, competition enforcement, disclosure rules, prudential regulation — and each remedy has a real record of working sometimes.

But government failure is equally real and belongs in the same lesson. Regulators can be captured by the industries they oversee. Political incentives are short and the costs of policy are often long. Information problems do not vanish when a decision moves to a ministry — they often worsen, because prices carried information the ministry now lacks. And interventions have unintended consequences that are frequently larger than the problem addressed.

So the honest question is never "market or state" in the abstract. It is: what is the specific failure, what is the proposed remedy, what does that remedy's own failure mode look like, and is the expected improvement worth it? That comparison is real economics, and it does not resolve into a slogan in either direction.`,
          resources: [OPENSTAX, CORE, MIT_1401],
          assignment: {
            prompt: 'Choose one real policy. Name the market failure it targets and the mechanism it uses. Then name the most likely government-failure mode for that specific remedy. Conclude with a judgement and the evidence that would change your mind.',
            tool: 'NONE',
            postTag: 'econschool',
          },
        },
      ],
    },
  ],
};

export default ECON_SCHOOL;
