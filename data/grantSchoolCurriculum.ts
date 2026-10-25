/**
 * grantSchoolCurriculum — "Grant School": how to find, win and manage grants, for first-time
 * applicants. Rides the shared School chassis (services/schoolChassis.ts) and pairs with the
 * Grant Matcher + Aria's application workspace (components/elevate/GrantHub.tsx): every lesson ends
 * with something to DO in the workspace, so the course is the thing you do, not a thing you read.
 *
 * Sources are public-domain federal material (Grants.gov, SAM.gov, 2 CFR 200, SBA, IRS). Dollar
 * thresholds are the ones in effect at `asOf`; each lesson that quotes one says where to confirm it,
 * because federal rules are revised and the notice itself always controls.
 *
 * GUARDRAIL: education, not legal, tax or accounting advice. Every certification on a federal
 * application is made by the organization's authorized representative, under penalty of law.
 */
import type { Curriculum } from '../services/schoolChassis';

const GRANTS_LEARN = { label: 'Grants.gov — Learn Grants', url: 'https://www.grants.gov/learn-grants' };
const GRANTS_APPLICANT = { label: 'Grants.gov — Applicant resources', url: 'https://www.grants.gov/applicants' };
const SAM = { label: 'SAM.gov — registration (free)', url: 'https://sam.gov/' };
const LISTINGS = { label: 'SAM.gov — Assistance Listings (formerly CFDA)', url: 'https://sam.gov/content/assistance-listings' };
const CFR200 = { label: '2 CFR Part 200 — the Uniform Guidance (eCFR)', url: 'https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200' };
const USASPENDING = { label: 'USAspending.gov — who got federal money', url: 'https://www.usaspending.gov/' };
const LOGIN = { label: 'Login.gov — the sign-in Grants.gov and SAM.gov use', url: 'https://www.login.gov/' };
const IRS_EOS = { label: 'IRS — Tax Exempt Organization Search', url: 'https://apps.irs.gov/app/eos/' };
const SBA = { label: 'SBA — funding programs', url: 'https://www.sba.gov/funding-programs' };
const SBIR = { label: 'SBIR.gov — America\'s Seed Fund', url: 'https://www.sbir.gov/' };
const ASM = '2026-10';

export const GRANT_SCHOOL: Curriculum = {
  id: 'grant-school',
  label: 'Grant School',
  blurb: 'Find the right grant, get registered, write a clear application and manage the award — with Aria filling in what she already knows.',
  accent: '#2FBF71',
  reviewNote: 'Education, not legal or accounting advice. Rules change and each notice controls; confirm thresholds and deadlines in the notice itself.',
  tracks: [
    {
      id: 'foundations', title: 'How grants work', level: 'FOUNDATION',
      blurb: 'The vocabulary and the money map — what a grant is, who gives them, and what is a scam.',
      lessons: [
        {
          id: 'gs-what', title: 'What a grant actually is', minutes: 7, asOf: ASM,
          blurb: 'Grants, cooperative agreements, contracts and loans are four different things.',
          body: `A grant is money given to do something that serves the public. It is not a loan, and it is not payment for a product. You keep your independence, but you promise to spend it on what you said, track it, and report back.

A cooperative agreement is a grant where the agency stays closely involved. A contract is the opposite: the government is buying something and tells you exactly what. A loan must be repaid.

Why it matters: each has different rules, forms and risks. Most community organizations want grants. Most small businesses are better served by loans and contracts (see the small-business lesson).

The other word to learn: "federal" is only one source. Foundations, corporations, community foundations, state and city governments and faith networks give more money in total to many organizations than Washington does, and their applications are often shorter.`,
          resources: [GRANTS_LEARN],
          assignment: { prompt: 'In the Grants tab, open the matcher and pick your organization type. Write down three notices that look relevant and, for each, whether it is a grant, a cooperative agreement or something else.', tool: 'NONE' },
        },
        {
          id: 'gs-who-gives', title: 'Who gives grants, and how they differ', minutes: 8, asOf: ASM,
          blurb: 'Federal, state, local, foundation and corporate funders want different things.',
          body: `Federal agencies publish formal notices with long forms, strict rules and a fixed deadline. They are slower and heavier, and they come with audits and reporting. In exchange they fund larger amounts.

States pass federal money down and add their own programs. Cities and counties fund local priorities like housing, youth and neighborhood projects.

Private foundations fund causes they care about, often by invitation, and their tax filings show exactly who they have funded before. Corporations give through community programs and local branches.

Formula funds versus competitive grants is the most useful split. Formula money (for example, most school aid like Title I) is calculated by law and sent to states, which send it on to districts. You do not compete for it, you claim it through the right office. Competitive (discretionary) grants are the ones you apply for and are scored against other applicants.

Match the funder to your size: a first-time organization is usually more successful with a small local or foundation grant than a million-dollar federal one.`,
          resources: [GRANTS_LEARN, USASPENDING],
          assignment: { prompt: 'Use the "who has been funded near you" panel in the matcher. Which recipients in your county look like you? Add two to your notes as possible partners or peers.', tool: 'NONE' },
        },
        {
          id: 'gs-anatomy', title: 'Reading a Notice of Funding Opportunity', minutes: 10, asOf: ASM,
          blurb: 'The NOFO is the contract before the contract. Learn where the answers hide.',
          body: `Every competitive federal grant starts with a Notice of Funding Opportunity, or NOFO (older ones say FOA). It is long, but it is organized the same way every time:

1. Overview: agency, program, deadline, estimated awards and award range.
2. Eligibility: who may apply, whether match is required, any limits on the number of applications.
3. Application and submission: what to send, page limits, formatting, and where to submit.
4. Review criteria: the scoring rubric. This is the most important part for writing.
5. Award administration: what happens after, including reporting.

Read in this order: eligibility first (do you qualify?), then review criteria (how will it be scored?), then the application requirements (what must be attached?), then the deadline.

Every program has an Assistance Listing number (formerly CFDA) that identifies it across the government. Keep it: it is how you find past winners and the program's rules.

Print the review criteria and write to them in the same order and with the same words. Reviewers score against that list, not against your passion.`,
          resources: [GRANTS_LEARN, LISTINGS],
          assignment: { prompt: 'Open one notice in the matcher and use "Who can apply". Highlight the exact eligibility sentence, the deadline, and the award range, and paste them into your application notes.', tool: 'NONE' },
        },
        {
          id: 'gs-scams', title: 'Scams and what costs money', minutes: 5, asOf: ASM,
          blurb: 'Federal grants are free to find and free to apply for. Anyone charging is not your friend.',
          body: `Finding grants on Grants.gov is free. Registering at SAM.gov is free. Applying is free. The government does not call, text or email to say you have "won" a grant you never applied for, and it never asks for a fee, a gift card or your bank login to release money.

Be wary of anyone who says: "You are guaranteed to qualify", "Pay a processing fee", "Send your Social Security or bank number to claim it", or "This is an exclusive program".

Paid help is not always wrong. Professional grant writers and consultants can be worth it. The difference: a legitimate one charges a flat or hourly fee for work, not a percentage of the award (fees tied to winning generally cannot be charged to a federal award), and never asks you to sign something you have not read.

If you are unsure whether an offer is real, look up the program on Grants.gov or ask your state's small-business or nonprofit support center.`,
          resources: [GRANTS_APPLICANT],
          assignment: { prompt: 'Write three sentences you would say to a volunteer who got a "you have been selected for a government grant" phone call.', tool: 'NONE' },
        },
        {
          id: 'gs-ai', title: 'Using AI and Aria honestly', minutes: 6, asOf: ASM,
          blurb: 'AI can save you hours. It cannot be responsible for what you submit. You are.',
          body: `Aria can pull your organization's facts into forms, point out what is missing, and draft sections from the facts you give her. The Grant Council can read your draft the way a program officer, a peer reviewer and an auditor would.

Three rules keep you safe.

1. Facts only. A draft must contain only things that are true and that you can document. Aria writes [NEEDS YOUR FACT: …] where she lacks one. Do not fill those with guesses. A made-up number in a federal application is a false statement, and knowingly false statements can carry serious penalties.
2. You decide and you certify. Only your authorized representative signs and certifies. We never do that for you.
3. Check the notice for AI rules. Some funders ask you to disclose AI assistance or limit it. If a notice says so, follow it.

Read everything out loud before you submit. If a sentence sounds like it could belong to any organization, rewrite it with something specific to yours.`,
          assignment: { prompt: 'Open the Council in your workspace and run it on a paragraph you wrote. Which fix would you actually make, and which would you reject? Say why.', tool: 'NONE' },
        },
      ],
    },
    {
      id: 'ready', title: 'Get ready to apply', level: 'FOUNDATION',
      blurb: 'The registrations and paperwork that take weeks — start them first.',
      lessons: [
        {
          id: 'gs-registrations', title: 'The registration chain: SAM.gov, UEI, Login.gov, Grants.gov', minutes: 10, asOf: ASM,
          blurb: 'Four accounts, in order. The first one is the slow one.',
          body: `Federal applications need four things to be in place before you can submit.

1. SAM.gov registration and a UEI. The Unique Entity ID is a 12-character code you receive when you register your organization at SAM.gov. It is free. It replaced the old DUNS number. Registration asks for your legal name, address and EIN, some certifications, and, depending on your path, payment information. Plan for several weeks; it can be faster, but do not count on it. It must be renewed every year.
2. Login.gov. A personal sign-in for the people who will use SAM.gov and Grants.gov, with two-factor authentication.
3. A Grants.gov account for the person who prepares the application.
4. The Authorized Organization Representative (AOR) role in Grants.gov. This is the person with legal authority to submit and certify on behalf of the organization. The organization's E-Business point of contact approves the role.

Do these in this order, and start the SAM.gov registration before you pick a grant. The most common reason first-time applicants miss a deadline is registration that is not complete.

Aria tracks this for you: when a deadline is closer than your longest missing registration, she says so.`,
          resources: [SAM, LOGIN, GRANTS_APPLICANT],
          assignment: { prompt: 'In the Profile tab, enter your SAM.gov status and UEI (or "not registered"). Write the date you will start registration and who will be your authorized representative.', tool: 'NONE' },
        },
        {
          id: 'gs-aor', title: 'Who signs: the authorized representative', minutes: 6, asOf: ASM,
          blurb: 'One person certifies the application for the whole organization.',
          body: `The Authorized Organization Representative (AOR) is the person your organization has legally empowered to submit applications and make the certifications that come with them: that your information is true, that you comply with federal rules, and that you are not debarred or delinquent on federal debt.

Choose carefully. This is usually an executive director, board chair, pastor, owner, superintendent or principal, not an intern. The AOR needs a Login.gov account and the role approved in Grants.gov, and they must read what they certify.

What the platform will and will not do: we pre-fill names, addresses and numbers. We never complete a signature, a date of signature, or a certification checkbox. Those are legal acts and belong to your AOR, who should review the full application before pressing submit.

Make a plan for two people: the AOR, and a backup who can prepare. If your AOR is unavailable on deadline day and no one else has the role, you cannot submit.`,
          resources: [GRANTS_APPLICANT],
          assignment: { prompt: 'Name your AOR and a backup. Write when each will have a Login.gov account and the Grants.gov role.', tool: 'NONE' },
        },
        {
          id: 'gs-status', title: 'Your legal status: 501(c)(3), church, school, business', minutes: 8, asOf: ASM,
          blurb: 'What you are decides what you can apply for, and what letters you will need.',
          body: `Eligibility depends on what your organization legally is.

A 501(c)(3) nonprofit has an IRS determination letter. Many notices are limited to these, and funders often ask for the letter. If you have lost it, the IRS can provide a copy, and the IRS Tax Exempt Organization Search shows your status.

Churches and houses of worship are treated as tax-exempt without applying. Many funders still ask for a letter or a statement; ask the funder what they accept, and consider getting an IRS letter if you plan to apply often.

Public schools and districts, cities, counties and states are governments, with their own registration paths and often a central grants office. A single school usually applies through its district.

For-profit businesses are excluded from many grants, and eligible for others (research, rural and energy programs in particular).

If your group has no legal status yet (for example a volunteer team), many funders will accept a fiscal sponsor: an established nonprofit that receives the grant for you and charges a modest fee. Get a written agreement.`,
          resources: [IRS_EOS],
          assignment: { prompt: 'Write your legal status in one line. List the documents that prove it and where each is stored.', tool: 'NONE' },
        },
        {
          id: 'gs-finance', title: 'Your financial house: books, policies and audits', minutes: 9, asOf: ASM,
          blurb: 'Reviewers ask whether you can handle money. Be ready to show it.',
          body: `Funders want evidence you can manage their money. At minimum have:

- Bookkeeping that separates grant money from everything else, with receipts for every expense.
- A budget for the current year and last year's financial statements.
- A written conflict-of-interest policy and basic financial policies (who approves spending, who reconciles the bank account, two signatures on large payments).
- A board or leadership list.

Audits scale with money. Under the federal rules, an organization that spends $1,000,000 or more in federal awards in a year must have a Single Audit (this threshold was raised in 2024; confirm the current figure in the Uniform Guidance). Small organizations are not required to, but a CPA review or audit still strengthens an application.

Indirect costs: if you do not have a negotiated rate with a federal agency, you may use a de minimis rate of up to 15% of modified direct costs. Use it only if the notice allows it, and say so in your budget.

None of this requires a big staff. It requires writing down what you already do.`,
          resources: [CFR200],
          assignment: { prompt: 'In the Profile tab, set your financial review level, indirect cost choice, and board size. List the policies you have, and the two you need to write.', tool: 'NONE' },
        },
        {
          id: 'gs-documents', title: 'Your document vault', minutes: 6, asOf: ASM,
          blurb: 'Gather the attachments once. Reuse them for every application.',
          body: `Most applications ask for the same pile of documents. Collect them once:

- IRS determination letter (or your status statement)
- SAM.gov registration confirmation
- Most recent financial statements, and an audit or review if you have one
- Board list with affiliations
- Organization chart or staffing plan
- Current-year budget
- Two or three boilerplate paragraphs: your mission, your history, who you serve
- Résumés or bios for the people who will run the project
- Letters of support from partners (ask for these early; they take weeks)

Keep it in one folder with dates in the file names. Check each year for anything that expired. Your workspace shows the checklist for each notice, based on what that notice asks for.

A prepared vault turns a two-week scramble into a two-day edit, and it lets you say yes quickly when a good opportunity appears.`,
          assignment: { prompt: 'Open the document checklist for one notice and tick what you already have. For each item you do not, write who will get it and by what date.', tool: 'NONE' },
        },
      ],
    },
    {
      id: 'choose', title: 'Find the right grant', level: 'INTERMEDIATE',
      blurb: 'A small number of well-chosen applications beats a pile of long shots.',
      lessons: [
        {
          id: 'gs-fit', title: 'Fit: mission, size and place', minutes: 8, asOf: ASM,
          blurb: 'The grant should want what you already do.',
          body: `The best predictor of success is fit. Ask three questions of every notice.

Mission fit: could the funder explain, in one sentence, why your project is exactly what they hope to fund? If you have to bend your work to fit, skip it. Chasing money changes organizations in ways that are hard to undo.

Size fit: does the award range match your capacity? An organization with a $150,000 budget will struggle to manage a $2 million award. Look at the average award, and at recipients on USAspending: are they bigger than you?

Place fit: many notices limit funding to a state, county or kind of community. Read the eligibility text. The matcher's "relevance" score is a ranking, not a determination: only the notice decides who is eligible.

Timing fit: can you finish the registrations and write the narrative before the deadline, with the people you have?

A good rule for a first application: pick one grant that fits all four, and finish it well.`,
          resources: [USASPENDING],
          assignment: { prompt: 'Pick one matcher result. Score it 1 to 5 on mission, size, place and timing. If any score is below 3, choose a different one.', tool: 'NONE' },
        },
        {
          id: 'gs-gonogo', title: 'The go / no-go decision', minutes: 6, asOf: ASM,
          blurb: 'A good "no" saves a month.',
          body: `Before you invest weeks, decide. A quick checklist:

1. Eligible? Read the eligibility text. If unsure, email the agency contact named in the notice; they answer these questions.
2. Registered? If your SAM.gov registration is not active and the deadline is close, you may not make it. Treat it as practice and aim for the next cycle.
3. Capacity? Who will write, who will do the budget, who will collect letters, who will submit?
4. Match? If a cost share is required, where does it come from?
5. Strategy? If you win, can you deliver, and do you want the reporting that comes with it?

Many strong organizations decline most of the notices they look at. Keep a short list of "next cycle" notices. Most programs return every year with similar requirements, so an application you could not finish this time is a head start for the next.

If you decide to go, write the decision down along with who owns each task and the date it is due.`,
          assignment: { prompt: 'Make the go / no-go call on your chosen notice in writing. If go, assign each task and a due date counting back from the deadline.', tool: 'NONE' },
        },
        {
          id: 'gs-funders', title: 'Researching private funders', minutes: 8, asOf: ASM,
          blurb: 'A foundation\'s tax filing is a map of who it really funds.',
          body: `Private foundations file a public tax return (Form 990-PF) listing the grants they gave: recipient, amount and purpose. That tells you far more than a website.

Look for foundations that have given to organizations like yours: same kind of work, same region, and similar size. A foundation that gives a hundred grants of $5,000 in your county is a much better target than one that gives a handful of $500,000 grants nationally.

Read the foundation's guidelines. Many give only to organizations they already know, or by invitation. If they say no unsolicited proposals, respect it and look for a way to introduce yourself, such as a board connection or an event.

Start with a short letter of inquiry or a phone call to the program officer. Ask whether your project fits and what they would want to see. Funders are people with budgets to spend on good projects, and most appreciate being asked before you write twenty pages.

Keep a simple tracking sheet: funder, contact, what they funded, deadline, status.`,
          resources: [IRS_EOS],
          assignment: { prompt: 'Find two foundations that gave to organizations like yours. Write what they funded, the typical amount, and one question you would ask a program officer.', tool: 'NONE' },
        },
        {
          id: 'gs-calendar', title: 'Working backwards from the deadline', minutes: 5, asOf: ASM,
          blurb: 'A plan that starts at the deadline and counts back.',
          body: `Deadlines are exact. Grants.gov closes at a specific time and date, and late applications are not reviewed. Build your plan backwards:

- Day 0: deadline. Submit by day -3 at the latest.
- Day -3: submission. Grants.gov takes time to validate, and an error leaves you a window to fix and resubmit.
- Day -7: AOR reads the whole application.
- Day -10: all attachments final, including letters of support.
- Day -14: full draft, reviewed by someone who did not write it.
- Day -21: budget done and checked against the narrative.
- Day -28 or earlier: registrations active; letters requested; decisions made.

If your longest registration takes six weeks, your plan starts six weeks before that. Put each date on the calendar, and tell each person their date.

Your workspace shows the number of days left and warns you when a registration will not finish in time.`,
          assignment: { prompt: 'Build your backwards calendar for the notice you chose. Put every date on a shared calendar.', tool: 'NONE' },
        },
      ],
    },
    {
      id: 'write', title: 'Write a clear application', level: 'INTERMEDIATE',
      blurb: 'Reviewers read dozens. Make yours easy to score.',
      lessons: [
        {
          id: 'gs-need', title: 'The statement of need', minutes: 9, asOf: ASM,
          blurb: 'Start with a real, sourced problem, not adjectives.',
          body: `The need statement answers: who is affected, how many, where, and how do we know? A strong one is built from facts you can cite.

Lead with the clearest fact, then explain. "In our zip code, 31% of children live below the poverty line (U.S. Census Bureau, ACS 2023)" beats "Our community has many struggling families."

Use at least two kinds of evidence: public data (Census, your city, your school district, public health) and your own (waiting lists, the number of people you turned away, a survey). Always give the source and year.

Describe the gap: what exists now, and what is missing. If other organizations help, say so and explain how your work fits alongside theirs. Reviewers distrust applications that claim to be the only one.

Keep people at the center: one short, true story can make a number memorable, with permission and without identifying details.

Do not exaggerate. Reviewers check, and one weak claim makes them doubt the rest. Aria will mark any number she cannot trace to your facts.`,
          resources: [{ label: 'Census Data (public domain)', url: 'https://data.census.gov/' }],
          assignment: { prompt: 'Ask Aria to draft your need statement from three facts you type in. Replace every [NEEDS YOUR FACT] with a real, sourced one before you keep it.', tool: 'NONE' },
        },
        {
          id: 'gs-goals', title: 'Goals, objectives and outcomes', minutes: 8, asOf: ASM,
          blurb: 'Say what will be different, by when, and how you will know.',
          body: `A goal is the big change you want. Objectives are the measurable steps toward it. Keep the difference clear.

Goal: Reduce hunger among families we serve.
Objective: By December 2027, 300 households will receive weekly groceries, and 80% will report fewer skipped meals on the six-month survey.

Good objectives are SMART: specific, measurable, achievable, relevant and time-bound. Use only numbers you can honestly reach and measure.

Separate three levels:
- Outputs: what you do (300 households served, 40 workshops held).
- Outcomes: what changes for people (less hunger, new skills, better grades).
- Impact: the larger, longer change you contribute to.

Funders weigh outcomes most. If your outcomes take years, name the short-term signs you will track along the way.

Two to four objectives are plenty. More looks unfocused.`,
          assignment: { prompt: 'Write one goal and two SMART objectives for your project. For each, name how and when you will measure it.', tool: 'NONE' },
        },
        {
          id: 'gs-approach', title: 'Approach and logic model', minutes: 9, asOf: ASM,
          blurb: 'Show the path from your resources to your results.',
          body: `The approach section tells reviewers what happens, in what order, who does it, and why it should work.

A logic model is a one-page picture of it:

Inputs (staff, money, space, partners) → Activities (what you do) → Outputs (how much you do) → Outcomes (what changes) → Impact.

Write the approach so a reviewer could picture a typical week of the project. Name roles, not just titles ("our case manager meets each family within 10 days of intake").

Say why this approach. Cite evidence it works: a research finding, a proven model you are adapting, or your own results from a pilot. If it is new, say how you will test and adjust it.

Include a timeline: milestones by quarter. Show that the activities fit the grant period and that the budget pays for them.

Name partners and what each will actually do. Do not list a partner who has not agreed; attach a letter if you can.`,
          assignment: { prompt: 'Draw your logic model on one page: inputs, activities, outputs, outcomes. Check that every activity has a cost in your budget.', tool: 'NONE' },
        },
        {
          id: 'gs-evaluation', title: 'Evaluation: how you will know', minutes: 7, asOf: ASM,
          blurb: 'You do not need a researcher. You need a simple plan you will follow.',
          body: `Evaluation is how you learn whether the project worked and how you improve it.

For each objective, write down: the measure, the source of the data, who collects it, how often, and who reviews it. Keep measures few and real. Attendance sheets, intake and exit surveys, test scores, case notes, photos with permission and simple counts are all fine.

Plan for privacy. Collect only what you need, store it securely, and follow rules that apply to your population: for example, student records and children's data have special protections.

Say how you will use the results. Funders love "we review the numbers quarterly and adjust". Include one way you would handle bad news.

If the notice asks for an outside evaluator, budget for it. If it does not, internal evaluation is normal for small projects.

Be honest about limits. "We will measure participation and self-reported change; we cannot prove cause" is stronger than overclaiming.`,
          assignment: { prompt: 'For each objective, fill in: measure, source, who collects, how often, who reviews. Then write one sentence on what you would change if the first quarter went badly.', tool: 'NONE' },
        },
        {
          id: 'gs-budget', title: 'The budget and the justification', minutes: 12, asOf: ASM,
          blurb: 'Every dollar traces to an activity, and the math is checkable.',
          body: `The budget turns your plan into numbers, and reviewers read it against your narrative. If you promise a coordinator and the budget has none, you lose points.

Standard federal categories: personnel, fringe benefits, travel, equipment, supplies, contractual, construction (rare), other, and indirect costs.

Costs must be necessary, reasonable, allocable to the project, and allowable under the Uniform Guidance (2 CFR 200). Common traps: charging a cost to two grants, buying things the notice forbids, and counting donated time without records.

For each line, write a justification: what it buys, how you calculated it, and which activity it supports. Show the arithmetic: "Program coordinator: 0.5 FTE × $52,000 = $26,000; fringe 22% = $5,720."

Equipment is a single item above a threshold ($10,000 under the current rules; confirm in the notice). Smaller purchases are supplies.

Indirect costs cover overhead you cannot assign to one project. Use your negotiated rate, or the 15% de minimis rate if you have none and the notice allows it, and state which.

Match: when the notice requires cost sharing, document where it comes from, and keep records. When it does not, do not volunteer extra: voluntary committed match is generally discouraged and still must be tracked once promised.

Check the total three times. A budget that does not add up undermines trust in everything else.`,
          resources: [CFR200],
          assignment: { prompt: 'Build a one-page budget with a justification line for each cost. Run the Council\'s Budget Auditor on it and fix what it flags.', tool: 'NONE' },
        },
        {
          id: 'gs-capacity', title: 'Showing you can deliver', minutes: 6, asOf: ASM,
          blurb: 'Who you are and what you have already done.',
          body: `The capacity section answers: why you, and why will this work out?

Include real history: years operating, people served, past grants managed (federal or otherwise), key staff and what they have done, and the systems that keep money and data safe.

Use numbers: "Since 2019 we have served 2,400 families" is stronger than "We have a long history".

Describe how you manage money and report: who does the books, whether you have been audited, and how you will keep federal funds separate.

Name people. Short bios for the project lead and the fiscal manager help, especially if they have relevant training or experience.

If you are new, say so, and show how you reduce risk: an experienced partner, a fiscal sponsor, a pilot you completed, or an advisory board.`,
          assignment: { prompt: 'Write your capacity paragraph using only facts you can document. List the document that proves each claim.', tool: 'NONE' },
        },
        {
          id: 'gs-edit', title: 'Edit for the tired reader', minutes: 6, asOf: ASM,
          blurb: 'Clear writing is scored higher because it is easier to score.',
          body: `Reviewers read in batches, often late. Make the answer easy to find.

- Lead each section with its main point in the first sentence.
- Use the notice's headings in the notice's order, and its words for the same things.
- Short sentences, plain words, active voice. Define any acronym the first time you use it.
- Replace adjectives with evidence: not "innovative", but what is new and why it works.
- Cut anything that does not help the reviewer score. Respect the page limit and font rules exactly; a technical violation can disqualify.
- Have someone who does not know your work read it and tell you what the project is in two sentences.

Run the Council's editor, read the application out loud, and fix every sentence you trip on.

Finally, proofread names, numbers and dates against your records. A wrong EIN or a mismatched organization name can hold up an award.`,
          assignment: { prompt: 'Send your draft to someone outside your organization. Ask them to explain the project back to you. Where they were wrong is where you were unclear.', tool: 'NONE' },
        },
      ],
    },
    {
      id: 'submit', title: 'Submit, win and manage', level: 'ADVANCED',
      blurb: 'Submitting is the middle of the process. Here is the rest.',
      lessons: [
        {
          id: 'gs-submit', title: 'Submitting in Grants.gov', minutes: 8, asOf: ASM,
          blurb: 'Workspaces, forms, checks and what to do when it is rejected.',
          body: `Most federal applications go through a Grants.gov Workspace: a shared online folder holding the forms and attachments. Several people can prepare parts of it, but only the AOR submits.

Steps: create a Workspace from the notice's opportunity page; complete each required form (the SF-424 cover form first, which your Profile pre-fills as a copy sheet); attach your narrative and budget as PDFs, following file name and size rules; run "Check Application" to catch errors; the AOR submits.

After submission you get a tracking number. Grants.gov then validates the application and the agency retrieves it. If either rejects it, you receive an email with the errors. You can fix and resubmit until the deadline, which is why you submit days early.

Common rejections: wrong or mismatched UEI or organization name, an expired SAM.gov registration, missing required forms, attachments with special characters in the file name, and exceeding file size limits.

Keep the confirmation emails and tracking number. Do not wait for the last day.`,
          resources: [GRANTS_APPLICANT],
          assignment: { prompt: 'Make a pre-submission checklist for your notice: forms, attachments, file names, AOR sign-off, tracking number saved.', tool: 'NONE' },
        },
        {
          id: 'gs-review', title: 'What happens after you submit', minutes: 6, asOf: ASM,
          blurb: 'Review, scoring, and the long wait.',
          body: `Agencies first screen for eligibility and completeness. Applications that pass go to review, usually by a panel of outside experts who score against the criteria in the notice. Program staff then recommend awards, and officials decide, so decisions can take a few months.

You may be asked clarifying questions or to submit more documents. Answer quickly and exactly.

If you are not funded, you can usually ask the agency for the reviewers' comments (a debrief). Ask politely, read them without defensiveness, and fix the weaknesses. Many awards go to applicants on their second or third try.

If you are funded, you receive a Notice of Award with the terms and conditions. Read every line. Your AOR accepts the award, and you may negotiate the budget with the agency before you spend.

While you wait, keep working on the project in whatever form you can, and keep records. Do not announce an award before you receive the official notice.`,
          assignment: { prompt: 'Write what you will do in each outcome: funded, funded at a lower amount, or not funded. Include whom you would ask for reviewer comments.', tool: 'NONE' },
        },
        {
          id: 'gs-manage', title: 'Managing an award', minutes: 9, asOf: ASM,
          blurb: 'Spend as promised, record everything, and report on time.',
          body: `An award is a promise. Under the Uniform Guidance you must spend funds only on approved costs, within the grant period, and keep documentation.

Basics:
- Set up a separate account or class in your books for the award.
- Track time for anyone paid partly from the grant; staff time records are often audited.
- Follow your own written procurement rules when you buy; larger purchases require competition.
- Request changes in writing before you move money or change the project significantly.
- Draw down funds as you need them, not far ahead.
- File required reports on time: financial (often the SF-425) and performance reports.
- Keep records for at least three years after the final report, longer if the award says so.

Federal awards are monitored. If you spend $1,000,000 or more in federal awards in a year, you need a Single Audit.

Closeout: submit final reports within the deadline after the grant ends (usually 120 days), and settle any remaining funds.

If something goes wrong, tell your program officer early. They expect problems and respond better to honesty than to surprises.`,
          resources: [CFR200],
          assignment: { prompt: 'List your first 90 days after an award: books set up, who tracks time, reporting calendar, and who talks to the program officer.', tool: 'NONE' },
        },
        {
          id: 'gs-renew', title: 'Reporting, relationships and renewal', minutes: 6, asOf: ASM,
          blurb: 'Funders fund people they trust. Build that trust between grants.',
          body: `The best preparation for your next grant is how you handle this one.

Send reports on time and make them honest and clear: what you planned, what happened, what you learned, and what you would change. Include a short human story with permission.

Keep your program officer informed with brief updates, not just reports. Invite them to see the work, if the funder allows.

Thank the funder properly and credit them as the award requires. Follow any rules about acknowledging federal funding.

Track your results so your next application has real evidence: numbers, outcomes and testimonials.

Build a funding mix. No single funder should be more than a fraction of your budget. Combine federal, state, local, foundation, corporate and individual giving, so one decision cannot sink you.

Finally, share what you learned. Another small organization may be where you started.`,
          assignment: { prompt: 'Write your thank-you and credit plan, and list three ways you will gather evidence during the grant for your next application.', tool: 'NONE' },
        },
      ],
    },
    {
      id: 'paths', title: 'Your path', level: 'ADVANCED',
      blurb: 'Specific guidance for churches, schools, teachers and small businesses.',
      lessons: [
        {
          id: 'gs-faith', title: 'Churches and faith-based organizations', minutes: 8, asOf: ASM,
          blurb: 'You may apply on the same footing as anyone. Keep worship and services clearly separate.',
          body: `Faith-based organizations can compete for federal grants on the same footing as other organizations, and they do not have to give up their religious character to do it.

The key rule: direct federal funds may not pay for explicitly religious activities such as worship, religious instruction or proselytization. Services funded by the grant, such as a food pantry, housing counseling, tutoring or job training, must be open to people regardless of their faith, and participation in religious activities cannot be a condition for getting help.

In practice:
- Offer funded services at a separate time or place from any religious activity, or make participation clearly voluntary.
- Keep separate accounts so grant money never pays for worship costs, and track staff time carefully.
- Describe your program in terms of its secular outcomes: meals served, families housed, students tutored.
- Check the notice and the agency's rules: details vary by program and agency, and the notice controls.

Practical tips: many churches partner with or create a separate nonprofit arm to manage grants, which also makes audit and liability easier. Confirm whether the funder wants an IRS determination letter or accepts a statement of your church's status.

Grace and secular outcomes are not in conflict: reviewers want to know what changes for the people you serve.`,
          resources: [GRANTS_APPLICANT],
          assignment: { prompt: 'Describe one program your congregation runs that could be funded. Write how you will separate funded services from worship in time, place and accounting.', tool: 'NONE' },
        },
        {
          id: 'gs-nonprofit', title: 'Nonprofits and cultural institutions', minutes: 6, asOf: ASM,
          blurb: 'Museums, arts groups and community organizations have their own federal doors.',
          body: `Arts, humanities and heritage organizations have dedicated funders: the National Endowment for the Arts, the National Endowment for the Humanities, the Institute of Museum and Library Services, state arts and humanities councils, and many private foundations.

Their review criteria look different from social-service grants. Expect questions about artistic or scholarly quality, public benefit, access and audiences, partnerships, and how you will document and share the work.

Public programs, collections care, digitization, education and community engagement are common fundable activities. State councils often fund smaller amounts with simpler applications, a good first step.

For all nonprofits: keep your 990s up to date and public, because funders will read them. Board engagement matters: many funders ask whether your board gives.

Build relationships. Attend funder webinars, ask for a call with the program officer, and sign up for the agency's announcements. Many programs are forecast months in advance, which is the best time to prepare.`,
          assignment: { prompt: 'Find the state arts or humanities council for your state. Write the smallest grant it offers and its next deadline.', tool: 'NONE' },
        },
        {
          id: 'gs-school', title: 'Schools and districts', minutes: 8, asOf: ASM,
          blurb: 'Know which money you claim and which you compete for.',
          body: `School funding has two layers. Most large federal education money (Title I for low-income students, IDEA for students with disabilities, school meals) is formula money. Congress sets how it is divided, the money goes to your state education agency, and your district receives its share. Your job is to claim and use it well, through your district's federal programs office.

Competitive grants sit on top of that: programs for STEM, early childhood, school safety and mental health, literacy, career and technical education, teacher training and innovation. These are the ones you search for in the matcher.

A single public school usually applies through its district; the district holds the registrations and signs. Charter schools differ by state: some apply as their own nonprofit, some through a district. Private schools and homeschool co-ops typically apply as nonprofits, and some education funds are limited to public schools, so read eligibility closely.

Talk to your district's grants office first. They may already be applying, and can tell you what the school can do alone. Align your project to the school or district improvement plan and use your own data on attendance, achievement and enrollment.

Student privacy rules apply to anything you collect or share.`,
          resources: [GRANTS_APPLICANT],
          assignment: { prompt: 'Ask your district office which formula funds your school receives and who holds the registrations. List two competitive grants that fit your school improvement plan.', tool: 'NONE' },
        },
        {
          id: 'gs-teacher', title: 'Teachers and classrooms', minutes: 6, asOf: ASM,
          blurb: 'Very few grants go to individuals. Most classroom money comes another way.',
          body: `Individual teachers are rarely eligible for federal grants as persons. Federal programs for teachers are mostly fellowships, research experiences and summer institutes: competitive and specific.

Classroom money usually comes from elsewhere: your school or district discretionary funds, parent organizations, local education foundations, community foundations, businesses that support schools, and classroom-project crowdfunding sites where a teacher posts a project and the public funds it.

For larger ideas, work with your principal or district grants office, which can apply on behalf of your school and include your project in a bigger application. Offer to be the teacher lead and to supply the classroom details and evidence.

Whatever the source, the same writing rules apply: a specific need, a clear plan, a real budget and a way to measure results. A simple project with a clear plan often outperforms a grand one.

Check your district's policy before you apply for or accept outside funds, and never put student names or photos in a public project without permission.`,
          assignment: { prompt: 'Write a three-sentence classroom project summary, with an itemized cost, and send it to your principal asking whether the school can apply or support it.', tool: 'NONE' },
        },
        {
          id: 'gs-contracts', title: 'Selling to the government: contracts and set-asides', minutes: 9, asOf: ASM,
          blurb: 'The government is the largest buyer in the country, and a lot of it is reserved for small businesses.',
          body: `A contract is the government buying something: a service, a product or a build. Unlike a grant, you are paid for delivering exactly what the solicitation describes, and there is no "mission fit" to argue; you win by being qualified, responsive and competitively priced.

Where to look. SAM.gov lists contract opportunities. Notices come in stages: a sources sought or request for information (the agency is testing the market, the best time to introduce yourself), a presolicitation, and the solicitation itself with the due date and instructions. Award notices show who won, which tells you who your competitors are.

Set-asides. Some purchases are reserved for small businesses, and some for women-owned, veteran-owned, service-disabled veteran-owned, HUBZone or 8(a) firms. You may only bid on a set-aside you qualify for, and some certifications need proof from SBA or the VA. Notices that are "full and open" make you compete against every size of business.

NAICS codes. Every notice carries a six-digit industry code, and the size standard that decides whether you count as small depends on it. Pick the codes that describe what you really sell, and list them in your SAM.gov registration.

Registration comes first. You need an active SAM.gov registration to be awarded a contract. It also assigns your CAGE code.

Your capability statement is a one-page summary of what you do, your codes, certifications, past performance and contact details. Contracting officers keep them. Aria can draft one from your facts and mark what is missing.

Start small: sources sought notices, subcontracting to a larger prime, and local government bids are easier first wins than a large federal solicitation. Free help is available from Procurement Technical Assistance Centers and Small Business Development Centers.`,
          resources: [SAM, SBA],
          assignment: { prompt: 'In Contracts & loans, pick your type of work and certifications and run a search. Choose one opportunity and write what you would need to bid: registration, documents, pricing, and the date you would start.', tool: 'NONE' },
        },
        {
          id: 'gs-business', title: 'Small businesses', minutes: 9, asOf: ASM,
          blurb: 'Loans, contracts and research awards — plus the few grants that do accept businesses.',
          body: `Most federal grants exclude for-profit businesses, so small businesses should look broadly.

Financing. The Small Business Administration backs loans through banks and lenders (the 7(a) program for general needs, 504 for real estate and equipment) and offers microloans for small amounts. These are loans, which you repay, but they are the main federal support for ordinary small businesses.

Contracts. The government buys a great deal from small businesses, and many contracts are reserved for small, women-owned, veteran-owned, service-disabled veteran-owned and HUBZone businesses. Opportunities are posted on SAM.gov, and many start with the same SAM.gov registration you need for grants. Local governments post their own bids.

Research awards. SBIR and STTR programs fund small businesses to develop new technology for several agencies. They have their own application cycles and are competitive; see SBIR.gov.

Grants that accept businesses. Some rural development, energy-efficiency, agriculture and workforce programs welcome for-profit applicants; read the eligibility text.

State and local help. Many states and cities offer startup, façade-improvement, hiring and training incentives, and Opportunity Zones offer tax advantages for investment in designated areas.

Get free advice from a Small Business Development Center, SCORE mentors and your state's economic development office.`,
          resources: [SBA, SBIR, SAM],
          assignment: { prompt: 'List the three most likely money sources for your business: one financing, one contract or procurement, and one state or local program. Write the first step for each.', tool: 'NONE' },
        },
      ],
    },
  ],
};

export default GRANT_SCHOOL;
