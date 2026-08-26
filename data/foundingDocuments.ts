/**
 * foundingDocuments — the Telescoping Text corpus for Civics Hall.
 *
 * THE MECHANIC: every document exists ONCE, with five band-tagged zoom levels. A kindergartner
 * chants the Preamble; a sixth-grader reads a paragraph; a senior reads the whole thing with a
 * gloss; a college reader gets the scholarly apparatus. Same document id, same permalink, an
 * age-appropriate lens. This is only legally possible because the entire spine is public domain —
 * which is also why we can say, on every page, "this text belongs to everyone".
 *
 * LICENCE: every text below is public domain. US founding documents are federal works and/or
 * long out of copyright; Magna Carta, the English Bill of Rights, Locke and the 1852 Douglass
 * oration are centuries out of copyright. Translations used are pre-1930 where a translation is
 * involved. We never include a modern scholarly translation or an annotated edition, because those
 * carry their own copyright — see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md.
 *
 * The higher bands quote the real text verbatim. The lower bands do NOT paraphrase away the
 * document — they quote a shorter true fragment and frame it, so a five-year-old still touches the
 * actual words.
 */

export type DocBand = 'k2' | 'g35' | 'g68' | 'g912' | 'col';

export const DOC_BANDS: { id: DocBand; label: string }[] = [
  { id: 'k2', label: 'K–2' },
  { id: 'g35', label: '3–5' },
  { id: 'g68', label: '6–8' },
  { id: 'g912', label: '9–12' },
  { id: 'col', label: 'College' },
];

export interface DocZoom {
  /** The actual words of the document at this zoom level. Always real text. */
  text: string;
  /** How a teacher frames it at this age — the lens, not a replacement for the text. */
  lens: string;
}

export interface FoundingDoc {
  id: string;
  title: string;
  year: string;
  author?: string;
  /** Which strand of Civics Hall this document anchors. */
  strand: 'foundations' | 'structure' | 'rights' | 'action' | 'living';
  /** Where the public-domain original lives. */
  source: { label: string; url: string };
  zooms: Record<DocBand, DocZoom>;
}

export const FOUNDING_DOCS: FoundingDoc[] = [
  {
    id: 'preamble-1787',
    title: 'The Preamble to the Constitution',
    year: '1787',
    strand: 'living',
    source: { label: 'U.S. National Archives — Constitution of the United States', url: 'https://www.archives.gov/founding-docs/constitution-transcript' },
    zooms: {
      k2: {
        text: '“We the People…”',
        lens: 'Three words that begin a promise. Say them together, then write your own class promise and everybody signs it.',
      },
      g35: {
        text: '“We the People of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility…”',
        lens: 'Who is “We”? Notice it does not say “We the King”. Ask what a “more perfect Union” means — perfect, or getting better?',
      },
      g68: {
        text: '“We the People of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.”',
        lens: 'Six purposes in one sentence. List them, then match each to something a government does in your town today.',
      },
      g912: {
        text: '“We the People of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.”',
        lens: 'The Preamble grants no power — it states purpose. Argue both sides: should a court be able to decide a case using purpose alone?',
      },
      col: {
        text: '“We the People of the United States, in Order to form a more perfect Union, establish Justice, insure domestic Tranquility, provide for the common defence, promote the general Welfare, and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States of America.”',
        lens: 'Read against the Articles of Confederation’s opening, which spoke for states rather than people. The substitution of “We the People” for a list of states was itself the argument — and the Anti-Federalists said so immediately.',
      },
    },
  },
  {
    id: 'magna-carta-39-40',
    title: 'Magna Carta, clauses 39 and 40',
    year: '1215',
    strand: 'foundations',
    source: { label: 'British Library / Wikisource — Magna Carta (1215)', url: 'https://en.wikisource.org/wiki/Magna_Carta' },
    zooms: {
      k2: {
        text: '“To no one will we… deny or delay right or justice.”',
        lens: 'Even the king had to follow the rules. Ask: what happens in our class if the rule-maker breaks the rule?',
      },
      g35: {
        text: '“No free man shall be seized or imprisoned… except by the lawful judgement of his equals or by the law of the land.”',
        lens: 'This is where “nobody is above the law” gets written down. Eight hundred years ago, and we still use it.',
      },
      g68: {
        text: '“No free man shall be seized or imprisoned, or stripped of his rights or possessions, or outlawed or exiled, or deprived of his standing in any other way, nor will we proceed with force against him, or send others to do so, except by the lawful judgement of his equals or by the law of the land. To no one will we sell, to no one deny or delay right or justice.”',
        lens: 'Two ideas are born here: trial by your peers, and justice that cannot be bought. Find both in the Fifth and Sixth Amendments.',
      },
      g912: {
        text: '“No free man shall be seized or imprisoned, or stripped of his rights or possessions, or outlawed or exiled, or deprived of his standing in any other way, nor will we proceed with force against him, or send others to do so, except by the lawful judgement of his equals or by the law of the land. To no one will we sell, to no one deny or delay right or justice.”',
        lens: 'Note the limit: “no free man”. Magna Carta was a bargain between a king and his barons, not a charter of universal rights. Its later power came from being read more broadly than it was written.',
      },
      col: {
        text: '“No free man shall be seized or imprisoned, or stripped of his rights or possessions, or outlawed or exiled, or deprived of his standing in any other way, nor will we proceed with force against him, or send others to do so, except by the lawful judgement of his equals or by the law of the land.”',
        lens: 'Trace the transmission: Coke’s seventeenth-century reading of clause 39 as “due process of law”, its passage into colonial charters, and its arrival in the Fifth Amendment. The document’s influence is largely a history of its reinterpretation.',
      },
    },
  },
  {
    id: 'locke-second-treatise',
    title: 'Locke, Second Treatise of Government',
    year: '1689',
    author: 'John Locke',
    strand: 'foundations',
    source: { label: 'Project Gutenberg — Two Treatises of Government', url: 'https://www.gutenberg.org/ebooks/7370' },
    zooms: {
      k2: {
        text: '“…all free, equal, and independent…”',
        lens: 'A very old idea: nobody is born the boss of anybody else. Ask what that means for taking turns.',
      },
      g35: {
        text: '“Men being, as has been said, by nature, all free, equal, and independent, no one can be… subjected to the political power of another, without his own consent.”',
        lens: 'Consent means you agreed. Locke says a government only counts if the people said yes.',
      },
      g68: {
        text: '“Men being, as has been said, by nature, all free, equal, and independent, no one can be put out of this estate, and subjected to the political power of another, without his own consent.” (§95)',
        lens: 'Read this next to the Declaration’s “consent of the governed”. Jefferson was not being original — and knew it.',
      },
      g912: {
        text: '“To understand political power right, and derive it from its original, we must consider what state all men are naturally in, and that is, a state of perfect freedom to order their actions… A state also of equality, wherein all the power and jurisdiction is reciprocal, no one having more than another.” (§4)',
        lens: 'Locke builds the whole argument from a hypothetical “state of nature”. Ask whether an argument resting on an imagined starting point can bind real governments.',
      },
      col: {
        text: '“To understand political power right, and derive it from its original, we must consider what state all men are naturally in, and that is, a state of perfect freedom to order their actions, and dispose of their possessions and persons, as they think fit, within the bounds of the law of nature, without asking leave, or depending upon the will of any other man.” (§4)',
        lens: 'Set §4 against §95 and §222 (dissolution of government). Locke supplies both the founding justification and the revolutionary one — which is precisely why 1776 could cite him for independence and 1787 could cite him for order.',
      },
    },
  },
  {
    id: 'english-bill-of-rights-1689',
    title: 'The English Bill of Rights',
    year: '1689',
    strand: 'foundations',
    source: { label: 'Wikisource — Bill of Rights 1689', url: 'https://en.wikisource.org/wiki/Bill_of_Rights_1689' },
    zooms: {
      k2: {
        text: '“…election of members of Parliament ought to be free…”',
        lens: 'Voting should be free — nobody gets to tell you how to vote. Hold a free class vote and a rigged one; discuss the difference.',
      },
      g35: {
        text: '“That excessive bail ought not to be required, nor excessive fines imposed; nor cruel and unusual punishments inflicted.”',
        lens: 'Read this, then read the Eighth Amendment. Notice the wording is almost identical — a hundred years apart.',
      },
      g68: {
        text: '“That the pretended power of suspending the laws or the execution of laws by regal authority without consent of Parliament is illegal… That election of members of Parliament ought to be free… That excessive bail ought not to be required, nor excessive fines imposed; nor cruel and unusual punishments inflicted.”',
        lens: 'Three rules limiting a monarch. Match each to its American descendant — the Constitution borrowed heavily and openly.',
      },
      g912: {
        text: '“That the pretended power of suspending the laws or the execution of laws by regal authority without consent of Parliament is illegal… That levying money for or to the use of the Crown by pretence of prerogative, without grant of Parliament… is illegal.”',
        lens: '“No taxation without representation” is not an American invention; it is an English constitutional claim the colonists were asserting *as Englishmen*. That framing changes what 1776 was arguing.',
      },
      col: {
        text: '“That the pretended power of suspending the laws or the execution of laws by regal authority without consent of Parliament is illegal.”',
        lens: 'The 1689 settlement resolved sovereignty in favour of the King-in-Parliament, not the people. Compare with the American move to popular sovereignty — the same vocabulary carrying a different theory of who ultimately rules.',
      },
    },
  },
  {
    id: 'declaration-1776',
    title: 'The Declaration of Independence',
    year: '1776',
    strand: 'foundations',
    source: { label: 'U.S. National Archives — Declaration of Independence', url: 'https://www.archives.gov/founding-docs/declaration-transcript' },
    zooms: {
      k2: {
        text: '“…all men are created equal…”',
        lens: 'Five words worth memorising. Ask what “equal” looks like in a classroom.',
      },
      g35: {
        text: '“We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness.”',
        lens: '“Unalienable” means nobody can take it away — not even a king. Ask which rights they would put on their own list.',
      },
      g68: {
        text: '“…That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed,—That whenever any Form of Government becomes destructive of these ends, it is the Right of the People to alter or to abolish it…”',
        lens: 'This is the argument, not the poetry: government exists to protect rights, gets its power from consent, and can be replaced when it fails. Three steps — find them.',
      },
      g912: {
        text: '“We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness.—That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed,—That whenever any Form of Government becomes destructive of these ends, it is the Right of the People to alter or to abolish it, and to institute new Government…”',
        lens: 'The document is a legal brief: a premise, then a list of particular charges against the King. Read the charges and ask what standard of proof its authors thought they were meeting.',
      },
      col: {
        text: '“We hold these truths to be self-evident, that all men are created equal… deriving their just powers from the consent of the governed…”',
        lens: 'Hold this line beside the fact that its principal author enslaved people, and beside Douglass in 1852. The document’s later force came from being taken more seriously than its signers took it.',
      },
    },
  },
  {
    id: 'federalist-51',
    title: 'Federalist No. 51',
    year: '1788',
    author: 'James Madison',
    strand: 'structure',
    source: { label: 'Library of Congress — The Federalist Papers', url: 'https://guides.loc.gov/federalist-papers/full-text' },
    zooms: {
      k2: {
        text: '“If men were angels, no government would be necessary.”',
        lens: 'People are not perfect, so we make rules — and rules for the rule-makers too.',
      },
      g35: {
        text: '“If men were angels, no government would be necessary. If angels were to govern men, neither external nor internal controls on government would be necessary.”',
        lens: 'Two sentences that explain why we split power up. Play a game where one person makes every rule, then split the job three ways.',
      },
      g68: {
        text: '“In framing a government which is to be administered by men over men, the great difficulty lies in this: you must first enable the government to control the governed; and in the next place oblige it to control itself.”',
        lens: 'The whole design problem in one sentence: strong enough to work, restrained enough to be safe. Find both halves in the three branches.',
      },
      g912: {
        text: '“Ambition must be made to counteract ambition. The interest of the man must be connected with the constitutional rights of the place… If men were angels, no government would be necessary.”',
        lens: 'Madison does not ask officials to be virtuous. He designs so that their self-interest defends the system. Ask whether that is cynical, realistic, or both.',
      },
      col: {
        text: '“But what is government itself, but the greatest of all reflections on human nature? If men were angels, no government would be necessary… Ambition must be made to counteract ambition.”',
        lens: 'Read 51 with 10 (faction) as one argument about scale and structure. Then test it: when ambition aligns across branches rather than counteracting, what in the design is supposed to hold?',
      },
    },
  },
  {
    id: 'first-amendment-1791',
    title: 'The First Amendment',
    year: '1791',
    strand: 'rights',
    source: { label: 'U.S. National Archives — The Bill of Rights', url: 'https://www.archives.gov/founding-docs/bill-of-rights-transcript' },
    zooms: {
      k2: {
        text: '“…the right of the people peaceably to assemble…”',
        lens: 'You are allowed to gather with others and say what you think — peaceably. Practise disagreeing kindly.',
      },
      g35: {
        text: '“Congress shall make no law… abridging the freedom of speech, or of the press; or the right of the people peaceably to assemble, and to petition the Government for a redress of grievances.”',
        lens: 'Five freedoms hide in this sentence. Find them all: religion, speech, press, assembly, petition.',
      },
      g68: {
        text: '“Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof; or abridging the freedom of speech, or of the press; or the right of the people peaceably to assemble, and to petition the Government for a redress of grievances.”',
        lens: 'Notice it restrains *Congress*, not your school or your parents. Ask who the First Amendment actually binds.',
      },
      g912: {
        text: '“Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof; or abridging the freedom of speech, or of the press; or the right of the people peaceably to assemble, and to petition the Government for a redress of grievances.”',
        lens: '“No law” has never meant no law. Work the hard cases — incitement, defamation, true threats — and articulate where you would draw a line and why.',
      },
      col: {
        text: '“Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof; or abridging the freedom of speech, or of the press…”',
        lens: 'Follow incorporation: how a limit on Congress came to bind the states through the Fourteenth Amendment. The text never changed; its reach did.',
      },
    },
  },
  {
    id: 'douglass-1852',
    title: 'What to the Slave Is the Fourth of July?',
    year: '1852',
    author: 'Frederick Douglass',
    strand: 'action',
    source: { label: 'Project Gutenberg — Frederick Douglass', url: 'https://www.gutenberg.org/ebooks/23' },
    zooms: {
      k2: {
        text: '“…a day that reveals to him… the gross injustice…”',
        lens: 'A celebration can feel very different depending on who you are. Ask when a rule felt unfair to one person and fine to another.',
      },
      g35: {
        text: '“What, to the American slave, is your 4th of July? I answer: a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim.”',
        lens: 'Douglass was invited to celebrate a holiday and instead told the truth about it. Ask why that took courage.',
      },
      g68: {
        text: '“What, to the American slave, is your 4th of July? I answer: a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim. To him, your celebration is a sham.”',
        lens: 'He does not reject the Declaration — he holds the country to it. Find the difference between attacking a promise and demanding it be kept.',
      },
      g912: {
        text: '“What, to the American slave, is your 4th of July? I answer: a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim. To him, your celebration is a sham; your boasted liberty, an unholy license…”',
        lens: 'Read the oration beside the Declaration you studied earlier. Douglass’s rhetorical move — using a nation’s own founding text as the indictment — becomes the template for a century of American reform.',
      },
      col: {
        text: '“What, to the American slave, is your 4th of July? … your boasted liberty, an unholy license; your national greatness, swelling vanity…”',
        lens: 'Situate the 1852 oration between the Fugitive Slave Act and the Reconstruction Amendments. Then ask the harder question: is the Constitution, on Douglass’s later reading, a pro-slavery or an anti-slavery document? He changed his mind — track why.',
      },
    },
  },
  {
    id: 'gettysburg-1863',
    title: 'The Gettysburg Address',
    year: '1863',
    author: 'Abraham Lincoln',
    strand: 'living',
    source: { label: 'Library of Congress — Gettysburg Address', url: 'https://www.loc.gov/collections/abraham-lincoln-papers/articles-and-essays/gettysburg-address/' },
    zooms: {
      k2: {
        text: '“…government of the people, by the people, for the people…”',
        lens: 'Say it three times. Ask who “the people” includes.',
      },
      g35: {
        text: '“Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.”',
        lens: '“Four score and seven” is 87 years. Count back from 1863 — where does it land, and why did Lincoln choose that year?',
      },
      g68: {
        text: '“Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal… that government of the people, by the people, for the people, shall not perish from the earth.”',
        lens: 'Lincoln dates the country from 1776, not 1787 — from the Declaration, not the Constitution. That is an argument, not a detail.',
      },
      g912: {
        text: '“…that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion—that we here highly resolve that these dead shall not have died in vain—that this nation, under God, shall have a new birth of freedom…”',
        lens: '272 words that re-found the country on the Declaration’s premise. Compare its length and effect with the two-hour oration that preceded it that day.',
      },
      col: {
        text: '“…that this nation, under God, shall have a new birth of freedom—and that government of the people, by the people, for the people, shall not perish from the earth.”',
        lens: 'Read as constitutional revision by rhetoric: Lincoln retroactively makes equality the nation’s organising premise, and the Thirteenth through Fifteenth Amendments then write that reading into law.',
      },
    },
  },
];

export const docById = (id: string) => FOUNDING_DOCS.find(d => d.id === id);
export default FOUNDING_DOCS;
