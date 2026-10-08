/**
 * founding-documents - "The Founding Documents" course for the Learn map.
 * Authored from data/foundingDocuments.ts (the Telescoping Text corpus) so the Learn map and Civics Hall agree.
 * Focus is on the primary documents themselves: authors, context, key phrases and what they changed.
 */
import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

type QD = [1 | 2 | 3, string, string, string[], number, string, string];

const mk = (lessonId: string, qs: QD[]): Question[] =>
  qs.map((x, i) => {
    const choices = [...x[3]];
    choices.splice(x[4], 0, x[2]);
    return {
      id: `${lessonId}.q${i + 1}`,
      lessonId,
      kind: 'mcq' as const,
      prompt: x[1],
      choices,
      answer: x[4],
      hint: x[5],
      explanation: x[6],
      level: x[0],
    };
  });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'founding-documents',
    label: 'The Founding Documents',
    blurb: 'Read the words themselves: from Magna Carta to the Gettysburg Address, who wrote each text, why, and what it changed.',
    accent: '#FF8C00',
    framework: 'c3',
    tracks: [
      {
        id: 'founding-documents.t1',
        title: 'Roots of Rights',
        blurb: 'Magna Carta, Locke and the English Bill of Rights.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'founding-documents.l01',
            title: 'Magna Carta: Nobody Above the Law',
            blurb: 'A bargain between a king and his barons that planted the idea of lawful judgement.',
            minutes: 7,
            body: `Magna Carta was issued in 1215 as an agreement between King John of England and his barons. Clauses 39 and 40 are the best known. Clause 39 says that no free man shall be seized or imprisoned, or stripped of his rights or possessions, except by the lawful judgement of his equals or by the law of the land. Clause 40 adds: "To no one will we sell, to no one deny or delay right or justice."

Two ideas stand out. The first is trial by one's peers, and the second is justice that cannot be bought or put off. Together they say that even the king must follow the law.

The charter had limits. It speaks of "free men," so it was a bargain among the powerful, not a charter of universal rights. Its later strength came from being read more broadly than it was written. In the seventeenth century, Sir Edward Coke read clause 39 as a guarantee of "due process of law." Colonial charters carried the idea across the Atlantic, and it reached the Fifth Amendment.

Why it mattered: Magna Carta is where "nobody is above the law" was first written down, and its influence is largely a history of how people reinterpreted it.`,
          },
          {
            id: 'founding-documents.l02',
            title: 'Locke and Government by Consent',
            blurb: 'The Second Treatise argues that legitimate power rests on the agreement of the people.',
            minutes: 7,
            body: `John Locke published his Second Treatise of Government in 1689, in the period following England's Glorious Revolution. It asks a basic question: where does political power come from, and what makes it legitimate?

Locke starts from a thought experiment, the state of nature. In section 4 he describes it as "a state of perfect freedom" in which people order their actions as they think fit, within the bounds of the law of nature, and as a state of equality in which no one has more power than another.

From there he draws a conclusion in section 95: since men are by nature "all free, equal, and independent," no one can be subjected to the political power of another without his own consent. Government is legitimate only if the people agreed to it.

Locke also wrote about the dissolution of government in section 222, which supports the right of a people to replace a government that betrays its trust. This is why both revolutionaries and constitution-builders could cite him.

Why it mattered: Jefferson's phrase "consent of the governed" in 1776 was not entirely original. It echoed Locke's argument, which colonists knew well.`,
          },
          {
            id: 'founding-documents.l03',
            title: 'The English Bill of Rights of 1689',
            blurb: 'Limits on the Crown that the American colonists later claimed as their own.',
            minutes: 6,
            body: `The English Bill of Rights was adopted in 1689, after the Glorious Revolution, as a statement of the limits on royal power. It declared that the pretended power of suspending laws, or the execution of laws, by regal authority without consent of Parliament is illegal. It also held that levying money for the Crown without a grant of Parliament is illegal.

Other clauses said that elections of members of Parliament ought to be free, and that "excessive bail ought not to be required, nor excessive fines imposed; nor cruel and unusual punishments inflicted." Compare that wording with the Eighth Amendment: it is almost identical, written about a hundred years later.

The document settled sovereignty in favour of the King-in-Parliament, not in favour of the people. The Americans later moved to popular sovereignty, using much of the same vocabulary but with a different theory of who finally rules.

It also shaped the colonists' complaint. "No taxation without representation" was not an American invention, but an English constitutional claim that colonists asserted as Englishmen. That framing changes what the argument of 1776 was about.

Why it mattered: the Constitution and the Bill of Rights borrowed from it heavily and openly.`,
          },
        ],
      },
      {
        id: 'founding-documents.t2',
        title: 'Declaring Independence',
        blurb: 'The Declaration of 1776: its argument, its key phrases and its unfinished promise.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'founding-documents.l04',
            title: 'The Declaration of Independence: Anatomy of an Argument',
            blurb: 'A premise, a principle and a list of charges.',
            minutes: 7,
            body: `The Declaration of Independence was adopted in 1776, with Thomas Jefferson as its principal author. It is best read as a legal and political argument in three steps.

First, a premise about rights: "We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness."

Second, a principle about government: "That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed." If a government becomes destructive of these ends, "it is the Right of the People to alter or to abolish it, and to institute new Government."

Third, the evidence: a long list of specific charges against the King, meant to show that this standard had been broken. The document is like a legal brief, a premise followed by particular charges.

Notice what it does not do. It does not set out how the new government will work. That task came later with the Constitution.

Why it mattered: the Declaration explained to the world why the colonies were separating, and it gave future reformers a standard to hold their country to.`,
          },
          {
            id: 'founding-documents.l05',
            title: 'Key Phrases of the Declaration',
            blurb: 'What "self-evident," "unalienable" and "consent of the governed" mean.',
            minutes: 6,
            body: `A few phrases in the Declaration carry most of its weight.

"Self-evident" means that a claim needs no proof because it is obvious to reason. Jefferson uses it to present equality as a starting point rather than something to be argued.

"All men are created equal" is the line a young student can memorise first, and it is the sentence that later reformers quoted most. It says that no one is born the ruler of another.

"Unalienable" means that a right cannot be taken away or given up, not even by a king. The three rights named, Life, Liberty and the pursuit of Happiness, are introduced with the words "among these," which signals that the list is not complete.

"Consent of the governed" is the idea that government gets its just powers from the people it governs. It parallels Locke's argument that no one can be subjected to political power without consent.

"Alter or abolish" states the remedy: when government turns against the purposes for which it was made, the people have a right to change it.

Why it mattered: these phrases were short enough to be remembered and strong enough to be used again, by Lincoln, by Douglass and by many others.`,
          },
          {
            id: 'founding-documents.l06',
            title: 'The Declaration and Its Unfinished Promise',
            blurb: 'Principles stated in 1776 and the long argument over who they included.',
            minutes: 7,
            body: `The Declaration's claim that all men are created equal sat uneasily beside the fact that slavery existed in the new states. Its principal author, Jefferson, himself enslaved people. Historians stress this tension, and so did some of the earliest readers of the text.

The document's later force came from being taken more seriously than its signers took it. People excluded from its benefits could point to its own words. Frederick Douglass did so in 1852, using the nation's founding text as the indictment. In 1863 Abraham Lincoln dated the nation from 1776 and called it "dedicated to the proposition that all men are created equal."

This pattern, in which a founding text becomes a standard for criticism, runs through American reform. Advocates for ending slavery, and later for other expansions of rights, often cited the Declaration's words to claim that the country had not yet lived up to them.

Students should notice two things at once: the ideal as written and the reality of the time. Good history keeps both in view without dismissing either.

Why it mattered: the Declaration is both a founding statement and a lasting yardstick for the republic's promises.`,
          },
        ],
      },
      {
        id: 'founding-documents.t3',
        title: 'Building the Government',
        blurb: 'The Preamble, Federalist No. 51 and the First Amendment.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'founding-documents.l07',
            title: 'The Preamble: We the People',
            blurb: 'One sentence that states the purposes of the Constitution.',
            minutes: 6,
            body: `The Preamble opens the Constitution of 1787 with one sentence: "We the People of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America."

Count the purposes: a more perfect Union, justice, domestic tranquility, the common defence, the general welfare and the blessings of liberty. That is six goals for the new government.

The words "We the People" matter. The earlier Articles of Confederation spoke for the states, while the Constitution speaks for the people. That substitution was itself an argument, and the Anti-Federalists, who opposed the Constitution, noticed it immediately.

The Preamble does not grant any power. It states the purpose, and the powers appear in the articles that follow. Lawyers and scholars still debate whether a court may decide a case by purpose alone.

Why it mattered: the Preamble tells readers who the government is for and what it is meant to do, which is why so many classrooms begin with it.`,
          },
          {
            id: 'founding-documents.l08',
            title: 'Federalist No. 51: Ambition Against Ambition',
            blurb: 'Madison explains why power is divided so that officials restrain one another.',
            minutes: 7,
            body: `Federalist No. 51 was written by James Madison and published in 1788 as part of the Federalist essays supporting the new Constitution. It explains how the structure of government protects liberty.

Madison begins with a famous sentence: "If men were angels, no government would be necessary." And if angels governed men, no outside or inside controls would be needed. Since neither is true, a government has a two-part challenge: "you must first enable the government to control the governed; and in the next place oblige it to control itself."

His solution is design. He does not rely on officials being virtuous. Instead, "Ambition must be made to counteract ambition," so that the personal interest of each officeholder is connected with the constitutional rights of the office. This is the reasoning behind separating powers among branches that can check one another.

Readers often pair it with Federalist No. 10, on faction, as one argument about scale and structure. A good question is what happens when ambition lines up across branches instead of working against itself.

Why it mattered: the essay explains in plain words why the Constitution divides power, and it is the best known statement of checks and balances.`,
          },
          {
            id: 'founding-documents.l09',
            title: 'The First Amendment: Five Freedoms',
            blurb: 'Religion, speech, press, assembly and petition in a single sentence.',
            minutes: 7,
            body: `The First Amendment was added to the Constitution in 1791 as part of the Bill of Rights. It begins: "Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof; or abridging the freedom of speech, or of the press; or the right of the people peaceably to assemble, and to petition the Government for a redress of grievances."

Five freedoms are packed into this sentence: religion, speech, press, assembly and petition. Religion actually receives two protections, one against an establishment and one for free exercise.

Notice the first words: "Congress shall make no law." The text restrains Congress, not your school or your family. Over time, courts applied these limits to state governments through the Fourteenth Amendment, a process known as incorporation. The wording did not change, but its reach did.

"No law" has never meant that no law at all can touch speech. Courts have worked through hard cases such as incitement, defamation and true threats, and students are invited to think about where lines should be drawn and why.

Why it mattered: the First Amendment protects the open exchange of ideas that self-government depends on.`,
          },
        ],
      },
      {
        id: 'founding-documents.t4',
        title: 'Holding the Nation to Its Words',
        blurb: 'Douglass, Lincoln and the way founding texts live on.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'founding-documents.l10',
            title: 'Douglass: What to the Slave Is the Fourth of July?',
            blurb: 'An 1852 oration that used the nation\'s own principles as the indictment.',
            minutes: 8,
            body: `Frederick Douglass, who had escaped slavery and become a leading writer and speaker, delivered his oration in 1852. It was invited as part of a celebration of independence, and he used the occasion to speak plainly.

He asks, "What, to the American slave, is your 4th of July?" and answers: "a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim." He says that, to the enslaved, the celebration is a sham, and he calls the nation's boasted liberty "an unholy license."

He does not reject the Declaration. He holds the country to it. The difference between attacking a promise and demanding that it be kept is the heart of the speech. His rhetorical move, using a nation's founding text as the indictment, became a template for American reform movements for the next century.

The speech was given between the Fugitive Slave Act and the Reconstruction Amendments. Historians also note that Douglass's view of the Constitution itself changed over time, a question students can trace.

Why it mattered: Douglass showed that honouring a founding document can mean pressing the country to live up to it.`,
          },
          {
            id: 'founding-documents.l11',
            title: 'Lincoln at Gettysburg',
            blurb: 'Two minutes that re-founded the nation on the Declaration\'s premise.',
            minutes: 7,
            body: `Abraham Lincoln gave the Gettysburg Address in 1863 at the dedication of a cemetery for soldiers killed in the battle. It runs only 272 words, and it followed a two-hour oration given the same day.

It begins, "Four score and seven years ago," which is eighty-seven years, counting back from 1863 to 1776. By starting there, Lincoln dates the country from the Declaration, not the Constitution of 1787. That is an argument, not just a detail. He describes a nation "conceived in Liberty, and dedicated to the proposition that all men are created equal."

He then asks the living to take "increased devotion" from the honoured dead, and he hopes "that this nation, under God, shall have a new birth of freedom," so that "government of the people, by the people, for the people, shall not perish from the earth."

One reading is that Lincoln revised the constitutional understanding of the nation by rhetoric: he made equality the organising premise. The Thirteenth through Fifteenth Amendments then wrote that reading into law.

Why it mattered: the Address is a model of brevity and shows how a short text can reframe a country's purpose.`,
          },
          {
            id: 'founding-documents.l12',
            title: 'Following the Thread: From 1215 to 1863',
            blurb: 'How ideas travel from one document to the next and how to read them closely.',
            minutes: 8,
            body: `The founding documents are best understood as a conversation across centuries. Each text borrowed from, answered or reinterpreted an earlier one.

Start with the order: Magna Carta (1215), the English Bill of Rights and Locke's Second Treatise (both 1689), the Declaration (1776), the Constitution and its Preamble (1787), Federalist No. 51 (1788), the First Amendment (1791), Douglass (1852) and Lincoln (1863).

Now follow some threads. Lawful judgement by one's peers in Magna Carta reappears in the Fifth and Sixth Amendments. The ban on excessive bail and cruel and unusual punishments passed from the English Bill of Rights to the Eighth Amendment. Locke's consent became Jefferson's "consent of the governed." Madison's checks and balances respond to the problem of human ambition. And Douglass and Lincoln reread the Declaration to press the nation toward its stated principles.

When reading a primary source, ask who wrote it, when, for whom and why. Then read the exact words before reading what others say about them. All of these texts are in the public domain, which means they belong to everyone.

Why it mattered: knowing the thread lets a reader see that constitutional ideas were built over time, and that they continue to be argued over.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'founding-documents',
    questions: [
      ...mk('founding-documents.l01', [
        [1, 'In what year was Magna Carta issued?', '1215', ['1066', '1689', '1776'], 0, 'It is in the early 1200s.', 'Magna Carta was issued in 1215 between King John and his barons.'],
        [1, 'According to clause 39, a free man may not be seized or imprisoned except by what?', 'The lawful judgement of his equals or the law of the land', ['The order of the king alone', 'The vote of the barons only', 'The decision of a church council'], 2, 'Think of a trial by peers.', 'Clause 39 requires lawful judgement of equals or the law of the land.'],
        [2, 'What limit did Magna Carta have as originally written?', 'It spoke of free men, so it was not a charter of universal rights', ['It applied to no one', 'It was written in secret', 'It created a president'], 1, 'Look at the phrase no free man.', 'It was a bargain among the powerful, and its later power came from broader readings.'],
        [3, 'How did Sir Edward Coke help give clause 39 lasting influence?', 'He read it as a guarantee of due process of law', ['He repealed it', 'He translated it into Latin', 'He added new clauses to it'], 3, 'He lived in the seventeenth century.', 'Coke\'s reading of clause 39 as due process helped carry it into colonial charters and the Fifth Amendment.'],
      ]),
      ...mk('founding-documents.l02', [
        [1, 'Who wrote the Second Treatise of Government?', 'John Locke', ['James Madison', 'Thomas Jefferson', 'Frederick Douglass'], 0, 'He was an English philosopher.', 'John Locke wrote the Second Treatise, published in 1689.'],
        [1, 'In Locke\'s argument, what must a government have to be legitimate?', 'The consent of the people', ['A long history of rule by the same ruling family', 'The approval of a king or the established church', 'A large army able to keep order across the realm'], 3, 'It is a key phrase in the Declaration too.', 'Locke argued that no one can be subjected to political power without his own consent.'],
        [2, 'What does Locke mean by the state of nature?', 'A hypothetical condition of freedom and equality before government', ['A protected wilderness set aside by the English crown', 'A real island where he lived', 'A specific English law'], 1, 'It is a thought experiment.', 'It is an imagined starting point from which he builds his argument.'],
        [3, 'Why could both revolutionaries and constitution-builders cite Locke?', 'He gave both a founding justification and a justification for replacing a failed government', ['He wrote the Constitution himself', 'He opposed all government', 'He supported absolute monarchy'], 2, 'Think of sections 95 and 222.', 'His writings cover how governments begin and when they may be dissolved.'],
      ]),
      ...mk('founding-documents.l03', [
        [1, 'What did the English Bill of Rights say about excessive bail?', 'It ought not to be required', ['It should always be doubled', 'It is required for every crime', 'It is set by the king alone'], 1, 'The Eighth Amendment has similar words.', 'The text said excessive bail ought not to be required, nor excessive fines imposed.'],
        [1, 'In what year was the English Bill of Rights adopted?', '1689', ['1215', '1787', '1863'], 0, 'It followed the Glorious Revolution.', 'It was adopted in 1689.'],
        [2, 'Which American provision has wording almost identical to the English ban on cruel and unusual punishments?', 'The Eighth Amendment', ['The First Amendment guarantee of free speech', 'The Preamble to the Constitution', 'Federalist No. 51 by James Madison'], 3, 'It was written about a century later.', 'The Eighth Amendment borrowed the English phrasing closely.'],
        [3, 'How does the English settlement of 1689 differ from the American approach to who rules?', 'It placed sovereignty in the King-in-Parliament, while the Americans moved to popular sovereignty', ['It gave all power to the people', 'It abolished Parliament', 'It made the king supreme'], 2, 'Compare Parliament with We the People.', 'The 1689 settlement favoured the King-in-Parliament, not the people.'],
      ]),
      ...mk('founding-documents.l04', [
        [1, 'Who was the principal author of the Declaration of Independence?', 'Thomas Jefferson', ['James Madison', 'Alexander Hamilton of New York', 'Abraham Lincoln'], 0, 'He was from Virginia.', 'Thomas Jefferson was its principal author.'],
        [1, 'In what year was the Declaration adopted?', '1776', ['1215', '1787', '1791'], 3, 'It is the year of independence.', 'The Declaration was adopted in 1776.'],
        [2, 'What does the second step of the Declaration\'s argument say about government?', 'It is instituted to secure rights and gets its power from consent', ['It is a monarchy that should be led by a king chosen by the colonial assemblies', 'It exists mainly to collect taxes and to pay the costs of national defence', 'It is unrelated to rights and is only about keeping order among the colonies'], 1, 'Look at the phrase consent of the governed.', 'Governments are instituted to secure rights, deriving their just powers from consent.'],
        [3, 'Why is the Declaration described as like a legal brief?', 'It states a premise and then lists specific charges against the King', ['It is written in legal Latin', 'It only lists laws', 'It was signed in a courtroom'], 2, 'Think about premise and evidence.', 'It sets out a principle and then charges the King with particular acts.'],
      ]),
      ...mk('founding-documents.l05', [
        [1, 'What does unalienable mean?', 'Cannot be taken away', ['Easily sold or traded away', 'Given by a king', 'Only for adults'], 1, 'Not even a king can do it.', 'An unalienable right cannot be taken away or given up.'],
        [1, 'Which three rights does the Declaration name, using the words among these?', 'Life, Liberty and the pursuit of Happiness', ['Speech, press, assembly and the right to petition the government', 'Property, trade, travel and the freedom to choose a livelihood', 'Justice, tranquility, defence, welfare and the blessings of liberty'], 0, 'They are in the famous second sentence.', 'The text names Life, Liberty and the pursuit of Happiness.'],
        [2, 'What does the phrase among these signal about the list of rights?', 'The list is not complete', ['The list is only for kings', 'The list is secret', 'The list is final'], 2, 'Consider what among implies.', 'Among these suggests that other rights exist too.'],
        [3, 'What remedy does the phrase alter or abolish describe?', 'The people may change a government that turns against its purposes', ['The king may dissolve the colonies', 'Judges may erase laws', 'Congress may end elections'], 3, 'Think about the right of the people.', 'It states the people\'s right to change a destructive government and form a new one.'],
      ]),
      ...mk('founding-documents.l06', [
        [1, 'What tension do historians note about the Declaration\'s claim of equality?', 'Slavery existed in the new states, and its author enslaved people', ['No one had read it', 'It was written in secret', 'It was written in another language'], 1, 'Think about who was excluded.', 'The ideal of equality sat beside the reality of slavery.'],
        [1, 'Whose 1852 speech used the Declaration as an indictment?', 'Frederick Douglass', ['Abraham Lincoln of Illinois', 'John Locke of England', 'James Madison of Virginia'], 0, 'He had escaped slavery.', 'Douglass pressed the nation to live up to its own founding words.'],
        [2, 'What pattern does the lesson describe?', 'A founding text becomes a standard for criticizing the nation', ['A text is replaced by a new one every decade', 'A text loses all meaning', 'A text applies only to kings'], 3, 'Reformers kept citing it.', 'Reformers cited the Declaration to say the country had not yet lived up to it.'],
        [3, 'Why should a student keep both the ideal and the reality in view?', 'Good history notices what was written and what was done', ['Because only the ideal matters', 'Because only the reality of the time matters and the written ideals can be ignored', 'Because the documents are fictional'], 2, 'Think of fairness in history.', 'Seeing both lets us understand the document\'s importance and its limits.'],
      ]),
      ...mk('founding-documents.l07', [
        [1, 'What are the first three words of the Preamble?', 'We the People', ['In God We', 'All men are', 'Congress shall make'], 0, 'They are the K-2 words.', 'The Preamble begins We the People of the United States.'],
        [1, 'How many purposes does the Preamble list?', 'Six', ['Two', 'Ten', 'Twelve'], 1, 'Count the goals in the sentence.', 'It lists union, justice, tranquility, defence, welfare and liberty.'],
        [2, 'What does the Preamble NOT do?', 'Grant any specific powers', ['Name the document it opens as a Constitution for the United States', 'Mention liberty', 'Open the document'], 2, 'Powers appear in the articles.', 'It states purposes; powers are in the articles that follow.'],
        [3, 'Why did We the People replace a list of states, as in the Articles of Confederation?', 'It was an argument that the Constitution rests on the people', ['It shortened the document by removing the list of thirteen state names', 'It removed the office of the president from the proposed government', 'It was only a spelling choice made by the clerk who copied out the final text'], 3, 'Anti-Federalists noticed it.', 'The substitution signalled that authority came from the people, and critics noticed.'],
      ]),
      ...mk('founding-documents.l08', [
        [1, 'Who wrote Federalist No. 51?', 'James Madison', ['Thomas Jefferson', 'Abraham Lincoln', 'John Locke'], 0, 'He is often called the Father of the Constitution.', 'James Madison wrote No. 51, published in 1788.'],
        [1, 'Complete the quotation: If men were angels...', 'no government would be necessary', ['we would not need laws about speech', 'the king would rule', 'elections would be annual'], 2, 'Think of what governments are for.', 'Madison wrote that if men were angels, no government would be necessary.'],
        [2, 'What does Ambition must be made to counteract ambition mean?', 'Officials\' self-interest is arranged to restrain other officials', ['Officials should have no goals', 'Only one branch should be ambitious', 'Ambition should be punished'], 3, 'It describes a design principle.', 'The structure makes each officeholder defend the powers of the office against others.'],
        [3, 'What two-part challenge does Madison describe for a government?', 'It must control the governed and oblige itself to control itself', ['It must tax the governed and spend the proceeds on public works and defence', 'It must write laws for the nation and then enforce them through courts', 'It must be large enough to defend itself and small enough to be local'], 1, 'One part is about the governed, one about government.', 'It must first be able to govern and then be restrained.'],
      ]),
      ...mk('founding-documents.l09', [
        [1, 'In what year was the First Amendment added?', '1791', ['1215', '1776', '1863'], 2, 'It is part of the Bill of Rights.', 'The Bill of Rights, including the First Amendment, was added in 1791.'],
        [1, 'Which of these is one of the five freedoms in the First Amendment?', 'Petition', ['Travel', 'Voting', 'Education'], 0, 'Petition the government for a redress of grievances.', 'Religion, speech, press, assembly and petition are protected.'],
        [2, 'Whom does the text of the First Amendment restrain?', 'Congress', ['Parents', 'Private schools', 'Individuals only'], 1, 'Read the first words.', 'It says Congress shall make no law, and later applied to states through incorporation.'],
        [3, 'What is incorporation?', 'Applying limits on Congress to state governments through the Fourteenth Amendment', ['Creating a corporation that holds the rights of citizens as a legal body', 'Adding a new amendment to the Constitution that repeats the First Amendment', 'Writing a new Preamble that applies the Constitution to each state separately'], 3, 'The text stayed the same but its reach grew.', 'Courts extended the First Amendment\'s limits to the states through the Fourteenth Amendment.'],
      ]),
      ...mk('founding-documents.l10', [
        [1, 'Who delivered What to the Slave Is the Fourth of July?', 'Frederick Douglass', ['Thomas Jefferson of Virginia', 'Abraham Lincoln', 'James Madison'], 0, 'He escaped slavery.', 'Douglass delivered it in 1852.'],
        [1, 'In what year was the oration given?', '1852', ['1776', '1788', '1863'], 2, 'It is between the Constitution and the Civil War.', 'The oration dates from 1852.'],
        [2, 'What was the occasion for the speech?', 'A celebration of independence', ['A cemetery dedication', 'A constitutional convention in Philadelphia', 'A royal coronation'], 1, 'It is in the title.', 'Douglass was invited to speak at an Independence Day celebration.'],
        [3, 'How does Douglass treat the Declaration of Independence?', 'He holds the country to it rather than rejecting it', ['He says it should be forgotten', 'He says it was written by Locke', 'He says it applies only to kings'], 3, 'Think of demanding that a promise be kept.', 'He uses the nation\'s own principles as the standard against which to judge it.'],
      ]),
      ...mk('founding-documents.l11', [
        [1, 'How many words long is the Gettysburg Address, according to the course data?', '272', ['72', '1,000', '5,000'], 0, 'It is very short.', 'The Address is 272 words.'],
        [1, 'What does four score and seven years mean?', 'Eighty-seven years', ['Forty-seven years', 'Seventy years', 'Ninety-seven years'], 3, 'A score is twenty.', 'Four score and seven is 4 times 20 plus 7, or 87 years.'],
        [2, 'To what year does Lincoln count back from 1863?', '1776', ['1215', '1787', '1689'], 1, 'It is the year of the Declaration.', 'Counting back 87 years from 1863 reaches 1776.'],
        [3, 'Why does it matter that Lincoln dated the nation from 1776?', 'It treats equality in the Declaration as the nation\'s founding premise', ['It ignores the Declaration entirely and treats the Constitution as the start', 'It praises the king and the colonial order that came before independence', 'It shows he had not read the Constitution closely before he spoke at the ceremony'], 2, 'Compare the Declaration with the Constitution.', 'Starting from 1776 puts the Declaration\'s principle of equality at the centre.'],
      ]),
      ...mk('founding-documents.l12', [
        [1, 'Which document came first?', 'Magna Carta (1215)', ['The Declaration (1776)', 'The First Amendment (1791)', 'Gettysburg (1863)'], 0, 'It is the oldest.', 'Magna Carta dates from 1215, long before the others.'],
        [1, 'Which phrase moved from Locke into the Declaration?', 'Consent of the governed', ['Four score and seven', 'We the People', 'Ambition against ambition'], 3, 'It concerns where power comes from.', 'Locke\'s idea of consent became Jefferson\'s phrase.'],
        [2, 'Which later provision echoes the English Bill of Rights on cruel and unusual punishments?', 'The Eighth Amendment', ['The Preamble', 'Clause 40 of Magna Carta', 'Federalist No. 51'], 1, 'It is in the Bill of Rights.', 'The Eighth Amendment is nearly identical in wording.'],
        [3, 'Why are these documents in the public domain?', 'They are old or federal works, so they belong to everyone', ['They were never published and so no one has ever claimed ownership of them', 'They were written anonymously by authors whose names have since been lost', 'They are fictional accounts, so copyright law does not apply to them at all'], 2, 'Think about copyright age.', 'Their age and federal origin mean no one owns them, so everyone may read and share them.'],
      ]),
    ],
  },
};
