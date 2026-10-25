/**
 * Practice bank for Grant School — 2 questions per lesson. Each row is
 * [prompt, correct, [3 wrong choices], hint, explanation, level]. The correct choice rotates through
 * positions 0-3 so answers spread out. Facts match the lessons' `asOf` date; federal thresholds are
 * the ones in the Uniform Guidance as revised in 2024.
 */
import type { Question, QuestionBank } from './types';

type Row = [string, string, [string, string, string], string, string, 1 | 2 | 3];

const ROT = [2, 0, 3, 1];
let counter = 0;

function build(lessonId: string, rows: Row[]): Question[] {
  return rows.map((r, i) => {
    const pos = ROT[counter++ % 4];
    const choices = [...r[2]];
    choices.splice(pos, 0, r[1]);
    return { id: `${lessonId}.q${i + 1}`, lessonId, kind: 'mcq' as const, prompt: r[0], choices, answer: pos, hint: r[3], explanation: r[4], level: r[5] };
  });
}

export const GRANT_BANK: QuestionBank = {
  curriculumId: 'grant-school',
  questions: [
    ...build('gs-what', [
      ['Which describes a grant?', 'Money given to carry out a public-benefit project, which you spend as promised and report on', ['A loan you repay with interest', 'Payment for a product the government orders from you', 'A gift with no conditions or reporting'], 'Think about what you promise in return.', 'Grants fund public-benefit work and come with conditions and reporting. Loans are repaid; contracts buy something specific.', 1],
      ['What is different about a cooperative agreement?', 'The agency stays closely involved in the work', ['It must be repaid', 'It has no budget', 'It is only for individuals'], 'The word "cooperative" is the clue.', 'A cooperative agreement is a grant with substantial federal involvement.', 1],
    ]),
    ...build('gs-who-gives', [
      ['Title I school aid is mostly which kind of funding?', 'Formula funding that goes to states, then to districts', ['A competitive grant each school writes for', 'A loan from the Department of Education', 'A private foundation grant'], 'Congress sets how it is divided.', 'Formula funds are divided by law and passed down by the state; you claim them, you do not compete for them.', 2],
      ['Which funder\'s past giving is publicly visible in its tax filing?', 'A private foundation (Form 990-PF)', ['A federal agency', 'A bank', 'An individual donor'], 'Foundations must file a public return.', 'Private foundations list their grants on Form 990-PF, a useful map of who they fund.', 1],
    ]),
    ...build('gs-anatomy', [
      ['What does NOFO stand for?', 'Notice of Funding Opportunity', ['Notice of Federal Obligation', 'National Office of Funding Operations', 'Network of Funded Organizations'], 'It announces a program and how to apply.', 'The NOFO is the official announcement; older notices call it a FOA.', 1],
      ['Which part of a NOFO should you read to learn how you will be scored?', 'The review criteria', ['The overview', 'The contact list', 'The agency history'], 'Reviewers use a rubric.', 'Reviewers score against the review criteria, so write to them in the same order and words.', 1],
    ]),
    ...build('gs-scams', [
      ['A caller says you "won" a government grant and must pay a processing fee. What is it?', 'A scam', ['A normal first step', 'A tax payment', 'A state requirement'], 'Do federal grants charge to release money?', 'The government does not charge fees or call to award money you never applied for.', 1],
      ['Which fee arrangement is a warning sign for a grant writer?', 'A percentage of the award', ['An hourly rate', 'A flat fee per application', 'A written statement of work'], 'Think about paying for winning versus paying for work.', 'Fees tied to winning generally cannot be charged to a federal award and create bad incentives.', 2],
    ]),
    ...build('gs-ai', [
      ['An AI draft contains a statistic you cannot trace to any source. What should you do?', 'Remove it or replace it with a sourced fact', ['Keep it; it sounds plausible', 'Round it up', 'Cite the AI as the source'], 'Who is responsible for what you submit?', 'You are responsible for accuracy; a made-up number in a federal application is a false statement.', 2],
      ['Who certifies a federal application?', 'The organization\'s authorized representative', ['The AI assistant', 'The grant writer', 'The funder'], 'It is a legal act.', 'Only the authorized representative makes the certifications, after reading the application.', 1],
    ]),
    ...build('gs-registrations', [
      ['Where do you get a UEI?', 'By registering your organization at SAM.gov (free)', ['From the IRS', 'From Grants.gov for a fee', 'From your bank'], 'It replaced DUNS.', 'The Unique Entity ID is assigned when you register at SAM.gov, which is free.', 1],
      ['Why start SAM.gov registration before choosing a grant?', 'It can take weeks, and you cannot submit without it', ['It makes the grant larger', 'It is only needed after winning', 'It guarantees eligibility'], 'Think about the deadline.', 'Registration is the slowest prerequisite and must be active when you submit.', 1],
    ]),
    ...build('gs-aor', [
      ['What can the platform never fill in for you?', 'Signatures, signing dates and certifications', ['Your address', 'Your organization name', 'Your EIN'], 'Which items are legal acts?', 'Those belong to your authorized representative, so we leave them blank.', 1],
      ['Why name a backup preparer?', 'Only the AOR can submit, so the work must continue if someone is unavailable', ['The funder requires two signers', 'It doubles your award', 'It replaces SAM.gov'], 'Consider deadline day.', 'Planning for absence protects the deadline; the AOR role itself still has to be held by someone.', 2],
    ]),
    ...build('gs-status', [
      ['What do many funders ask a nonprofit to attach?', 'The IRS determination letter', ['A bank statement', 'The mayor\'s approval', 'A copy of the mission statement only'], 'It proves tax-exempt status.', 'The determination letter documents 501(c)(3) status.', 1],
      ['A volunteer team with no legal status wants a grant. A common solution is', 'A fiscal sponsor', ['Applying as an individual always', 'A personal loan', 'Skipping registration'], 'Someone established receives the money.', 'A fiscal sponsor is an established nonprofit that receives and manages the grant, usually for a fee, under a written agreement.', 2],
    ]),
    ...build('gs-finance', [
      ['At what level of annual federal award spending is a Single Audit required (current rules)?', '$1,000,000 or more', ['$100,000 or more', '$500,000 or more', '$10,000,000 or more'], 'It was raised in 2024.', 'The Single Audit threshold is $1,000,000 in federal awards expended, for fiscal years beginning on or after October 1, 2024. Confirm in the Uniform Guidance.', 2],
      ['An organization with no negotiated rate may use what indirect rate, if the notice allows?', 'De minimis, up to 15% of modified direct costs', ['25% of the award', 'Any rate it chooses', 'None is ever allowed'], 'It is a flat default rate.', 'The de minimis rate is up to 15% of modified total direct costs.', 2],
    ]),
    ...build('gs-documents', [
      ['Why build a document vault?', 'Most applications ask for the same attachments', ['Funders pay for it', 'It replaces the narrative', 'It is required to open an account'], 'Think reuse.', 'Gathering documents once turns each application into an edit instead of a scramble.', 1],
      ['Which attachment takes weeks to obtain and should be requested early?', 'Letters of support from partners', ['Your organization name', 'The page limit', 'The notice number'], 'It depends on other people.', 'Partners need time and a clear summary to write specific letters.', 1],
    ]),
    ...build('gs-fit', [
      ['Which question tests "mission fit"?', 'Could the funder explain in one sentence why your project is what they hope to fund?', ['Is the deadline far away?', 'Is the award large?', 'Do you like the agency?'], 'It is about alignment, not size.', 'If you have to bend your work to fit, the fit is poor.', 1],
      ['An organization with a $150,000 budget is considering a $2 million award. The main concern is', 'Capacity to manage it', ['The font size', 'The agency\'s logo', 'The Assistance Listing number'], 'Think scale.', 'Award size should match your ability to deliver and manage the money.', 2],
    ]),
    ...build('gs-gonogo', [
      ['If your SAM.gov registration is inactive and the deadline is days away, the best move is usually', 'Treat this one as practice and aim for the next cycle', ['Submit anyway', 'Use another organization\'s UEI', 'Skip the narrative'], 'You cannot submit without it.', 'An inactive registration blocks submission; preparing now still helps for the next cycle.', 2],
      ['Who answers eligibility questions about a notice?', 'The agency contact named in the notice', ['A random consultant', 'The press office', 'Your bank'], 'Look at the contact section.', 'Agency contacts answer eligibility questions, and their answer is authoritative.', 1],
    ]),
    ...build('gs-funders', [
      ['Which foundation is the better target?', 'One that gives many $5,000 grants to groups like yours in your county', ['One that gives a few $500,000 grants nationally to large institutions', 'One that does not accept applications from anyone', 'One that has never published its giving'], 'Look for past giving that resembles you.', 'Past giving to similar organizations is the strongest predictor.', 2],
      ['A foundation says "no unsolicited proposals." What should you do?', 'Respect it and look for a way to be introduced', ['Send a full proposal anyway', 'Call every board member', 'Apply under another name'], 'Follow the funder\'s rules.', 'Respect their process and find a legitimate introduction, such as a mutual connection or event.', 1],
    ]),
    ...build('gs-calendar', [
      ['By when should you submit relative to the deadline?', 'At least a few days early', ['In the last minute', 'After the deadline if you apologize', 'Exactly on the hour'], 'Think about error fixes.', 'Grants.gov validates and can reject; early submission leaves time to fix and resubmit.', 1],
      ['If your longest registration takes six weeks, your plan should', 'Start at least six weeks before the writing', ['Wait until the deadline', 'Ignore it', 'Start after you win'], 'Work backwards.', 'Prerequisites set the earliest start date; the writing fits in what remains.', 1],
    ]),
    ...build('gs-need', [
      ['Which opening is strongest for a need statement?', '"31% of children in our zip code live below the poverty line (Census ACS 2023)."', ['"Our community has many struggling families."', '"We are passionate about children."', '"Everyone knows poverty is a problem."'], 'Specific and sourced.', 'A sourced fact is checkable and credible; adjectives are not.', 1],
      ['What should accompany every statistic?', 'Its source and year', ['A guess at the trend', 'An exclamation', 'A competitor\'s name'], 'How will a reviewer check it?', 'Reviewers verify; a source and year make a claim credible.', 1],
    ]),
    ...build('gs-goals', [
      ['Which is an objective, not a goal?', '"By December 2027, 300 households will receive weekly groceries."', ['"Reduce hunger in our community."', '"Improve lives."', '"Be the best food pantry."'], 'Numbers and a date.', 'Objectives are specific, measurable and time-bound steps toward a goal.', 2],
      ['Funders weigh which most heavily?', 'Outcomes: what changed for people', ['The number of pages', 'The length of the introduction', 'The number of partners listed'], 'Not just what you did.', 'Outputs show effort; outcomes show change.', 2],
    ]),
    ...build('gs-approach', [
      ['A logic model flows from', 'Inputs to activities to outputs to outcomes', ['Outcomes to inputs to budget', 'Budget to deadline to award', 'Narrative to attachments to signature'], 'Resources go in, results come out.', 'It shows the path from resources to results on one page.', 1],
      ['What should you do about partners you name?', 'Name only those who agreed, with what each will do', ['List famous organizations to impress', 'Leave roles vague', 'Name partners without asking'], 'Think trust.', 'Unconfirmed partners hurt credibility; letters of commitment help.', 2],
    ]),
    ...build('gs-evaluation', [
      ['A good evaluation plan names for each objective', 'The measure, the data source, who collects it, how often, and who reviews it', ['Only the final report date', 'A single word: "success"', 'The funder\'s favorite chart'], 'It should be followable.', 'Specificity makes the plan believable and usable.', 2],
      ['Which statement is stronger?', '"We will measure participation and self-reported change; we cannot prove cause."', ['"Our program will cure poverty."', '"Results will be excellent."', '"We never fail."'], 'Honest limits build trust.', 'Acknowledging limits is stronger than overclaiming.', 2],
    ]),
    ...build('gs-budget', [
      ['A cost must be', 'Necessary, reasonable, allocable and allowable', ['Large, round and early', 'Approved by a friend', 'Paid in cash'], 'The Uniform Guidance sets the tests.', 'Under 2 CFR 200, a cost must meet all four tests to be charged to an award.', 2],
      ['What does a budget justification show?', 'What each cost buys, how it was calculated, and which activity it supports', ['Only the total', 'The funder\'s expected savings', 'The signer\'s salary'], 'Show the arithmetic.', 'Reviewers check numbers against the narrative.', 1],
      ['When a notice does not require match, you should generally', 'Not volunteer extra cost sharing', ['Promise as much as possible', 'Hide your other funding', 'Double the budget'], 'Promises must be tracked.', 'Voluntary committed cost sharing is not expected, and once promised must still be documented.', 3],
    ]),
    ...build('gs-capacity', [
      ['Which is the strongest evidence of capacity?', '"Since 2019 we have served 2,400 families."', ['"We have a long history of excellence."', '"We are a great team."', '"Trust us."'], 'Numbers and dates.', 'Concrete history beats adjectives.', 1],
      ['A newer organization can reduce reviewer risk by', 'Showing an experienced partner, fiscal sponsor or a completed pilot', ['Hiding its age', 'Asking for more money', 'Skipping the capacity section'], 'Lower the risk visibly.', 'Reviewers want assurance the money will be managed well.', 2],
    ]),
    ...build('gs-edit', [
      ['What should the first sentence of a section do?', 'State its main point', ['Warm up the reader', 'Repeat the title', 'Give history'], 'Tired readers skim.', 'Lead with the point so a reviewer can score quickly.', 1],
      ['What can happen if you ignore the page limit or format rules?', 'The application can be disqualified', ['Nothing', 'A bonus', 'A faster review'], 'Rules are enforced.', 'Technical violations can remove an application from review.', 1],
    ]),
    ...build('gs-submit', [
      ['Who submits a federal application in Grants.gov?', 'The Authorized Organization Representative', ['Any volunteer', 'The agency', 'The grant writer by default'], 'Role-based.', 'Only the AOR can submit.', 1],
      ['After submitting you receive', 'A tracking number', ['An award letter', 'A refund', 'A deadline extension'], 'Keep it.', 'Keep the tracking number and confirmation emails; validation may still reject the application.', 1],
    ]),
    ...build('gs-review', [
      ['If you are not funded, a smart next step is', 'Ask the agency for reviewers\' comments and improve', ['Reapply unchanged', 'Complain publicly', 'Stop applying'], 'Learn from the feedback.', 'Many awards go to applicants who try again with reviewer comments in hand.', 1],
      ['When should you announce an award?', 'After you receive the official Notice of Award', ['As soon as you are told it looks good', 'Before you submit', 'Never'], 'Wait for the official notice.', 'Only the official notice makes it real.', 1],
    ]),
    ...build('gs-manage', [
      ['How long should you keep award records after the final report (typical federal rule)?', 'At least three years', ['One month', 'Until the next election', 'Records are not needed'], 'It is in 2 CFR 200.', 'The default retention period is three years from the final report; the award may require longer.', 2],
      ['What do you do before moving money or changing the project significantly?', 'Ask the agency in writing', ['Just do it', 'Wait for the audit', 'Ask a friend'], 'Prior approval.', 'Significant changes need written approval.', 2],
    ]),
    ...build('gs-renew', [
      ['What is the best preparation for your next grant?', 'Handling this one well: on-time, honest reports and real results', ['Hiding problems', 'Ignoring the funder', 'Changing your mission'], 'Funders fund people they trust.', 'Good stewardship builds the evidence and relationships you need next.', 1],
      ['Why diversify funding?', 'So one decision cannot sink the organization', ['It is required by law', 'It lowers the award', 'It avoids reports'], 'Concentration risk.', 'A mix of sources makes you resilient.', 1],
    ]),
    ...build('gs-faith', [
      ['Direct federal grant funds may not pay for', 'Explicitly religious activities like worship or religious instruction', ['A food pantry', 'Tutoring', 'Job training'], 'Think about what the money is for.', 'Funded services must be secular and open to all, and funds cannot directly pay for worship or instruction.', 2],
      ['A practical way to protect a congregation\'s grant compliance', 'Separate funded services in time, place and accounting', ['Mix all accounts together', 'Require attendance at services', 'Hide the program from members'], 'Make the line visible.', 'Separation and clear records show where the money went.', 2],
    ]),
    ...build('gs-nonprofit', [
      ['Which agency funds humanities projects?', 'The National Endowment for the Humanities', ['The Federal Reserve', 'The IRS', 'The Postal Service'], 'The name says it.', 'NEH funds humanities work; NEA funds the arts; IMLS supports museums and libraries.', 1],
      ['A good first step for a small arts group is often', 'A state arts or humanities council grant', ['A $5 million federal award', 'Skipping registration', 'A loan'], 'Smaller and simpler.', 'State councils often offer smaller awards with simpler applications.', 1],
    ]),
    ...build('gs-school', [
      ['A single public school usually applies', 'Through its district', ['Alone in all cases', 'Through the White House', 'Through a bank'], 'The district holds the registrations.', 'The district typically holds the UEI, signs, and manages the award.', 1],
      ['Which is usually formula money?', 'Title I', ['A STEM innovation grant', 'A school safety pilot', 'An early-childhood competition'], 'Divided by law.', 'Title I is a formula program; the others are typically competitive.', 2],
    ]),
    ...build('gs-teacher', [
      ['Where does most classroom money come from?', 'The district, parent groups, local foundations and classroom-funding sites', ['Federal grants to individual teachers', 'Lottery tickets', 'Loans'], 'It is rarely federal and personal.', 'Individual teachers are rarely eligible for federal grants; most classroom money is local.', 1],
      ['Before accepting outside funds, a teacher should', 'Check district policy', ['Post student photos publicly', 'Use personal accounts', 'Ignore the principal'], 'Rules apply.', 'Districts have policies on outside funds and student privacy.', 1],
    ]),
    ...build('gs-contracts', [
      ['A notice is "full and open." What does that mean for a small business?', 'It competes against businesses of every size', ['It is reserved for small businesses', 'It is only for veteran-owned firms', 'It cannot be bid on'], 'Open means not reserved.', 'Full and open competition is not limited by size or certification.', 1],
      ['Which notice type is the best time to introduce yourself to an agency?', 'Sources sought', ['Award notice', 'Closed solicitation', 'Surplus sale'], 'The agency is still shaping the buy.', 'A sources sought or request for information is the agency testing the market before it writes the solicitation.', 2],
      ['What must you hold to be awarded a federal contract?', 'An active SAM.gov registration', ['A 501(c)(3) letter', 'A grant award', 'A college degree'], 'It also assigns your CAGE code.', 'Contract awards require an active SAM.gov registration, renewed every year.', 1],
    ]),
    ...build('gs-business', [
      ['Which SBA program is a loan for general business needs?', '7(a)', ['SBIR', 'Title I', 'Pell'], 'It is a loan guarantee.', 'The 7(a) program is the SBA\'s main loan program.', 1],
      ['Where are federal contract opportunities posted?', 'SAM.gov', ['Grants.gov only', 'Facebook', 'The IRS website'], 'The same site you register on.', 'SAM.gov lists contracting opportunities, including small-business set-asides.', 1],
    ]),
  ],
};
