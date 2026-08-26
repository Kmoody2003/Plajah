/**
 * philosophyCurriculum — "School of Philosophy: The Examined Life", age 4 to seminar.
 *
 * Rides the shared School chassis (services/schoolChassis.ts), aligned to the PLAJAH_PHIL
 * progression seeded in data/educationStandards.ts. (There is no US national philosophy standard;
 * the progression is Plajah-authored and labelled as such rather than borrowing false authority.)
 *
 * THE LADDER: wonder circles (PreK) → structured inquiry (3–5) → argument literacy and the
 * fallacies (6–8) → ethics-bowl deliberation and formal logic (9–12) → history of philosophy and
 * branch seminars (college). The same ritual — a community of inquiry, reasons given and tested —
 * recurs at every band, which is what makes it one ladder rather than five subjects.
 *
 * THE BRIDGE: the college Political Philosophy unit and Civics Hall's Strand I are the SAME
 * material. Locke's Second Treatise lives once, in data/foundingDocuments.ts, serving both schools.
 *
 * LICENCE POSTURE (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md):
 *  - Hostable: OpenStax Introduction to Philosophy (CC BY); forall x: Calgary (CC BY); Wi-Phi
 *    videos (CC BY-NC-SA — adaptable, contrary to the common assumption that they are ND);
 *    pre-1930 public-domain translations (Jowett's Plato, Meiklejohn/Abbott's Kant, Elwes' Spinoza).
 *  - Hostable by explicit permission: Early Modern Texts (Bennett) — the PDFs say all rights
 *    reserved, but the site's rights FAQ expressly permits rehosting with attribution.
 *  - NEVER ingested: modern scholarly translations (Cooper's Plato, Guyer–Wood Kant, Cohler's
 *    Montesquieu) — cite as further reading only.
 *  - Link-only: Stanford Encyclopedia (confirmed NOT open — exclusive distribution), Internet
 *    Encyclopedia, PLATO's lesson plans, 1000-Word Philosophy, NHSEB cases. The community-of-inquiry
 *    METHOD is unprotected pedagogy and is reimplemented here in original prose.
 *
 * TEACHING POSTURE: philosophy is the one subject where the disagreement IS the content. No lesson
 * here resolves a live philosophical question for the learner. Each presents positions at their
 * strongest and asks for reasons.
 */
import type { Curriculum } from '../services/schoolChassis';

const OPENSTAX_PHIL = { label: 'OpenStax Introduction to Philosophy (CC BY)', url: 'https://openstax.org/details/books/introduction-philosophy' };
const FORALLX = { label: 'forall x: Calgary — open logic textbook (CC BY)', url: 'https://forallx.openlogicproject.org/' };
const WIPHI = { label: 'Wireless Philosophy — video series (CC BY-NC-SA)', url: 'https://www.wi-phi.com/' };
const EMT = { label: 'Early Modern Texts — modernised classics (rehost permitted with attribution)', url: 'https://www.earlymoderntexts.com/' };
const GUTENBERG_PLATO = { label: 'Plato, Jowett translation (Project Gutenberg, public domain)', url: 'https://www.gutenberg.org/ebooks/author/93' };
const GUTENBERG_MILL = { label: 'Mill, On Liberty & Utilitarianism (Gutenberg, public domain)', url: 'https://www.gutenberg.org/ebooks/34901' };
const GUTENBERG_LOCKE = { label: 'Locke, Two Treatises of Government (Gutenberg, public domain)', url: 'https://www.gutenberg.org/ebooks/7370' };
const SEP = { label: 'Stanford Encyclopedia of Philosophy — reference, link only', url: 'https://plato.stanford.edu/' };
const IEP = { label: 'Internet Encyclopedia of Philosophy — reference, link only', url: 'https://iep.utm.edu/' };

export const PHILOSOPHY_SCHOOL: Curriculum = {
  id: 'philosophy-school',
  label: 'School of Philosophy',
  blurb:
    'The examined life, from a four-year-old’s first real question to a university seminar. Every primary text is public domain — the actual words, at every age.',
  accent: '#A78BFA',
  framework: 'PLAJAH_PHIL',
  tracks: [
    {
      id: 'wonder',
      title: 'Wonder & Inquiry',
      blurb: 'Philosophy for children: the community of inquiry, where reasons are given and tested kindly.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'ph-wonder-1',
          title: 'Running a Wonder Circle',
          blurb: 'The one ritual this whole school is built on — and it works from age four.',
          minutes: 16,
          standardIds: ['PJPH.WONDER.K2'],
          body: `A wonder circle is a group sitting together, taking one genuine question seriously, and giving reasons. That is the whole method, and it is more demanding than it sounds because most classroom talk is not that.

Start with a question that has no answer key and that the adult in the room does not already know the answer to. Is it ever fair to break a promise? Could a robot be your friend? Is a copy of a painting still art? If the teacher knows the answer, it is a quiz, and children detect that instantly.

Then hold three rules. One: you must give a reason. "Because I think so" is an invitation to say more, not a contribution. Two: you may change your mind, and doing so is treated as a success rather than a defeat — this single norm does more for a group's thinking than any content. Three: you speak to each other, not to the teacher. The adult's job is to ask "what makes you say that?" and "does anyone see it differently?", and otherwise to stay quiet.

Two things go wrong predictably. Adults fill silences too fast — count to ten, because young children need longer to assemble a thought than the pause feels. And discussions drift to whatever is most entertaining; the fix is to write the question where everyone can see it and return to it.

You are not teaching children philosophy. You are noticing that they already do it, and giving them a room where it is expected.`,
          resources: [WIPHI, OPENSTAX_PHIL],
          assignment: {
            prompt: 'Run one wonder circle with a real group — a class, a family, friends. Use a question you genuinely do not know the answer to. Record: the question, two reasons given, and one moment where somebody changed their mind. Then write what you would do differently.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
        {
          id: 'ph-wonder-2',
          title: 'Question of the Week',
          blurb: 'Structured inquiry for 3–5: the same ritual, with the reasons written down.',
          minutes: 18,
          standardIds: ['PJPH.INQ.35'],
          body: `By eight or nine, children can do something the youngest cannot: hold a position, hear a genuine objection, and respond to it rather than repeating themselves. That capacity is what this band builds.

The structure is a week. On Monday the question goes up — What makes something alive? Is it ever right to lie? Should everyone get the same, or what they need? Children write a first answer with one reason, privately, before any discussion. That private step matters, because it prevents the whole room converging on whoever spoke first.

Midweek is the circle, and the new move is the objection. Every child practises the sentence "I think X, but someone might say Y" — because being able to state the case against your own view is the beginning of thinking rather than merely believing.

On Friday they write a final answer and, crucially, note whether it changed and why. Over a term this produces a visible record of a mind at work, which is more valuable to a child than any single conclusion.

Fables and folk tales make excellent prompts and are almost all public domain, so a class can read the actual story rather than a summary. The tortoise and the hare is a genuine question about whether persistence beats talent. The story is doing philosophy already; you are just slowing it down.`,
          resources: [OPENSTAX_PHIL, WIPHI],
          assignment: {
            prompt: 'Run a full week: private first answer with a reason, a circle where everyone states an objection to their own view, then a final written answer noting whether it changed. Publish three anonymised before-and-after pairs.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
      ],
    },
    {
      id: 'argument',
      title: 'Argument & Logic',
      blurb: 'From "I disagree" to "here is why, and here is what would change my mind".',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'ph-arg-1',
          title: 'Premises, Conclusions and the Fallacies',
          blurb: 'Taking an argument apart — and naming the moves that only look like reasoning.',
          minutes: 22,
          standardIds: ['PJPH.ARG.68'],
          body: `An argument, in philosophy, is not a quarrel. It is a set of claims — premises — offered in support of another claim — the conclusion. The first skill is separating them, because in ordinary speech they arrive tangled and the conclusion is often unstated.

Then two independent questions, which learners routinely merge. Is the reasoning valid — if the premises were true, would the conclusion have to follow? And are the premises actually true? An argument can be perfectly valid and still worthless because a premise is false, and an argument can have all-true premises and prove nothing because the reasoning does not connect them. Keeping these apart is most of the skill.

Fallacies are moves that resemble reasoning and are not. Attacking the person rather than the claim. Rebuilding an opponent's position as something weaker and defeating that. Presenting two options as exhaustive when others exist. Treating the absence of disproof as proof. Appealing to an authority outside their field. Assuming what you set out to show.

Naming them is useful and has a trap worth warning learners about: fallacy-spotting can become its own bad habit, where labelling a move replaces engaging with it. The discipline is to state your opponent's argument in a form they would accept *before* you object to it. If you cannot, you have not understood it well enough to disagree with it yet.`,
          resources: [WIPHI, FORALLX, OPENSTAX_PHIL],
          assignment: {
            prompt: 'Take a real argument from an opinion piece. Write out its premises and conclusion explicitly. Assess validity and truth separately. Then restate the argument in a form its author would accept, and only then give your objection.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
        {
          id: 'ph-arg-2',
          title: 'Socrates on Trial',
          blurb: 'Stage the Apology from the actual dialogue — the most famous argument in the West.',
          minutes: 24,
          standardIds: ['PJPH.ARG.68', 'PJPH.ETH.HS'],
          body: `In 399 BC an elderly Athenian was tried for impiety and corrupting the young, convicted, and executed. Plato's account of his defence is short, dramatic, in the public domain in classic translation, and works remarkably well read aloud with parts.

Stage it rather than summarising it, because the argument only lands when heard. Socrates does not do what a defendant is supposed to do. He does not plead, flatter the jury, or bring his family in to be pitied. He cross-examines his accuser in open court, and the examination is a live demonstration of the method that got him prosecuted in the first place.

Two claims from it are worth a full discussion. That he knows only that he knows nothing — which is not modesty but a precise epistemic position, and worth asking whether it is coherent. And that the unexamined life is not worth living — a claim strong enough that learners should be invited to disagree with it, because many thoughtful people do.

Then the question the whole trial poses, and which this course does not resolve: was Athens wrong to convict him? He genuinely did unsettle young people's confidence in inherited beliefs, and the city had recently survived a coup involving men associated with him. A society deciding how much destabilising questioning it can tolerate is not a stupid society. Have learners argue both sides in role before saying what they think — the point is that the case is harder than its reputation.`,
          resources: [GUTENBERG_PLATO, WIPHI, SEP],
          assignment: {
            prompt: 'Read the Apology in the public-domain translation and stage a section with parts. Then write the prosecution’s strongest case — the real one, not a caricature — and Socrates’ best reply. State your own verdict last, with reasons.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
        {
          id: 'ph-arg-3',
          title: 'Formal Logic: Making Validity Mechanical',
          blurb: 'Truth-functional logic, proofs, and why symbols help.',
          minutes: 28,
          standardIds: ['PJPH.LOGIC.HS'],
          body: `Ordinary language is ambiguous in ways that hide reasoning errors. Formal logic strips arguments to their structure so validity becomes something you can check rather than something you sense.

Truth-functional logic handles claims combined with *and*, *or*, *not*, *if–then*, and *if and only if*. Each connective has a truth table defining exactly when the compound is true. The one that consistently surprises people is the conditional: "if P then Q" is false only when P is true and Q is false, which means a conditional with a false antecedent counts as true. That is a deliberate technical decision, not a claim about ordinary usage, and saying so plainly saves a great deal of confusion.

With the connectives defined, validity becomes checkable. An argument is valid when no assignment of truth values makes every premise true and the conclusion false, and you can test it exhaustively with a truth table or derive it with a proof system.

Two patterns are worth memorising because their invalid twins are so tempting. Affirming the antecedent is valid; affirming the consequent is not. Denying the consequent is valid; denying the antecedent is not. Almost every everyday reasoning slip is one of the two invalid forms.

The open textbook forall x: Calgary is a complete course for this, freely licensed, with exercises and answers — so a learner can work through a genuine logic course without paying anyone.`,
          resources: [FORALLX, WIPHI],
          assignment: {
            prompt: 'Translate five arguments from ordinary language into symbols. Test each with a truth table. Then find a real argument in the wild that commits affirming the consequent, and show formally why it fails.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
      ],
    },
    {
      id: 'ethics',
      title: 'Ethics',
      blurb: 'Three great frameworks, applied to cases that genuinely divide thoughtful people.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ph-eth-1',
          title: 'Consequences, Duties and Character',
          blurb: 'The three main answers to "what makes an action right?" — each at full strength.',
          minutes: 26,
          standardIds: ['PJPH.ETH.HS'],
          body: `Western moral philosophy offers three dominant frameworks. Learners should be able to argue inside each, because the interesting cases are precisely the ones where they disagree.

Consequentialism holds that rightness depends on outcomes — classically, the action producing the greatest wellbeing overall. Its strengths are real: it takes suffering seriously, it is impartial between people, and it gives a clear procedure. Its notorious difficulty is that it can license terrible acts to individuals when the sums come out right, and it demands calculations of the future that nobody can actually perform.

Deontology holds that some acts are right or wrong in themselves, regardless of outcome, because of duties and rights. Kant's formulations — act only on principles you could will everyone to follow; treat people always as ends and never merely as means — capture something consequentialism misses, namely that persons are not resources to be optimised. Its difficulty is rigidity, and what to do when duties conflict.

Virtue ethics asks a different question entirely: not "what should I do?" but "what kind of person should I be?" It focuses on character developed through practice, and on judgement rather than rules. Its strength is realism about how moral life is actually lived; its difficulty is that it gives less guidance when you need an answer now.

The mature position is not to pick one and apply it mechanically. It is to notice that each captures something the others miss, and that they conflict in identifiable ways — which is why the next lesson practises reasoning in cases where they genuinely do.`,
          resources: [OPENSTAX_PHIL, EMT, GUTENBERG_MILL],
          assignment: {
            prompt: 'Take one moral dilemma. Work it through all three frameworks and state what each concludes. Where they conflict, say precisely which feature of the case produces the conflict. Then say which you find most persuasive here — and whether you would say the same in a different case.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
        {
          id: 'ph-eth-2',
          title: 'Ethics Bowl: Deliberation, Not Debate',
          blurb: 'A format that rewards understanding your opponent instead of defeating them.',
          minutes: 30,
          standardIds: ['PJPH.ETH.HS', 'PJPH.ARG.68'],
          body: `Debate assigns you a side and rewards you for winning. Ethics bowl does something different and, for teaching, better: teams analyse the same case, present their reasoning, and are judged on the quality of that reasoning — including how well they engage with what the other team said.

The consequence is that agreeing with your opponent is not a loss. Conceding a good point improves your score. That single design choice changes the behaviour in the room completely, because the incentive is to understand rather than to score.

Run it in four moves. Present your analysis of the case — what is at stake, whose interests are involved, which considerations matter and why. Respond to the other team, engaging with their strongest point rather than their weakest. Answer judges' questions, which will probe the part of your view you were least sure about. Then reflect: what, if anything, moved.

Good cases share features. They are genuinely hard, with thoughtful people on both sides. They are concrete rather than abstract. They avoid the purely political questions where learners arrive with fixed positions, because the aim is reasoning rather than rehearsal.

Write your own cases from real situations in your school or town. Doing so is itself a philosophical exercise, since a good case requires identifying exactly where the difficulty sits — and cases written locally engage learners far more than borrowed ones.`,
          resources: [OPENSTAX_PHIL, WIPHI, IEP],
          assignment: {
            prompt: 'Write an original ethics-bowl case from a real local situation, with the strongest considerations on each side. Run it with a group in the four-move format. Report one point where a team conceded well — and why that improved their position rather than weakening it.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
      ],
    },
    {
      id: 'history',
      title: 'History of Philosophy',
      blurb: 'The long conversation, read in the original public-domain texts.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'ph-hist-1',
          title: 'What Can I Know? Descartes to Hume',
          blurb: 'The early modern crisis about knowledge, and why it still matters.',
          minutes: 28,
          standardIds: ['PJPH.HIST.COL'],
          body: `Early modern philosophy begins with a demolition. Descartes asks what he can be certain of, and sets out to doubt everything doubtable: the senses deceive, dreams are indistinguishable from waking while they last, and for all he can prove some deceiver may be manufacturing his experience wholesale. What survives is that he is thinking, and therefore exists — a single point of certainty from which he tries to rebuild.

Whether the rebuilding works is one of the great arguments in philosophy, and learners should read enough to have a view rather than being handed a verdict.

Hume then presses harder, and his target is causation. We see one event follow another, repeatedly. We never observe the connection itself — only the sequence. So what justifies expecting the future to resemble the past? Any argument that it will seems to assume the very principle in question. This is the problem of induction, and it has never been solved to general satisfaction, which is worth stating plainly rather than papering over.

Kant's response is the pivot of modern philosophy: perhaps the structure is contributed by the mind. We do not perceive raw reality; we perceive it organised by categories our understanding imposes, including causation. That does not defeat scepticism so much as relocate it, and arguing about whether that is a solution or a retreat is exactly the seminar.

Read these in public-domain translations or the modernised Early Modern Texts versions, which keep the argument and remove the eighteenth-century sentence structure.`,
          resources: [EMT, SEP, OPENSTAX_PHIL],
          assignment: {
            prompt: 'Read Descartes’ first Meditation and Hume on causation in a public-domain or EMT version. Write the sceptical argument in premise–conclusion form. Then give the strongest reply you can, and say honestly whether it satisfies you.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
        {
          id: 'ph-hist-2',
          title: 'Liberty: Locke, Mill and the Limits of Interference',
          blurb: 'The political-philosophy unit — and the shared spine with Civics Hall.',
          minutes: 28,
          standardIds: ['PJPH.POL.COL', 'PJPH.HIST.COL'],
          body: `This unit is deliberately the same material as Strand I of Civics Hall. Locke's Second Treatise lives once on Plajah and serves both schools, which is exactly right: the political-philosophy question and the civics question are the same question approached from different directions.

Locke supplies the architecture. People are naturally free and equal; no one holds authority by nature; legitimate government therefore arises only by consent and holds power in trust for a purpose. When it destroys the ends it was constituted to protect, the trust is broken. That argument justified a revolution and then a constitution, which tells you how much work it does.

Mill asks a different and sharper question: granted a legitimate government, when may it interfere with an individual? His answer is the harm principle — power may rightfully be exercised over a member of a civilised community against their will only to prevent harm to others. A person's own good is not sufficient warrant.

That principle is far more contested than its popularity suggests, and the seminar is in the objections. What counts as harm — physical only, or also offence, or economic damage? Who counts as capable of self-government, given Mill's own exclusions? Does the principle survive contact with cases where individual choices aggregate into collective damage?

Read both in public domain, then bring them to a live regulation and see what each would say. That is the exercise: not what Mill thought, but what Mill's argument commits you to.`,
          resources: [GUTENBERG_LOCKE, GUTENBERG_MILL, EMT],
          assignment: {
            prompt: 'Read Locke §§4 and 95 and Mill’s statement of the harm principle. Apply both to one current regulation. Where do they agree, and where does the harm principle prove harder to apply than it first appears? Name the ambiguity in "harm" that your case exposes.',
            tool: 'NONE',
            postTag: 'philosophy',
          },
        },
      ],
    },
  ],
};

export default PHILOSOPHY_SCHOOL;
