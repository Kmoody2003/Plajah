import type { Figure } from '../../components/learn/lesson/figures';

type N = { id: string; label: string; col: number; row: number };
type E = [string, string, string?];
/** Lay labels out left to right on one row; returns nodes plus chain edges. */
const chain = (p: string, labels: string[], row = 0, col0 = 0): { nodes: N[]; edges: E[] } => ({
  nodes: labels.map((label, i) => ({ id: `${p}${i}`, label, col: col0 + i, row })),
  edges: labels.slice(1).map((_, i) => [`${p}${i}`, `${p}${i + 1}`] as E),
});

const civil = chain('c', ['Complaint and summons', 'Rule 12 motion or answer', 'Discovery', 'Summary judgment motion', 'Trial', 'Judgment and post-trial motions', 'Appeal']);
const civil2 = chain('c', ['Complaint and summons', 'Motion to dismiss or answer', 'Discovery', 'Summary judgment', 'Trial', 'Appeal']);

export const FIGURES: Record<string, Figure[]> = {
  'law-civpro.l01': [
    {
      id: 'fed-civil-stages', type: 'diagram', after: 3, layout: 'wide', title: 'Stages of a federal civil case',
      nodes: civil.nodes.slice(0, 4).concat(civil.nodes.slice(4).map((n, i) => ({ ...n, col: i, row: 1 }))),
      edges: civil.edges,
      caption: 'The lesson names these stages in order, and each later lesson in the course sits at one of them. Summary judgment ends the case early only if no genuine factual dispute exists.',
      alt: 'A flow of seven stages in two rows. Top row: complaint and summons, Rule 12 motion or answer, discovery, summary judgment motion. Bottom row: trial, judgment and post-trial motions, appeal.',
    },
    {
      id: 'civpro-dates', type: 'timeline', after: 2, layout: 'inline', title: 'Dates named in this lesson',
      events: [
        { when: '1938', label: 'Federal Rules of Civil Procedure first adopted' },
        { when: '1994', label: 'Kokkonen: federal courts presume they lack jurisdiction' },
        { when: '1998', label: 'Steel Co.: jurisdiction must be established before the merits' },
      ],
      caption: 'The Rules came first; the two Supreme Court cases then stress that a federal court must check its own power before it decides anything else.',
      alt: 'A timeline with three dated events: 1938 the Federal Rules of Civil Procedure were first adopted, 1994 Kokkonen v. Guardian Life, and 1998 Steel Co. v. Citizens for a Better Environment.',
    },
  ],

  'law-g912.l06': [
    {
      id: 'civil-case-flow', type: 'diagram', after: 3, layout: 'wide', title: 'How a civil case moves',
      nodes: civil2.nodes.concat([{ id: 'settle', label: 'Settlement (most cases)', col: 4, row: 1 }]),
      edges: civil2.edges.concat([['c2', 'settle'] as E]),
      caption: 'A case runs from complaint toward trial and appeal, but most civil cases settle, often after discovery shows each side the strengths and weaknesses of the other.',
      alt: 'A flow from complaint and summons, to motion to dismiss or answer, to discovery, summary judgment, trial and appeal. A branch from discovery leads to settlement, which the lesson says is how most civil cases end.',
    },
    {
      id: 'discovery-tools', type: 'diagram', after: 1, layout: 'inline', title: 'Discovery tools named in the lesson',
      nodes: [
        { id: 'd', label: 'Discovery', col: 1, row: 0 },
        { id: 'i', label: 'Interrogatories (written questions)', col: 0, row: 1 },
        { id: 'r', label: 'Requests for documents', col: 1, row: 1 },
        { id: 'p', label: 'Depositions (questions under oath)', col: 2, row: 1 },
      ],
      edges: [['d', 'i'], ['d', 'r'], ['d', 'p']],
      caption: 'Discovery is limited to relevant, proportional information, and privileged material such as attorney-client communications is protected.',
      alt: 'A hub labelled discovery with three branches: interrogatories, which are written questions; requests for documents; and depositions, where a witness answers questions under oath outside the courtroom.',
    },
  ],

  'law-g912.l07': [
    {
      id: 'criminal-case-flow', type: 'diagram', after: 3, layout: 'wide', title: 'How a criminal case moves',
      nodes: [
        { id: 'a', label: 'Investigation and arrest', col: 0, row: 0 },
        { id: 'b', label: 'Initial appearance (charges, bail)', col: 1, row: 0 },
        { id: 'c', label: 'Grand jury indictment or preliminary hearing', col: 2, row: 0 },
        { id: 'd', label: 'Arraignment and plea', col: 3, row: 0 },
        { id: 'e', label: 'Plea bargain (large majority)', col: 3, row: 1 },
        { id: 'f', label: 'Jury trial', col: 4, row: 1 },
        { id: 'g', label: 'Sentencing', col: 4, row: 2 },
        { id: 'h', label: 'Appeal', col: 5, row: 2 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['d', 'f'], ['e', 'g'], ['f', 'g'], ['g', 'h']],
      caption: 'After the plea stage a case either ends in a plea bargain, as the large majority do, or goes to trial. A guilty verdict or plea leads to sentencing; the government generally cannot appeal an acquittal.',
      alt: 'A flow: investigation and arrest, initial appearance, grand jury indictment or preliminary hearing, then arraignment and plea. From there the case goes either to a plea bargain or to a jury trial, both leading to sentencing and then appeal.',
    },
    {
      id: 'criminal-landmarks', type: 'timeline', after: 2, layout: 'inline', title: 'Two decisions named in this lesson',
      events: [
        { when: '1963', label: 'Gideon v. Wainwright: states must provide counsel to poor felony defendants' },
        { when: '1966', label: 'Miranda v. Arizona: warnings before custodial interrogation' },
      ],
      caption: 'Gideon secures a lawyer at trial and Miranda protects a suspect during custodial questioning.',
      alt: 'A timeline of two decisions: 1963 Gideon v. Wainwright, and 1966 Miranda v. Arizona.',
    },
  ],

  'law-g912.l02': [
    {
      id: 'separation-checks', type: 'diagram', after: 1, layout: 'wide', title: 'Three branches and some of their checks',
      nodes: [
        { id: 'con', label: 'Congress (Article I): makes laws', col: 0, row: 0 },
        { id: 'pre', label: 'President (Article II): carries out laws', col: 2, row: 0 },
        { id: 'cou', label: 'Courts (Article III): judicial power', col: 1, row: 2 },
      ],
      edges: [
        ['pre', 'con', 'veto a bill'],
        ['con', 'pre', 'override veto (two-thirds of each chamber); impeach and remove officials'],
        ['pre', 'cou', 'nominates judges, Senate confirms'],
        ['cou', 'con', 'judicial review of laws'],
        ['cou', 'pre', 'judicial review of executive acts'],
      ],
      caption: 'Each branch holds some power over the others, so no one branch gathers lawmaking, enforcing and judging in its own hands.',
      alt: 'Three boxes: Congress makes laws, the President carries out laws, and the courts hold judicial power. Arrows show the President can veto a bill, Congress can override a veto by a two-thirds vote in each chamber and can impeach and remove officials, the President nominates judges with Senate confirmation, and courts can review laws and executive acts.',
    },
    {
      id: 'sop-cases', type: 'timeline', after: 2, layout: 'inline', title: 'Two cases named in this lesson',
      events: [
        { when: '1803', label: 'Marbury v. Madison: courts review whether acts are constitutional' },
        { when: '1952', label: 'Youngstown Sheet & Tube Co. v. Sawyer: steel mill seizure struck down' },
      ],
      caption: 'Marbury recognized judicial review; Youngstown applied it to hold that the President lacked power to seize the steel mills.',
      alt: 'A timeline with two entries: 1803 Marbury v. Madison, and 1952 Youngstown Sheet & Tube Co. v. Sawyer.',
    },
  ],

  'law-g912.l11': [
    {
      id: 'negligence-elements', type: 'diagram', after: 1, layout: 'wide', title: 'The four elements of negligence',
      nodes: [
        { id: 'd', label: '1. Duty of care', col: 0, row: 0 },
        { id: 'b', label: '2. Breach of the duty', col: 1, row: 0 },
        { id: 'c', label: '3. Causation: actual cause and proximate cause', col: 2, row: 0 },
        { id: 'm', label: '4. Actual damages', col: 3, row: 0 },
      ],
      edges: [['d', 'b'], ['b', 'c'], ['c', 'm']],
      caption: 'The plaintiff needs all four elements; if any one is missing, the plaintiff loses.',
      alt: 'Four boxes in order: duty of care, breach of the duty, causation (actual cause and proximate cause), and actual damages. All four are required.',
    },
  ],

  'law-g912.l12': [
    {
      id: 'contract-formation', type: 'diagram', after: 0, layout: 'wide', title: 'What formation requires, and what can defeat it',
      nodes: [
        { id: 'a', label: 'Offer', col: 0, row: 0 },
        { id: 'b', label: 'Acceptance (mutual assent)', col: 1, row: 0 },
        { id: 'c', label: 'Consideration: bargained-for exchange', col: 2, row: 0 },
        { id: 'd', label: 'Enforceable contract', col: 3, row: 0 },
        { id: 'e', label: 'Defenses: incapacity, misrepresentation, duress, unconscionability', col: 2, row: 1 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['e', 'd', 'can defeat']],
      caption: 'Formation requires assent shown by offer and acceptance, plus consideration. Even then a defense can defeat enforcement, as the lesson explains.',
      alt: 'A flow from offer to acceptance, which is mutual assent, to consideration, which is a bargained-for exchange, to an enforceable contract. A separate box listing defenses such as incapacity, misrepresentation, duress and unconscionability points to the contract as something that can defeat it.',
    },
    {
      id: 'contract-cases', type: 'timeline', after: 3, layout: 'inline', title: 'Two cases named in this lesson',
      events: [
        { when: '1854', label: 'Hadley v. Baxendale: consequential losses limited to those foreseeable' },
        { when: '1954', label: 'Lucy v. Zehmer: assent judged objectively' },
      ],
      caption: 'Lucy v. Zehmer illustrates objective assent on formation; Hadley v. Baxendale limits recovery on breach.',
      alt: 'A timeline with two cases: 1854 Hadley v. Baxendale and 1954 Lucy v. Zehmer.',
    },
  ],

  'law-g912.l01': [
    {
      id: 'law-hierarchy', type: 'diagram', after: 0, layout: 'wide', title: 'Sources of written law, ranked',
      nodes: [
        { id: 'fc', label: 'U.S. Constitution', col: 0, row: 0 },
        { id: 'fs', label: 'Federal statutes and treaties', col: 0, row: 1 },
        { id: 'fr', label: 'Federal regulations', col: 0, row: 2 },
        { id: 'sc', label: 'State constitution', col: 1, row: 0 },
        { id: 'ss', label: 'State statutes', col: 1, row: 1 },
        { id: 'sr', label: 'State agency regulations', col: 1, row: 2 },
        { id: 'lo', label: 'City and county ordinances', col: 1, row: 3 },
      ],
      edges: [['fc', 'fs'], ['fs', 'fr'], ['sc', 'ss'], ['ss', 'sr']],
      caption: "Federal sources are on the left and each state's matching layers on the right; the higher source controls when sources conflict. Federal law overrides conflicting state law at every level (the Supremacy Clause), so the rows do not show rank across the two columns. Judge-made common law runs alongside the written sources.",
      alt: 'Two ranked columns. Federal: the U.S. Constitution, then federal statutes and treaties, then federal regulations. State: state constitution, state statutes, state agency regulations, then city and county ordinances. Higher sources control, and common law runs alongside the written sources.',
    },
    {
      id: 'precedent-binding', type: 'diagram', after: 1, layout: 'inline', title: 'Binding and persuasive precedent',
      nodes: [
        { id: 'a', label: 'Earlier decision', col: 0, row: 0 },
        { id: 'b', label: 'Higher court, same jurisdiction: binding', col: 1, row: 0 },
        { id: 'c', label: 'Another jurisdiction: persuasive only', col: 1, row: 1 },
      ],
      edges: [['a', 'b', 'stare decisis'], ['a', 'c']],
      caption: 'Stare decisis tells courts to follow earlier decisions of higher courts in their own system; decisions from other jurisdictions can persuade but do not bind.',
      alt: 'An earlier court decision leads to two outcomes: a decision from a higher court in the same jurisdiction is binding precedent, while a decision from another jurisdiction is only persuasive.',
    },
  ],

  'law-g912.l05': [
    {
      id: 'two-court-systems', type: 'diagram', after: 0, layout: 'wide', title: 'Two parallel court systems',
      nodes: [
        { id: 'f0', label: 'Federal district courts (trial)', col: 0, row: 0 },
        { id: 'f1', label: 'Courts of appeals, the circuits (intermediate)', col: 1, row: 0 },
        { id: 'f2', label: 'Supreme Court of the United States', col: 2, row: 0 },
        { id: 's0', label: 'State trial courts', col: 0, row: 1 },
        { id: 's1', label: 'Intermediate appellate courts', col: 1, row: 1 },
        { id: 's2', label: 'State supreme court (highest)', col: 2, row: 1 },
      ],
      edges: [['f0', 'f1', 'appeal'], ['f1', 'f2', 'appeal'], ['s0', 's1', 'appeal'], ['s1', 's2', 'appeal']],
      caption: 'Most systems have three levels: trial courts hear evidence and find facts, intermediate courts review for legal error, and a highest court decides the most important questions of law.',
      alt: 'Two rows. Federal: district courts, then courts of appeals (circuits), then the Supreme Court. State: trial courts, then intermediate appellate courts, then the state supreme court.',
    },
    {
      id: 'fed-jurisdiction', type: 'diagram', after: 2, layout: 'inline', title: 'Two main routes into federal court',
      nodes: [
        { id: 'f', label: 'Federal courts: limited jurisdiction', col: 1, row: 0 },
        { id: 'q', label: 'Federal question: claim arises under the Constitution, federal statutes or treaties', col: 0, row: 1 },
        { id: 'd', label: 'Diversity: different states, over $75,000, no plaintiff shares citizenship with any defendant', col: 2, row: 1 },
      ],
      edges: [['f', 'q'], ['f', 'd']],
      caption: 'A federal court needs a statutory basis, most often one of these two; state courts are courts of general jurisdiction and hear most disputes.',
      alt: 'A box for federal courts of limited jurisdiction with two branches: federal question, where the claim arises under the Constitution, federal statutes or treaties, and diversity, where the parties are citizens of different states, the amount exceeds $75,000, and no plaintiff shares citizenship with any defendant.',
    },
  ],

  'law-conlaw.l01': [
    {
      id: 'marbury-reasoning', type: 'diagram', after: 0, layout: 'wide', title: 'Marshall\'s reasoning in Marbury v. Madison',
      nodes: [
        { id: 'a', label: 'Marbury had a right to the commission', col: 0, row: 0 },
        { id: 'b', label: 'The law ordinarily provides a remedy for a violated right', col: 1, row: 0 },
        { id: 'c', label: 'But the statute gave the Court original jurisdiction beyond Article III', col: 2, row: 0 },
        { id: 'd', label: 'Conflicting statute cannot be applied', col: 3, row: 0 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd']],
      caption: 'The three steps in the lesson end in the result that a statute conflicting with the Constitution cannot be applied, which is the classic source of judicial review.',
      alt: 'Four boxes in sequence: Marbury had a right to the commission; the law ordinarily provides a remedy; the statute purported to give the Court original jurisdiction beyond what Article III allows; so the conflicting statute could not be applied.',
    },
    {
      id: 'jr-timeline', type: 'timeline', after: 1, layout: 'inline', title: 'Judicial review cases named in this lesson',
      events: [
        { when: '1803', label: 'Marbury v. Madison' },
        { when: '1816', label: "Martin v. Hunter's Lessee: review of state court decisions on federal questions" },
        { when: '1958', label: 'Cooper v. Aaron: Brown binding on the states' },
      ],
      caption: 'The practice began against federal statutes and was then extended to review of state courts and state officials.',
      alt: 'A timeline: 1803 Marbury v. Madison, 1816 Martin v. Hunter\'s Lessee, and 1958 Cooper v. Aaron.',
    },
  ],

  'law-conlaw.l02': [
    {
      id: 'youngstown-zones', type: 'diagram', after: 1, layout: 'wide', title: "Justice Jackson's three zones",
      nodes: [
        { id: 'a', label: 'Acts with congressional authorization: power at its maximum', col: 0, row: 0 },
        { id: 'b', label: 'Congress silent: zone of twilight, outcome depends on circumstances', col: 1, row: 0 },
        { id: 'c', label: "Acts against Congress's will: lowest ebb, rests on President's own powers", col: 2, row: 0 },
      ],
      edges: [['a', 'b'], ['b', 'c']],
      caption: "Jackson's concurrence in Youngstown (1952) is still used to analyze presidential power, from strongest when Congress backs the President to weakest when Congress opposes.",
      alt: 'Three zones in order from strongest to weakest presidential power: with congressional authorization the power is at its maximum; when Congress is silent is a zone of twilight; against the express or implied will of Congress is the lowest ebb.',
    },
    {
      id: 'sop-case-years', type: 'timeline', after: 2, layout: 'wide', title: 'Cases named in this lesson',
      events: [
        { when: '1935', label: "Humphrey's Executor v. United States" },
        { when: '1952', label: 'Youngstown Sheet & Tube Co. v. Sawyer' },
        { when: '1983', label: 'INS v. Chadha: one-house legislative veto invalid' },
        { when: '1989', label: 'Mistretta v. United States: delegation upheld' },
        { when: '2019', label: 'Gundy v. United States' },
        { when: '2022', label: 'West Virginia v. EPA: major questions doctrine' },
        { when: '2024', label: 'Loper Bright v. Raimondo: Chevron overruled' },
      ],
      caption: 'The years are those given in the lesson; the doctrine in this area has shifted over time, and the lesson asks you to state each side fairly.',
      alt: 'A timeline of 1935 Humphrey\'s Executor, 1952 Youngstown, 1983 INS v. Chadha, 1989 Mistretta, 2019 Gundy, 2022 West Virginia v. EPA and 2024 Loper Bright Enterprises v. Raimondo.',
    },
  ],

  'law-torts.l04': [
    {
      id: 'negligence-elements', type: 'diagram', after: 0, layout: 'wide', title: 'Elements of negligence',
      nodes: [
        { id: 'd', label: 'Duty', col: 0, row: 0 },
        { id: 'b', label: 'Breach', col: 1, row: 0 },
        { id: 'c', label: 'Causation (actual and proximate)', col: 2, row: 0 },
        { id: 'm', label: 'Damages', col: 3, row: 0 },
      ],
      edges: [['d', 'b'], ['b', 'c'], ['c', 'm']],
      caption: 'The plaintiff must prove all four elements; this lesson is about the first, duty.',
      alt: 'Four elements in order: duty, breach, causation (both actual and proximate), and damages.',
    },
    {
      id: 'palsgraf-chain', type: 'diagram', after: 1, layout: 'wide', title: 'The events in Palsgraf (1928)',
      nodes: [
        { id: 'a', label: 'Guard pushes a passenger carrying a package', col: 0, row: 0 },
        { id: 'b', label: 'Package of fireworks falls and explodes', col: 1, row: 0 },
        { id: 'c', label: 'Shock knocks down scales', col: 2, row: 0 },
        { id: 'd', label: 'Mrs. Palsgraf, far away, is injured', col: 3, row: 0 },
        { id: 'm', label: 'Cardozo (majority): duty runs only to foreseeable plaintiffs', col: 1, row: 1 },
        { id: 'n', label: 'Andrews (dissent): duty is owed to the world; limit by proximate cause', col: 3, row: 1 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd']],
      caption: 'The majority treated this as a question of duty to a foreseeable plaintiff; the dissent would have limited liability through proximate cause instead.',
      alt: 'A chain of events: a railroad guard pushes a passenger carrying a package, the package of fireworks falls and explodes, the shock knocks down scales, and Mrs. Palsgraf, standing far away, is injured. Two notes below: Judge Cardozo for the majority held duty runs only to foreseeable plaintiffs; Judge Andrews in dissent would have set the limit by proximate cause.',
    },
  ],

  'law-torts.l05': [
    {
      id: 'hand-formula', type: 'diagram', after: 2, layout: 'wide', title: "Learned Hand's formula",
      nodes: [
        { id: 'b', label: 'B: burden of the precaution', col: 0, row: 0 },
        { id: 'p', label: 'P times L: probability of harm times magnitude of loss', col: 1, row: 0 },
        { id: 'r', label: 'If B is less than P times L, failing to take the precaution is negligent', col: 2, row: 0 },
      ],
      edges: [['b', 'p', 'compare'], ['p', 'r']],
      caption: 'From United States v. Carroll Towing (1947). It is an analytic tool, not a mechanical rule, since courts and juries rarely have numbers.',
      alt: 'The burden of the precaution (B) is compared with the probability of harm (P) multiplied by the magnitude of the loss (L). If B is less than P times L, failing to take the precaution is negligent.',
    },
  ],

  'law-torts.l07': [
    {
      id: 'actual-cause-tests', type: 'diagram', after: 0, layout: 'wide', title: 'Tests for actual cause',
      nodes: [
        { id: 'q', label: 'Did the defendant in fact contribute to the harm?', col: 1, row: 0 },
        { id: 'a', label: 'Default: but-for test', col: 0, row: 1 },
        { id: 'b', label: 'Multiple sufficient causes: substantial factor test', col: 1, row: 1 },
        { id: 'c', label: 'Cannot tell which of several negligent defendants: alternative liability (Summers v. Tice, 1948)', col: 2, row: 1 },
      ],
      edges: [['q', 'a'], ['q', 'b'], ['q', 'c']],
      caption: 'The but-for test is the default; the other two approaches handle cases where it breaks down, as in two merging fires or two hunters firing.',
      alt: 'A question about actual cause branching to three tests: the default but-for test; the substantial factor test for multiple sufficient causes such as two merging fires; and alternative liability, applied in Summers v. Tice (California 1948), when the plaintiff cannot tell which negligent defendant caused the harm.',
    },
  ],

  'law-contracts.l01': [
    {
      id: 'contracts-sources', type: 'diagram', after: 2, layout: 'wide', title: 'Which body of law governs?',
      nodes: [
        { id: 'q', label: 'What is the contract mainly about?', col: 1, row: 0 },
        { id: 'a', label: 'Sale of goods: UCC Article 2 (a statute)', col: 0, row: 1 },
        { id: 'b', label: 'Services or real estate: common law', col: 2, row: 1 },
        { id: 'c', label: 'Mixed: predominant purpose test (majority approach)', col: 1, row: 1 },
      ],
      edges: [['q', 'a'], ['q', 'b'], ['q', 'c']],
      caption: 'Choosing between the two bodies of law is the first step in a contracts problem. Where the UCC is silent, the common law fills the gaps.',
      alt: 'A question about what the contract is mainly about with three branches: a sale of goods is governed by UCC Article 2, a statute; services or real estate by the common law; and mixed contracts by the predominant purpose test, the majority approach.',
    },
    {
      id: 'contract-elements', type: 'diagram', after: 3, layout: 'wide', title: 'What a contract needs',
      nodes: [
        { id: 'a', label: 'Mutual assent: offer and acceptance', col: 0, row: 0 },
        { id: 'b', label: 'Consideration: something bargained for and given in exchange', col: 1, row: 0 },
        { id: 'c', label: 'No defense such as incapacity or illegality', col: 2, row: 0 },
        { id: 'd', label: 'Enforceable contract', col: 3, row: 0 },
      ],
      edges: [['a', 'd'], ['b', 'd'], ['c', 'd']],
      caption: 'Under the bargain theory that dominates American law, all three ingredients together make a promise enforceable.',
      alt: 'Three requirements feeding into an enforceable contract: mutual assent through offer and acceptance, consideration that is bargained for, and the absence of a defense such as incapacity or illegality.',
    },
  ],

  'law-contracts.l02': [
    {
      id: 'offer-ends', type: 'diagram', after: 2, layout: 'wide', title: 'Ways an offer ends',
      nodes: [
        { id: 'o', label: 'Offer (power of acceptance)', col: 1, row: 0 },
        { id: 'a', label: 'Lapse of time', col: 0, row: 1 },
        { id: 'b', label: 'Revocation by the offeror', col: 1, row: 1 },
        { id: 'c', label: 'Rejection or counteroffer by the offeree', col: 2, row: 1 },
        { id: 'd', label: 'Death or incapacity of a party (common law)', col: 0, row: 2 },
        { id: 'e', label: 'Destruction of subject matter or supervening illegality', col: 2, row: 2 },
      ],
      edges: [['o', 'a'], ['o', 'b'], ['o', 'c'], ['o', 'd'], ['o', 'e']],
      caption: 'These are the ways the lesson lists. Revocation has limits, such as an option contract or substantial reliance under Restatement (Second) section 87(2).',
      alt: 'An offer branching into five ways it can end: lapse of time, revocation by the offeror, rejection or counteroffer by the offeree, death or incapacity of either party under the common law, and destruction of the subject matter or supervening illegality.',
    },
  ],

  'law-contracts.l03': [
    {
      id: 'mirror-image', type: 'diagram', after: 1, layout: 'wide', title: 'The mirror image rule at common law',
      nodes: [
        { id: 'o', label: 'Offer', col: 0, row: 0 },
        { id: 'a', label: 'Response matches the offer: acceptance, contract formed', col: 1, row: 0 },
        { id: 'b', label: 'Response adds or changes terms: counteroffer, which rejects the original offer', col: 1, row: 1 },
      ],
      edges: [['o', 'a'], ['o', 'b']],
      caption: 'At common law an acceptance must match the offer. The UCC modified this rule for goods, as the next lesson explains.',
      alt: 'An offer leads to two possible responses: a response that matches the offer is an acceptance and forms a contract; a response that adds or changes terms is a counteroffer, which rejects the original offer.',
    },
    {
      id: 'bilateral-unilateral', type: 'diagram', after: 2, layout: 'inline', title: 'How an offer can be accepted',
      nodes: [
        { id: 'o', label: 'Offer invites acceptance', col: 1, row: 0 },
        { id: 'a', label: 'By promise: bilateral contract (exchange of promises)', col: 0, row: 1 },
        { id: 'b', label: 'By performance: unilateral contract (offeree completes the act)', col: 2, row: 1 },
      ],
      edges: [['o', 'a'], ['o', 'b']],
      caption: 'Where an offer is ambiguous, Restatement (Second) section 32 presumes it invites acceptance by either a promise or a performance.',
      alt: 'An offer invites acceptance either by a promise, forming a bilateral contract through an exchange of promises, or by performance, forming a unilateral contract when the offeree completes the requested act.',
    },
  ],

  'law-college.l07': [
    {
      id: 'two-directions', type: 'diagram', after: 0, layout: 'wide', title: 'Dividing power in two directions',
      nodes: [
        { id: 'a', label: 'Federalism (vertical): national government and the states', col: 0, row: 0 },
        { id: 'b', label: 'Separation of powers (horizontal): Congress, President, courts', col: 2, row: 0 },
        { id: 'c', label: 'Federal government: enumerated powers', col: 0, row: 1 },
        { id: 'd', label: 'States: general police power', col: 1, row: 1 },
        { id: 'e', label: 'Congress: Article I, legislative power', col: 2, row: 1 },
        { id: 'f', label: 'President: Article II, executive power', col: 3, row: 1 },
        { id: 'g', label: 'Courts: Article III, judicial power', col: 4, row: 1 },
      ],
      edges: [['a', 'c'], ['a', 'd'], ['b', 'e'], ['b', 'f'], ['b', 'g']],
      caption: 'The Constitution splits power vertically between nation and states and horizontally among the three branches, with checks so each branch can restrain the others.',
      alt: 'Two groupings. Federalism, the vertical split, divides authority between the national government, which has enumerated powers, and the states, which hold general police power. Separation of powers, the horizontal split, divides the national government among Congress under Article I, the President under Article II, and the courts under Article III.',
    },
  ],

  'law-g68.l03': [
    {
      id: 'bill-to-law', type: 'diagram', after: 3, layout: 'wide', title: 'How a federal bill becomes a law',
      nodes: [
        { id: 'a', label: 'Member introduces bill', col: 0, row: 0 },
        { id: 'b', label: 'Committee studies, may hold hearings and change it', col: 1, row: 0 },
        { id: 'c', label: 'Full chamber debates and votes', col: 2, row: 0 },
        { id: 'd', label: 'Other chamber repeats the steps; differences are reconciled', col: 3, row: 0 },
        { id: 'e', label: 'President signs: becomes law', col: 3, row: 1 },
        { id: 'f', label: 'President vetoes: back to Congress', col: 2, row: 1 },
        { id: 'g', label: 'Two-thirds of House and Senate override: becomes law', col: 1, row: 1 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['d', 'f'], ['f', 'g']],
      caption: 'Both chambers must agree on the same text. If the President does nothing for ten days, not counting Sundays, while Congress is in session, the bill becomes law without a signature.',
      alt: 'A flow: a member introduces a bill, a committee studies it, the full chamber votes, the other chamber repeats the steps and differences are reconciled. The President then either signs, making it law, or vetoes it and sends it back; Congress can override the veto by a two-thirds vote in both the House and the Senate.',
    },
  ],

  'law-g35.l06': [
    {
      id: 'bill-simple', type: 'diagram', after: 2, layout: 'wide', title: 'From idea to law',
      nodes: [
        { id: 'a', label: 'An idea is written as a bill', col: 0, row: 0 },
        { id: 'b', label: 'Committee studies it', col: 1, row: 0 },
        { id: 'c', label: 'House and Senate both pass the same version', col: 2, row: 0 },
        { id: 'd', label: 'President signs: it is a law', col: 3, row: 0 },
        { id: 'e', label: 'President vetoes: two-thirds of both chambers can still make it law', col: 3, row: 1 },
      ],
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['c', 'e']],
      caption: 'Many steps help make sure a law is thought about carefully.',
      alt: 'A bill starts as an idea, goes to a committee, is passed in the same version by both the House and the Senate, and then goes to the President. If the President signs it becomes a law. If the President vetoes it, two-thirds of the members of both chambers can still make it a law.',
    },
  ],

  'law-g35.l07': [
    {
      id: 'three-jobs', type: 'diagram', after: 1, layout: 'wide', title: 'Three branches, three jobs',
      nodes: [
        { id: 'a', label: 'Legislative branch (Congress): makes laws', col: 0, row: 0 },
        { id: 'b', label: 'Executive branch (President): carries out laws', col: 1, row: 0 },
        { id: 'c', label: 'Judicial branch (courts): decides what laws mean', col: 2, row: 0 },
      ],
      edges: [],
      caption: 'The people who wrote the Constitution split power into three branches so that no one person or group gets too much.',
      alt: 'Three branches and their jobs: the legislative branch, Congress, makes laws; the executive branch, led by the President, carries out laws; the judicial branch, the courts, decides what laws mean and whether they are being followed.',
    },
    {
      id: 'checks-simple', type: 'diagram', after: 3, layout: 'wide', title: 'Some checks and balances',
      nodes: [
        { id: 'p', label: 'President', col: 0, row: 0 },
        { id: 'c', label: 'Congress', col: 1, row: 0 },
        { id: 'j', label: 'Courts', col: 1, row: 1 },
      ],
      edges: [['p', 'c', 'vetoes a bill'], ['c', 'p', 'overrides a veto'], ['j', 'c', 'can rule a law unconstitutional (Marbury, 1803)'], ['p', 'j', 'picks judges; Senate must approve']],
      caption: 'Each branch has some way to check the others, which keeps any one branch from ruling alone.',
      alt: 'Checks among the branches: the President can veto a bill from Congress, Congress can override a veto, the courts can decide a law goes against the Constitution (first used in Marbury v. Madison in 1803), and the President picks judges but the Senate must approve them.',
    },
  ],

  'law-g35.l12': [
    {
      id: 'court-levels', type: 'diagram', after: 1, layout: 'wide', title: 'Three levels of courts',
      nodes: [
        { id: 'a', label: 'Trial courts: witnesses speak, judge or jury decides what happened', col: 0, row: 0 },
        { id: 'b', label: 'Appeals courts: read the record, hear lawyers on whether the law was applied correctly', col: 1, row: 0 },
        { id: 'c', label: 'Highest court: federal Supreme Court has nine justices; each state has its own', col: 2, row: 0 },
      ],
      edges: [['a', 'b', 'appeal'], ['b', 'c', 'chosen cases']],
      caption: 'Both the federal system and each state system usually have these three levels. The highest court chooses cases that raise important questions.',
      alt: 'Three levels in order: trial courts, where cases begin and judges or juries decide what happened; appeals courts, which review whether the law was applied correctly without holding a new trial; and a highest court, which chooses cases raising important questions. The Supreme Court of the United States has nine justices.',
    },
  ],
};
