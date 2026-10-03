import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Question descriptors are written with the correct choice FIRST; the builder rotates the choices
// (keeping their cyclic order) so the correct answer lands on a spread-out index.
type MC = { k: 'mc'; level: 1 | 2 | 3; p: string; c: [string, string, string, string]; h: string; e: string };
type TF = { k: 'tf'; level: 1 | 2 | 3; p: string; a: 0 | 1; h: string; e: string };
type QD = MC | TF;
const mc = (level: 1 | 2 | 3, p: string, c: [string, string, string, string], h: string, e: string): MC => ({ k: 'mc', level, p, c, h, e });
const tf = (level: 1 | 2 | 3, p: string, a: 0 | 1, h: string, e: string): TF => ({ k: 'tf', level, p, a, h, e });

const build = (lessonId: string, num: number, qs: QD[]): Question[] =>
  qs.map((d, i) => {
    const n = i + 1;
    const id = `${lessonId}.q${n}`;
    if (d.k === 'tf') return { id, lessonId, kind: 'tf', prompt: d.p, answer: d.a, hint: d.h, explanation: d.e, level: d.level };
    const target = (num * 3 + n * 5) % 4;
    const shift = target; // correct choice starts at index 0
    const rotated = d.c.map((_, j) => d.c[(j - shift + 4) % 4]);
    return { id, lessonId, kind: 'mcq', prompt: d.p, choices: rotated, answer: target, hint: d.h, explanation: d.e, level: d.level };
  });

interface LessonDef { title: string; blurb: string; minutes: number; body: string; qs: QD[] }

const ID = (n: number) => `publishing-business.l${String(n).padStart(2, '0')}`;

const DEFS: LessonDef[] = [
  // ───────── Track 1: Craft ─────────
  {
    title: 'Finding an Idea and a Reader',
    blurb: 'A book starts as an idea but succeeds only when it meets a specific reader.',
    minutes: 9,
    body: `This course is education, not legal or financial advice. Contracts, taxes and copyright rules vary by country and change over time, so check anything that affects your money or rights with a qualified professional.

Every book has two beginnings: an idea and a reader. Ideas are cheap. The hard part is a premise that a particular person would pay for and finish. Professionals therefore ask early: who is this for, and what do they get?

For fiction, a useful test is a one-sentence premise with a protagonist, a want and an obstacle: "A retired lighthouse keeper must hide a stranded smuggler from the harbour inspector before the winter storm closes the bay." For nonfiction, the test is a promise: "After reading this, a new manager will be able to run a 20-minute weekly one-to-one that people look forward to."

Next, define the reader concretely. "Everyone who likes stories" is not a reader. "Adults who enjoy quiet coastal mysteries like the ones in the library's staff picks" is. Look at comparable books, called comps, published in roughly the last five years. They show what the reader already buys, what the shelf expects, and how your book differs.

Worked example: an author lists three comps, notes that all three are about 70,000 words with a cosy tone, and realises her 150,000-word grim draft targets no clear shelf. She can cut, retone or choose a different reader. Deciding this before drafting saves months of rework.`,
    qs: [
      tf(1, `A comp (comparable title) is a recent, similar book used to show who the reader is and where your book fits.`, 0, `Think about how agents and booksellers describe a book to others.`, `Comps show the existing audience and market position, which is why agents and editors ask for them.`),
      mc(2, `An author says her nonfiction book is "for anyone who wants to be happier." Which revision best defines a reader?`, [`First-time managers who want a simple weekly one-to-one routine`, `Working adults who want to improve their general wellbeing`, `Readers who enjoy self-help books and motivational speaking`, `People interested in leadership and workplace culture topics`], `Look for a person you could picture and find.`, `A specific reader with a specific problem makes the book findable and the promise testable.`),
      mc(2, `A novelist's three best comps are all about 70,000 words, but her draft is 150,000 words. What is the most useful conclusion?`, [`Her length is far outside the shelf norm, so she should consider cutting or choosing a different audience`, `Her draft is a strong fit because longer books give readers better value for money`, `She should keep the length and simply add a cosy tone to match the three comps`, `The comps are too similar to each other, so they say nothing about her draft length`], `Compare the draft to what the reader already buys.`, `Large gaps from comparable books signal a possible mismatch with reader expectations.`),
      mc(3, `Why is a one-sentence premise (protagonist, want, obstacle) useful BEFORE drafting?`, [`It tests whether the story has a clear engine and can be described to a reader`, `It replaces the need to write the book by fixing every plot choice`, `It is required by registration offices before copyright can apply`, `It lets the author skip comps because the premise proves a market`], `What can you check cheaply before spending months?`, `A premise exposes a missing want or obstacle early, when fixing it is cheap.`),
      mc(3, `Which is the weakest statement of a nonfiction promise?`, [`This book covers many topics related to work.`, `After reading, you can run a 20-minute weekly one-to-one.`, `You will build a one-page budget in an afternoon.`, `You will be able to write a clear project brief.`], `A strong promise names something the reader can do.`, `Vague coverage is not a promise; the others each name a concrete outcome.`),
    ],
  },
  {
    title: 'Structure: Fiction and Nonfiction',
    blurb: 'Stories run on change and stakes; nonfiction runs on a promise and a logical path.',
    minutes: 10,
    body: `Structure is the order in which a reader receives your material. Readers rarely notice good structure but always feel bad structure as boredom or confusion.

Fiction is usually built on a character who wants something, meets rising obstacles, and changes. A common shape is three acts: setup (the world and the want), confrontation (complications that escalate), and resolution (a climax and its consequence). Plot points mark turns: an inciting incident that starts the problem, a midpoint that shifts what the character believes, and a low point before the climax. These are tools, not laws; many strong books bend them. Whatever the shape, each scene should change something, and stakes should rise.

Nonfiction usually runs on a promise and a path. The introduction states the problem and the outcome. Each chapter does one job, often building on the previous one, and ends by pointing forward. Narrative nonfiction (memoir, history) borrows story structure; prescriptive nonfiction (how-to) often uses a framework, a repeated pattern such as problem, principle, example, exercise.

Worked example: a 60,000-word thriller might place the inciting incident near 10 percent (word 6,000), the midpoint near 50 percent (30,000) and the climax near 85 to 90 percent (about 51,000 to 54,000). If the inciting incident arrives at word 25,000, the first act is far too slow for that genre.

A reverse outline, listing what each finished scene or chapter actually does, shows where structure sags.`,
    qs: [
      mc(1, `In a three-act structure, what usually happens in the middle act?`, [`Complications and obstacles escalate`, `The central character is introduced and the world is set up for the reader`, `The climax resolves and the consequences are shown to the reader`, `The author reveals the ending to hint at what is coming soon`], `The word to think about is confrontation.`, `Act two is where obstacles rise and stakes increase.`),
      mc(2, `Using the lesson's rule of thumb, a 60,000-word thriller places its inciting incident at 10 percent. At which word does it occur?`, [`6,000`, `600`, `10,000`, `16,000`], `Ten percent is one tenth.`, `60,000 x 0.10 = 6,000.`),
      mc(2, `By the lesson's beat-sheet guideline, a 60,000-word novel has its midpoint at 50 percent. A draft's midpoint falls at word 42,000. What is the best conclusion?`, [`The turn arrives late (70 percent), so the middle may sag or the pacing needs rebalancing`, `It is on target, since the midpoint of a novel can fall anywhere in the second half`, `The turn arrives early (30 percent), so the first act is likely too short for the genre`, `Midpoints are only needed in screenplays, so the position of the turn does not matter`], `Divide 42,000 by 60,000.`, `42,000 / 60,000 = 70 percent, well after the midpoint, suggesting a slow first half.`),
      mc(3, `Why is a reverse outline helpful during revision?`, [`It lists what each scene or chapter actually does, exposing sags and repeats`, `It plans the book before any writing begins, so that no scenes are wasted`, `It checks spelling and grammar across the finished manuscript, scene by scene`, `It replaces the need for beta readers by showing how real readers would react`], `It is made from the finished draft, not the plan.`, `Summarising what is on the page reveals where the structure fails.`),
      mc(3, `Which chapter plan best fits a prescriptive nonfiction book?`, [`Each chapter states a problem, teaches a principle, gives an example and ends with an exercise`, `Each chapter retells the introduction with new anecdotes so the reader remembers the topic`, `Chapters are arranged by length, shortest first, so that readers build up stamina gradually`, `One long narrative with no repeated pattern, so the argument feels like a story, not a lesson`], `Think of a repeatable pattern that serves the reader.`, `A repeated framework gives readers a predictable path to the promised outcome.`),
    ],
  },
  {
    title: 'Drafting Habits That Finish Books',
    blurb: 'Finished manuscripts come from schedules, targets and a rule against editing while drafting.',
    minutes: 8,
    body: `Many unfinished books fail not from lack of talent but from lack of a system. Professionals treat drafting as a repeatable habit with a measurable target.

Start with arithmetic. A typical adult novel runs roughly 70,000 to 100,000 words, though genres differ. If you aim for an 80,000-word first draft and write 500 words a day, five days a week, you produce 2,500 words a week. Dividing 80,000 by 2,500 gives 32 weeks, a little over seven months. Raise the target to 1,000 words on those days and the draft takes 16 weeks. Knowing the number turns a vague wish into a plan.

Protect a fixed time and place. Short daily sessions beat occasional marathons because the story stays alive in your head. Stop mid-scene when you can, so that tomorrow's start is easy. Keep a running log of word counts; visible progress motivates.

The most important rule is to separate generating from judging. The first draft's job is to exist. Editing each sentence as you go slows you down and kills momentum. If you spot a problem, leave a bracketed note such as [fix timeline] and keep moving. Revision comes later, when you have a whole to judge.

Plan for the stuck days: change scenes, write dialogue only, or outline the next three beats. A messy finished draft can be improved; an unfinished perfect page cannot.`,
    qs: [
      mc(1, `What is the main job of a first draft?`, [`To exist, so there is a whole manuscript to revise`, `To be polished enough to send out right away`, `To prove the premise works by being as close to final as possible`, `To be proofread and typeset so that revision can be skipped later`], `Think about what you cannot revise.`, `You can only improve a complete draft; polish comes in revision.`),
      mc(2, `An author writes 500 words a day, 5 days a week. How many words is that per week?`, [`2,500`, `500`, `3,500`, `1,500`], `Multiply daily words by working days.`, `500 x 5 = 2,500 words per week.`),
      mc(2, `Using that pace (2,500 words a week), how many weeks does an 80,000-word draft take?`, [`32`, `16`, `40`, `160`], `Divide the target by the weekly output.`, `80,000 / 2,500 = 32 weeks.`),
      mc(3, `Why leave a bracketed note like [fix timeline] instead of fixing it immediately?`, [`It protects momentum while keeping a record of the problem`, `It is a rule that editors require before accepting drafts`, `It lets the printer find pages that need redoing later`, `Notes become footnotes in the final book for the reader`], `Consider what constant fixing does to flow.`, `Notes separate generating from judging, so the draft keeps moving and the issue is not lost.`),
      mc(3, `Which routine is most likely to finish a book?`, [`A short, fixed daily session with a tracked word count`, `Waiting for inspiration before starting each session`, `One twelve-hour session every few months`, `Rewriting chapter one until it is perfect`], `Look for repeatability.`, `Consistent small sessions keep the story active and progress measurable.`),
    ],
  },
  {
    title: 'Revision and Self-Editing',
    blurb: 'Revise in passes, from big structure down to sentences, and only then polish.',
    minutes: 10,
    body: `Revision is where a draft becomes a book. The key principle is to work from large to small. Fixing commas in a chapter you will later cut wastes effort.

Pass one is the big picture. Let the draft rest, ideally a few weeks, then read it as a reader. Ask: does the premise deliver, does the structure work, are any characters or sections unnecessary, does the ending pay off the opening? Make structural changes now: move, merge, cut, add.

Pass two is scenes and chapters. Does each have a purpose, a change and an end that pulls the reader on? Trim the openings and endings that linger. Pass three is the sentence level: cut filler words and repeated tics, replace vague verbs, vary rhythm, check dialogue by reading it aloud. Pass four is mechanical: spelling, grammar, consistency of names and facts. Do this last.

Self-editing tricks:
- change the font or print the pages to see the text freshly
- read aloud or use text-to-speech to catch clumsy phrasing
- keep a style sheet listing character names, spellings and timeline so that facts stay consistent.

Worked example: an author cuts a 90,000-word draft by 10 percent in revision. Ten percent of 90,000 is 9,000, leaving 81,000 words. Cutting does not mean losing quality; it usually removes repetition that slowed the story.

Self-editing has limits. You know what you meant, so you read what you meant. That is why most professional books also use outside editors.`,
    qs: [
      mc(1, `In a sensible revision order, what comes first?`, [`Big-picture structure and content`, `Comma fixes across the draft`, `Spell-checking and consistency of names across all chapters`, `Choosing fonts and layout for the final printed pages`], `Work from large to small.`, `Structural problems must be solved before polishing sentences.`),
      mc(2, `An author cuts 10 percent from a 90,000-word draft. What is the new length?`, [`81,000`, `80,000`, `89,000`, `9,000`], `Find ten percent first, then subtract.`, `10 percent of 90,000 is 9,000; 90,000 - 9,000 = 81,000.`),
      mc(2, `An author discovers that a character's eye colour changes between chapters. Which tool prevents this?`, [`A style sheet recording names, spellings and facts`, `A bigger font for easier reading`, `Skipping the structural pass to save time before the polish`, `A longer title that signals the genre and the setting more clearly`], `Think of a reference list.`, `A style sheet is a running record that keeps facts consistent across the manuscript.`),
      mc(3, `Why is proofreading typos before deciding whether to cut a chapter inefficient?`, [`The chapter may be removed, so the polish work is wasted`, `Typos are fixed automatically by the printer anyway`, `Proofreading cannot start until an agent has signed off`, `Only an editor may cut chapters, never the author`], `Order the passes by scope.`, `Polishing material you later delete wastes effort; do structural decisions first.`),
      mc(3, `What is the main limitation of self-editing?`, [`Authors tend to see what they meant rather than what is on the page`, `Self-editing is too expensive for most authors to attempt`, `It tends to remove the voice and leave generic prose`, `It cannot catch plot problems, only spelling mistakes`], `Think about familiarity with your own text.`, `Familiarity makes errors invisible, which is why outside readers and editors add value.`),
    ],
  },

  // ───────── Track 2: Editors, Readers and Genre ─────────
  {
    title: 'The Four Kinds of Editing',
    blurb: 'Developmental, line, copy and proof are different jobs done at different stages.',
    minutes: 10,
    body: `People say "editing" as if it were one service, but professionals divide it into stages that are done in order.

Developmental (or structural) editing addresses the whole book: premise, plot or argument, pacing, character, organisation, what to cut or add. It comes first, on a complete draft, and may suggest big rewrites. Line editing works at the level of prose: clarity, voice, rhythm, word choice, awkward paragraphs. Copyediting corrects grammar, spelling, punctuation and usage, checks consistency and facts against a style sheet, and flags questions. Proofreading is the last check on the typeset pages, catching leftover typos and formatting slips; it does not rewrite.

Order matters. Proofreading a manuscript that is about to be restructured is wasted money. Services overlap, so ask any editor exactly what they include and request a sample edit.

Working with an editor: expect a written letter or comments, then your decisions. You are not obliged to accept every suggestion, but consider the reason behind each one. Respond to the problem, not just the proposed fix. In traditional publishing, the house provides editors at no charge to the author; in self-publishing the author normally hires freelancers, with fees varying widely by length and level of work.

Worked example: an author hires a copyeditor for a book that still has a weak middle. The copyeditor tidies sentences, but a reviewer later criticises the pacing. The developmental stage was skipped, and no copyedit can fix it.

Beware of paying a "publisher" for editing as a condition of publication; that pattern is discussed in a later lesson.`,
    qs: [
      mc(1, `Which stage is the LAST check on typeset pages?`, [`Proofreading`, `Developmental editing, which restructures the whole book`, `Line editing, which refines the voice and rhythm of sentences`, `Premise testing, which checks the idea against comparable books`], `It comes after layout.`, `Proofreading catches errors left on the typeset proofs and does not restructure.`),
      mc(2, `An author wants advice on reordering chapters and fixing a sagging middle. Which service fits?`, [`Developmental editing`, `Proofreading of the typeset pages`, `Copyediting for grammar and consistency`, `Barcode and cover design for retail`], `The problem is structural.`, `Developmental editors address pacing, structure and organisation.`),
      mc(2, `An editor's letter says a subplot slows the book and suggests cutting it. The author feels the proposed cut is wrong. A sound response is:`, [`Consider the underlying pacing problem and solve it, perhaps differently`, `Accept every suggestion exactly as written, since editors know best`, `Ignore the letter, because editors cannot know the book as well`, `Hire a proofreader instead to confirm the subplot is fine as is`], `Separate the problem from the suggested fix.`, `Authors decide, but they should address the problem the editor identified.`),
      mc(3, `Why is hiring a copyeditor before a developmental edit usually wasteful?`, [`Polished sentences may be cut or rewritten when the structure changes`, `Copyeditors lack training to work before structure is fixed`, `Copyediting is rarely offered before printing begins`, `Developmental editors only fix typos, so order makes no difference`], `Think about order of operations.`, `Large structural changes undo sentence-level work, so finer stages come later.`),
      mc(3, `Which request is the best way to compare two freelance editors?`, [`A sample edit of the same few pages and a clear list of what each service includes`, `Choosing the cheapest quote, since all editors offer the same services under one name`, `Choosing the editor whose website lists the most services and the longest client list`, `Asking only for testimonials from past clients and deciding on those alone`], `Look for like-for-like evidence.`, `Samples and scoped service lists reveal what you actually get, since terminology overlaps.`),
    ],
  },
  {
    title: 'Beta Readers and Feedback',
    blurb: 'Beta readers show how real readers experience the draft, if you ask the right questions.',
    minutes: 8,
    body: `Beta readers are volunteers (sometimes paid) from your target audience who read a nearly finished draft and report their experience as readers. Unlike editors, they are not asked to fix the book; they tell you where they got lost, bored, confused or moved.

Timing: use beta readers after your own revisions and before final editing, when the draft is complete enough to read straight through but still changeable. Choose readers who actually like your genre; a reader of historical romance is the wrong judge of a hard science fiction novel. Aim for several, perhaps five to eight, so you can see patterns.

Ask specific questions instead of "Did you like it?" For example: Where did you first feel bored? Which character did you care about least? What did you expect to happen that did not? Was anything confusing? Did the ending satisfy you? A short form or a few chapter-end check-ins gives you comparable answers.

Reading feedback is a skill. One reader's taste is an opinion; the same problem noted by several readers is data. Worked example: of six beta readers, four stall in the same chapter and two do not mention it. Four of six is two thirds, a strong signal that the chapter needs work. Meanwhile, one reader dislikes the cover colour and nobody else mentions it: note it, but do not act yet.

Thank your readers, give them a deadline, and avoid defending the book in the moment. Your task is to listen, then decide. Do not share a manuscript without agreeing expectations about keeping it private.`,
    qs: [
      mc(1, `When are beta readers most useful?`, [`After your own revisions, before final editing`, `Before the first chapter is written`, `After the book has been printed`, `Only once an agent has requested changes`], `The book must be readable but still changeable.`, `A complete, revised draft can be read straight through while changes remain cheap.`),
      mc(2, `Of 6 beta readers, 4 stall at the same chapter. What fraction is that, and what should you conclude?`, [`Two thirds; a strong signal to examine that chapter`, `One third; a minor issue`, `Half; inconclusive, so wait for more readers before concluding`, `One sixth; likely a difference in taste, not a problem with the chapter`], `Reduce 4 over 6.`, `4/6 = 2/3, enough agreement to treat the chapter as a likely problem.`),
      mc(2, `One reader of eight dislikes your main character's name; the other seven do not mention it. Best action?`, [`Note it but do not change it unless more evidence appears`, `Rename every character at once`, `Cancel the release until all eight readers agree on the name list`, `Drop that reader from the group because their opinion is out of step`], `One voice among eight is weak evidence.`, `A single reaction is an opinion; patterns across readers are what justify changes.`),
      mc(3, `Which question produces the most useful beta-reader feedback?`, [`Where did you first feel bored or confused?`, `Did you like it?`, `Is the book good enough that you would recommend it to a friend?`, `How would you rate the book out of ten, and why that number?`], `Specific beats general.`, `Specific questions draw out where the experience broke, which can be compared across readers.`),
      mc(3, `Why choose beta readers who enjoy the book's genre?`, [`They hold the genre's expectations and can say whether the book meets them`, `They are cheaper to recruit because they read for free and rarely need follow-up`, `They tend to give only positive comments, which keeps the author motivated`, `Genre is irrelevant to feedback, since any reader can judge pacing equally well`], `Match reader to target audience.`, `Feedback is only useful from people who resemble the intended readers.`),
    ],
  },
  {
    title: 'Genre and Category Conventions',
    blurb: 'Genres are promises to readers about length, tone, structure and ending.',
    minutes: 9,
    body: `A genre is a contract with the reader. Someone who picks up a romance expects a central love story and a satisfying ending; a mystery reader expects a puzzle that is fairly solved. Break the promise and readers feel cheated, however good the prose.

Conventions cover several areas. Length: genres have typical word counts, and debut manuscripts far outside them are harder to place. Tone and content: a cosy mystery avoids graphic violence, while a thriller leans on pace. Structure: romance centres on the relationship arc; fantasy readers expect worldbuilding that is consistent. Ending: romance traditionally promises a happy ending, and crime fiction usually resolves the central question.

Publishing also uses categories, the shelf or subject label under which a book is filed and sold, such as fiction/mystery/cozy. Categories are distinct from genre as a craft concept: they steer where a bookseller shelves the book and where an online store lists it. Age category matters too: children's, middle grade, young adult and adult books differ in protagonist age, themes and length. Picture books, for example, are very short compared with novels.

You can innovate, but knowingly. Worked example: an author writes a "cosy mystery" in which the detective dies and the culprit escapes. Readers who bought the label for a gentle puzzle may feel betrayed. The author could instead position it as literary crime, which has different expectations. Choosing the label shapes everything from cover to marketing.

Check typical lengths and conventions in recent comps rather than guessing, because norms shift over time.`,
    qs: [
      mc(1, `What does it mean to call a genre a promise to the reader?`, [`Readers expect certain elements, such as tone or ending, from the genre`, `Authors must follow a legal formula and cannot write anything new`, `Only booksellers read genre rules, so readers are unaffected`, `A genre is a legal agreement between author and retailer on price`], `Think of expectations.`, `Readers pick a genre for specific experiences; failing to deliver them feels like a broken promise.`),
      mc(2, `A manuscript labelled as cosy mystery ends with the detective's death and the culprit escaping. What is the risk?`, [`Readers of the label may feel cheated because it breaks genre expectations`, `None, because labels do not matter to readers`, `The book would lose its copyright protection for failing to follow the genre`, `The book cannot be printed or listed in any category until the ending is changed`], `Compare the ending to what the label promises.`, `Cosy readers expect a fair, satisfying solution; breaking it without repositioning risks disappointment.`),
      mc(2, `A debut novel is far longer than the usual range for its genre. Which step is wisest?`, [`Check recent comps and consider trimming or repositioning`, `Ignore the norm, since debuts are judged on chapter one`, `Double the length to make a series look bigger`, `Remove the genre label and hope nobody notices`], `Look at the market.`, `Typical lengths guide acceptable ranges; adjusting or repositioning can improve the book's chance.`),
      mc(3, `How does a retail category differ from a craft genre?`, [`A category is the label that decides where a book is shelved or listed for sale`, `A category is a chapter heading that divides the book into sections for readers`, `A category is the legal right to sell a book within a defined territory`, `They are identical terms, because a genre and a category always mean the same`], `One steers shelving and search.`, `Categories help sellers file the book; genre describes the reading experience and conventions.`),
      mc(3, `Why do age categories (middle grade, young adult, adult) matter to authors?`, [`They shape protagonist age, themes, length and where the book is marketed`, `They only affect the font size and the page layout used in the printed book`, `They decide how long copyright lasts for the book in each age group`, `They are mostly irrelevant to readers, who ignore the age labels when buying`], `Think of audience and content.`, `Age categories set expectations about content, style and length for readers and gatekeepers.`),
    ],
  },

  // ───────── Track 3: Traditional Publishing, Small Presses ─────────
  {
    title: 'Query Letters and Book Proposals',
    blurb: 'The query pitches a finished novel; the proposal sells a nonfiction book before it is written.',
    minutes: 10,
    body: `Traditional submission has two standard documents.

A query letter is a one-page pitch to a literary agent, usually for a finished novel or memoir. It typically has three parts:
- a hook paragraph that conveys protagonist, goal and stakes
- a short book paragraph with genre, word count and comparable titles
- and a brief author bio with relevant credentials.

Keep it professional and specific. Follow each agent's submission guidelines exactly, since they often ask for a query plus a sample of pages, and personalise by explaining why you chose that agent. Never claim a book is "the next bestseller", and avoid listing your family's praise.

A book proposal is used mainly for nonfiction and is typically submitted before the book is complete. It usually contains an overview, a market analysis (who will buy it and why), a competitive-titles section, a marketing and platform section (your reach and plan), an annotated chapter outline, an author bio, and sample chapters. A proposal is a business plan for the book, so the platform section matters in a way it does not in fiction.

Fiction is generally sold on the complete manuscript for a first-time author; nonfiction on a proposal and samples. Worked example: a nonfiction author with a 12-chapter plan submits a proposal with three sample chapters. If each of the 12 planned chapters is 5,000 words, the book will be 60,000 words, a figure the proposal should state so that the editor can judge the scope.

Legitimate agents do not charge fees to read a query; see the agent lesson for details.`,
    qs: [
      mc(1, `What is a query letter?`, [`A one-page pitch sent to an agent or editor`, `A signed contract with an agent`, `A tax form reporting royalties`, `A final manuscript ready for typesetting`], `It is short and sent first.`, `Queries are brief professional pitches used to ask an agent to read more.`),
      mc(2, `A nonfiction proposal outlines 12 chapters of about 5,000 words each. What total word count should it state?`, [`60,000`, `17,000`, `50,000`, `6,000`], `Multiply chapters by words.`, `12 x 5,000 = 60,000 words.`),
      mc(2, `An agent's guidelines request a query plus the first 10 pages pasted in the email body. A writer sends a full attachment of 300 pages. What is the best judgement?`, [`The writer ignored the guidelines, which signals poor professionalism`, `That is ideal, because more pages show confidence`, `Guidelines are only suggestions, so a full file is best`, `The agent must read all 300 pages once they are sent`], `Think about following instructions.`, `Following each agent's submission instructions is a basic professional expectation.`),
      mc(3, `Why does a nonfiction proposal include a platform and marketing section?`, [`Publishers judge whether the author can reach readers, since the book is sold before it is written`, `It is optional decoration, because publishers choose books only on the strength of the sample chapters alone`, `It replaces the chapter outline, because publishers want reach more than structure`, `It sets the copyright term, which depends on how large the author's audience is`], `Consider the business risk for the publisher.`, `A proposal is a business case; author reach and plans help show the book can sell.`),
      mc(3, `Which opening line of a query is strongest?`, [`When a lighthouse keeper hides a smuggler, the harbour inspector's suspicion threatens both their lives.`, `My novel is the best thriller you will read this year and will be the next bestseller for sure.`, `I have always loved writing, and my family says this is the best story they have ever read, so I hope you agree.`, `My book is a 90,000-word novel that I believe has everything an agent could want in a bestseller.`], `Look for protagonist, goal and stakes.`, `A good hook shows who wants what and what is at risk, instead of making claims.`),
    ],
  },
  {
    title: 'Literary Agents and What They Do',
    blurb: 'Agents sell your book to publishers, negotiate the contract and are paid only by commission.',
    minutes: 9,
    body: `A literary agent represents an author to publishers. Large publishers often accept submissions only through agents, so an agent frequently opens the door. The agent's work includes:
- judging and sometimes editing a manuscript before it goes out
- pitching it to suitable editors
- negotiating the advance, royalties, rights and other terms
- checking royalty statements
- chasing payments
- and managing subsidiary rights such as foreign or audio licences.

Agents also give career advice.

How agents are paid matters. Reputable agents work on commission, commonly around 15 percent of domestic sales and often more for foreign sales sold with a sub-agent, though terms vary. They are paid only when you are. The Association of Authors' Representatives (AAR) canon of ethics prohibits members from charging reading or evaluation fees, and author-advocacy groups such as Writer Beware warn authors to be suspicious of anyone asking for upfront fees. Money should flow from the publisher to the agency, which then pays the author their share.

Worked example: an agent sells a book with a 12,000 dollar advance at 15 percent commission. The agent keeps 12,000 x 0.15 = 1,800 dollars, and the author receives 10,200 dollars (usually paid in instalments, as the next lessons explain). The agent's commission applies to later royalties too.

Before signing an agency agreement, read it: check commission, term, what happens if you part ways, and which works are covered. Ask existing clients about the agent's record, and check where deals have been announced. A good agent is selective; an offer of representation from someone who charges fees should prompt caution.`,
    qs: [
      tf(1, `A reputable literary agent charges a reading fee before considering your manuscript.`, 1, `Think about how legitimate agents are paid.`, `Reputable agents work on commission, and the AAR canon prohibits reading and evaluation fees.`),
      mc(2, `A book sells for a 12,000 dollar advance and the agent commission is 15 percent. How much does the author receive before taxes?`, [`10,200 dollars`, `1,800 dollars`, `11,850 dollars`, `10,800 dollars`], `Compute 15 percent, then subtract.`, `12,000 x 0.15 = 1,800 commission; 12,000 - 1,800 = 10,200.`),
      mc(2, `An agent offers to represent you if you first pay 500 dollars for a manuscript assessment. The best response is:`, [`Be cautious: this is a recognised warning sign, so verify the agent's sales record`, `Pay at once, since assessments are standard and the fee is deductible from commission`, `Sign at once, because agents who charge fees are the most selective in the business`, `Ask for a larger fee in return so that the agency has a stake in your success`], `Recall how legitimate agents earn.`, `Upfront fees are a red flag that advocacy groups warn about; reputable agents earn commission on sales.`),
      mc(3, `Beyond selling the manuscript, which agent task most directly protects an author later?`, [`Checking royalty statements and negotiating contract terms`, `Designing the cover and typesetting the interior`, `Printing books and delivering them to bookshops`, `Registering the ISBN and the copyright`], `Think of ongoing money and rights.`, `Agents scrutinise contracts and statements, which is where authors can lose money or rights.`),
      mc(3, `Why should an author read the agency agreement's termination clause?`, [`It governs what happens, and who is paid, if the relationship ends`, `It sets the cover price and the retail discount for each print edition`, `It decides the genre label under which the agent pitches the book`, `It registers the copyright in the author name at the national office`], `Think about leaving.`, `Termination terms decide how long commissions continue and which deals the agent keeps rights to.`),
    ],
  },
  {
    title: 'Traditional Publishing Economics',
    blurb: 'Advances, royalties and earn-out explained with a worked example.',
    minutes: 12,
    body: `In a traditional deal the publisher pays for editing, design, printing and distribution, and takes on the financial risk. In return it licenses certain rights from the author and pays in two ways.

An advance is money paid up front, often in instalments (for example on signing, on delivery of the manuscript and on publication). It is an advance against royalties, not a gift: the publisher recoups it from your earnings. Normally you do not repay an advance if the book fails to earn it out, unless you breach the contract. Royalties are a percentage of sales, calculated on either list price or net receipts depending on the contract, and the percentage varies by format. Terms differ widely, so treat any figure as an example only.

Earn-out means your royalties have repaid the advance; after that you receive royalty cheques. Publishers usually keep a reserve against returns, because bookstores can return unsold copies, so statements may withhold part of the earnings for a time.

Worked example (illustrative numbers). A hardcover lists at 20 dollars. The contract pays 10 percent of list, so each copy earns 2 dollars. The advance is 10,000 dollars, so it earns out at 10,000 / 2 = 5,000 copies. If 3,000 copies sell, royalties are 6,000 dollars, the book is not earned out, and no further royalties are paid, but the author keeps the 10,000. If 8,000 copies sell, royalties are 16,000 dollars, and the author receives 16,000 - 10,000 = 6,000 dollars beyond the advance (before the agent's 15 percent commission).

Rights not granted to the publisher are reserved to the author, which is why the contract lesson matters.`,
    qs: [
      mc(1, `What is an advance?`, [`Money paid up front that the publisher recoups from your royalties`, `A gift from the publisher with no connection to later sales or royalties`, `A loan with interest that the author must repay on a fixed schedule`, `A printing fee paid by the author before production can begin`], `Think "advance against" something.`, `An advance is an up-front payment against future royalties; it is generally not repaid if the book fails to earn out.`),
      mc(2, `A book earns 2 dollars per copy in royalties and the advance is 10,000 dollars. How many copies must sell to earn out?`, [`5,000`, `2,000`, `10,000`, `20,000`], `Divide advance by per-copy royalty.`, `10,000 / 2 = 5,000 copies.`),
      mc(2, `Using the same terms (2 dollars per copy, 10,000 dollar advance), 8,000 copies sell. What royalty cheque beyond the advance does the author get, before agent commission?`, [`6,000 dollars`, `16,000 dollars`, `10,000 dollars`, `2,000 dollars`], `Total royalties minus advance.`, `8,000 x 2 = 16,000; 16,000 - 10,000 = 6,000.`),
      mc(3, `Only 3,000 copies sell on those terms. What is true?`, [`Royalties of 6,000 dollars fall short of the advance, and the author normally keeps the full advance`, `The author must repay the 4,000 dollar shortfall to the publisher, since the advance exceeded earned royalties`, `The author receives an extra 6,000 dollars on top of the advance, since royalties were earned`, `The contract becomes void because the book failed to earn out the advance within one year`], `Compare earned royalties to advance, then recall repayment rules.`, `3,000 x 2 = 6,000, below 10,000; the book is unearned, but advances are generally non-returnable absent breach.`),
      mc(3, `Why may statements hold back part of earnings for a time?`, [`Retailers can return unsold copies, so publishers keep a reserve against returns`, `Authors owe it as income tax that the publisher withholds before each payment is made`, `It pays for the cover design and production costs that the publisher advanced`, `It is a penalty charged when the book is delivered after the agreed date`], `Think of bookshop returns.`, `Returns reduce net sales, so contracts often allow a reserve against returns.`),
    ],
  },
  {
    title: 'Small Presses, Hybrid Models and Vanity Traps',
    blurb: 'How to tell a real small press from a service that profits from authors, not readers.',
    minutes: 10,
    body: `Between the big publishers and going alone lie small and independent presses. Many are excellent: they may accept submissions without an agent, pay modest advances or none, and offer care and focus that a large house cannot. Check their record: do they have distribution, are their books reviewed and in libraries or bookstores, and do their authors speak well of them?

A hybrid publisher shares costs or asks the author to contribute. Some hybrid models are transparent: they sell a defined set of services, the author keeps control of rights and a large royalty share, and the company is selective. Others are vanity presses, which make their money from author fees instead of book sales. Advocacy groups such as Writer Beware (run by the SFWA) and the Authors Guild warn about the same red flags: upfront fees presented as a "publishing package"; pressure to sign quickly; vague descriptions of costs; claims of selectivity when nearly everyone is accepted; a minimum number of copies the author must buy; rights grabbed for a long time with no easy reversion; and no real distribution beyond the company's own website.

Worked example: a company offers a 4,000 dollar package including cover, "editing" and distribution, then takes a 50 percent royalty and 7 years of exclusive rights. If total sales revenue to the author is only 800 dollars, the author is 3,200 dollars behind before counting their time. A traditional publisher would instead pay for production.

Checks:
- search the company's name with "complaints" and "Writer Beware"
- ask for author references
- read the contract with a lawyer or the Authors Guild's review services
- ask where the books are actually sold.

Pay-to-play is not illegal, but it should be a clear, informed choice, not a disguised sale.`,
    qs: [
      mc(1, `What is the defining feature of a vanity press?`, [`It earns its money mainly from author fees rather than book sales`, `It publishes only poetry in very small print runs`, `It is free to authors and takes a share of royalties`, `It pays large advances but keeps the copyright forever`], `Follow the money.`, `Vanity presses profit from authors, so they have little incentive to sell books.`),
      mc(2, `A company charges 4,000 dollars and the author earns only 800 dollars in sales revenue. What is the author's net position, ignoring time?`, [`Down 3,200 dollars`, `Up 800 dollars`, `Down 4,800 dollars`, `Break even`], `Subtract revenue from cost.`, `800 - 4,000 = -3,200 dollars.`),
      mc(2, `Which clause is a red flag in a publishing contract?`, [`A minimum number of copies the author must buy`, `A clear reversion clause`, `A stated royalty rate on both print sales and ebook sales`, `A defined delivery date for the manuscript and the final proofs`], `Think about who profits.`, `Forcing authors to buy copies is a recognised sign of a vanity or predatory model.`),
      mc(3, `A publisher claims to be highly selective, but a writer sees it accepts nearly every submission within a day. What does that suggest?`, [`The selectivity claim may be false and revenue may depend on author fees`, `The press is an elite house confident in its picks`, `The writer is a genius whose work beats most submissions`, `The writer is unusually talented, hence the quick yes`], `Compare claims with behaviour.`, `Quick acceptance of almost all manuscripts conflicts with selectivity and is a vanity warning sign.`),
      mc(3, `What makes a hybrid publisher acceptable rather than predatory?`, [`Transparent services and costs, author-friendly rights terms, selectivity and real distribution`, `A glossy website, professional-looking sample covers and a long list of package services`, `A long contract that covers every possible situation in great legal detail`, `A famous founder who appears often at conferences and in the publishing media`], `Look for transparency and results.`, `Clear terms, rights control and real sales channels separate honest hybrids from disguised vanity services.`),
    ],
  },

  // ───────── Track 4: Self-Publishing ─────────
  {
    title: 'Self-Publishing: Formats, Design and ISBNs',
    blurb: 'Choose formats, invest in cover and interior, and understand what an ISBN is.',
    minutes: 11,
    body: `Self-publishing means you act as the publisher: you commission editing, design and formatting, then upload files to printers and retailers and you keep the rights and the revenue.

Formats include ebook (commonly EPUB, a reflowable format), paperback, hardcover and audiobook. Each is a separate product with its own file and price. The interior is the typeset text: trim size, margins, fonts, chapter openers, front and back matter. The cover is your most important marketing asset: it should signal genre at thumbnail size, with a legible title. Print covers also need a spine and back cover sized to your page count. Hire professionals unless you have the skills; readers judge quickly.

An ISBN (International Standard Book Number) is a 13-digit identifier for a specific edition of a book, used by retailers, libraries and distributors to track it. In the United States, ISBNs are sold through Bowker (myidentifiers.com); in many other countries a national agency assigns them, sometimes for free. Each format needs its own ISBN: paperback, hardcover, ebook and audiobook are different editions, and a substantially revised edition should also get a new one. If you buy your own ISBN, you are listed as publisher of record; free ISBNs supplied by a platform may list the platform instead and may limit where the book can be distributed. ISBNs are not copyright and do not protect your work; some retailers sell ebooks without one, but print distribution generally requires it. Check current policies, as they change.

Worked example: an author releasing a paperback, a hardcover, an ebook and an audiobook needs four ISBNs, one per format.`,
    qs: [
      mc(1, `What is an ISBN?`, [`A 13-digit identifier for a specific edition of a book`, `A copyright registration number`, `A sales-tax number that retailers must show on every printed copy`, `A cover design standard that sets the trim size and the spine width`], `It identifies editions for the trade.`, `ISBNs help retailers and libraries identify an edition; they do not protect copyright.`),
      mc(2, `An author releases a paperback, hardcover, ebook and audiobook, each with its own ISBN. How many ISBNs are needed?`, [`4`, `1`, `2`, `3`], `One per format.`, `Each format is a separate edition and needs its own ISBN.`),
      mc(2, `A print cover needs a spine. What determines the spine width?`, [`The page count and paper type`, `The length of the author name and the title printed on it`, `The ISBN assigned to that edition and the barcode size`, `The list price and the wholesale discount offered to retailers`], `Think about how thick the book is.`, `Spine width depends on the thickness of the interior pages, so it varies with page count and paper.`),
      mc(3, `Which statement about ISBNs is correct?`, [`An ISBN identifies an edition but does not give copyright protection`, `Buying an ISBN registers your copyright`, `An ISBN transfers the publishing rights to the agency that issued the number`, `One ISBN covers every format, so ebook and print share the same number`], `Separate identification from legal rights.`, `Identifiers aid trade tracking; copyright arises from creation and is separate.`),
      mc(3, `Why does cover design matter so much for thumbnails online?`, [`Readers judge genre and quality in a glance, so the title must be legible and the style on-genre`, `Covers are required by copyright law, so they must carry the author name in large type`, `Thumbnails are printed in the retailer catalogue, so the colours must match precisely`, `Retailers choose the cover image for you, so the design matters less than the title`], `Think of a tiny image in search results.`, `A cover has a second to signal genre and professionalism at small size.`),
    ],
  },
  {
    title: 'Metadata, Categories, Keywords and Distribution',
    blurb: 'Metadata is how readers, retailers and libraries find your book.',
    minutes: 10,
    body: `Metadata is the structured information about your book that retailers, libraries and databases display and search: title, subtitle, author name, series, description, ISBN, price, language, categories, keywords, trim size, page count and publication date. Wrong or thin metadata hides a good book.

Categories tell a store where to shelve the book. Many retailers use their own category lists, while the trade uses BISAC subject codes (set by the Book Industry Study Group) and in the UK, Thema codes are widely used. Pick the most accurate, specific categories, and check where comparable bestsellers are listed. Keywords are the search phrases a reader would type; choose ones that describe the book honestly, such as "small town cozy mystery lighthouse," rather than another author's name or unrelated popular terms, which some platforms prohibit. The description is sales copy: lead with the hook, use short paragraphs and end with a reason to buy.

Distribution means getting the book into sales channels. You can upload directly to individual retailers, or use an aggregator or a distributor that sends your files to many stores and libraries at once. Wide distribution reaches more outlets, while exclusivity programmes offered by some retailers give special benefits in return for selling only there. Terms and fees change, so compare current conditions before choosing. Libraries typically buy through library wholesalers, so check that your distributor lists you there. Bookshops usually order through wholesalers and expect returnable stock and a standard trade discount.

Worked example: an author's book is categorised broadly as "Fiction" and has no keywords. A competing book in the narrower "Cozy mystery" category with matching keywords appears in related searches. The first author edits metadata, which can usually be changed without republishing the book.`,
    qs: [
      mc(1, `What is metadata?`, [`Structured information about a book used for display and search`, `The plot summary of the book`, `The cover art and interior layout files uploaded to the printer or store`, `The royalty rate and payment terms agreed between the author and a retailer`], `It is data about the book.`, `Metadata includes title, description, categories, keywords and more, and drives discoverability.`),
      mc(2, `An author lists "Fiction" only, while rivals use "Cozy mystery". What is the best fix?`, [`Choose more specific, accurate categories that match comparable books`, `Add unrelated bestseller names as keywords to borrow attention from big books`, `Remove the description, since categories do all the work in helping buyers`, `Change the title every week so retailers see the book as fresh content`], `Be specific and honest.`, `Accurate, narrow categories help readers who want that kind of book find it.`),
      mc(2, `Which keyword set is honest and useful for a coastal mystery novel?`, [`small town cozy mystery lighthouse`, `famous-author-name bestseller thriller romance`, `free money fast work from home guide`, `best book ever written must read now`], `Describe the book, not someone else's.`, `Keywords should reflect what the book actually is; misusing others' names is often prohibited.`),
      mc(3, `Why is accurate metadata important for libraries and bookshops, beyond online stores?`, [`They order and catalogue through databases that rely on correct data and codes`, `Libraries read the cover and the back blurb aloud to decide which copies to buy`, `It sets how long copyright lasts in the countries where the book is catalogued`, `It allows the author to avoid paying royalties to the distributor and retailers`], `Think of ordering systems.`, `Trade and library systems rely on standardised metadata to find and order titles.`),
      mc(3, `What is a typical trade-off between wide distribution and an exclusivity programme?`, [`Reach across many stores versus special benefits at one retailer`, `Higher copyright protection versus lower protection in other regions`, `No ISBN is needed for wide distribution, while exclusivity requires an ISBN`, `Print editions are included in wide distribution, but ebooks only in exclusivity`], `Think of breadth versus a single partner.`, `Exclusivity trades reach for benefits; compare current terms, which change.`),
    ],
  },
  {
    title: 'Print on Demand, Offset Printing and Pricing',
    blurb: 'Compare print methods and calculate your real per-copy margin.',
    minutes: 12,
    body: `Offset printing uses plates and large presses to print a batch, such as 1,000 or 2,000 copies at once. The cost per copy falls as quantity rises, but you pay upfront, must store the books and carry the risk of unsold stock. Print on demand (POD) prints a copy only when ordered and ships it, so there is no inventory and no big upfront bill; the cost per copy is higher, and quality options such as paper, colour and trim sizes are more limited. Many authors use POD for retail and offset for events or large orders.

Pricing begins with knowing your margin. Print cost depends on page count, trim size and ink; the sales channel then takes a share. Retailers and wholesalers buy at a discount off the list price: bookshops and libraries typically expect a discount, such as 40 percent or more, if you want them to stock the book. Terms vary by platform and change, so confirm current figures.

Worked example (illustrative). A paperback lists at 15 dollars. Through a wholesale channel with a 40 percent discount, the publisher's revenue is 15 x 0.60 = 9.00 dollars. If the printing cost is 4.50 dollars, the margin is 9.00 - 4.50 = 4.50 dollars per copy. Sold direct at full price, you keep 15.00 - 4.50 = 10.50 dollars.

Compare offset: 2,000 copies at 2.50 dollars each costs 5,000 dollars upfront. If only 1,200 sell, the unsold 800 copies are stock you paid for. POD costs only for copies sold.

Price relative to comps: too high deters buyers; too low may signal poor quality and leave no margin. Ebooks have no printing cost, but the retailer's share and fees still apply.`,
    qs: [
      mc(1, `What is a main advantage of print on demand?`, [`No inventory or large upfront printing bill`, `The lowest cost per copy of any available printing method`, `Unlimited choices of paper stock, colour and trim size for every title`, `Guaranteed bookshop sales because the retailer prints the book itself`], `Think about risk.`, `POD prints per order, avoiding warehouse costs and unsold stock.`),
      mc(2, `A paperback lists at 15 dollars with a 40 percent wholesale discount. What revenue does the publisher receive per copy?`, [`9.00 dollars`, `6.00 dollars`, `15.00 dollars`, `10.50 dollars`], `Take 60 percent of the list.`, `15 x 0.60 = 9.00 dollars.`),
      mc(2, `If the print cost for that book is 4.50 dollars, what is the per-copy margin in the wholesale channel?`, [`4.50 dollars`, `9.00 dollars`, `10.50 dollars`, `1.50 dollars`], `Revenue minus cost.`, `9.00 - 4.50 = 4.50 dollars.`),
      mc(3, `An author buys 2,000 offset copies at 2.50 dollars each, but only 1,200 sell. What does she have in unsold stock and what did the print run cost?`, [`800 copies and 5,000 dollars`, `1,200 copies and 3,000 dollars`, `800 copies and 2,000 dollars`, `2,000 copies and 5,000 dollars`], `Subtract sales from the run.`, `2,000 - 1,200 = 800 unsold; 2,000 x 2.50 = 5,000 dollars.`),
      mc(3, `A wholesale discount of 40 percent and a print cost of 4 dollars: what list price gives about 5 dollars of margin?`, [`15 dollars`, `10 dollars`, `12 dollars`, `20 dollars`], `Solve 0.60 x price - 4 = 5.`, `0.6P = 9, so P = 15 dollars.`),
    ],
  },
  {
    title: 'Audiobooks',
    blurb: 'Narration, production, rights and the economics of an audio edition.',
    minutes: 9,
    body: `Audiobooks are a distinct edition with their own production, rights and ISBN. They have grown into an important format, and many authors treat them as a second revenue stream.

Production steps are:
1. choose a narrator whose voice suits the genre
2. record and edit the audio to the distributor's technical standards (consistent volume, low noise)
3. proofread the audio against the text
4. and supply cover art, which is usually square.

Authors can narrate their own work, hire a professional, or work with a production company. Narration is a performance craft, and poor audio is the main reason listeners abandon a title.

Costs and payment models: a narrator may be paid per finished hour, which is the length of the final audio, or may share royalties with the author instead of a fee. Finished hours are far fewer than recording hours. As a rule of thumb many producers use roughly 9,000 words per finished hour, though pace varies. Worked example: a 90,000-word book is about 90,000 / 9,000 = 10 finished hours. At 200 dollars per finished hour, narration would cost 2,000 dollars; a royalty-share arrangement would cost nothing upfront but give up part of the earnings. The rates here are illustrative only; they vary widely by narrator.

Rights and exclusivity: some platforms offer higher royalties for exclusive distribution and lower for non-exclusive, and the contract term can be long. Compare current terms, and make sure your publishing contract has not already granted audio rights to someone else. If you sold audio rights in a traditional deal, the publisher decides the audio edition.

Check that you own or have licensed every element: narration agreements should state who owns the recording.`,
    qs: [
      mc(1, `What is a finished hour in audiobook production?`, [`One hour of final, edited audio`, `One hour of raw recording time in the studio`, `One hour of the author reading the text aloud unedited`, `One hour spent proofreading the audio against the written text`], `It is about the final product.`, `Narrators are often paid by the length of the final audio, not raw recording time.`),
      mc(2, `Using about 9,000 words per finished hour, how long is a 90,000-word audiobook?`, [`10 hours`, `9 hours`, `100 hours`, `1 hour`], `Divide words by words per hour.`, `90,000 / 9,000 = 10 finished hours.`),
      mc(2, `With those 10 hours at an illustrative 200 dollars per finished hour, what is the narration fee?`, [`2,000 dollars`, `200 dollars`, `20,000 dollars`, `900 dollars`], `Multiply hours by rate.`, `10 x 200 = 2,000 dollars.`),
      mc(3, `What is the upfront trade-off of a royalty-share narration deal?`, [`No upfront fee, but part of future earnings is shared`, `Higher audio quality is guaranteed, but the narrator keeps a fixed fee`, `The narrator owns the book rights, but the author keeps the recording`, `Copyright in the text ends once the narrator records the first chapter`], `Think about cash now versus later.`, `Royalty-share lowers the upfront cost but gives the narrator a percentage of sales.`),
      mc(3, `Why check your existing publishing contract before producing audio yourself?`, [`You may have already granted audio rights to a publisher`, `Audio recordings are prohibited by almost every print publishing contract`, `ISBNs cannot be assigned to audiobooks, so there is nothing to produce`, `Audio rights never exist in a contract, so checking would be pointless`], `Who holds the rights?`, `If a contract grants audio rights, only that rights holder may produce the audiobook.`),
    ],
  },

  // ───────── Track 5: Rights, Contracts, Business, Lorea ─────────
  {
    title: 'Copyright, Registration and Permissions',
    blurb: 'You own your book when you write it; registration and permissions protect and clear it.',
    minutes: 11,
    body: `In the United States and many other countries, copyright exists automatically as soon as your original expression is fixed in a tangible form, such as typed on a page. You do not need to register, add a notice or publish for ownership to begin. Copyright protects the way ideas are expressed, not the ideas, facts or titles themselves.

Registration with the US Copyright Office is separate and still valuable. For works of US origin, registration is generally required before you can file an infringement lawsuit in federal court. Also, statutory damages and attorney's fees are generally available only if the work was registered before the infringement began or within three months of first publication, which is why many authors register around publication. Fees and procedures change, so check copyright.gov.

Permissions: quoting other people's work can infringe their copyright. Fair use is a legal defence judged case by case, not a right to quote a given amount, and there is no safe word count. Short quotations for commentary or criticism are often fair use, but song lyrics and poems are commonly treated cautiously because even brief quotes can be a significant part of the work. When in doubt, ask the rights holder in writing, state exactly what you will use and where, and keep the reply. Images need the same care: the photographer or artist usually owns the picture even if you paid for a print or found it online. Licences such as Creative Commons have specific conditions, so read them.

Worked example: an author wants to open a chapter with two lines of a current pop song. She must obtain permission from the rights holders or replace the epigraph with her own words or a public domain text.

This is general education, not legal advice.`,
    qs: [
      mc(1, `When does copyright in your manuscript begin in the US?`, [`When the original work is fixed in tangible form`, `Only after registration with the national copyright office is complete`, `Only after the book is published and offered for sale to readers`, `Only after you buy an ISBN and list the book with a retailer`], `Think about creation, not paperwork.`, `Copyright arises automatically on fixation; registration is optional but useful.`),
      mc(2, `A US author wants to sue an infringer in federal court. Which statement is generally correct for US works?`, [`Registration (or a refusal) must occur first`, `No registration is ever needed, since the copyright exists from creation`, `An ISBN must be assigned to the book before any case can be filed`, `A newspaper notice of the copyright claim must be published first`], `Recall the lawsuit prerequisite.`, `For works of US origin, registration is generally a prerequisite to filing suit.`),
      mc(2, `A book is first published on 1 March. For the strongest remedies against an infringement that begins later, by what date should it be registered at the latest?`, [`Three months after first publication (about 1 June), or before the infringement`, `Ten years after first publication, because that is the general limit for any claim`, `One day after publication, since later registration has no effect on remedies at all`, `Any date at all, since the registration timing makes no difference to the remedies`], `Recall the timely registration window.`, `Statutory damages and fees generally require registration before infringement or within three months of first publication.`),
      mc(3, `Which is the most accurate view of fair use?`, [`A case-by-case defence, with no guaranteed safe number of words`, `Any quote under 100 words is allowed as long as the author is credited`, `Giving credit to the original author means the use is always legal`, `It automatically applies to song lyrics and poems when used in a novel`], `Think about who decides.`, `Fair use depends on factors weighed by a court; attribution alone does not cure infringement.`),
      mc(3, `An author finds a photograph online and wants it on her cover. What is the safest step?`, [`Obtain a licence or permission from the rights holder, or use properly licensed or original art`, `Use it on the cover, since an image found online is free to use if the site is credited clearly`, `Credit the website and link to the page, which satisfies the legal requirements`, `Crop a small part of the image so that the original owner cannot recognise it`], `Who owns the picture?`, `Online availability does not transfer rights; licences define what you may do.`),
    ],
  },
  {
    title: 'Contracts to Read Closely',
    blurb: 'Rights granted, territory, term, reversion, options and audit are where authors win or lose.',
    minutes: 11,
    body: `A publishing contract is a licence: you keep copyright but grant certain rights to the publisher for a period and place, in return for payment. Authors should read every clause and consider having an agent, an attorney or an author organisation review it. Key clauses:

Rights granted: which formats and uses are licensed: print, ebook, audio, translation, film, serial. Rights not granted should be reserved to you. Granting every right to a publisher who will not use them wastes opportunities.

Territory: where the publisher may sell: the US only, North America, English-language world, or the world. Retaining territories lets you license them elsewhere.

Term: how long the grant lasts. Some contracts last for the full life of copyright, which is why a good reversion clause matters.

Reversion: how rights return to you. Traditional out-of-print clauses are weak today because ebooks and print on demand mean a book is never technically out of print. The Authors Guild recommends defining reversion by a minimum earnings or sales threshold in a period, for instance a small royalty amount per year, so that dormant books can be reclaimed.

Option clause: gives the publisher a first look at your next work. Prefer a limited option: a short window, a first-look right instead of a right to match any other offer, and no restriction on other projects.

Audit clause: your right to have a qualified accountant inspect the publisher's records to check royalty statements. Without it you must trust the numbers.

Worked example: a contract grants world rights, all formats, for the life of copyright, with a reversion clause that triggers only when the book is "out of print". With ebooks always available, reversion never happens. That clause should be renegotiated.

This is education, not legal advice.`,
    qs: [
      mc(1, `What does a reversion clause do?`, [`Returns rights to the author under stated conditions`, `Increases the advance when a book earns out within a year`, `Registers the copyright in the author name at the national office`, `Lets the publisher choose a new cover and title for later editions`], `Think "reverts to".`, `Reversion lets an author regain rights, for example when sales fall below a threshold.`),
      mc(2, `A contract grants "world rights, all formats, life of copyright" with reversion only if "out of print." Why is that a problem today?`, [`Ebooks and POD keep a book technically in print forever, so rights may never return`, `It lowers the retail price of the book, so earnings fall with every printed edition sold`, `It prevents publication, because the publisher cannot print without a reversion date set`, `It changes the ISBN, so that earlier editions can no longer be found in libraries`], `Is any book out of print now?`, `Digital availability means the out-of-print trigger is almost never met unless it is defined by sales or earnings.`),
      mc(2, `A contract has an option clause giving the publisher the right to match any offer for your next book. What is the author's main concern?`, [`It can chill other publishers' interest and hold you to one house`, `It guarantees higher pay, because the publisher must outbid every rival offer`, `It ends the contract once the next book is delivered to the publisher`, `It audits the royalties on the new book and the earlier titles together`], `Think about competing offers.`, `Matching rights can deter other buyers; first-look options with short windows are less restrictive.`),
      mc(3, `What practical power does an audit clause give an author?`, [`The right to have the publisher's royalty records inspected by an accountant`, `The right to approve the cover and the interior design before printing begins`, `The right to demand a larger advance on later books in the series`, `The right to receive a new ISBN for each reprint of the book`], `Statements are only claims until checked.`, `Audit rights allow verification of statements, which otherwise rely on trust.`),
      mc(3, `Why does an author care about territory in a contract?`, [`Territories not granted can be licensed elsewhere, such as to a UK or translation publisher`, `Territory sets the font and trim size used when the book is printed locally in each region`, `Territory defines the copyright term that applies in each country where it is sold`, `Territory sets the tax rate that the publisher must apply to each sale in the region`], `Think about selling in other regions.`, `Retaining territories lets the author or agent license them separately.`),
    ],
  },
  {
    title: 'Marketing and Launch',
    blurb: 'Build an audience early, gather honest reviews and plan a launch you can sustain.',
    minutes: 10,
    body: `Marketing for books is mostly the long, patient work of finding readers and giving them reasons to trust you. Publishers expect authors to take part, even in traditional deals, and self-published authors carry all of it.

Platform is your existing ability to reach readers: a newsletter, social media following, speaking, a community. Fewer, deeper channels beat many shallow ones. An email newsletter is especially valuable because you own the list and are not dependent on a platform's algorithm; offer something useful, such as a short story or a checklist, in exchange for a subscription, and comply with the consent and unsubscribe rules of the countries you send to.

Reviews act as social proof. Send advance review copies to genuine readers, bloggers and reviewers in your genre, and ask for honest reviews. Do not pay for positive reviews, do not review your own book, and do not trade reviews in a way that retailer rules forbid; platforms remove such reviews and may penalise accounts. Book events, such as readings, library talks, podcasts and festivals, build local and community support. Libraries are an underrated channel, as librarians recommend books.

Plan a launch window: finalise the cover and metadata, set pre-orders where offered, prepare a launch email and a few posts, line up reviewers, and schedule events. A launch is a spike, not the whole plan; a backlist, a series and consistent publishing give long-term growth.

Worked example: an author with a list of 400 subscribers expects a launch conversion of 5 percent. 400 x 0.05 = 20 sales from the list. That is modest, which is why growing the list for months before launch matters more than a day of posting. Conversion rates vary widely; treat that figure as an illustration, not a prediction.`,
    qs: [
      mc(1, `Why is an email newsletter valued by many authors?`, [`You own the list and are not at the mercy of a platform's algorithm`, `It is legally required before a self-published book can be sold to the public`, `It guarantees sales, since every subscriber will buy each new book released`, `It replaces the book as the product, since readers pay for the updates`], `Think about control.`, `A list you own lets you reach readers directly even if social platforms change.`),
      mc(2, `An author has 400 subscribers and assumes a 5 percent purchase rate. How many sales?`, [`20`, `5`, `200`, `80`], `Find five percent of 400.`, `400 x 0.05 = 20 sales.`),
      mc(2, `If the author grows the list to 1,000 and the same 5 percent applies, how many additional sales are expected compared with 400?`, [`30 more (50 instead of 20)`, `10 more`, `600 more`, `No change`], `Compute 1,000 x 0.05, then subtract 20.`, `1,000 x 0.05 = 50; 50 - 20 = 30 more.`),
      mc(3, `Why is paying a service for batches of five-star reviews a bad idea?`, [`It violates retailer rules, can get reviews removed and damages trust`, `Reviews are never read by shoppers, so the money is wasted on the service`, `It is required by law that reviews come only from verified buyers who paid`, `It improves the copyright position by showing the work has public demand`], `Think about platform enforcement and honesty.`, `Fake or paid reviews breach policies and can lead to removals or penalties and reader distrust.`),
      mc(3, `Which plan best supports long-term sales after launch day?`, [`A backlist or series plus steady audience-building`, `A single burst of posts timed to the launch day announcement`, `Never mentioning the book again once the launch week has ended`, `Buying many copies yourself to push the book up the charts`], `A launch is a spike.`, `Sustained work and more titles keep readers returning long after the spike.`),
    ],
  },
  {
    title: 'Taxes and Record-Keeping for Authors',
    blurb: 'Track income and expenses from the first day, and know when to ask a professional.',
    minutes: 9,
    body: `This lesson uses the United States as its example; other countries differ. It is general information, not tax advice, so confirm details with a qualified tax professional or the tax authority.

In the US, an author who writes with the intent to make a profit is generally treated as self-employed. Royalties and advances are income, usually reported on Schedule C (Profit or Loss from Business) for sole proprietors. Payers may send forms such as 1099 for the amounts paid. Net profit is income minus ordinary and necessary business expenses. Self-employment tax is a separate tax for Social Security and Medicare, commonly figured at 15.3 percent on net self-employment earnings (with a deduction adjustment; rates and thresholds can change, so check the IRS for the current year), in addition to regular income tax. Authors with meaningful income often make estimated quarterly tax payments, since no employer withholds tax.

Common expenses include editing, cover design, ISBNs, proofreading, software, professional fees, advertising, conference costs and printing of copies for sale. Rules for items such as a home office, travel and meals are specific; ask a professional. Selling paperbacks directly to readers may also create sales-tax duties in some places.

Record-keeping habits: keep a separate bank account for book income, save receipts and invoices, record dates, amounts and purposes, and keep a simple spreadsheet or accounting software. Keep contracts and royalty statements. Retention periods vary, so ask your adviser.

Worked example: an author receives 5,000 dollars in royalties, and pays 600 dollars for a cover, 500 dollars for editing and 100 dollars for advertising. Expenses are 1,200 dollars, so net profit is 5,000 - 1,200 = 3,800 dollars. That is the figure self-employment tax and income tax consider, not the 5,000 dollars.`,
    qs: [
      tf(1, `Records of income and expenses should be kept from the start, ideally in a separate account.`, 0, `Consider what you need at tax time.`, `Good records prove income and deductions and make filing and any audits far easier.`),
      mc(2, `An author earns 5,000 dollars in royalties with expenses of 1,200 dollars. What is the net profit?`, [`3,800 dollars`, `6,200 dollars`, `1,200 dollars`, `5,000 dollars`], `Income minus expenses.`, `5,000 - 1,200 = 3,800 dollars.`),
      mc(2, `Expenses were cover 600 dollars, editing 500 dollars and ads 100 dollars. What is the total?`, [`1,200 dollars`, `1,100 dollars`, `600 dollars`, `1,300 dollars`], `Add them up.`, `600 + 500 + 100 = 1,200 dollars.`),
      mc(3, `Why do many self-employed authors make estimated tax payments during the year?`, [`No employer withholds tax from royalties`, `It is a copyright fee charged by the national copyright office`, `ISBNs require it, since each number is registered to a taxpayer`, `It lowers their royalties by taking a share before the publisher pays`], `Who normally withholds?`, `Without payroll withholding, taxpayers often pay quarterly estimates to avoid a large bill and penalties.`),
      mc(3, `Which describes self-employment tax?`, [`A separate tax funding Social Security and Medicare, on top of income tax`, `A fee paid to the publisher each year in exchange for distributing the book`, `A form of copyright registration filed with the copyright office annually`, `A tax paid only by employees whose employer withholds it from a paycheck`], `It is separate from income tax.`, `Self-employed people pay both halves of Social Security and Medicare contributions, commonly figured at 15.3 percent with adjustments.`),
    ],
  },
  {
    title: 'Writing, Publishing and Reading on Lorea',
    blurb: 'How Plajah\'s Lorea fits the craft and business lessons, and what it does not replace.',
    minutes: 10,
    body: `Lorea is Plajah's home for writing, publishing and reading. As built at the time of writing, it covers several parts of this course. The notes below are education, not legal or financial advice, and features may change.

Writing: the Writer's Desk tracks projects and word-count goals, manuscripts and research, and has a submissions area for queries and proposals, so you can log where you sent a pitch and what happened. The Book Authoring Studio is a page-based writing space. You can import existing text from plain text, Markdown, Fountain, Word (.docx) and PDF, and there is a continuity pass that reads the whole manuscript and flags inconsistencies.

Publishing: from the studio you can publish a book to the Lorea marketplace, free or at a price you set. A priced book pays out only if you have connected payments, so set that up first. There is an optional, opt-in Rights and Identifiers panel for details such as an ISBN, a content fingerprint and credits, and the studio can issue a creation certificate. Be clear about what those do: a platform certificate or fingerprint is a useful record, not a substitute for copyright registration with a government office, and an ISBN is purchased through your national agency if you want one for retail print.

Reading and buy-to-own: the reader opens EPUB-based books. For a paid book, readers see a purchase screen unless they are the author or already own it, and a purchase gives the reader a licence to keep the book.

Worked example: an author imports a Word draft, uses beta reader notes, runs the continuity pass, publishes at a set price, and separately registers copyright and arranges her own print ISBN if she wants bookstore distribution.`,
    qs: [
      mc(1, `Which file types can the Lorea authoring studio import for a manuscript?`, [`Plain text, Markdown, Fountain, Word (.docx) and PDF`, `Only audio files and video files recorded by the author for the studio`, `Only images, such as scans of printed pages and cover art`, `Only spreadsheets and presentations that contain the book outline or notes`], `Think of common manuscript formats.`, `The import tool reads txt, md, fountain, docx and pdf files.`),
      mc(2, `A reader opens a paid Lorea book they have not purchased and do not own. What do they see?`, [`A purchase screen, unless they are the author or hold a licence`, `The full book for free, because all Lorea books are open to every reader`, `A blank page, until the author approves the reader access request manually`, `A tax form asking the reader to declare the purchase for sales tax`], `Think buy-to-own.`, `Paid books gate access behind purchase, with exceptions for the author and licence holders.`),
      mc(2, `An author wants to sell a priced book on Lorea. What should she do first?`, [`Connect payments so earnings can be paid out`, `Delete the manuscript and republish it as a new project in the studio`, `Register a trademark for the book title with the national trademark office`, `Remove the price and offer the book free until the first sale occurs`], `A priced book needs a way to pay you.`, `Priced books only pay out when payouts are connected, so set that up before publishing.`),
      mc(3, `What is the right understanding of Lorea's creation certificate or content fingerprint?`, [`A useful platform record, not a replacement for government copyright registration`, `A legal copyright registration that gives the same remedies as a government filing`, `An ISBN issued by the platform that works at every retailer worldwide`, `A literary agent that represents the book to publishers on the author behalf`], `Separate platform records from legal registration.`, `Registration with a copyright office has specific legal effects that a platform record does not.`),
      mc(3, `Which task still remains the author's responsibility even when publishing on Lorea?`, [`Editing quality, contracts and rights decisions, taxes, and any print ISBN or copyright registration`, `Nothing at all, since the platform handles the editing, rights, tax and print matters for you`, `Only the title and the cover, because everything else is done automatically by the studio`, `Only formatting the page numbers and the table of contents, as the platform does the rest`], `Tools help but do not do the business for you.`, `Platform tools handle writing, publishing and reading; legal, tax and print-distribution matters stay with the author.`),
    ],
  },
];

const TRACK_META: { title: string; blurb: string; level: 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED'; from: number; to: number }[] = [
  { title: 'The Craft of the Book', blurb: 'Finding a reader, shaping the story or argument, finishing a draft and revising it.', level: 'FOUNDATION', from: 1, to: 4 },
  { title: 'Editors, Readers and Genre', blurb: 'Editing stages, beta readers and the conventions readers expect.', level: 'FOUNDATION', from: 5, to: 7 },
  { title: 'Traditional and Small-Press Publishing', blurb: 'Queries, agents, advances and royalties, and spotting predatory services.', level: 'INTERMEDIATE', from: 8, to: 11 },
  { title: 'Self-Publishing End to End', blurb: 'Formats, ISBNs, metadata, distribution, print methods, pricing and audio.', level: 'INTERMEDIATE', from: 12, to: 15 },
  { title: 'Rights, Business and Lorea', blurb: 'Copyright, contracts, marketing, taxes and publishing on Plajah.', level: 'ADVANCED', from: 16, to: 20 },
];

const allQuestions: Question[] = [];
const lessonObjs = DEFS.map((d, i) => {
  const num = i + 1;
  const id = ID(num);
  allQuestions.push(...build(id, num, d.qs));
  return { id, title: d.title, blurb: d.blurb, minutes: d.minutes, body: d.body };
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'publishing-business',
    label: 'Writing and Publishing Books (Professional)',
    blurb: 'From idea to income: the craft of writing a book and the business of publishing it, traditionally or on your own.',
    accent: '#D40055',
    framework: 'ccss',
    tracks: TRACK_META.map((t, ti) => ({
      id: `publishing-business.t${ti + 1}`,
      title: t.title,
      blurb: t.blurb,
      level: t.level,
      lessons: lessonObjs.slice(t.from - 1, t.to),
    })),
  },
  bank: { curriculumId: 'publishing-business', questions: allQuestions },
};
