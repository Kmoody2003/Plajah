/**
 * civicsCurriculum — "Civics Hall: The Long Argument of Liberty".
 *
 * Rides the shared School chassis (services/schoolChassis.ts). Aligned to the NCSS C3 Framework
 * (D2.Civ.*), seeded in data/educationStandards.ts under framework C3_SOCIAL.
 *
 * The distinctive claim: a **primary-source spine**. Every lesson attaches to a real document in
 * data/foundingDocuments.ts, readable at five zoom levels (the Telescoping Text), so a learner
 * touches the actual words at every age rather than a textbook's summary of them.
 *
 * Five strands, deliberately in this order:
 *   I  Foundations of Liberty — the writings that formed America BEFORE America (1215→1776)
 *   II Structure of Government — how the machine was designed, and why it has friction
 *   III Rights & the Citizen — what is protected, from whom, and where the limits are
 *   IV Civic Action — how people have actually changed things
 *   V  The Living Constitution — amendment, reinterpretation, and the second founding
 *
 * LICENCE POSTURE: the entire document spine is public domain (National Archives, Library of
 * Congress, Gutenberg, Wikisource). The C3 Framework document itself is NCSS-copyrighted — we
 * ALIGN and CITE it and never reproduce its text. All teaching prose here is original.
 *
 * TEACHING POSTURE: this course teaches contested questions as contested. Where Americans
 * genuinely disagree — on interpretation, on the reach of rights, on what the founding meant — the
 * lesson presents the strongest version of more than one position and asks the learner to argue.
 * It does not tell them which side to land on.
 */
import type { Curriculum } from '../services/schoolChassis';
import { COMPARATIVE_STRAND } from './comparativeCivicsLessons';

const NARA = { label: 'U.S. National Archives — founding documents (public domain)', url: 'https://www.archives.gov/founding-docs' };
const LOC = { label: 'Library of Congress — primary source sets', url: 'https://www.loc.gov/classroom-materials/' };
const CONAN = { label: 'Constitution Annotated — clause-by-clause with the case law', url: 'https://constitution.congress.gov/' };
const DOCSTEACH = { label: 'DocsTeach — document analysis activities (NARA)', url: 'https://www.docsteach.org/' };
const GUTENBERG_LOCKE = { label: 'Locke, Two Treatises of Government (Gutenberg)', url: 'https://www.gutenberg.org/ebooks/7370' };
const GUTENBERG_PAINE = { label: 'Paine, Common Sense (Gutenberg)', url: 'https://www.gutenberg.org/ebooks/147' };
const FEDERALIST = { label: 'The Federalist Papers, full text (Library of Congress)', url: 'https://guides.loc.gov/federalist-papers/full-text' };
const WIKISOURCE_MC = { label: 'Magna Carta, 1215 (Wikisource)', url: 'https://en.wikisource.org/wiki/Magna_Carta' };
const WIKISOURCE_BOR = { label: 'English Bill of Rights, 1689 (Wikisource)', url: 'https://en.wikisource.org/wiki/Bill_of_Rights_1689' };

export const CIVICS_HALL: Curriculum = {
  id: 'civics-hall',
  label: 'Civics Hall',
  blurb:
    'The long argument of liberty, from Magna Carta to the amendments — read in the actual documents. Every text is public domain, so every learner, at every age, reads the real words.',
  accent: '#D40055',
  framework: 'C3_SOCIAL',
  tracks: [
    // ── Strand I ────────────────────────────────────────────────────────────────
    {
      id: 'foundations',
      title: 'Foundations of Liberty',
      blurb: 'Before America, 1215–1776: the charters, arguments and sermons the founders were reading. Almost no curriculum teaches this as a connected arc.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'civ-found-1',
          title: 'The King Signs Something: Magna Carta, 1215',
          blurb: 'The first time a ruler wrote down that he too was bound by law.',
          minutes: 18,
          standardIds: ['D2.Civ.8.K-2', 'D2.Civ.8.3-5'],
          body: `In June 1215, a group of English barons cornered a king who had lost a war and raised taxes to pay for it, and made him put his seal to a list of promises. Most of the sixty-three clauses concern medieval grievances that mean nothing to us now — fish weirs, forest law, the debts owed to moneylenders. Two of them changed the world.

Clause 39 says that a free man cannot be seized, imprisoned or stripped of his possessions except by the lawful judgement of his equals or by the law of the land. Clause 40 says that justice will not be sold, denied or delayed to anyone. Read them slowly and notice what they assume: that there is a law standing above the king, and that he is inside it rather than over it.

It is worth being honest about what the document was. It was not a declaration of universal rights; it was a peace treaty between an unpopular king and the aristocrats who could raise armies against him. "No free man" excluded most people alive in England at the time. The king repudiated it within weeks and the Pope annulled it.

It survived anyway, because later generations read it more generously than it was written. Seventeenth-century English lawyers turned clause 39 into "due process of law". Colonial charters copied it. It arrives, five and a half centuries later, in the Fifth Amendment. That is the pattern this whole strand will keep showing you: the words matter, and what later people decide the words mean matters just as much.`,
          resources: [WIKISOURCE_MC, NARA],
          assignment: {
            prompt: 'Read clauses 39 and 40 in the original. Then find the Fifth and Sixth Amendments and mark every phrase that echoes them. Write one paragraph on what changed in the journey — and one on who was left out of the 1215 version.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-found-2',
          title: 'Consent: Locke and the State of Nature',
          blurb: 'The argument that a government is only legitimate if the governed agreed to it.',
          minutes: 22,
          standardIds: ['D2.Civ.8.6-8'],
          body: `John Locke published the Second Treatise in 1689, and the founders read it so closely that pieces of it appear almost verbatim in the Declaration of Independence eighty-seven years later.

His method is to ask an odd question: what would people be like with no government at all? He calls this the state of nature, and his answer is that people there are free and equal — not because someone granted it, but because no one was born with authority over anyone else. From that starting point everything follows. If no one naturally rules, then the only way legitimate authority can arise is if people agree to it. Government is therefore a trust, created for a purpose, and holding power on condition.

That word "condition" is the dangerous part, and Locke knew it. If government exists to protect life, liberty and property, then a government destroying those things has broken the trust — and the people may replace it. This is why the same book could be quoted in 1776 to justify a revolution and in 1787 to justify a constitution.

The obvious objection is worth taking seriously, because your learners will raise it: nobody actually signed anything. Locke's answer — tacit consent, shown by continuing to live under a government and enjoy its protections — has never satisfied everyone, and it should not simply be handed over as settled. Ask whether an argument built on a hypothetical starting point can bind real people. It is a genuinely open question, and the course is better for leaving it open.`,
          resources: [GUTENBERG_LOCKE, NARA],
          assignment: {
            prompt: 'Read Locke §4 and §95. Then read the Declaration’s second sentence. Mark every idea that appears in both, in order. Finally, write the strongest objection you can to the idea of tacit consent — and Locke’s best reply.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-found-3',
          title: '1689: What the English Had Already Won',
          blurb: 'Why the colonists thought they were claiming old English rights, not inventing new ones.',
          minutes: 18,
          standardIds: ['D2.Civ.8.6-8', 'D2.Civ.3.6-8'],
          body: `The English Bill of Rights of 1689 is the missing document in most American civics classes, and its absence makes 1776 much harder to understand.

After deposing one king and installing another, Parliament set conditions. The monarch could not suspend laws without Parliament's consent. He could not raise money by prerogative. Elections to Parliament must be free. Excessive bail must not be required, nor cruel and unusual punishments inflicted. Read that last clause and then read the Eighth Amendment: the wording is nearly identical, a century apart.

This reframes the revolutionary crisis. When colonists objected to taxation without representation, they were not proposing a novel political theory. They were claiming a settled English constitutional right — as Englishmen — and arguing that Parliament was violating it. That is why so much of the early resistance is phrased as loyalty rather than rebellion, and it explains why the break, when it came, needed a *different* argument. Paine's Common Sense in early 1776 supplied it, by attacking monarchy itself rather than a particular king's policies.

So the arc of this strand is: a limit on the king (1215), a settlement of who rules (1689), an argument that legitimacy comes from consent (Locke), and then a rupture (1776) that used all three.`,
          resources: [WIKISOURCE_BOR, GUTENBERG_PAINE, NARA],
          assignment: {
            prompt: 'Put the 1689 Bill of Rights and the U.S. Bill of Rights side by side. Find three clauses that clearly descend from the English text. Then explain, in a paragraph, why the colonists could argue they were being conservative rather than radical.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-found-4',
          title: 'The Declaration as an Argument',
          blurb: 'Read past the famous sentence: it is a legal brief with a premise and a charge sheet.',
          minutes: 20,
          standardIds: ['D2.Civ.8.6-8', 'D2.Civ.8.9-12'],
          body: `Almost everyone can quote the second sentence. Almost no one reads the rest, which is where the actual work happens.

The Declaration is structured like a legal argument. It opens with a premise about where legitimate authority comes from — equality, unalienable rights, government by consent, and the right to replace a government that destroys those ends. Then it does something a manifesto would not bother to do: it lists specific charges. Twenty-seven of them, naming particular acts by a particular king, because the authors were trying to prove a case to what they called "a candid world", not simply express a feeling.

That structure is the lesson. The famous sentence is the premise; the grievances are the evidence; independence is the conclusion. Students who learn to read it that way stop treating founding documents as scripture and start treating them as arguments that can be examined, tested and answered.

And then the hardest part, which this course does not route around. The man who wrote "all men are created equal" enslaved people, as did many signers. The right response is neither to discard the document nor to pretend the contradiction away, but to notice what happened next: the sentence turned out to be more powerful than its authors. Abolitionists used it. Seneca Falls rewrote it to include women. Lincoln re-founded the country on it. Douglass, in 1852, held it up as an indictment. A promise, once written down, becomes something people can demand.`,
          resources: [NARA, DOCSTEACH],
          assignment: {
            prompt: 'Read the full Declaration. Separate it into premise, grievances, and conclusion. Pick three grievances and research what actually happened — were they accurate? Then write a paragraph on how you would grade the document as a legal brief.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
      ],
    },

    // ── Strand II ───────────────────────────────────────────────────────────────
    {
      id: 'structure',
      title: 'Structure of Government',
      blurb: 'The machine and its friction: why the design deliberately makes things slow, and what happens when the friction fails.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'civ-struct-1',
          title: 'If Men Were Angels',
          blurb: 'Federalist 51 and the design principle behind every branch, chamber and veto.',
          minutes: 22,
          standardIds: ['D2.Civ.1.3-5', 'D2.Civ.1.6-8'],
          body: `Madison's Federalist 51 contains the most quoted sentence in American constitutional design, and the quotation usually stops one line too early.

"If men were angels, no government would be necessary. If angels were to govern men, neither external nor internal controls on government would be necessary." Then the part that matters: "In framing a government which is to be administered by men over men, the great difficulty lies in this: you must first enable the government to control the governed; and in the next place oblige it to control itself."

Two requirements pulling in opposite directions — strong enough to actually govern, restrained enough to be safe. Almost every structural feature of the Constitution is an answer to that tension. Three branches so no one holds every kind of power. Two chambers with different terms and constituencies. A veto, and an override of the veto. Judicial review. Federalism, splitting power between nation and states.

Madison's move is the interesting one. He does not ask officials to be good. He assumes they will be ambitious and self-interested, and then arranges the offices so that a senator defending the Senate's power against a president is simultaneously defending the structure. "Ambition must be made to counteract ambition."

Which raises the question worth spending class time on: what happens when ambition stops counteracting — when the people in two branches share an interest and cooperate rather than checking each other? Madison's design assumes rivalry between institutions. Ask your learners what holds if the rivalry moves elsewhere.`,
          resources: [FEDERALIST, CONAN],
          assignment: {
            prompt: 'Read Federalist 51. List five specific structural features of the Constitution and explain which half of Madison’s problem each one solves — enabling government, or restraining it. Then argue whether the design still works as he expected.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-struct-2',
          title: 'The Case Against: Reading Brutus',
          blurb: 'The Anti-Federalists lost — and predicted a great deal of what happened next.',
          minutes: 20,
          standardIds: ['D2.Civ.1.6-8', 'D2.Civ.1.9-12'],
          body: `Teaching the Federalist Papers without the Anti-Federalists is like reading one side of a court transcript. The Constitution was ratified over strenuous objection, and the objectors were not fools — several of their predictions read uncomfortably well today.

The writer using the name Brutus argued that a republic could not work across a territory that large and that diverse, because representatives would be too distant from the people they represented and would form an interest of their own. He warned that the "necessary and proper" clause and the supremacy clause would let national power expand indefinitely at the expense of the states. He predicted the federal judiciary would become enormously powerful and effectively unaccountable, since judges served for life and interpreted the very document that limited them.

Two things follow. First, the Bill of Rights exists largely because the Anti-Federalists demanded it as the price of ratification — the losing side wrote the most-cited part of the document. Second, this is the honest way to teach a founding: as an argument that was genuinely contested, by serious people, with real stakes, rather than as a settled consensus that only cranks resisted.

Have your learners score the predictions. Some Anti-Federalist fears look overstated now; others look prophetic. Deciding which is which is real civic reasoning.`,
          resources: [
            { label: 'Anti-Federalist Papers, incl. Brutus (Wikisource)', url: 'https://en.wikisource.org/wiki/Anti-Federalist_Papers' },
            FEDERALIST,
          ],
          assignment: {
            prompt: 'Read Brutus I. Extract three specific predictions. For each, find present-day evidence for and against it, and deliver a verdict with reasons. Present it as a brief, not an opinion.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-struct-3',
          title: 'How a Law Is Actually Made',
          blurb: 'The textbook diagram, and the several places where it is misleading.',
          minutes: 18,
          standardIds: ['D2.Civ.3.6-8', 'D2.Civ.1.9-12'],
          body: `The classic diagram is accurate as far as it goes: a bill is introduced, referred to committee, reported, debated, passed in both chambers in identical form, reconciled if they differ, then signed or vetoed.

What the diagram hides is where bills actually die. The overwhelming majority never leave committee — not by a vote against them, but by never being scheduled. Control of the calendar is therefore one of the most consequential powers in a legislature, and it belongs to leadership rather than to the chamber as a whole. In the Senate, procedural rules mean most significant legislation needs a supermajority to reach a vote at all, which is a rule the chamber wrote for itself rather than anything in the Constitution.

Two other realities belong in an honest account. Much of what governs daily life is not statute but regulation — written by agencies under authority delegated by statute, which is why administrative agencies are a permanent constitutional argument. And a great deal of legislating happens through must-pass vehicles: provisions attached to bills that have to move, because they could not survive a vote of their own.

None of this is corruption; it is the mechanics of a body that has to prioritise. But a citizen who knows only the diagram will misread almost every news story about Congress, which is exactly why it is worth teaching the second layer.`,
          resources: [
            { label: 'Congress.gov — the legislative process', url: 'https://www.congress.gov/legislative-process' },
            CONAN,
          ],
          assignment: {
            prompt: 'Track one real bill on Congress.gov from introduction to its current status. Note every step it cleared and where it stalled. Then explain what the textbook diagram would have led you to expect, and what actually happened.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
      ],
    },

    // ── Strand III ──────────────────────────────────────────────────────────────
    {
      id: 'rights',
      title: 'Rights & the Citizen',
      blurb: 'What is protected, who is bound by the protection, and how the hard cases are actually decided.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'civ-rights-1',
          title: 'Five Freedoms in One Sentence',
          blurb: 'The First Amendment, what it restrains, and what it conspicuously does not.',
          minutes: 20,
          standardIds: ['D2.Civ.2.K-2', 'D2.Civ.2.3-5', 'D2.Civ.2.6-8'],
          body: `Forty-five words carrying five distinct freedoms: religion (both no establishment and free exercise), speech, press, assembly, and petition. Have learners find all five before anything else — most people can name two.

Then the sentence's first word, which is where most public confusion lives: "Congress". The First Amendment restrains government. It is not a rule about your employer, your school's private club, a social platform, or your family dinner. Through the Fourteenth Amendment it now binds state and local government too, but it has never bound private people. An enormous share of arguments about "free speech" are actually arguments about private power, and separating those two questions is one of the most useful things a civics course can teach.

Third, "no law" has never meant no law. Courts have carved out narrow categories — incitement to imminent lawless action, true threats, defamation, fraud — and the carving is deliberately narrow, because the presumption runs strongly toward protection. The interesting work is at the edges.

Teach the edges as genuinely contested. Where speech is hateful but not threatening, where a platform is private but functions as a public square, where religious exercise collides with a general law — reasonable people who all take the First Amendment seriously land in different places. Ask learners to state the strongest version of the position they disagree with before giving their own.`,
          resources: [NARA, CONAN],
          assignment: {
            prompt: 'Identify all five freedoms in the text. Then take one hard case — a speech restriction you find genuinely difficult — and write both sides at full strength before stating where you land and why.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-rights-2',
          title: 'Due Process: From Clause 39 to the Fourteenth',
          blurb: 'The oldest right in the book, and how it came to bind the states.',
          minutes: 20,
          standardIds: ['D2.Civ.3.6-8', 'D2.Civ.3.9-12'],
          body: `Follow one idea across eight centuries and the Constitution stops looking like a list and starts looking like a conversation.

It begins with clause 39 of Magna Carta: no free man seized or stripped of possessions except by lawful judgement of his equals or by the law of the land. English lawyers later render "law of the land" as "due process of law". Colonial charters carry it over. The Fifth Amendment states it against the federal government: no person shall be deprived of life, liberty, or property, without due process of law.

Then the crucial turn. As written, the Bill of Rights limited only the federal government — a state could, and did, do things the federal government could not. After the Civil War, the Fourteenth Amendment applied due process against the states, and over the following century the Supreme Court used that clause to extend most of the Bill of Rights to state and local government one right at a time. That process is called incorporation, and it is why a city police department is bound by the Fourth Amendment today.

The text never changed. Its reach changed enormously. Whether that expansion was faithful interpretation or judicial improvisation is one of the genuine, live disagreements in American constitutional law, and a serious civics course lets learners hear both accounts.`,
          resources: [CONAN, NARA],
          assignment: {
            prompt: 'Trace due process from Magna Carta clause 39 to the Fifth Amendment to the Fourteenth. Then pick one right that was incorporated against the states and read how the Court justified it. Summarise the reasoning, then the strongest objection to it.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
      ],
    },

    // ── Strand IV ───────────────────────────────────────────────────────────────
    {
      id: 'action',
      title: 'Civic Action',
      blurb: 'How people have actually changed things — and how to do it about something you care about.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'civ-action-1',
          title: 'Holding a Country to Its Own Words',
          blurb: 'Douglass in 1852, and the most durable move in American reform.',
          minutes: 22,
          standardIds: ['D2.Civ.14.9-12', 'D2.Civ.2.9-12'],
          body: `In July 1852, Frederick Douglass was invited to speak at an Independence Day celebration in Rochester. He accepted, and then asked his audience what the Fourth of July meant to an enslaved person: a day revealing, more than any other, the injustice of which he was the constant victim.

Notice precisely what Douglass does, because it is the strategic heart of this lesson. He does not reject the Declaration. He takes it more seriously than his audience does. The nation had written down that all are created equal; he holds the words up and asks the country to mean them. That move — using a society's own stated principles as the indictment — recurs through Seneca Falls in 1848, through Lincoln at Gettysburg, through the movement literature of the 1950s and 60s.

It is worth asking why it works. A demand made from outside a society's values can be dismissed as foreign. A demand made from inside them cannot be answered without either changing or admitting hypocrisy. That is not a rhetorical trick; it is a real constraint that written commitments place on the people who make them.

Which is also the answer to a question learners often ask about founding documents that were not honoured: what is the use of a promise nobody kept? The use is that it can be quoted back.`,
          resources: [
            { label: 'Frederick Douglass, Narrative and orations (Gutenberg)', url: 'https://www.gutenberg.org/ebooks/23' },
            LOC,
          ],
          assignment: {
            prompt: 'Read the 1852 oration. Then find one other reform document that uses the same move — quoting a nation’s own principles against its practice. Compare the two: what does each demand, and what makes the argument hard to refuse?',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-action-2',
          title: 'Taking Informed Action',
          blurb: 'The capstone: pick a real local issue, find out who actually decides, and make the case.',
          minutes: 30,
          standardIds: ['D2.Civ.12.9-12', 'D2.Civ.14.9-12'],
          body: `Everything so far has been reading. This lesson is the part the C3 Framework calls taking informed action, and it is deliberately the hardest thing in the course, because it requires finding out how power is actually distributed where you live.

Work in four steps. First, choose a real issue in your own community, narrow enough to be tractable — a crossing, a library closure, a bus route, a school policy. Second, and this is where most civic projects fail, identify who actually holds the decision. Not "the government": the specific body, and often a specific committee within it. Many issues that feel national are decided by a council of seven people who meet on a Tuesday, and many that feel local are constrained by state law. Finding out which is real research.

Third, build the case as evidence rather than feeling. What does the data show? Who is affected, and how? What has been tried elsewhere, and what did it cost? What is the strongest objection, and what is your answer to it? A proposal that has already engaged its best counterargument is far harder to dismiss.

Fourth, deliver it in the form that body actually accepts — public comment, a written submission, a petition, a meeting. Then record what happened, including if nothing did. Learning that change is slow and procedural is not a disappointing outcome for this assignment; it is the most accurate civics lesson available.`,
          resources: [DOCSTEACH, LOC, { label: 'USA.gov — contact your elected officials', url: 'https://www.usa.gov/elected-officials' }],
          assignment: {
            prompt: 'Complete the four steps on a real local issue: choose it, identify exactly who decides, build an evidence-based case that answers its strongest objection, and deliver it in the accepted form. Publish your submission and a short account of what happened.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
      ],
    },

    // ── Strand V ────────────────────────────────────────────────────────────────
    {
      id: 'living',
      title: 'The Living Constitution',
      blurb: 'Amendment, reinterpretation, and the second founding — how a fixed text keeps changing.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'civ-living-1',
          title: 'The Second Founding',
          blurb: 'The Thirteenth, Fourteenth and Fifteenth Amendments rebuilt the country. Most courses spend a week on them.',
          minutes: 24,
          standardIds: ['D2.Civ.8.9-12', 'D2.Civ.3.9-12'],
          body: `Between 1865 and 1870 the United States amended its Constitution three times in a way that changed the country more fundamentally than anything since 1787. Historians increasingly call it the second founding, and the label is earned.

The Thirteenth abolished slavery. The Fourteenth did four enormous things at once: it made everyone born here a citizen, overturning the Court's contrary holding; it forbade states from abridging the privileges or immunities of citizens; it applied due process against the states; and it guaranteed equal protection of the laws. The Fifteenth barred denying the vote on grounds of race.

Two observations make this a civics lesson rather than a history one. First, the target changed. The original Bill of Rights restrained the federal government, because the perceived threat was a distant central power. The Reconstruction Amendments restrained the states, because the war had demonstrated that a state could be the more immediate threat to a citizen's liberty. That inversion is the single most consequential structural change in American constitutional history.

Second, the guarantees were substantially unenforced for most of a century, and then became the basis of nearly every major rights case of the twentieth. Which returns to the theme running through this entire course: written commitments do not enforce themselves, and they are also not nothing — because they remain available to be enforced later by people determined enough to insist.`,
          resources: [NARA, CONAN],
          assignment: {
            prompt: 'Read the Fourteenth Amendment, Section 1, closely. Identify its four distinct guarantees. For each, find one modern case or law that depends on it, and explain how.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
        {
          id: 'civ-living-2',
          title: 'How Should a Constitution Be Read?',
          blurb: 'The genuine, unresolved argument about interpretation — taught as an argument.',
          minutes: 24,
          standardIds: ['D2.Civ.3.9-12', 'D2.Civ.8.9-12'],
          body: `A short document written in the eighteenth century governs a country facing questions its authors could not have imagined. How should judges read it? Americans genuinely disagree, and this course presents the disagreement rather than resolving it.

One position holds that the text should be given the meaning it had when it was adopted. Its case is about legitimacy and constraint: the Constitution's authority comes from ratification by the people, so its meaning cannot shift with the preferences of unelected judges; if the country wants change, Article V provides amendment. Its difficulty is that some original understandings are contested, unknowable, or morally unacceptable today.

The other holds that broad phrases — "unreasonable searches", "cruel and unusual", "equal protection" — were written broadly on purpose, and must be applied to conditions the drafters never anticipated. Its case is that a document unable to address new circumstances becomes irrelevant. Its difficulty is the question of limits: if meaning develops, what stops a judge from finding whatever they prefer?

Both are honest attempts to answer a real problem: how a fixed text governs a changing society without either freezing it or dissolving into whatever the current majority wants. Have your learners argue both sides in turn — assigned position, not chosen — before writing where they actually land. That exercise, more than any content in this course, is what civic reasoning consists of.`,
          resources: [CONAN, FEDERALIST],
          assignment: {
            prompt: 'Take one constitutional question you find hard. Write the strongest argument for deciding it by original meaning, then the strongest for reading the text as applying to present conditions. Only then state your own view — and name the best objection to it.',
            tool: 'NONE',
            postTag: 'civicshall',
          },
        },
      ],
    },

    // ── Strand VI ───────────────────────────────────────────────────────────────
    // Comparative civics. Authored in data/comparativeCivicsLessons.ts, sharing the reference
    // dataset that renders as the Seven Nations reader tab.
    COMPARATIVE_STRAND,
  ],
};

export default CIVICS_HALL;
