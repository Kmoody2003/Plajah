/**
 * journalismCurriculum — "The Plajah School of Journalism: Notice, Ask, Verify, Publish", age 4 to j-school.
 *
 * Rides the shared School chassis (services/schoolChassis.ts), aligned to the PLAJAH_JOUR
 * progression seeded in data/educationStandards.ts. There is no national K-12 journalism standard;
 * the progression is Plajah-authored and labelled as such, and the ELA writing standards it leans
 * on (informative writing, research, speaking and listening) are cited by code, never hosted.
 *
 * THE LADDER — one ritual repeated at every band, which is what makes it one ladder:
 *   notice → ask → check → tell it plainly → put your name on it → fix it in public.
 *   PreK–2  Little Noticers: who/what/where, picture news, "how do you know?"
 *   3–5     Cub Reporters: news vs opinion vs ad, the 5 Ws, the first interview, the class paper
 *   6–8     The School Newsroom: inverted pyramid, attribution, quotes, headlines, lateral reading
 *   9–12    High School Press: beats, the SPJ code, student press law, data, broadcast, editorials
 *   College J-School: public records, investigations, libel and privacy, the business of news
 *   Every band: Publish & Distribute — the newsletter, the broadcast, the feed, the correction.
 *
 * THE BRIDGES:
 *   - Practice happens in the Student Newsroom (components/journalism/StudentNewsroom.tsx), whose
 *     coach reuses the pro desk's linters (services/journalist/styleChecker, factCheck,
 *     headlineTester) at a band-appropriate volume. Adults graduate into the Journalist Desk.
 *   - Lorea's "The First Draft" exhibit (data/loreaExhibits/journalism.ts) is the hands-on museum
 *     for the same ideas; lessons point into its rooms.
 *   - The Writers Desk's ARTICLE / COLUMN / NEWSLETTER projects open the newsroom kit for that form.
 *
 * LICENCE POSTURE: all lesson prose is original. Codes of ethics (SPJ), court opinions and
 * statutes are cited and linked; court opinions are public domain. AP Stylebook is licensed and is
 * never reproduced — the style linter covers common mechanical rules in original wording.
 *
 * SAFETY POSTURE FOR MINORS: under-13 work never leaves the classroom without a teacher or guardian
 * sign-off; reporting on other children uses first names only, with consent. The rules live in
 * services/journalismSchool/studentDesk.ts and are taught here, not merely enforced.
 */
import type { Curriculum } from '../services/schoolChassis';

const SPJ = { label: 'SPJ Code of Ethics', url: 'https://www.spj.org/ethicscode.asp' };
const SPLC = { label: 'Student Press Law Center — legal help for student journalists', url: 'https://splc.org/' };
const NLP = { label: 'News Literacy Project — Checkology (free for educators)', url: 'https://newslit.org/' };
const COR = { label: 'Civic Online Reasoning — lateral reading lessons (free)', url: 'https://cor.inquirygroup.org/' };
const POYNTER = { label: 'Poynter — journalism training and ethics', url: 'https://www.poynter.org/' };
const JEA = { label: 'Journalism Education Association — scholastic journalism', url: 'https://jea.org/' };
const FOIA_GOV = { label: 'FOIA.gov — how to file a federal records request', url: 'https://www.foia.gov/' };
const RCFP = { label: 'Reporters Committee for Freedom of the Press — open government guide', url: 'https://www.rcfp.org/open-government-guide/' };
const DATAJ = { label: 'The Data Journalism Handbook (open, CC BY-SA)', url: 'https://datajournalism.com/read/handbook/one' };
const LOC_CHRON = { label: 'Chronicling America — historic newspapers (Library of Congress, free)', url: 'https://chroniclingamerica.loc.gov/' };
const WELLS = { label: 'Ida B. Wells, Southern Horrors (1892) — Project Gutenberg, public domain', url: 'https://www.gutenberg.org/ebooks/search/?query=southern+horrors+wells' };
const BLY = { label: 'Nellie Bly, Ten Days in a Mad-House (1887) — Project Gutenberg, public domain', url: 'https://www.gutenberg.org/ebooks/search/?query=ten+days+in+a+mad-house' };
const TINKER = { label: 'Tinker v. Des Moines (1969) — opinion text', url: 'https://supreme.justia.com/cases/federal/us/393/503/' };
const HAZELWOOD = { label: 'Hazelwood v. Kuhlmeier (1988) — opinion text', url: 'https://supreme.justia.com/cases/federal/us/484/260/' };
const SULLIVAN = { label: 'New York Times Co. v. Sullivan (1964) — opinion text', url: 'https://supreme.justia.com/cases/federal/us/376/254/' };

export const JOURNALISM_SCHOOL: Curriculum = {
  id: 'journalism-school',
  label: 'School of Journalism',
  blurb:
    'Notice, ask, verify, publish — from a four-year-old’s picture news to a university investigation. Every lesson ends in real reporting, edited in the Student Newsroom and distributed to a real audience.',
  accent: '#E8553E',
  framework: 'PLAJAH_JOUR',
  tracks: [
    // ── PreK–2 ────────────────────────────────────────────────────────────────
    {
      id: 'noticers',
      title: 'Little Noticers (PreK–2)',
      blurb: 'Reporting starts as noticing. Who, what, where — said out loud, drawn, and shared kindly.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'jr-notice-1',
          title: 'What Happened? Who Was There? Where?',
          blurb: 'The first three questions every reporter asks, played as a game.',
          minutes: 12,
          standardIds: ['PJJR.NOTICE.K2'],
          body: `A reporter is someone who notices something and tells other people about it, truthfully. That is the whole job, and a four-year-old can already do it.

Play "Reporter Says." The adult does something small and visible — waters the plant, drops a block, opens the window. Then ask three questions, always in the same order: What happened? Who did it? Where did it happen? Children answer in a full sentence: "Ms. Ana watered the plant by the window."

Keep the order fixed for weeks. The repetition is the lesson: what, who, where becomes a habit before it becomes a rule. Older children in the band add when ("this morning") and, later, why — but only when they know why. "I don't know why" is a good reporter's answer, and should be praised as one.`,
          resources: [NLP],
          assignment: { prompt: 'Pick one thing that happened today. Say or draw what happened, who was there and where. A grown-up can help you type one sentence under the picture.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-notice-2',
          title: 'Picture News: Draw It, Caption It',
          blurb: 'A drawing plus one true sentence is a news story.',
          minutes: 15,
          standardIds: ['PJJR.NOTICE.K2'],
          body: `Newspapers have always paired pictures with captions, the short line under a photo that tells you who and what you are looking at. Picture News is the same thing at age five.

The child draws something that really happened — the class hamster escaped, it snowed, a new student came. Then the child dictates or writes one caption that says what the picture shows. The adult asks one question: "Would someone who wasn't there understand?" If not, add the missing who or where.

The habit being built is that the words must match the picture. A drawing of rain captioned "It was sunny" is a correction waiting to happen, and correcting it is part of the fun, not a failure.`,
          assignment: { prompt: 'Make a Picture News page in the Student Newsroom: one picture, one caption that says who and what.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-notice-3',
          title: 'How Do You Know? Saw It, Heard It, Guessed It',
          blurb: 'The three ways we know things — and why reporters say which one.',
          minutes: 12,
          standardIds: ['PJJR.VERIFY.K2'],
          body: `This is the youngest version of verification. When a child reports something, ask: "How do you know?" There are three good answers: I saw it. Someone told me. I'm guessing.

Sort statements together. "The lunch is pizza" — did you see the menu, did someone tell you, or are you hoping? Make three corners of the room for Saw, Heard and Guessed, and have children walk to the corner that fits.

The lesson is not that guessing is bad. It is that a reporter always says which one it is. "My brother told me the park is closed" is honest reporting. "The park is closed" — when you only heard it — is not yet.`,
          resources: [NLP],
          assignment: { prompt: 'Tell one piece of news and add how you know: "I saw it", "someone told me", or "I think so".', tool: 'NONE' },
        },
        {
          id: 'jr-notice-4',
          title: 'Asking a Good Question',
          blurb: 'Questions that open doors instead of closing them.',
          minutes: 14,
          standardIds: ['PJJR.ASK.K2'],
          body: `Some questions close: "Do you like recess?" — "Yes." Some questions open: "What is the best part of recess?" — and then a story arrives.

Practise turning closed questions into open ones. Start with "What", "How" and "Tell me about". Children pair up and ask each other one open question about a toy, a pet or a weekend, then listen all the way to the end before speaking.

Listening is the half of interviewing nobody teaches. Count to three silently after the person stops. Very often they will say one more thing, and it is usually the best thing.`,
          assignment: { prompt: 'Ask someone at home one open question that starts with "What", "How" or "Tell me about". Bring back the best thing they said.', tool: 'NONE' },
        },
        {
          id: 'jr-notice-5',
          title: 'Kind and True: Reporting About Friends',
          blurb: 'News about people is about real feelings. First names, permission, kindness.',
          minutes: 10,
          standardIds: ['PJJR.ETHICS.K2'],
          body: `Real reporters follow a rule called "minimize harm." For young children it sounds like this: we tell the truth, and we are kind about it.

Three classroom rules for class news: use first names only. Ask "Can I put you in the news?" before you do. Never share something that would make a friend feel embarrassed — if Sam fell in the mud, the news is "It was so muddy at recess", not "Sam fell in the mud."

Children who learn this at five do not need to unlearn cruelty at fourteen. It is also exactly what professional ethics codes ask of adults.`,
          resources: [SPJ],
          assignment: { prompt: 'Before your next Picture News about a friend, ask "Can I put you in the news?" and mark it in the newsroom.', tool: 'NONE' },
        },
      ],
    },

    // ── 3–5 ──────────────────────────────────────────────────────────────────
    {
      id: 'cub',
      title: 'Cub Reporters (Grades 3–5)',
      blurb: 'News, opinion and ads sorted apart; the 5 Ws and How; a first interview; the class paper.',
      level: 'FOUNDATION',
      lessons: [
        {
          id: 'jr-cub-1',
          title: 'News, Opinion or Ad?',
          blurb: 'Three kinds of message that often look alike, and the job each one is doing.',
          minutes: 18,
          standardIds: ['PJJR.LITERACY.35'],
          body: `Everything on a page or a screen is trying to do a job. News tries to inform you about what happened. Opinion tries to persuade you of what someone thinks. An ad tries to sell you something.

They borrow each other's clothes. An ad can be laid out like a news story — that is called sponsored content, and honest outlets label it. An opinion column can be full of facts and still be opinion, because its job is to persuade.

Sort a stack of real clippings, posts and cereal boxes into three piles. For each, finish the sentence "This wants me to ___." Then find the label, if there is one: "Opinion", "Sponsored", "Ad". When a message hides its job, that is the first sign to slow down.`,
          resources: [NLP],
          assignment: { prompt: 'Find one news story, one opinion and one ad this week. Write one sentence each: "This wants me to…".', tool: 'NONE' },
        },
        {
          id: 'jr-cub-2',
          title: 'The 5 Ws and How',
          blurb: 'Who, what, when, where, why and how — the checklist for a complete story.',
          minutes: 20,
          standardIds: ['PJJR.STORY.35'],
          body: `The Little Noticers' three questions grow into six: Who? What? When? Where? Why? How? Together they are the checklist a reader silently runs. If one is missing, the reader notices the hole.

Not every story answers all six equally. A fire story leads with what and where. A science-fair winner leads with who. The skill is deciding which W matters most to the reader — and putting it first.

Practise on a short, real school event. Fill a 5W chart from notes, circle the most important W, and write a first sentence that starts with it. That sentence is a lede, and the next lesson is about writing better ones. Walk through Lorea's lede room to try the five-W hunt station.`,
          resources: [NLP],
          assignment: { prompt: 'In the Student Newsroom, open the News Brief kit and fill in all six questions about a real school event.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-cub-3',
          title: 'Your First Interview',
          blurb: 'Prepare, ask, listen, write it down exactly — and say thank you.',
          minutes: 25,
          standardIds: ['PJJR.ASK.35'],
          body: `An interview has three parts: before, during and after.

Before: know why you are asking this person. Write five open questions, then circle the two you most need answered, in case time runs short.

During: tell them who you are and what the story is for. Ask your circled questions first. Write down their exact words when they say something you might quote, and read it back: "Did I get that right?" That one habit prevents most misquotes in professional newsrooms, too.

After: say thank you, and tell them when the story will come out. Then write up your notes the same day, while you still remember what your shorthand meant.`,
          resources: [JEA],
          assignment: { prompt: 'Interview a classmate, teacher or family member using the Interview kit. Record at least one exact quote and read it back to them.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-cub-4',
          title: 'Writing the Lede',
          blurb: 'The first sentence decides whether anyone reads the second.',
          minutes: 20,
          standardIds: ['PJJR.STORY.35'],
          body: `The first sentence of a news story is called the lede. Its job is to tell the reader the most important thing, quickly, so they decide to keep reading.

A weak lede warms up: "On Tuesday there was an assembly and many things happened." A strong lede gets to the point: "Room 12 raised $340 for the animal shelter by selling bookmarks, the most of any class."

Three tests for a lede: Is it under about 30 words? Does it say who and what? Would a friend say "really?" when they hear it? Write three different ledes for the same story and let a partner pick the strongest. Professional reporters do this too.`,
          assignment: { prompt: 'Write three ledes for your story in the newsroom and ask a partner to choose the best one.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-cub-5',
          title: 'Fact or Opinion? Checking a Claim',
          blurb: 'Facts can be checked. Opinions can be argued. Know which you are holding.',
          minutes: 18,
          standardIds: ['PJJR.VERIFY.35'],
          body: `A fact is a statement that can be checked: "The library has 4,000 books." An opinion is a judgment someone makes: "The library is the best room in the school." Both belong in journalism, but they must never be confused.

To check a fact, ask: who would know? The librarian would know how many books there are. A friend's guess would not count. Reporters call this going to the source.

Play Check It: the teacher reads ten statements. Students label each Fact or Opinion, then for each fact, name who could check it. Numbers, dates and names are the facts that most often go wrong, so they get checked first — in this class and in every newsroom.`,
          resources: [NLP, COR],
          assignment: { prompt: 'Underline every number, date and name in your draft. For each one, write who you checked it with.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-cub-6',
          title: 'Making the Class Newspaper',
          blurb: 'Editors, reporters, artists and a deadline: putting out issue one.',
          minutes: 40,
          standardIds: ['PJJR.PUBLISH.35'],
          body: `A newspaper is a team. Reporters write stories. Editors read them, ask questions and fix mistakes. Artists and photographers make the pictures. A designer fits it all on the page. And everyone shares one thing: the deadline.

Assign roles for one issue, and rotate them next issue so everyone tries each job. The editor's question is always the same: "How do you know?" — the same question the Little Noticers learned.

Use the Press Room to lay out the front page, then print it or share it with families. When a reader finds a mistake, print a correction in the next issue. A paper that fixes its mistakes in public is more trustworthy, not less.`,
          resources: [JEA],
          assignment: { prompt: 'Publish issue one of your class paper from the Press Room — print it or send it home as a family newsletter.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
      ],
    },

    // ── 6–8 ──────────────────────────────────────────────────────────────────
    {
      id: 'school-newsroom',
      title: 'The School Newsroom (Grades 6–8)',
      blurb: 'The inverted pyramid, attribution, quotes, headlines and captions, and checking what you read online.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'jr-ms-1',
          title: 'The Inverted Pyramid',
          blurb: 'Most important first, least important last — and why the shape exists.',
          minutes: 22,
          standardIds: ['PJJR.STORY.68'],
          body: `A hard news story is shaped like an upside-down triangle: the most important information at the top, supporting details next, background last. The shape lets a reader stop anywhere and still have the most important part of the news.

The form spread in the 1800s, alongside the telegraph and wire services, though historians still argue over exactly why. The usual explanation is practical: if an editor had to cut a story to fit the page, cutting from the bottom lost the least. A reader skimming on a phone today is doing the same thing.

Not everything should be a pyramid. Features, profiles and narrative stories use other shapes. But learn the pyramid first: it forces you to decide what matters most. Build one at the sort station in Lorea's pyramid room, then rebuild your own story in that order.`,
          resources: [POYNTER],
          assignment: { prompt: 'Rewrite your story as an inverted pyramid in the newsroom. Check: could the last paragraph be cut without losing the news?', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-ms-2',
          title: 'Sources and Attribution: Who Says So?',
          blurb: 'Every fact you did not witness belongs to someone. Name them.',
          minutes: 22,
          standardIds: ['PJJR.SOURCE.68'],
          body: `Attribution means telling the reader where a piece of information came from: "according to the principal", "the city's budget shows", "said Maya, a seventh-grader". It lets readers judge the information for themselves.

Sources come in kinds. Primary sources saw it, did it or created the record — the eyewitness, the coach, the official report. Secondary sources are reporting about it — another article, a post. Go primary whenever you can, and say when you couldn't.

Two sources that agree are stronger than one, if they are independent — two people who both heard the same rumour from one friend are really one source. Use "said" for attribution. It is invisible in the best way; "claimed" and "admitted" quietly add your opinion.`,
          resources: [SPJ, JEA],
          assignment: { prompt: 'List every source in your story as primary or secondary. Add a second independent source for your most important fact.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-ms-3',
          title: 'Quotes: Exact Words, Fair Context',
          blurb: 'Quotation marks are a promise that those were the words.',
          minutes: 20,
          standardIds: ['PJJR.SOURCE.68'],
          body: `Putting words inside quotation marks promises the reader that the person said exactly those words. If you are not sure of the exact words, paraphrase without quotation marks and still attribute: Coach Lee said practice would move to Thursdays.

Quote what only that person could say — feeling, judgment, a vivid phrase. Paraphrase the plain facts. "The game starts at 4 p.m.," said the coach — that is a waste of a quote.

Context matters as much as accuracy. If someone said "I'd never cancel the dance — unless it storms," quoting only "I'd never cancel the dance" is accurate and dishonest. Read your quote back to the speaker, and never cut a qualification that changes the meaning.`,
          assignment: { prompt: 'Mark each quote in your story. For each, note whether you read it back to the speaker.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-ms-4',
          title: 'Headlines and Captions',
          blurb: 'The most-read words in any story, and the easiest to get wrong.',
          minutes: 20,
          standardIds: ['PJJR.STORY.68'],
          body: `Many more people read the headline than the story. That makes the headline a promise: the story must deliver exactly what it says, no more.

A news headline is short, uses a strong present-tense verb, and names the subject: "Robotics team wins regional title." Avoid questions the story can't answer, and avoid "you won't believe…" — that is called clickbait, and it spends your readers' trust to buy one click.

Captions identify who and what is in a photo, left to right, and add one thing the picture can't show. Credit the photographer. Never caption a photo with something you did not verify — a wrong caption on a real photo is one of the most common forms of misinformation. The newsroom's headline checker scores length and clarity; the honesty test is yours.`,
          assignment: { prompt: 'Write three headlines for your story and run them through the newsroom headline checker. Keep the most accurate, not the most dramatic.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-ms-5',
          title: 'Lateral Reading: Checking What You See Online',
          blurb: 'Professional fact-checkers leave the page to learn about the page.',
          minutes: 25,
          standardIds: ['PJJR.VERIFY.68'],
          body: `When students judge a website, they usually read down the page: does it look professional, does it have an "About" section? Researchers at Stanford found that professional fact-checkers do something different. They leave the page almost immediately and open new tabs to see what other sources say about it. This is called lateral reading.

Three questions for any claim online: Who is behind this? What is the evidence? What do other sources say? Search the organisation's name with words like "funding" or "who runs". Look up the original study, not the post about it. Do a reverse image search on a dramatic photo.

Lateral reading is quick — often under a minute — and it beats a polished design every time. Practise on three real posts, timed.`,
          resources: [COR, NLP],
          assignment: { prompt: 'Pick one viral post. Read laterally for five minutes and write a three-line verdict: who made it, what the evidence is, what others say.', tool: 'NONE' },
        },
        {
          id: 'jr-ms-6',
          title: 'Photo and Video Reporting',
          blurb: 'Pictures are evidence. Treat them like quotes.',
          minutes: 20,
          standardIds: ['PJJR.MEDIA.68'],
          body: `A news photo is a quote from the world. It must not be staged, and it must not be altered beyond normal adjustments like brightness and cropping that don't change meaning. Removing a person, adding a sky or combining two shots turns a news photo into an illustration — which is fine only if it is labelled as one.

Get permission before photographing classmates, and follow your school's photo rules. Shoot wide, medium and close so the editor has a choice. Write down names, spelled correctly, right after you take the shot.

The same rule applies to AI-generated images: a generated image may never be presented as a news photo. If you use one as illustration, label it clearly. The newsroom will ask you to declare it.`,
          assignment: { prompt: 'Shoot a three-photo sequence (wide, medium, close) for your story and write a caption for each. Declare any edits.', tool: 'PHOTO' },
        },
      ],
    },

    // ── 9–12 ─────────────────────────────────────────────────────────────────
    {
      id: 'hs-press',
      title: 'High School Press (Grades 9–12)',
      blurb: 'Beats, the ethics code, student press law, data, broadcast, editorials and corrections.',
      level: 'INTERMEDIATE',
      lessons: [
        {
          id: 'jr-hs-1',
          title: 'Working a Beat',
          blurb: 'Own one area of school life and know it better than anyone.',
          minutes: 25,
          standardIds: ['PJJR.REPORT.HS'],
          body: `A beat is an area a reporter covers continuously: student government, athletics, the budget, the arts, the cafeteria. Beats exist because the best stories are found by people who are already paying attention when something changes.

Build a beat book: the people who matter on your beat, their roles, how to reach them, the calendar of regular meetings, and the documents that get published — minutes, budgets, schedules. Visit regularly when nothing is happening. Sources talk to reporters they know.

Every week, file one "beat memo": three things you noticed, one you're following up, one question nobody has answered yet. Most of them won't become stories. The one that does will be a story no one else had.`,
          resources: [JEA],
          assignment: { prompt: 'Choose a beat and start a beat book in the newsroom: five sources, three recurring meetings, two documents to watch.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-hs-2',
          title: 'The Ethics Code: Four Principles',
          blurb: 'Seek truth, minimize harm, act independently, be accountable.',
          minutes: 30,
          standardIds: ['PJJR.ETHICS.HS'],
          body: `The Society of Professional Journalists' Code of Ethics rests on four principles: Seek truth and report it. Minimize harm. Act independently. Be accountable and transparent. They are voluntary — journalism is not a licensed profession in the United States — and they sometimes pull against each other.

Seeking truth may mean publishing something that hurts. Minimizing harm may mean withholding a name, especially of a minor. Independence means no gifts, no favours, and disclosing conflicts — reviewing your friend's band is a conflict. Accountability means explaining your choices and correcting errors promptly.

Work through cases where the principles collide: a student athlete's arrest, a teacher's private social-media post, a leaked test. There is no answer key. The skill is naming which principles are in tension and defending your choice out loud — the same move the Philosophy School's ethics bowl teaches.`,
          resources: [SPJ, POYNTER],
          assignment: { prompt: 'Write a 300-word ethics memo for a hard case on your beat: which principles collide, what you would publish, and why.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-hs-3',
          title: 'Student Press Law: Tinker, Hazelwood and New Voices',
          blurb: 'What the First Amendment protects for student journalists — and where it stops.',
          minutes: 30,
          standardIds: ['PJJR.LAW.HS'],
          asOf: '2026-10',
          anchors: [
            { kind: 'case', ref: 'Tinker v. Des Moines Independent Community School District|1969|US', note: 'students keep free-expression rights at school absent substantial disruption' },
            { kind: 'case', ref: 'Hazelwood School District v. Kuhlmeier|1988|US', note: 'school-sponsored publications may be restricted for legitimate pedagogical concerns' },
            { kind: 'case', ref: 'Mahanoy Area School District v. B. L.|2021|US', note: 'limits on schools regulating off-campus student speech' },
            { kind: 'concept', ref: 'New Voices student press freedom laws', note: 'state statutes restoring protections narrowed by Hazelwood' },
          ],
          body: `In Tinker v. Des Moines (1969), the Supreme Court held that students do not lose their free-speech rights at the schoolhouse gate; a school may restrict expression only when it would substantially disrupt school or invade others' rights.

In Hazelwood v. Kuhlmeier (1988), the Court allowed a principal to remove pages from a school-sponsored newspaper, holding that schools may restrict school-sponsored student expression for reasons "reasonably related to legitimate pedagogical concerns." That standard gives administrators far more room than Tinker.

In response, a number of states have passed "New Voices" laws that restore stronger protections to student journalists at public schools, and some protect advisers from retaliation. The list changes, so check the Student Press Law Center's current map for your state. Off-campus speech is governed partly by Mahanoy v. B. L. (2021). Know your rights before you need them, and know who to call: the SPLC runs a free legal hotline for student journalists.`,
          resources: [TINKER, HAZELWOOD, SPLC],
          assignment: { prompt: 'Look up whether your state has a New Voices law. Write a one-page "know your rights" card for your school paper\'s staff.', tool: 'NONE' },
        },
        {
          id: 'jr-hs-4',
          title: 'Numbers in the News',
          blurb: 'Rates, not raw counts; the right baseline; one chart that is honest.',
          minutes: 30,
          standardIds: ['PJJR.DATA.HS'],
          body: `Numbers carry authority, which is why they need the most checking. Four habits make a reporter trustworthy with data.

Use rates, not raw counts, when comparing groups of different sizes: a big school with more detentions than a small one may have a lower rate. Ask "compared to what?" — a 50 percent rise from 2 to 3 is a different story from 2,000 to 3,000. Find the original dataset, not the press release about it. And know the difference between correlation and cause.

Make one chart. Start bar-chart axes at zero. Label units and source. If the chart would look shocking only with a cropped axis, the story isn't shocking. Pair this lesson with the Economics School's data labs, which use the same public series.`,
          resources: [DATAJ],
          assignment: { prompt: 'Find one number on your beat. Report it as a rate with a comparison and a cited source in the newsroom data box.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-hs-5',
          title: 'Broadcast and Podcast: Writing for the Ear',
          blurb: 'Short sentences, one idea each, and say the key fact twice.',
          minutes: 30,
          standardIds: ['PJJR.MEDIA.HS'],
          body: `A listener cannot re-read. So broadcast writing changes the rules: short sentences, one idea per sentence, attribution first ("Police say the road will reopen Monday" — not after the fact), round numbers, and the most important fact repeated near the end for people who tuned in late.

A two-column script puts what the audience sees or hears (video, sound) on the left and what is said on the right. Time it: a typical newscast reader speaks at roughly 150 to 180 words a minute, so a 45-second story is fewer than 140 words.

Write the script in the newsroom's Broadcast kit, then record it in Fabula. A student newscast is a real distribution channel: put it on the class wall or the school's morning announcements.`,
          resources: [POYNTER],
          assignment: { prompt: 'Turn your print story into a 45-second broadcast script, then record it in Fabula.', tool: 'FABULA', postTag: 'journalismschool' },
        },
        {
          id: 'jr-hs-6',
          title: 'Opinion, Editorials and Reviews',
          blurb: 'Persuasion is a craft too — built on reporting, labelled as opinion.',
          minutes: 25,
          standardIds: ['PJJR.OPINION.HS'],
          body: `Opinion journalism takes a side, openly. An editorial is the publication's institutional view, usually unsigned and agreed by an editorial board. A column is one writer's signed view. A review judges a work against clear criteria.

Good opinion writing is reported. It states the issue, takes a position in the first few paragraphs, supports it with verifiable evidence, takes the strongest counterargument seriously and answers it, and ends with what the reader can do. It is clearly labelled "Opinion" so no reader mistakes it for news.

Keep the newsroom wall high: a reporter covering a beat should not write opinion about it. That separation is one of the oldest ways publications earn trust.`,
          resources: [JEA],
          assignment: { prompt: 'Write a 400-word editorial in the Opinion kit on a school issue. Include the strongest counterargument and your answer to it.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-hs-7',
          title: 'Corrections: Fixing Mistakes in Public',
          blurb: 'Every newsroom makes errors. Good ones say so, plainly and quickly.',
          minutes: 18,
          standardIds: ['PJJR.ETHICS.HS'],
          body: `Every publication makes mistakes. What separates trustworthy ones is how they handle them: promptly, visibly, and without hiding what was wrong.

A correction states what the story got wrong and what is right: "An earlier version of this story misspelled the name of the team captain. She is Priya Natarajan." A clarification adds context that was missing. An editor's note explains a larger change. A retraction withdraws a story that should not have been published.

Never silently edit a published story to change its facts — readers who saw the first version deserve to know. Plajah's newsroom keeps a visible correction log on every published piece for exactly this reason. Practise by writing corrections for three errors in a sample story.`,
          resources: [SPJ],
          assignment: { prompt: 'Find one error in a published class story (yours or a classmate\'s, with permission) and file a correction notice in the Press Room.', tool: 'NEWSROOM' },
        },
      ],
    },

    // ── University ──────────────────────────────────────────────────────────
    {
      id: 'j-school',
      title: 'J-School (University)',
      blurb: 'Public records, investigations, media law, history, the business of news and verification in the AI era.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'jr-u-1',
          title: 'Public Records and FOIA',
          blurb: 'Documents don’t forget and don’t spin. Learn to ask for them.',
          minutes: 40,
          standardIds: ['PJJR.RECORDS.COL'],
          asOf: '2026-10',
          anchors: [
            { kind: 'statute', ref: 'Freedom of Information Act, 5 U.S.C. § 552', note: 'federal public records access' },
            { kind: 'concept', ref: 'state public records and open meetings laws', note: 'most local reporting runs on state law, not FOIA' },
          ],
          body: `The federal Freedom of Information Act (5 U.S.C. § 552) gives anyone the right to request records from federal agencies, subject to nine exemptions such as national security, personal privacy and certain law-enforcement records. Every state has its own public records law, and most local journalism — police reports, budgets, inspection results, contracts, emails — runs on those state laws, not FOIA.

A good request is specific: name the records, the date range and the format you want, cite the statute, and ask for a fee waiver if you qualify as news media. Track deadlines; agencies often miss them, and polite persistence works.

Before you file, look for what is already public: meeting minutes, budgets, court dockets, campaign-finance filings. Reading documents is the core investigative skill. Draft a real request to a local agency as the assignment.`,
          resources: [FOIA_GOV, RCFP],
          assignment: { prompt: 'Draft a public-records request to a local or state agency in the newsroom\'s Records kit. Cite the statute and specify records, dates and format.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-u-2',
          title: 'The Investigative Method',
          blurb: 'A hypothesis, a paper trail, people, and a no-surprises letter.',
          minutes: 45,
          standardIds: ['PJJR.INVESTIGATE.COL'],
          body: `Investigative reporting reveals something someone with power would prefer stayed hidden, through original work. It is closer to science than to intuition.

Start with a testable hypothesis ("the city awarded towing contracts without bids"), then build the paper trail that could prove or disprove it: contracts, filings, court records. Build a timeline and a cast of characters. Interview from the outside in — peripheral sources first, the subject last, when you know enough to ask precise questions.

Before publication, send the subject a "no-surprises" letter listing every significant allegation and giving reasonable time to respond. Include their response fairly. A fact-check pass verifies every sentence against a source in your files. The story you can prove is the story you publish — and sometimes the hypothesis was wrong, which is also a finding.`,
          resources: [BLY, POYNTER],
          assignment: { prompt: 'Write an investigation plan in the Investigation kit: hypothesis, ten documents to obtain, ten people in order, and a draft no-surprises letter.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-u-3',
          title: 'Libel, Privacy and the Law of Publishing',
          blurb: 'Truth is a defence; actual malice is the standard for public officials.',
          minutes: 40,
          standardIds: ['PJJR.LAW.COL'],
          asOf: '2026-10',
          anchors: [
            { kind: 'case', ref: 'New York Times Co. v. Sullivan|1964|US', note: 'actual-malice standard for public officials' },
            { kind: 'case', ref: 'Gertz v. Robert Welch, Inc.|1974|US', note: 'private figures; states may set a lower standard' },
          ],
          body: `Defamation is a false statement of fact, published to others, that damages someone's reputation. Truth is a defence; so, generally, is opinion that does not imply false facts.

In New York Times Co. v. Sullivan (1964), the Supreme Court held that a public official cannot win a libel suit over coverage of official conduct without proving "actual malice": that the publisher knew the statement was false or acted with reckless disregard for whether it was true. The rule was later extended to public figures. In Gertz v. Robert Welch (1974), the Court let states set a lower standard for private individuals.

Privacy torts — publishing private facts, intrusion, false light — and the protection of sources vary by state; many states have shield laws, and there is no general federal one. This lesson is orientation, not legal advice. Real newsrooms have lawyers review risky stories; student media can call the SPLC.`,
          resources: [SULLIVAN, SPLC, RCFP],
          assignment: { prompt: 'Run a legal review on one of your stories: list each statement about an identifiable person and the evidence that it is true.', tool: 'NONE' },
        },
        {
          id: 'jr-u-4',
          title: 'A History of the Free Press',
          blurb: 'Zenger, Wells, Bly, the muckrakers — the people who made the job.',
          minutes: 40,
          standardIds: ['PJJR.HISTORY.COL'],
          body: `In 1735 a New York jury acquitted the printer John Peter Zenger of seditious libel for criticizing the colonial governor, after his lawyer argued that truth should be a defence. The verdict did not change the law at the time, but it became a founding story of American press freedom.

Ida B. Wells documented lynching with names, dates and court records in "Southern Horrors" (1892), turning statistics into proof against a lie told about why lynchings happened; her newspaper office in Memphis was destroyed. Nellie Bly feigned insanity to report from inside the Blackwell's Island asylum in 1887. The muckrakers of the early 1900s — Ida Tarbell on Standard Oil, Upton Sinclair on meatpacking — helped drive reforms.

Read the primary texts: Wells and Bly are in the public domain, and Chronicling America holds millions of historic newspaper pages. Then walk Lorea's "presses" room, which tells the same history at every reading level.`,
          resources: [WELLS, BLY, LOC_CHRON],
          assignment: { prompt: 'Find a historic newspaper page from your town in Chronicling America. Write a 500-word comparison of how it covered one event versus how it would be covered today.', tool: 'LOREA' },
        },
        {
          id: 'jr-u-5',
          title: 'Verification in the Age of AI',
          blurb: 'Provenance, synthetic media, and disclosing your own tools.',
          minutes: 40,
          standardIds: ['PJJR.VERIFY.COL'],
          body: `Generative tools have made fabricated text, images, audio and video cheap. The verification response is not a magic detector — detectors are unreliable — but disciplined provenance: where did this file come from, who first posted it, what is the earliest copy, and does it fit independent evidence such as weather, shadows, landmarks and other footage?

Content-credential systems that attach a signed history to media files (the C2PA standard is the leading one) help when present; their absence proves nothing. Treat any claim of "AI-detected" or "authentic" as another claim to verify.

Hold yourself to the rule you apply to others: disclose when AI tools helped write, translate or illustrate a story, and never let a model be the source of a fact. Plajah's publishing gate asks for this disclosure and will not let an AI mark a claim as verified — only a human can.`,
          resources: [POYNTER, COR],
          assignment: { prompt: 'Verify one viral image or clip: document its earliest copy, its first poster, and three independent checks. Publish your verification notes.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-u-6',
          title: 'The Business of News',
          blurb: 'Who pays for journalism decides what journalism survives.',
          minutes: 35,
          standardIds: ['PJJR.BUSINESS.COL'],
          body: `For most of the 20th century, advertising paid for most American newspapers. When classified and display advertising moved online, that model collapsed, and many local papers shrank or closed. Researchers call places with little or no local news coverage "news deserts".

Today's models mix reader revenue (subscriptions, memberships, donations), nonprofit newsrooms supported by foundations and readers, events, newsletters, and public media. Each creates pressures: advertisers, funders, and audiences all want something. Disclose funding, keep a wall between revenue and editorial decisions, and publish your ethics policy.

Build a one-page business plan for a local or campus outlet: audience, beat coverage, revenue mix, costs, and the independence safeguards you will publish. Plajah's own rule fits here: open work stays free, and creators choose whether to charge for their own.`,
          resources: [POYNTER],
          assignment: { prompt: 'Write a one-page business and independence plan for a campus or local outlet, then set it up as a Publication in the Journalist Desk.', tool: 'NONE' },
        },
      ],
    },

    // ── Every band ──────────────────────────────────────────────────────────
    {
      id: 'distribute',
      title: 'Publish & Distribute (Every Band)',
      blurb: 'The class paper, the newsletter, the broadcast, the feed — getting true work to real readers.',
      level: 'ADVANCED',
      lessons: [
        {
          id: 'jr-pub-1',
          title: 'Know Your Audience',
          blurb: 'Who is this for, and what do they need to know first?',
          minutes: 18,
          standardIds: ['PJJR.PUBLISH.35'],
          body: `Every story has an audience, and the same facts are told differently for each. A story about a new bus schedule leads with times for families and with the budget for the school board.

Before you write, finish this sentence: "This is for ___, who needs to know ___." For young reporters, the audience is usually the class or families. For high school and university, it may be the whole community.

Writing for an audience is not changing the truth to please them. It is choosing what to put first, which words to define, and where to publish so they will actually see it. The Press Room asks this question before you pick a channel.`,
          assignment: { prompt: 'In the Press Room, write the audience line for your next issue and choose the channel that reaches them.', tool: 'NEWSROOM' },
        },
        {
          id: 'jr-pub-2',
          title: 'The Newsletter',
          blurb: 'The oldest channel online, and still the most direct.',
          minutes: 25,
          standardIds: ['PJJR.PUBLISH.HS'],
          body: `A newsletter goes straight to a reader's inbox with no algorithm in the middle. That makes it one of the most reliable ways for a small outlet to reach people — and one of the most demanding, because readers unsubscribe when it wastes their time.

A good issue has a clear subject line that tells the truth, a short preheader, one lead story, a few briefs, and a way to reply. Send on a predictable schedule. Email law requires a working unsubscribe link and a postal address for commercial email, and consent matters for everyone: only send to people who asked.

For young students, the newsletter is the family edition of the class paper, sent by the teacher. The Press Room renders a ready-to-send issue from your approved stories.`,
          assignment: { prompt: 'Render a newsletter issue from your approved stories in the Press Room and send it through your teacher or your publication\'s mailing list.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
        {
          id: 'jr-pub-3',
          title: 'Syndication: RSS, the Open Web and the Feed',
          blurb: 'Publish once, reach readers wherever they read.',
          minutes: 25,
          standardIds: ['PJJR.PUBLISH.COL'],
          body: `RSS and Atom are open formats that let any reader app follow a publication without an account or an algorithm. Structured data (schema.org NewsArticle) helps search engines understand a story's headline, author and date. Platform feeds — including Plajah's — reach people who don't yet know your outlet exists.

Each channel has a trade-off between reach and control. Open feeds give readers control. Platforms give reach and take some control. A healthy outlet uses more than one, so no single company can switch its audience off.

Plajah's Journalist Desk generates RSS, Atom, structured data and an email version for every published article, and the class wall puts student work in the feed with the school's tag. Map each of your stories to the channels that fit.`,
          assignment: { prompt: 'For your publication, list each channel (class wall, newsletter, RSS, broadcast), who it reaches, and who controls it.', tool: 'NONE' },
        },
        {
          id: 'jr-pub-4',
          title: 'Engagement Without Clickbait',
          blurb: 'Earn attention honestly, and measure what matters.',
          minutes: 20,
          standardIds: ['PJJR.ETHICS.HS'],
          body: `Clicks are easy to buy with outrage and false promises, and the cost is trust. Engagement worth having comes from usefulness: stories that answer readers' real questions, invite their tips, and come back to follow up.

Measure what tells you whether you served readers: did they finish the story, return next week, reply, or share it with a note of their own? Raw page views reward the wrong things.

Practise by inviting questions before you report: ask your audience what they want to know about an upcoming school-board decision, report the answers, and publish a follow-up showing which questions you answered. It is a simple loop, and it is the opposite of clickbait.`,
          assignment: { prompt: 'Run a reader-questions loop: collect three questions from your audience, answer them in a story, and publish the follow-up.', tool: 'NEWSROOM', postTag: 'journalismschool' },
        },
      ],
    },
  ],
};

/** Lesson ids grouped by the ladder band they belong to — the newsroom uses this to pick kits. */
export const JOURNALISM_BAND_TRACKS: Record<'early' | 'elementary' | 'middle' | 'high' | 'university', string[]> = {
  early: ['noticers'],
  elementary: ['cub', 'distribute'],
  middle: ['school-newsroom', 'distribute'],
  high: ['hs-press', 'distribute'],
  university: ['j-school', 'distribute'],
};
