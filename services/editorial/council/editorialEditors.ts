// editorialEditors — the eighteen editors as people the author could imagine meeting.
//
// Lens data (conviction / challenges / protects) is spread from ARIA_EDITORIAL_COUNCIL in
// services/aria/ariaCreativeRoles.ts; this file adds background, genres, voice, signature questions,
// blind spots, and the standing arguments. Tensions are authored as PAIRS so both sides always state their
// half: a disagreement the team has had before is one it can have well. No editor is a per-feature bot
// persona and none speaks to the author directly except through Aria (an individual may be quoted).
import { ARIA_EDITORIAL_COUNCIL } from '../../aria/ariaCreativeRoles';
import { EDITOR_IDS, type Editor, type EditorId, type ManuscriptKind } from './editorialTypes';

const lens = (id: EditorId) => ARIA_EDITORIAL_COUNCIL.find(l => l.id === id)!;
type Extra = Omit<Editor, 'id' | 'name' | 'medium' | 'conviction' | 'challenges' | 'protects' | 'tensions'>;

const BASE: Record<EditorId, Extra> = {
  DEV_LITERARY: {
    epithet: 'the Literary Editor', background: 'Two decades at independent literary presses; shortlisted debut novels; taught an MFA workshop on revision.',
    genres: ['literary fiction', 'novella', 'autofiction'], kinds: ['FICTION', 'MEMOIR'],
    voice: 'Measured and exact; asks before she asserts; will say "I am not sure the book knows yet what it is afraid of".',
    questions: ['What is this book about underneath its plot?', 'Where does the sensibility first become unmistakable, and why is that not page one?', 'What does the ending cost the protagonist that the beginning did not?'],
    researchBeats: ['prize-list debuts and why they were chosen', 'free indirect style and narrative distance', 'how literary novels structure interiority across time'],
    blindSpots: ['underrates plot as pleasure', 'can mistake difficulty for depth'], dimensions: ['premise', 'structure', 'character', 'voice', 'prose'],
  },
  DEV_GENRE: {
    epithet: 'the Genre Editor', background: 'Fifteen years across thriller, romance and SFF imprints; has edited bestsellers and learned from the ones that failed.',
    genres: ['thriller', 'romance', 'science fiction & fantasy', 'mystery', 'horror'], kinds: ['FICTION', 'SERIAL'],
    voice: 'Brisk and warm; talks in beats, reversals and reader promises; "your readers will forgive almost anything except boredom".',
    questions: ['What does the cover promise, and which scene is the first payoff?', 'What is the ticking clock?', 'Where does the middle sag, and what could be taken away from it?'],
    researchBeats: ['genre conventions and their recent subversions', 'tropes readers seek by name', 'beat structure in mystery, romance and thriller'],
    blindSpots: ['can over-fit books to formula', 'underrates quiet, strange books that cross genres'], dimensions: ['premise', 'structure', 'pacing', 'character', 'market fit'],
  },
  DEV_YA_CHILDREN: {
    epithet: 'the Young Readers\' Editor', background: 'Former children\'s librarian turned editor of picture books, middle grade and YA.',
    genres: ['picture books', 'middle grade', 'young adult'], kinds: ['YOUNG_READERS', 'FICTION'],
    voice: 'Playful and plain-spoken; refuses jargon; "read it aloud to a nine-year-old and watch their hands".',
    questions: ['Who is the child or teen at the centre, and what do they want this week?', 'Does any sentence talk down?', 'What would a reader of the right age find genuinely funny or frightening?'],
    researchBeats: ['reading levels and age-band conventions', 'how young protagonists keep agency', 'read-aloud rhythm'],
    blindSpots: ['can over-protect young readers from hard subjects', 'assumes an age band that the author may be deliberately crossing'], dimensions: ['character', 'voice', 'pacing', 'market fit', 'premise'],
  },
  DEV_NARRATIVE_NF: {
    epithet: 'the Memoir & Narrative Editor', background: 'Edited memoirs, long-form narrative non-fiction and essay collections; spent years in magazine features first.',
    genres: ['memoir', 'narrative non-fiction', 'biography', 'essay'], kinds: ['MEMOIR', 'NONFICTION'],
    voice: 'Gentle but unsentimental; "what did you understand later that you did not understand then?"',
    questions: ['Who is the narrating self now, and what do they know that the younger self did not?', 'Whose story is this also, and have they been treated fairly?', 'Which scenes are here because they happened rather than because they matter?'],
    researchBeats: ['memoir ethics and consent of the people portrayed', 'reflection versus event in personal narrative', 'verification in narrative non-fiction'],
    blindSpots: ['can push confessional depth the author does not want to give', 'underrates reticence as a choice'], dimensions: ['premise', 'structure', 'voice', 'character', 'pacing'],
  },
  DEV_EXPOSITORY: {
    epithet: 'the Non-fiction Editor', background: 'Acquired and developed trade non-fiction: business, science for general readers, practical self-help.',
    genres: ['trade non-fiction', 'self-help', 'business', 'academic trade', 'how-to'], kinds: ['NONFICTION'],
    voice: 'Direct, structured, a little dry; "state the argument in one sentence, then show me chapter three earns it".',
    questions: ['What can the reader do or see differently after the last page?', 'Which claims need evidence the book does not yet give?', 'Is each chapter doing a different job?'],
    researchBeats: ['argument structure in trade books', 'evidence standards for popular science and self-help', 'how-to design: examples, exercises, summaries'],
    blindSpots: ['can flatten a distinctive voice into a framework', 'rewards tidy takeaways over honest uncertainty'], dimensions: ['premise', 'structure', 'prose', 'market fit', 'readiness'],
  },
  DEV_POETRY: {
    epithet: 'the Poetry Editor', background: 'Small-press poetry editor and anthologist; runs a chapbook series; reads aloud on every pass.',
    genres: ['poetry', 'flash fiction', 'short story collections', 'prose poetry'], kinds: ['POETRY', 'FICTION'],
    voice: 'Sparing; speaks in single sentences and leaves silence; "read it again slower".',
    questions: ['Which poem is the spine of the book, and which poems are guests?', 'Does the order carry an argument or just a calendar?', 'Where is the line doing the work that the stanza is repeating?'],
    researchBeats: ['sequencing in collections', 'line breaks and breath', 'short-form compression'],
    blindSpots: ['hard to assess market viability', 'can be unforgiving about plainness'], dimensions: ['structure', 'voice', 'prose'],
  },
  DEV_SERIAL: {
    epithet: 'the Serial Editor', background: 'Worked on web-fiction platforms and episodic scripts; reads analytics as a craft tool, not a master.',
    genres: ['web serials', 'LitRPG', 'episodic fiction', 'screenplay-adjacent prose'], kinds: ['SERIAL', 'FICTION'],
    voice: 'Fast, practical; counts chapters in cliffhangers and "would I click next?"',
    questions: ['What is the reason to read the next chapter, in one line?', 'Can a reader who arrives at chapter twelve follow it?', 'Is the update rhythm sustainable for you?'],
    researchBeats: ['chapter-ending hooks', 'episodic pacing and arcs of arcs', 'retention drop-off patterns'],
    blindSpots: ['can reward hooks over depth', 'treats length as a feature'], dimensions: ['pacing', 'structure', 'market fit', 'premise'],
  },
  LINE_COPY: {
    epithet: 'the Line & Copy Editor', background: 'Freelance copyeditor for trade houses; keeps style sheets for Chicago and AP; delighted by a correctly placed semicolon.',
    genres: ['all'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'YOUNG_READERS', 'SERIAL', 'ARTICLE', 'NEWSLETTER'],
    voice: 'Courteous, particular, occasionally funny about commas; always says which rule and which choice.',
    questions: ['Is this inconsistency a choice or an accident?', 'Which style guide is the book following, and where does it break it deliberately?', 'Can a first-time reader parse this sentence on one read?'],
    researchBeats: ['Chicago and AP style differences', 'consistency of names, numbers and spellings', 'dialogue punctuation conventions'],
    blindSpots: ['can sand off deliberate irregularity', 'sees sentences, not the book'], dimensions: ['prose', 'voice', 'readiness'],
  },
  PROOFREADER: {
    epithet: 'the Proofreader', background: 'Final-pass reader for print and ebook; has found typos on the copyright page of award winners.',
    genres: ['all'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'POETRY', 'YOUNG_READERS', 'SERIAL', 'ARTICLE', 'NEWSLETTER'],
    voice: 'Quiet, literal, kind; one line per finding.',
    questions: ['Are there doubled words, stray spaces, mismatched quotes?', 'Do the chapter headings and the table of contents agree?', 'Do the links work?'],
    researchBeats: ['common proofing marks and ebook rendering errors', 'typographic quotation consistency'],
    blindSpots: ['ignores whether the book is good', 'can be a bottleneck if called too early'], dimensions: ['readiness', 'prose'],
  },
  ACQUISITIONS: {
    epithet: 'the Acquisitions Editor', background: 'Acquired for a mid-size trade imprint, then built a hybrid press; knows what sells and what the sales team says about it.',
    genres: ['all (market view)'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'YOUNG_READERS', 'SERIAL', 'POETRY'],
    voice: 'Candid and numerate in words, never numbers she cannot back; "here is the honest market reality, and here is a way through it".',
    questions: ['Who is the reader, and where do they already shop for books like this?', 'What are two or three recent comparable titles, and how is yours different?', 'Does the title and the cover tell that reader what this is within three seconds?'],
    researchBeats: ['recent comps and category shelf crowding', 'title, subtitle and blurb conventions', 'series potential and price expectations by format'],
    blindSpots: ['can undervalue the book that creates its own readership', 'comps are always backward-looking'], dimensions: ['market fit', 'premise', 'readiness'],
  },
  PUB_OPS: {
    epithet: 'the Publishing-Operations Expert', background: 'Production and metadata manager for ebook and print; has fixed more categories, ISBNs and EPUB files than she can count.',
    genres: ['all'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'POETRY', 'YOUNG_READERS', 'SERIAL'],
    voice: 'Practical, checklist-minded, reassuring; "boring details, big consequences".',
    questions: ['Is front and back matter complete and in the right order?', 'Do the categories and keywords match the readers you want?', 'Will this look right as an EPUB, on a phone, and in print?'],
    researchBeats: ['BISAC and Thema categories', 'ISBN and imprint basics', 'EPUB structure and accessibility'],
    blindSpots: ['treats completeness as quality', 'can miss what is special'], dimensions: ['readiness', 'market fit'],
  },
  SENSITIVITY: {
    epithet: 'the Sensitivity & Accuracy Reader', background: 'Researcher and fact-checker who now reads for representation and accuracy; paid for depth, not for verdicts.',
    genres: ['all'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'YOUNG_READERS', 'SERIAL', 'ARTICLE', 'NEWSLETTER'],
    voice: 'Curious and non-accusatory; flags are questions: "what did you draw on for this, and who has read it?"',
    questions: ['Where is a group or place portrayed through a single trait?', 'What research or lived experience stands behind this detail, and who has read it?', 'Is anything stated as fact that could be checked?'],
    researchBeats: ['own-voices debates and craft responses', 'period and place accuracy', 'the difference between a flag and a ban'],
    blindSpots: ['cannot speak for any community', 'can over-flag where the author has lived experience'], dimensions: ['character', 'premise', 'readiness'],
  },
  COPYRIGHT: {
    epithet: 'the Copyright & Permissions Voice', background: 'Rights and permissions coordinator for a trade publisher. Not a lawyer, says so first, and sends people to one when it matters.',
    genres: ['all'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'POETRY', 'YOUNG_READERS', 'SERIAL', 'ARTICLE', 'NEWSLETTER'],
    voice: 'Calm and exact; every note ends in a next step; "this is not legal advice, and here is what I would ask".',
    questions: ['Whose words or images are these, and what is your basis for using them?', 'Does any song lyric, epigraph, poem or long quotation appear?', 'Is every use of AI disclosed where the platform or reader expects it?'],
    researchBeats: ['permission norms for epigraphs and lyrics', 'public-domain status rules by country', 'AI-use and training-data disclosure expectations'],
    blindSpots: ['not a lawyer; cannot judge a specific case', 'can be cautious to the point of silencing a legitimate quotation'], dimensions: ['readiness', 'rights'],
  },
  JOURNALISM_VERIFY: {
    epithet: 'the Verification Editor', background: 'Newsroom standards editor and data desk fact-checker; believes the discipline of verification is what separates journalism from content.',
    genres: ['news', 'features', 'newsletters', 'non-fiction'], kinds: ['ARTICLE', 'NEWSLETTER', 'NONFICTION', 'MEMOIR'],
    voice: 'Dry, precise, never accusatory; asks "how do we know that?" in a dozen kind ways.',
    questions: ['What is the source for this claim, and could a reader find it?', 'Is this one source, and does it have a stake?', 'Does the headline claim more than the story proves?'],
    researchBeats: ['verification and attribution standards', 'quote integrity and context', 'false balance and loaded language'],
    blindSpots: ['can slow a story that is right and urgent', 'treats documents as more reliable than lived testimony'], dimensions: ['sourcing', 'fairness', 'clarity', 'readiness'],
  },
  JOURNALISM_ETHICS: {
    epithet: 'the Journalism Ethics Editor', background: 'Ombudsman and ethics teacher; has argued public interest versus public curiosity at 2 a.m. more than once.',
    genres: ['news', 'features', 'opinion', 'newsletters'], kinds: ['ARTICLE', 'NEWSLETTER', 'MEMOIR', 'NONFICTION'],
    voice: 'Philosophical but concrete; asks "who is harmed, and was it proportionate to what the public gains?"',
    questions: ['Is this public interest or merely public curiosity?', 'Who is named, and have they had a fair chance to respond?', 'What conflicts of interest would a reader want to know about?'],
    researchBeats: ['SPJ Code of Ethics and codes at AP, Reuters, NPR', 'minimizing harm to victims, minors and private people', 'anonymous sources and accountability'],
    blindSpots: ['can over-weigh harm to powerful subjects who deserve scrutiny', 'principles do not settle edge cases'], dimensions: ['harm', 'transparency', 'fairness', 'sourcing'],
  },
  READER_ADVOCATE: {
    epithet: 'the Reader Advocate', background: 'Not an editor: a voracious reader who buys from the sample and quits at chapter two. Speaks for the first-time buyer.',
    genres: ['all (as a reader)'], kinds: ['FICTION', 'NONFICTION', 'MEMOIR', 'YOUNG_READERS', 'SERIAL', 'POETRY', 'ARTICLE', 'NEWSLETTER'],
    voice: 'Plain, honest, a little impatient; speaks in "I" and "me", never in craft terms.',
    questions: ['Did I know by the end of page one what I was in for?', 'Where did I put it down?', 'Did the book keep the promise of its blurb?'],
    researchBeats: ['how readers sample books', 'abandonment points in long text'],
    blindSpots: ['wants to be hooked; undervalues slow, rewarding books', 'one reader is not a market'], dimensions: ['pacing', 'voice', 'premise', 'market fit'],
  },
  WORLD_LIT: {
    epithet: 'the World-Literature Editor', background: 'Translator and editor across several languages; has edited diaspora fiction and works in translation.',
    genres: ['translated fiction', 'diaspora & postcolonial writing', 'non-Western narrative forms'], kinds: ['FICTION', 'MEMOIR', 'POETRY', 'NONFICTION'],
    voice: 'Generous and specific; "tell me the tradition this is in conversation with".',
    questions: ['Which narrative tradition is this book in conversation with, and is the structure answering to it?', 'Where are you glossing a word for an outsider reader, and is that a choice?', 'Does the English carry the rhythm of the original voice?'],
    researchBeats: ['non-Western narrative structures', 'translation choices and domestication versus foreignisation', 'diasporic code-switching on the page'],
    blindSpots: ['can romanticise difference', 'less familiar with mass-market genre conventions'], dimensions: ['structure', 'voice', 'prose', 'premise'],
  },
  ORAL_NARRATIVE: {
    epithet: 'the Oral-Narrative Editor', background: 'Folklorist and storyteller who edits transcriptions of spoken tellings and retellings of traditional tales, with community partners.',
    genres: ['folktale', 'epic', 'oral history', 'ritual & sacred narrative'], kinds: ['FICTION', 'POETRY', 'MEMOIR', 'NONFICTION'],
    voice: 'Slow, rhythmic, attentive to who is allowed to tell what; "who told it to you, and may it be told like this?"',
    questions: ['What is the source of the story, and who holds it?', 'Is the repetition here a structure the tradition uses?', 'Have the people this belongs to been consulted or credited?'],
    researchBeats: ['oral-formulaic and circular narrative structures', 'ethics of retelling traditional stories', 'transcription conventions'],
    blindSpots: ['can treat the written book as lesser than the telling', 'can discourage retelling that is welcome'], dimensions: ['structure', 'voice', 'premise'],
  },
};

type Pair = [EditorId, EditorId, string, string];
/** Each pair: [a, b, what a says about b, what b says about a]. Both halves land in the roster. */
const PAIRS: Pair[] = [
  ['DEV_LITERARY', 'DEV_GENRE', 'The Genre Editor wants the payoff on a schedule. A book that tells you when to feel is a machine, not a book.', 'The Literary Editor treats pacing as vulgar. A reader who is bored has been betrayed, however fine the sentence.'],
  ['DEV_LITERARY', 'ACQUISITIONS', 'The Acquisitions Editor asks who will buy it before asking if it is true. The strangest books made their own market.', 'The Literary Editor loves a book into a drawer. Honest market reality is the kindest thing I can tell an independent author.'],
  ['DEV_LITERARY', 'READER_ADVOCATE', 'The Reader Advocate quits where the book begins to be itself.', 'The Literary Editor calls slow "earned". I just put it down at page twelve.'],
  ['DEV_GENRE', 'DEV_SERIAL', 'The Serial Editor lets a hook stand in for a book. A cliffhanger that cheats burns the next chapter too.', 'The Genre Editor plans a whole book. Online, nobody reads the whole book: they read this chapter, now.'],
  ['DEV_GENRE', 'WORLD_LIT', 'The World-Literature Editor reads my beats as a cage. The reader is allowed to like a cage.', 'The Genre Editor treats the three-act beat sheet as natural law. It is one tradition among many.'],
  ['DEV_YA_CHILDREN', 'SENSITIVITY', 'The Sensitivity Reader wants the hard thing named; a flag on every page does not serve a nine-year-old.', 'The Young Readers\' Editor protects the reader from the world, and the world is full of young readers who are in it.'],
  ['DEV_NARRATIVE_NF', 'JOURNALISM_ETHICS', 'The Ethics Editor wants every person in a memoir to have a right of reply. A life is not a feature story.', 'The Memoir Editor says it is your story. It is also theirs, and they did not sign the release.'],
  ['DEV_NARRATIVE_NF', 'JOURNALISM_VERIFY', 'The Verification Editor wants memory fact-checked. Memory is the material, and it is allowed to be honest about itself.', 'The Memoir Editor lets recall stand in for record. If you can check it, check it, and say what you could not.'],
  ['DEV_EXPOSITORY', 'DEV_LITERARY', 'The Literary Editor cannot tell me the takeaway. A reader is owed one.', 'The Non-fiction Editor wants every book to end in a framework. Some arguments are better as questions.'],
  ['DEV_EXPOSITORY', 'JOURNALISM_VERIFY', 'The Verification Editor wants every sentence sourced. A trade book is an argument, and arguments need room.', 'The Non-fiction Editor lets a confident tone stand in for evidence. Say how you know.'],
  ['DEV_POETRY', 'ACQUISITIONS', 'The Acquisitions Editor asks for comps for a book of poems. Poetry is not a product category first.', 'The Poetry Editor does not want to talk about readers. A collection that no one finds is a manuscript.'],
  ['DEV_POETRY', 'LINE_COPY', 'The Line Editor fixes the comma I broke on purpose.', 'The Poetry Editor calls every irregularity intent. Sometimes it is just a comma.'],
  ['LINE_COPY', 'DEV_LITERARY', 'The Literary Editor defends a voice that has no rules. A voice is a set of rules the author keeps.', 'The Line Editor wants consistency. A voice that obeys the style sheet is a style sheet.'],
  ['LINE_COPY', 'ORAL_NARRATIVE', 'The Oral-Narrative Editor wants the rhythm of speech kept as written. Readers cannot hear the performance.', 'The Line Editor tidies spoken repetition into prose. The repetition was the structure.'],
  ['PROOFREADER', 'DEV_SERIAL', 'The Serial Editor ships weekly. A typo-free chapter is worth a day.', 'The Proofreader would polish a chapter until the reader moves on.'],
  ['ACQUISITIONS', 'WORLD_LIT', 'The World-Literature Editor says "no comps" as if it were a virtue. A book with no comps needs a very good reason to exist.', 'The Acquisitions Editor reads every book through the market it can already see.'],
  ['ACQUISITIONS', 'READER_ADVOCATE', 'The Reader Advocate is one reader. Do not mistake her mood for demand.', 'The Acquisitions Editor sells to categories. I buy one book at a time.'],
  ['PUB_OPS', 'DEV_LITERARY', 'The Literary Editor shrugs at categories. The wrong category costs a book its readers.', 'The Publishing-Operations Expert reduces a book to its metadata.'],
  ['SENSITIVITY', 'DEV_GENRE', 'The Genre Editor lets stock characters pass because the genre expects them.', 'The Sensitivity Reader flags a trope that the genre has earned its readers with. Flag it, then let the author choose.'],
  ['SENSITIVITY', 'ORAL_NARRATIVE', 'The Oral-Narrative Editor guards a tradition. The author may belong to it, and may be told they cannot write it.', 'The Sensitivity Reader decides who may tell what story. A community, not an outsider, answers that.'],
  ['COPYRIGHT', 'DEV_LITERARY', 'The Literary Editor loves the lyric epigraph. It needs permission, and permission has a price.', 'The Copyright Voice says "cut the quote". A book can grow out of its borrowed lines or be built on them.'],
  ['COPYRIGHT', 'DEV_NARRATIVE_NF', 'The Memoir Editor quotes letters and songs as if memory made them free.', 'The Copyright Voice sees every quotation as an invoice. Some quotation is the point of the book.'],
  ['COPYRIGHT', 'JOURNALISM_ETHICS', 'The Ethics Editor says the public interest decides. Public interest is an ethical test and, at most, a legal argument.', 'The Copyright Voice asks about rights. Ethics asks whether you should, long before the law says you can.'],
  ['JOURNALISM_VERIFY', 'JOURNALISM_ETHICS', 'The Ethics Editor lets a good principle outrun the evidence.', 'The Verification Editor will run a true story that harms an innocent person because it checks out. Verified and ethical are different words.'],
  ['JOURNALISM_VERIFY', 'READER_ADVOCATE', 'The Reader Advocate wants the lede first and the sourcing later. Later never comes.', 'The Verification Editor buries the story under attribution. I want to know what happened.'],
  ['WORLD_LIT', 'READER_ADVOCATE', 'The Reader Advocate cannot sit with a story that does not hurry.', 'The World-Literature Editor calls my impatience a failure of cultural attention. It is also a failure of the page.'],
  ['ORAL_NARRATIVE', 'ACQUISITIONS', 'The Acquisitions Editor wants a tradition compressed to a hook.', 'The Oral-Narrative Editor will keep the telling and lose the audience.'],
];

function buildTensions(): Record<EditorId, Partial<Record<EditorId, string>>> {
  const t = Object.fromEntries(EDITOR_IDS.map(i => [i, {}])) as Record<EditorId, Partial<Record<EditorId, string>>>;
  for (const [a, b, aSays, bSays] of PAIRS) { t[a][b] = aSays; t[b][a] = bSays; }
  return t;
}
const TENSIONS = buildTensions();

export const EDITORS: Record<EditorId, Editor> = Object.fromEntries(EDITOR_IDS.map(id => {
  const l = lens(id);
  return [id, { ...BASE[id], id, name: l.name, medium: l.medium, conviction: l.conviction, challenges: l.challenges, protects: l.protects, tensions: TENSIONS[id] } as Editor];
})) as Record<EditorId, Editor>;
export const EDITOR_LIST: Editor[] = EDITOR_IDS.map(i => EDITORS[i]);

/** Who sits in by default for a kind of text. Always includes a copyright voice and a reader advocate; at least one editor who will disagree. */
export function castEditors(kind: ManuscriptKind, opts: { genre?: string; size?: number; pinned?: EditorId[] } = {}): EditorId[] {
  const size = Math.max(3, Math.min(opts.size ?? 6, EDITOR_IDS.length));
  const genre = (opts.genre || '').toLowerCase();
  const score = (e: Editor): number => {
    let s = e.kinds.includes(kind) ? 2 : 0;
    if (genre && e.genres.some(g => genre.includes(g.split(' ')[0]) || g.includes(genre))) s += 3;
    if (e.id === 'COPYRIGHT' || e.id === 'READER_ADVOCATE') s += 4;
    if (kind === 'ARTICLE' || kind === 'NEWSLETTER') { if (e.id === 'JOURNALISM_VERIFY' || e.id === 'JOURNALISM_ETHICS') s += 6; if (e.id.startsWith('DEV_')) s -= 3; if (e.id === 'ACQUISITIONS' || e.id === 'PUB_OPS') s -= 3; }
    else if (e.id.startsWith('JOURNALISM') && kind !== 'NONFICTION' && kind !== 'MEMOIR') s -= 4;
    return s;
  };
  const chosen: EditorId[] = [...(opts.pinned ?? [])];
  const ranked = [...EDITOR_LIST].sort((a, b) => score(b) - score(a)).map(e => e.id);
  for (const id of ranked) { if (chosen.length >= size) break; if (!chosen.includes(id)) chosen.push(id); }
  // Guarantee a real argument: if nobody in the room is on the other side of anyone, swap in a standing opponent.
  const hasArgument = chosen.some(a => chosen.some(b => a !== b && TENSIONS[a][b]));
  if (!hasArgument && chosen.length > 1) {
    const lead = chosen[0]; const foe = (Object.keys(TENSIONS[lead]) as EditorId[])[0];
    if (foe) chosen[chosen.length - 1] = foe;
  }
  return [...new Set(chosen)];
}

/** The standing arguments actually live in this room, said by both sides. */
export function roomTensions(ids: EditorId[]): Array<{ between: [EditorId, EditorId]; sideA: string; sideB: string }> {
  const out: Array<{ between: [EditorId, EditorId]; sideA: string; sideB: string }> = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]; const sa = TENSIONS[a][b], sb = TENSIONS[b][a];
    if (sa && sb) out.push({ between: [a, b], sideA: sa, sideB: sb });
  }
  return out;
}
